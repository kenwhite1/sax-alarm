import { createHmac } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { one, q } from '../db.js';
import { redis } from '../redis.js';

export interface TgUser {
  id: number;
  first_name: string;
  username?: string;
  photo_url?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tgUser?: TgUser;
    }
  }
}

/**
 * Валидация Telegram WebApp initData (HMAC-SHA256, ключ = HMAC("WebAppData", bot_token)).
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(initData: string, botToken: string): TgUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computed = createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (computed !== hash) return null;

  const authDate = Number(params.get('auth_date') ?? 0);
  if (Date.now() / 1000 - authDate > 24 * 3600) return null; // протухший initData

  try {
    return JSON.parse(params.get('user') ?? '') as TgUser;
  } catch {
    return null;
  }
}

export async function auth(req: Request, res: Response, next: NextFunction) {
  const initData = req.header('X-Tg-Init-Data');
  if (!initData) return res.status(401).json({ error: 'no initData' });

  const user = validateInitData(initData, config.botToken);
  if (!user) return res.status(401).json({ error: 'bad initData' });

  // upsert + last_seen (нужен планировщику и сквад-множителю)
  await q(
    `INSERT INTO users (id, username, first_name, photo_url)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (id) DO UPDATE
       SET username=$2, first_name=$3, photo_url=COALESCE($4, users.photo_url),
           last_seen_at=now()`,
    [user.id, user.username ?? null, user.first_name, user.photo_url ?? null]
  );
  await redis.set(`seen:${user.id}`, Date.now(), 'EX', 3600);

  const banned = await one<{ is_banned: boolean }>(`SELECT is_banned FROM users WHERE id=$1`, [user.id]);
  if (banned?.is_banned) return res.status(403).json({ error: 'banned' });

  req.tgUser = user;
  next();
}
