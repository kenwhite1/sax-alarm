import { redis } from '../redis.js';
import { q } from '../db.js';

export type Period = 'day' | 'week' | 'all';

export function periodKey(period: Period, d = new Date()): string {
  if (period === 'all') return 'all';
  const iso = d.toISOString().slice(0, 10);
  if (period === 'day') return iso;
  // ISO-неделя
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const week = Math.ceil(((+t - +new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const TTL: Record<Period, number> = { day: 3 * 86400, week: 14 * 86400, all: 0 };

export async function addDrink(userId: number, squadIds: number[]) {
  const boost = Number(await redis.get(`boost:${userId}:${periodKey('day')}`) ?? 1);
  const inc = 1 * boost;

  for (const period of ['day', 'week', 'all'] as Period[]) {
    const key = periodKey(period);
    const gk = `lb:global:${period}:${key}`;
    await redis.zincrby(gk, inc, String(userId));
    if (TTL[period]) await redis.expire(gk, TTL[period]);
    for (const sid of squadIds) {
      const sk = `lb:squad:${sid}:${period}:${key}`;
      await redis.zincrby(sk, inc, String(userId));
      if (TTL[period]) await redis.expire(sk, TTL[period]);
    }
  }
}

export interface LbRow {
  userId: number;
  drinks: number;
  rank: number;
  username?: string;
  first_name?: string;
  photo_url?: string;
  is_premium?: boolean;
}

export async function top(
  scope: 'global' | `squad:${number}`,
  period: Period,
  limit = 50,
  me?: number
): Promise<{ rows: LbRow[]; me?: LbRow }> {
  const key =
    scope === 'global'
      ? `lb:global:${period}:${periodKey(period)}`
      : `lb:squad:${scope.slice(6)}:${period}:${periodKey(period)}`;

  const flat = await redis.zrevrange(key, 0, limit - 1, 'WITHSCORES');
  const rows: LbRow[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    rows.push({ userId: Number(flat[i]), drinks: Number(flat[i + 1]), rank: i / 2 + 1 });
  }

  if (rows.length) {
    const users = await q(
      `SELECT id, username, first_name, photo_url, is_premium FROM users WHERE id = ANY($1)`,
      [rows.map(r => r.userId)]
    );
    const byId = new Map(users.map(u => [Number(u.id), u]));
    for (const r of rows) Object.assign(r, byId.get(r.userId) ?? {});
  }

  let meRow: LbRow | undefined;
  if (me) {
    const [rank, score] = await Promise.all([redis.zrevrank(key, String(me)), redis.zscore(key, String(me))]);
    if (rank !== null && score !== null) {
      meRow = { userId: me, drinks: Number(score), rank: rank + 1 };
    }
  }
  return { rows, me: meRow };
}
