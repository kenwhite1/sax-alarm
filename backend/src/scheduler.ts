/**
 * Планировщик рандомных будильников.
 *
 * Тик раз в минуту. Для каждого пользователя внутри его активного окна
 * (active_from..active_to по его tz) с вероятностью p срабатывает будильник:
 *
 *   p(минута) = alarms_per_day / active_minutes * squadBoost
 *
 * squadBoost = 1 + 0.25 * (кол-во других активных участников сквада), cap 2.0.
 * «Активен» = last_seen_at за последние 30 мин (см. seen:{id} в Redis).
 * Ночью не будим: вне окна p = 0. Пуш — через Bot API (работает при свёрнутом приложении).
 */
import { config } from './config.js';
import { q, one } from './db.js';
import { redis } from './redis.js';
import { sendAlarmNotification } from './bot.js';

interface SchedUser {
  id: number;
  tz: string;
  active_from: number;
  active_to: number;
  alarms_per_day: number;
}

function localHour(tz: string): number {
  try {
    return Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: tz }).format(new Date()));
  } catch {
    return new Date().getUTCHours();
  }
}

export async function squadBoostFor(userId: number): Promise<number> {
  const mates = await q<{ user_id: number }>(
    `SELECT sm2.user_id FROM squad_members sm1
     JOIN squad_members sm2 ON sm2.squad_id = sm1.squad_id AND sm2.user_id <> sm1.user_id
     WHERE sm1.user_id = $1`,
    [userId]
  );
  if (!mates.length) return 1;

  let active = 0;
  for (const m of mates) {
    const seen = Number(await redis.get(`seen:${m.user_id}`) ?? 0);
    if (Date.now() - seen < config.squadActiveWindowMin * 60_000) active++;
  }
  return Math.min(1 + active * config.squadBoostPerMember, config.squadBoostCap);
}

async function tickUser(u: SchedUser) {
  const h = localHour(u.tz);
  const inWindow =
    u.active_from <= u.active_to
      ? h >= u.active_from && h < u.active_to
      : h >= u.active_from || h < u.active_to; // окно через полночь
  if (!inWindow) return;

  // уже есть невыполненный будильник — не спамим
  const pending = await one(
    `SELECT id FROM alarms WHERE user_id=$1 AND status IN ('scheduled','fired')
     AND created_at > now() - interval '1 hour'`,
    [u.id]
  );
  if (pending) return;

  const windowHours = (u.active_to - u.active_from + 24) % 24 || 24;
  const boost = await squadBoostFor(u.id);
  const p = (u.alarms_per_day / (windowHours * 60)) * boost;

  if (Math.random() >= p) return;

  const alarm = await one(
    `INSERT INTO alarms (user_id, scheduled_at, fired_at, status, squad_boost)
     VALUES ($1, now(), now(), 'fired', $2) RETURNING id`,
    [u.id, boost]
  );
  try {
    await sendAlarmNotification(u.id, alarm!.id, boost);
  } catch (e) {
    console.error('notify failed', u.id, e);
  }
}

async function expireOldAlarms() {
  await q(`UPDATE alarms SET status='missed' WHERE status='fired' AND fired_at < now() - interval '15 minutes'`);
}

export function startScheduler() {
  setInterval(async () => {
    try {
      const users = await q<SchedUser>(
        `SELECT id, tz, active_from, active_to, alarms_per_day
         FROM users WHERE is_banned = false AND last_seen_at > now() - interval '14 days'`
      );
      await Promise.allSettled(users.map(tickUser));
      await expireOldAlarms();
    } catch (e) {
      console.error('scheduler tick failed', e);
    }
  }, config.schedulerTickSec * 1000);
  console.log('⏰ scheduler started');
}
