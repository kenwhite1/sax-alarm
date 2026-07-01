import { Router } from 'express';
import multer from 'multer';
import { one, q } from '../db.js';
import { checkDrink, commitDrink, enqueueServerVerification } from '../services/antifraud.js';
import { addDrink } from '../services/leaderboard.js';
import { config } from '../config.js';

const upload = multer({ limits: { fileSize: 2 * 1024 * 1024, files: 10 } });
export const drinks = Router();

/**
 * POST /api/drinks  (multipart)
 * fields: alarmId, captureMs, clientScore, livenessScore, manual ('1' = ручное подтверждение после fail)
 * files:  frames[] — 3..10 JPEG из live-серии getUserMedia (upload из галереи в UI отсутствует)
 */
drinks.post('/', upload.array('frames', 10), async (req, res) => {
  const userId = req.tgUser!.id;
  const frames = ((req.files as Express.Multer.File[]) ?? []).map(f => f.buffer);
  const alarmId = Number(req.body.alarmId) || null;
  const manual = req.body.manual === '1';

  if (alarmId) {
    const alarm = await one(`SELECT * FROM alarms WHERE id=$1 AND user_id=$2 AND status='fired'`, [alarmId, userId]);
    if (!alarm) return res.status(400).json({ error: 'no active alarm' });
  }

  const verdict = await checkDrink({
    userId,
    frames,
    captureMs: Number(req.body.captureMs) || 0,
    clientScore: manual ? 0 : Number(req.body.clientScore) || 0,
    livenessScore: Number(req.body.livenessScore) || 0,
  });

  if (!verdict.ok) {
    return res.status(422).json({ error: 'rejected', reasons: verdict.reasons });
  }

  const status = manual ? 'unverified' : verdict.status;
  const drink = await one(
    `INSERT INTO drinks (user_id, alarm_id, status, client_score, liveness_score,
                         phash, frames_count, capture_ms, meta)
     VALUES ($1,$2,$3,$4,$5, $6::bit(64), $7,$8,$9) RETURNING id, status`,
    [
      userId,
      alarmId,
      status,
      Number(req.body.clientScore) || 0,
      Number(req.body.livenessScore) || 0,
      verdict.phashes[0] ? BigInt('0x' + verdict.phashes[0]).toString(2).padStart(64, '0') : null,
      frames.length,
      Number(req.body.captureMs) || 0,
      JSON.stringify({ reasons: verdict.reasons, manual }),
    ]
  );
  for (let i = 0; i < verdict.phashes.length; i++) {
    await q(`INSERT INTO drink_frames (drink_id, seq, phash) VALUES ($1,$2,$3::bit(64))`, [
      drink!.id, i, BigInt('0x' + verdict.phashes[i]).toString(2).padStart(64, '0'),
    ]);
  }
  await commitDrink(userId, verdict.phashes);

  if (alarmId) await q(`UPDATE alarms SET status='completed' WHERE id=$1`, [alarmId]);

  // Лидерборд: flagged не попадает, unverified — с пометкой (вес 1, но исключается из топ-заморозки призов)
  const squads = await q<{ squad_id: number }>(`SELECT squad_id FROM squad_members WHERE user_id=$1`, [userId]);
  if (status !== 'flagged') {
    await addDrink(userId, squads.map(s => s.squad_id));
  }

  // стрик
  await q(
    `UPDATE users SET
       streak_days = CASE
         WHEN last_drink_day = CURRENT_DATE THEN streak_days
         WHEN last_drink_day = CURRENT_DATE - 1 THEN streak_days + 1
         ELSE 1 END,
       last_drink_day = CURRENT_DATE
     WHERE id=$1`,
    [userId]
  );

  // серверная перепроверка для честности топа
  if (status === 'verified') await enqueueServerVerification(drink!.id);

  res.json({ id: drink!.id, status });
});

/** Пропуск будильника за предмет alarm_skip. */
drinks.post('/skip', async (req, res) => {
  const userId = req.tgUser!.id;
  const alarmId = Number(req.body.alarmId);
  const inv = await one(
    `UPDATE inventory SET qty = qty - 1 WHERE user_id=$1 AND item_code='alarm_skip' AND qty > 0 RETURNING qty`,
    [userId]
  );
  if (!inv) return res.status(402).json({ error: 'no alarm_skip items' });
  await q(`UPDATE alarms SET status='skipped' WHERE id=$1 AND user_id=$2 AND status='fired'`, [alarmId, userId]);
  res.json({ ok: true, left: inv.qty });
});

/** Активный будильник (для открытия Mini App из пуша). */
drinks.get('/active-alarm', async (req, res) => {
  const alarm = await one(
    `SELECT id, fired_at, squad_boost FROM alarms
     WHERE user_id=$1 AND status='fired' ORDER BY fired_at DESC LIMIT 1`,
    [req.tgUser!.id]
  );
  res.json({ alarm: alarm ?? null, graceMinutes: 15, minIntervalSec: config.minDrinkIntervalSec });
});
