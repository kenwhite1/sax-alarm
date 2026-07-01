/**
 * Telegram Bot API: уведомления-будильники и платежи Telegram Stars (XTR).
 * Webhook-обработчик апдейтов — в index.ts (POST /bot/webhook).
 */
import { config } from './config.js';
import { one, q } from './db.js';

const API = () => `https://api.telegram.org/bot${config.botToken}`;

export async function tg<T = any>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!data.ok) throw new Error(`tg ${method}: ${data.description}`);
  return data.result;
}

/** Будильник: пуш работает при свёрнутом Mini App; звук стартует по user gesture внутри приложения. */
export async function sendAlarmNotification(userId: number, alarmId: number, boost: number) {
  const boostTxt = boost > 1 ? `\n🔥 Сквад-буст ×${boost.toFixed(2)} — вы пьёте не одни!` : '';
  await tg('sendMessage', {
    chat_id: userId,
    text: `🎷 ПОРА ПИТЬ! Саксофоны уже разогреваются…${boostTxt}\n\nУ тебя 10 минут, чтобы заглушить их дринком.`,
    reply_markup: {
      inline_keyboard: [[{ text: '🍺 Заглушить саксофон', web_app: { url: `${config.miniAppUrl}?alarm=${alarmId}` } }]],
    },
  });
}

/** Stars-инвойс: createInvoiceLink с currency XTR (provider_token не нужен). */
export async function createStarsInvoice(productCode: string, payload: string): Promise<string> {
  const p = await one(`SELECT * FROM products WHERE code=$1`, [productCode]);
  if (!p) throw new Error('unknown product');
  return tg<string>('createInvoiceLink', {
    title: p.title,
    description: `Sax Alarm — ${p.title}`,
    payload,
    currency: 'XTR',
    prices: [{ label: p.title, amount: p.stars_price }],
  });
}

export async function answerPreCheckout(id: string, ok: boolean, error?: string) {
  await tg('answerPreCheckoutQuery', { pre_checkout_query_id: id, ok, ...(error ? { error_message: error } : {}) });
}

/** successful_payment → провести транзакцию и выдать товар. */
export async function handleSuccessfulPayment(userId: number, payload: string, chargeId: string, stars: number) {
  const tx = await one(
    `UPDATE transactions SET status='paid', tg_charge_id=$1, paid_at=now()
     WHERE invoice_payload=$2 AND status='pending' RETURNING *`,
    [chargeId, payload]
  );
  if (!tx) return; // повторный апдейт — идемпотентность

  const product = await one(`SELECT * FROM products WHERE code=$1`, [tx.product_code]);
  if (!product) return;

  if (product.kind === 'subscription') {
    const days = Number(product.meta?.days ?? 30);
    await q(
      `INSERT INTO subscriptions (user_id, tx_id, plan, expires_at)
       VALUES ($1,$2,$3, GREATEST(now(), COALESCE((SELECT premium_until FROM users WHERE id=$1), now())) + ($4 || ' days')::interval)`,
      [userId, tx.id, product.code, days]
    );
    await q(
      `UPDATE users SET is_premium=true,
         premium_until = GREATEST(now(), COALESCE(premium_until, now())) + ($2 || ' days')::interval
       WHERE id=$1`,
      [userId, days]
    );
  } else if (product.kind === 'boost') {
    const { redis } = await import('./redis.js');
    const { periodKey } = await import('./services/leaderboard.js');
    await redis.set(`boost:${userId}:${periodKey('day')}`, String(product.meta?.multiplier ?? 2), 'EX', 86400);
  } else {
    await q(
      `INSERT INTO inventory (user_id, item_code, qty) VALUES ($1,$2,1)
       ON CONFLICT (user_id, item_code) DO UPDATE SET qty = inventory.qty + 1`,
      [userId, product.code]
    );
  }

  await tg('sendMessage', { chat_id: userId, text: `✅ «${product.title}» — твоё. Саксофон одобряет. 🎷` });
}
