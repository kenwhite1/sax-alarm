# Архитектура

## Общая схема

```
Telegram-клиент
 ├─ Bot API push «ПОРА ПИТЬ» ──► пользователь ──► открывает Mini App (web_app button, ?alarm=ID)
 └─ Mini App (React+TS, Vite)
     ├─ X-Tg-Init-Data (HMAC-подпись Telegram) на каждый запрос
     ▼
 Backend (Express + TS)
     ├─ PostgreSQL — источник истины (users, squads, drinks, payments, ads, reports)
     ├─ Redis — лидерборды (ZSET), rate-limit, pHash-память, presence, очередь верификации
     ├─ Scheduler — тик 60с, рандомные будильники, сквад-множитель
     └─ Bot API — уведомления, Stars-инвойсы, webhook платежей
```

## Frontend

Экраны: Home (статистика, окно активных часов), Alarm (полноэкранный: звук + камера + CV), Leaderboard (мир/сквад × день/неделя/всё время), Squad (создание/инвайт, буст, лента дринков с «оспорить»), Shop (Stars), Profile (стрики, бейджи).

CV-пайплайн (`vision/drinkDetector.ts`): 6 кадров с интервалом 550мс из живого видео → на каждом coco-ssd ищет cup/bottle/wine glass, FaceLandmarker — рот → score = доля кадров «сосуд у рта» с весом уверенности; liveness = суммарное движение сосуда + факт сближения со ртом. Модели грузятся параллельно с проигрыванием будильника, чтобы к моменту съёмки были готовы.

Аудио (`lib/audio.ts`): AudioContext создаётся в обработчике клика «Проснуться и налить» (обход запрета автоплея: notification → open Mini App → user gesture → звук). GainNode делает экспоненциальное крещендо 0.05→1.0 за 90с, трек зациклен; без mp3 включается синтез-fallback.

## Backend

Аутентификация: `middleware/auth.ts` валидирует initData по HMAC-SHA256 (ключ = HMAC("WebAppData", bot_token)), отсекает initData старше 24ч, апсертит пользователя и пишет presence в Redis (нужно сквад-множителю).

Планировщик (`scheduler.ts`): каждый тик для каждого активного юзера в его окне p = alarms_per_day / минуты_окна × squadBoost. Boost = 1 + 0.25 × (активные соседи по скваду за 30 мин), cap 2.0. Окно через полночь поддерживается. Будильник живёт 15 минут, потом `missed`.

Лидерборды: Redis ZSET на ключах `lb:global:{period}:{key}` и `lb:squad:{id}:...`; day/week имеют TTL, периоды — ISO-дата и ISO-неделя. Postgres хранит дринки как источник истины (пересборка ZSET возможна всегда), `leaderboard_snapshots` — история.

Платежи: `createInvoiceLink` c currency `XTR` → клиент `WebApp.openInvoice(link)` → Telegram шлёт `pre_checkout_query` (подтверждаем, если pending-транзакция существует) → `successful_payment` → транзакция `paid` (идемпотентно по payload), выдача товара: подписка продлевает `premium_until`, boost пишет множитель в Redis на день, предметы — в `inventory`.

## Схема БД

Все сущности — в `backend/migrations/001_init.sql`: users, squads, squad_members, alarms, drinks (+drink_frames с pHash каждого кадра), leaderboard_snapshots, badges/user_badges, products, transactions, subscriptions, inventory, ad_campaigns, ad_events, reports. Enum-статусы: alarm_status, drink_status (verified/unverified/flagged/rejected), tx_status, report_status.

## Ограничения Telegram и обходы

Автозапуск звука запрещён → звук по user gesture после открытия из пуша. Push при свёрнутом приложении невозможен из WebView → шлём через Bot API sendMessage с web_app-кнопкой. Фоновая работа Mini App отсутствует → активный будильник переспрашивается при каждом открытии (`/drinks/active-alarm`) и раз в 30с при открытом приложении.
