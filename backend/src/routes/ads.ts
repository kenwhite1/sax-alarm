import { Router } from 'express';
import { one, q } from '../db.js';

export const ads = Router();

/**
 * GET /api/ads/slot?placement=leaderboard|feed|challenge
 * Premium-пользователи рекламу не видят.
 * Выбор: активная кампания нужного типа с наименьшим числом показов за сегодня (равномерная ротация в daily_cap).
 */
const placementKind: Record<string, string[]> = {
  leaderboard: ['leaderboard_slot'],
  feed: ['drink_of_week', 'coupon'],
  challenge: ['squad_challenge'],
};

ads.get('/slot', async (req, res) => {
  const userId = req.tgUser!.id;
  const premium = (await one(`SELECT is_premium FROM users WHERE id=$1`, [userId]))?.is_premium;
  if (premium) return res.json({ ad: null });

  const kinds = placementKind[String(req.query.placement)] ?? ['coupon'];
  const ad = await one(
    `SELECT c.*,
       (SELECT count(*) FROM ad_events e
         WHERE e.campaign_id=c.id AND e.event='impression' AND e.created_at > date_trunc('day', now())) AS shown_today
     FROM ad_campaigns c
     WHERE c.status='active' AND c.kind = ANY($1) AND now() BETWEEN c.starts_at AND c.ends_at
     ORDER BY shown_today ASC LIMIT 1`,
    [kinds]
  );
  if (!ad || Number(ad.shown_today) >= ad.daily_cap) return res.json({ ad: null });

  await q(`INSERT INTO ad_events (campaign_id, user_id, event) VALUES ($1,$2,'impression')`, [ad.id, userId]);
  res.json({
    ad: {
      id: ad.id, kind: ad.kind, title: ad.title, body: ad.body,
      image_url: ad.image_url, cta_url: ad.cta_url, coupon_code: ad.coupon_code, advertiser: ad.advertiser,
    },
  });
});

/** POST /api/ads/:id/event  { event: 'click' | 'coupon_redeem' | 'challenge_join' | 'challenge_done' } */
ads.post('/:id/event', async (req, res) => {
  const allowed = ['click', 'coupon_redeem', 'challenge_join', 'challenge_done'];
  const event = String(req.body.event ?? '');
  if (!allowed.includes(event)) return res.status(400).json({ error: 'bad event' });
  await q(`INSERT INTO ad_events (campaign_id, user_id, event, meta) VALUES ($1,$2,$3,$4)`, [
    Number(req.params.id), req.tgUser!.id, event, JSON.stringify(req.body.meta ?? {}),
  ]);
  res.json({ ok: true });
});

/** Метрики для рекламодателя (защитить админ-токеном в проде). */
ads.get('/:id/metrics', async (req, res) => {
  const rows = await q(
    `SELECT event, count(*) AS total, count(DISTINCT user_id) AS uniques
     FROM ad_events WHERE campaign_id=$1 GROUP BY event`,
    [Number(req.params.id)]
  );
  const m = Object.fromEntries(rows.map(r => [r.event, { total: Number(r.total), uniques: Number(r.uniques) }]));
  const impressions = m.impression?.total ?? 0;
  const clicks = m.click?.total ?? 0;
  res.json({ ...m, ctr: impressions ? +(clicks / impressions * 100).toFixed(2) : 0 });
});
