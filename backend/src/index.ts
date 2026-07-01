import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { pool, one } from './db.js';
import { auth } from './middleware/auth.js';
import { drinks } from './routes/drinks.js';
import { squads } from './routes/squads.js';
import { leaderboard } from './routes/leaderboard.js';
import { me } from './routes/me.js';
import { shop } from './routes/shop.js';
import { ads } from './routes/ads.js';
import { reports } from './routes/reports.js';
import { startScheduler } from './scheduler.js';
import { answerPreCheckout, handleSuccessfulPayment } from './bot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

// ===== Telegram webhook (платежи Stars + команды) =====
app.post('/bot/webhook', async (req, res) => {
  // защита вебхука: setWebhook(..., secret_token) → заголовок ниже
  if (req.header('X-Telegram-Bot-Api-Secret-Token') !== config.webhookSecret) {
    return res.sendStatus(403);
  }
  const update = req.body;
  try {
    if (update.pre_checkout_query) {
      const pq = update.pre_checkout_query;
      const tx = await one(`SELECT 1 FROM transactions WHERE invoice_payload=$1 AND status='pending'`, [
        pq.invoice_payload,
      ]);
      await answerPreCheckout(pq.id, !!tx, tx ? undefined : 'Заказ не найден, попробуйте ещё раз');
    } else if (update.message?.successful_payment) {
      const sp = update.message.successful_payment;
      await handleSuccessfulPayment(
        update.message.from.id,
        sp.invoice_payload,
        sp.telegram_payment_charge_id,
        sp.total_amount
      );
    } else if (update.message?.text === '/start') {
      const { tg } = await import('./bot.js');
      await tg('sendMessage', {
        chat_id: update.message.chat.id,
        text: '🎷 Sax Alarm. Саксофоны будят — дринк спасает.\nОткрывай приложение и жди первый будильник.',
        reply_markup: { inline_keyboard: [[{ text: '🍺 Открыть Sax Alarm', web_app: { url: config.miniAppUrl } }]] },
      });
    }
  } catch (e) {
    console.error('webhook error', e);
  }
  res.sendStatus(200); // всегда 200, иначе Telegram ретраит
});

// ===== Mini App API =====
const api = express.Router();
api.use(auth);
api.use('/me', me);
api.use('/drinks', drinks);
api.use('/squads', squads);
api.use('/leaderboard', leaderboard);
api.use('/shop', shop);
api.use('/ads', ads);
api.use('/reports', reports);
app.use('/api', api);

// ===== Статика фронтенда (single-service деплой: Railway и т.п.) =====
const staticDir = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
  app.get(/^\/(?!api|bot).*/, (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  console.log('🌐 serving frontend from', staticDir);
}

/** Авто-миграция при старте (для хостингов без доступа к psql). */
async function migrate() {
  const t = await one<{ t: string | null }>(`SELECT to_regclass('public.users') AS t`);
  if (!t?.t) {
    const sql = fs.readFileSync(path.resolve(__dirname, '../migrations/001_init.sql'), 'utf8');
    await pool.query(sql);
    console.log('🗄  migrations applied');
  }
}

migrate()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`🎷 Sax Alarm backend on :${config.port}`);
      startScheduler();
    });
  })
  .catch(e => {
    console.error('startup failed', e);
    process.exit(1);
  });
