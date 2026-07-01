import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  botToken: process.env.BOT_TOKEN ?? '',
  webhookSecret: process.env.WEBHOOK_SECRET ?? 'change-me',
  miniAppUrl: process.env.MINI_APP_URL ?? 'https://example.com',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://sax:sax@localhost:5432/sax_alarm',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',

  // Антифрод
  minDrinkIntervalSec: 20 * 60,       // минимум между засчитанными дринками
  maxDrinksPerDay: 8,                 // выше — автофлаг
  phashMaxHamming: 10,                // ближе — считаем дубликатом
  phashMemoryDays: 14,                // окно дедупликации
  captureFreshnessSec: 180,           // кадры должны быть сняты в течение N сек до отправки
  reportsToFlag: 2,                   // репортов от сквада для флага
  verifyThreshold: 0.55,              // client_score для 'verified'

  // Планировщик
  schedulerTickSec: 60,
  squadActiveWindowMin: 30,           // «активен» = last_seen в этом окне
  squadBoostPerMember: 0.25,          // +25% за каждого активного соседа
  squadBoostCap: 2.0,
};
