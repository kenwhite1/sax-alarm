import { Router } from 'express';
import { one, q } from '../db.js';

export const me = Router();

me.get('/', async (req, res) => {
  const userId = req.tgUser!.id;
  const user = await one(
    `SELECT id, username, first_name, photo_url, tz, active_from, active_to, alarms_per_day,
            is_premium, premium_until, custom_sound, streak_days, created_at
     FROM users WHERE id=$1`,
    [userId]
  );
  const stats = await one(
    `SELECT
       count(*) FILTER (WHERE status IN ('verified','unverified'))                          AS total,
       count(*) FILTER (WHERE status='verified')                                            AS verified,
       count(*) FILTER (WHERE created_at > date_trunc('day', now()) AND status<>'rejected') AS today,
       count(*) FILTER (WHERE created_at > date_trunc('week', now()) AND status<>'rejected') AS week
     FROM drinks WHERE user_id=$1`,
    [userId]
  );
  const badges = await q(
    `SELECT b.code, b.title, b.emoji FROM user_badges ub JOIN badges b ON b.code=ub.badge_code WHERE ub.user_id=$1`,
    [userId]
  );
  const inventory = await q(`SELECT item_code, qty FROM inventory WHERE user_id=$1 AND qty>0`, [userId]);
  res.json({ user, stats, badges, inventory });
});

me.patch('/settings', async (req, res) => {
  const userId = req.tgUser!.id;
  const { tz, activeFrom, activeTo, alarmsPerDay, customSound } = req.body ?? {};
  const isPremium = (await one(`SELECT is_premium FROM users WHERE id=$1`, [userId]))?.is_premium;

  await q(
    `UPDATE users SET
       tz = COALESCE($2, tz),
       active_from = COALESCE($3, active_from),
       active_to = COALESCE($4, active_to),
       alarms_per_day = LEAST(GREATEST(COALESCE($5, alarms_per_day), 1), 6),
       custom_sound = CASE WHEN $6::text IS NOT NULL AND $7 THEN $6 ELSE custom_sound END
     WHERE id=$1`,
    [userId, tz ?? null, activeFrom ?? null, activeTo ?? null, alarmsPerDay ?? null, customSound ?? null, !!isPremium]
  );
  res.json({ ok: true });
});

/** Заморозка стрика (предмет streak_freeze). */
me.post('/streak-freeze', async (req, res) => {
  const userId = req.tgUser!.id;
  const inv = await one(
    `UPDATE inventory SET qty=qty-1 WHERE user_id=$1 AND item_code='streak_freeze' AND qty>0 RETURNING qty`,
    [userId]
  );
  if (!inv) return res.status(402).json({ error: 'no streak_freeze items' });
  await q(`UPDATE users SET last_drink_day=CURRENT_DATE WHERE id=$1`, [userId]);
  res.json({ ok: true, left: inv.qty });
});
