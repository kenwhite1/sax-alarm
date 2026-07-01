/**
 * Антифрод-слой. Каждая проверка возвращает вердикт, решение принимается сводно:
 *  - hard fail  → drink отклоняется (rejected)
 *  - soft fail  → засчитывается как 'unverified' или 'flagged' (не идёт в топ)
 * Баланс строгости и UX описан в docs/ANTIFRAUD.md.
 */
import { config } from '../config.js';
import { redis } from '../redis.js';
import { one } from '../db.js';
import { dhash, hamming } from './phash.js';

export interface FraudInput {
  userId: number;
  frames: Buffer[];        // 3..10 JPEG-кадров live-серии
  captureMs: number;       // клиентский ts начала съёмки
  clientScore: number;     // confidence клиентского CV
  livenessScore: number;   // межкадровое движение, 0..1
}

export interface FraudVerdict {
  ok: boolean;                       // false = rejected
  status: 'verified' | 'unverified' | 'flagged';
  reasons: string[];
  phashes: string[];
}

export async function checkDrink(input: FraudInput): Promise<FraudVerdict> {
  const reasons: string[] = [];

  // 1. Живая серия, не одиночное фото из галереи
  if (input.frames.length < 3) {
    return { ok: false, status: 'flagged', reasons: ['not_a_live_burst'], phashes: [] };
  }

  // 2. Свежесть: съёмка «сейчас», а не загруженный файл
  const ageSec = (Date.now() - input.captureMs) / 1000;
  if (ageSec < 0 || ageSec > config.captureFreshnessSec) reasons.push('stale_capture');

  // 3. Rate limit: минимальный интервал между дринками
  const last = Number(await redis.get(`drink:last:${input.userId}`) ?? 0);
  if (Date.now() - last < config.minDrinkIntervalSec * 1000) {
    return { ok: false, status: 'flagged', reasons: ['rate_limited'], phashes: [] };
  }

  // 4. Аномальный объём за день
  const today = await one<{ n: string }>(
    `SELECT count(*) n FROM drinks
     WHERE user_id=$1 AND created_at > date_trunc('day', now()) AND status <> 'rejected'`,
    [input.userId]
  );
  if (Number(today?.n ?? 0) >= config.maxDrinksPerDay) reasons.push('daily_spike');

  // 5. pHash: дубликаты и «слишком статичная» серия
  const phashes = await Promise.all(input.frames.map(dhash));

  const firstVsLast = hamming(phashes[0], phashes[phashes.length - 1]);
  if (firstVsLast < 2 && input.livenessScore < 0.15) reasons.push('static_scene'); // видео-стоп-кадр / фото фото

  const recent: string[] = await redis.lrange(`phash:${input.userId}`, 0, 199);
  const isDup = phashes.some(p => recent.some(r => hamming(p, r) <= config.phashMaxHamming));
  if (isDup) return { ok: false, status: 'flagged', reasons: ['duplicate_image'], phashes };

  // 6. Итог
  const hardIssues = reasons.filter(r => r === 'stale_capture' || r === 'static_scene');
  let status: FraudVerdict['status'];
  if (hardIssues.length > 0 || reasons.includes('daily_spike')) {
    status = 'flagged';
  } else if (input.clientScore >= config.verifyThreshold && input.livenessScore >= 0.3) {
    status = 'verified';
  } else {
    status = 'unverified'; // ручное подтверждение — засчитано, но с пометкой
  }

  return { ok: true, status, reasons, phashes };
}

/** Вызывать ПОСЛЕ успешной записи дринка. */
export async function commitDrink(userId: number, phashes: string[]) {
  await redis.set(`drink:last:${userId}`, Date.now());
  if (phashes.length) {
    await redis.lpush(`phash:${userId}`, ...phashes);
    await redis.ltrim(`phash:${userId}`, 0, 499);
    await redis.expire(`phash:${userId}`, config.phashMemoryDays * 86400);
  }
}

/**
 * Серверная перепроверка CV для топа лидерборда (очередь).
 * MVP: эвристика по liveness + client meta; прод: воркер с TFJS-node/YOLO,
 * который пересчитывает детекцию по сохранённым кадрам и пишет server_score.
 */
export async function enqueueServerVerification(drinkId: number) {
  await redis.lpush('queue:verify', String(drinkId));
}
