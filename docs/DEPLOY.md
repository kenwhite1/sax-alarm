# Деплой

## Вариант A: Railway (рекомендуется, проще всего)

Проект уже подготовлен под single-service деплой: корневой `package.json` собирает фронт и бэк, Express раздаёт статику фронтенда, миграции БД применяются автоматически при первом старте, `railway.json` задаёт build/start/healthcheck.

1. **Залей код в GitHub** (`git init && git add -A && git commit -m "init"`, создай репозиторий и запушь). Альтернатива без GitHub — Railway CLI: `npm i -g @railway/cli && railway login && railway up`.
2. **railway.com → New Project → Deploy from GitHub repo** — выбери репозиторий.
3. **Добавь базы:** в проекте `+ New → Database → PostgreSQL`, затем ещё раз `→ Redis`.
4. **Переменные сервиса** (вкладка Variables у app-сервиса):
   ```
   BOT_TOKEN      = <твой токен>
   WEBHOOK_SECRET = <случайная строка>
   DATABASE_URL   = ${{Postgres.DATABASE_URL}}
   REDIS_URL      = ${{Redis.REDIS_URL}}
   MINI_APP_URL   = https://<домен из шага 5>
   ```
   `PORT` Railway подставляет сам — backend его читает.
5. **Settings → Networking → Generate Domain** — получишь `xxx.up.railway.app` (HTTPS из коробки). Впиши его в `MINI_APP_URL` и сделай redeploy.
6. **Вебхук:**
   ```bash
   curl -F "url=https://xxx.up.railway.app/bot/webhook" \
        -F "secret_token=$WEBHOOK_SECRET" \
        -F 'allowed_updates=["message","pre_checkout_query"]' \
        https://api.telegram.org/bot$BOT_TOKEN/setWebhook
   ```
7. **@BotFather → /newapp** — укажи URL `https://xxx.up.railway.app`. Проверка: открой `https://xxx.up.railway.app/health` → `{"ok":true}`, отправь боту `/start`.

## Вариант B: свой VPS

### 1. @BotFather

Отправь `/newbot`, получи `BOT_TOKEN`. Затем `/newapp` → выбери бота → укажи название «Sax Alarm», описание, HTTPS-URL фронтенда — получится ссылка `t.me/<bot>/<appname>`. Полезно также `/setmenubutton` → указать URL Mini App, чтобы приложение открывалось кнопкой меню в чате с ботом.

### 2. Хостинг и HTTPS

Mini App работает только по HTTPS с валидным сертификатом. Минимальный сетап — один VPS: `docker compose up -d` (Postgres + Redis + backend), фронтенд собирается `npm run build` и раздаётся Nginx/Caddy. Caddy проще всего — автоматический Let's Encrypt:

```
your-domain.com {
    root * /var/www/sax-alarm       # dist фронтенда
    file_server
    handle /api/* { reverse_proxy localhost:3000 }
    handle /bot/* { reverse_proxy localhost:3000 }
}
```

Заполни `.env` (BOT_TOKEN, WEBHOOK_SECRET, MINI_APP_URL=https://your-domain.com) и прогони миграцию: `cd backend && npm run migrate`.

### 3. Вебхук для платежей и команд

```bash
curl -F "url=https://your-domain.com/bot/webhook" \
     -F "secret_token=$WEBHOOK_SECRET" \
     -F 'allowed_updates=["message","pre_checkout_query"]' \
     https://api.telegram.org/bot$BOT_TOKEN/setWebhook
```

`secret_token` обязателен: backend отвергает запросы без заголовка `X-Telegram-Bot-Api-Secret-Token`. Проверка: `getWebhookInfo` должен показать URL без ошибок, `/start` боту — прислать кнопку приложения.

### 4. Платежи Stars

Ничего подключать не нужно: для цифровых товаров Telegram требует именно Stars (XTR), provider_token не используется. Проверь цепочку: покупка в магазине → `openInvoice` → оплата → в течение секунд приходит `successful_payment` → товар выдан. Возвраты — `refundStarPayment` по `tg_charge_id` из таблицы `transactions`.

### 5. Чек-лист запуска

БД смигрирована, вебхук стоит, `/start` отвечает, будильник приходит (поставь себе `alarms_per_day=6` и узкое окно для теста), камера открывается (HTTPS!), тест-оплата Stars проходит, `npm test` зелёный. Аудио-файл `frontend/public/sax-loop.mp3` выложен (или устраивает синтез-fallback).
