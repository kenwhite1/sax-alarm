import { Router } from 'express';
import { one, q } from '../db.js';
import { config } from '../config.js';

export const reports = Router();

/**
 * POST /api/reports { drinkId }
 * Репортить может только участник общего сквада. При reportsToFlag репортах
 * дринк помечается flagged и исключается из лидерборда (вычитаем из ZSET).
 */
reports.post('/', async (req, res) => {
  const reporterId = req.tgUser!.id;
  const drinkId = Number(req.body.drinkId);

  const drink = await one(`SELECT * FROM drinks WHERE id=$1`, [drinkId]);
  if (!drink) return res.status(404).json({ error: 'not found' });
  if (Number(drink.user_id) === reporterId) return res.status(400).json({ error: 'self-report' });

  const shared = await one(
    `SELECT 1 FROM squad_members a JOIN squad_members b ON a.squad_id=b.squad_id
     WHERE a.user_id=$1 AND b.user_id=$2 LIMIT 1`,
    [reporterId, drink.user_id]
  );
  if (!shared) return res.status(403).json({ error: 'not a squadmate' });

  await q(
    `INSERT INTO reports (drink_id, reporter_id, reason) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
    [drinkId, reporterId, String(req.body.reason ?? 'suspicious').slice(0, 200)]
  );

  const n = await one<{ n: string }>(`SELECT count(*) n FROM reports WHERE drink_id=$1 AND status='open'`, [drinkId]);
  if (Number(n?.n) >= config.reportsToFlag && drink.status !== 'flagged') {
    await q(`UPDATE drinks SET status='flagged' WHERE id=$1`, [drinkId]);
    await q(`UPDATE users SET trust_score = GREATEST(trust_score - 0.1, 0) WHERE id=$1`, [drink.user_id]);

    // вычесть из лидербордов
    const { redis } = await import('../redis.js');
    const { periodKey } = await import('../services/leaderboard.js');
    const squadsRows = await q<{ squad_id: number }>(`SELECT squad_id FROM squad_members WHERE user_id=$1`, [drink.user_id]);
    for (const period of ['day', 'week', 'all'] as const) {
      await redis.zincrby(`lb:global:${period}:${periodKey(period)}`, -1, String(drink.user_id));
      for (const s of squadsRows) {
        await redis.zincrby(`lb:squad:${s.squad_id}:${period}:${periodKey(period)}`, -1, String(drink.user_id));
      }
    }
  }
  res.json({ ok: true });
});

/** Спорные дринки моего сквада (для UI «оспорить»). */
reports.get('/feed/:squadId', async (req, res) => {
  const rows = await q(
    `SELECT d.id, d.user_id, d.status, d.created_at, u.first_name, u.username,
            (SELECT count(*) FROM reports r WHERE r.drink_id=d.id AND r.status='open') AS report_count
     FROM drinks d
     JOIN squad_members sm ON sm.user_id=d.user_id AND sm.squad_id=$1
     JOIN users u ON u.id=d.user_id
     WHERE d.created_at > now() - interval '48 hours' AND d.status <> 'rejected'
     ORDER BY d.created_at DESC LIMIT 100`,
    [Number(req.params.squadId)]
  );
  res.json(rows);
});
