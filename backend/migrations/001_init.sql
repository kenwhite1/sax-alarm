-- Sax Alarm — schema v1
-- PostgreSQL 15+

CREATE TABLE users (
  id            BIGINT PRIMARY KEY,              -- telegram user id
  username      TEXT,
  first_name    TEXT NOT NULL DEFAULT '',
  photo_url     TEXT,
  tz            TEXT NOT NULL DEFAULT 'Europe/Moscow',
  active_from   SMALLINT NOT NULL DEFAULT 12,    -- час начала окна будильников (локальное время)
  active_to     SMALLINT NOT NULL DEFAULT 22,    -- час конца окна (не будим ночью)
  alarms_per_day SMALLINT NOT NULL DEFAULT 2,    -- базовая ожидаемая частота
  is_premium    BOOLEAN NOT NULL DEFAULT FALSE,
  premium_until TIMESTAMPTZ,
  custom_sound  TEXT,                            -- premium: id сакс-ремикса
  streak_days   INT NOT NULL DEFAULT 0,
  last_drink_day DATE,
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  trust_score   REAL NOT NULL DEFAULT 1.0,       -- падает при фроде/репортах
  is_banned     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE squads (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  owner_id    BIGINT NOT NULL REFERENCES users(id),
  max_size    SMALLINT NOT NULL DEFAULT 10,      -- premium владельца → 25
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE squad_members (
  squad_id  BIGINT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (squad_id, user_id)
);
CREATE INDEX idx_squad_members_user ON squad_members(user_id);

CREATE TYPE alarm_status AS ENUM ('scheduled','fired','completed','missed','skipped');
CREATE TABLE alarms (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES users(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  fired_at     TIMESTAMPTZ,
  status       alarm_status NOT NULL DEFAULT 'scheduled',
  squad_boost  REAL NOT NULL DEFAULT 1.0,        -- множитель сквада в момент генерации
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_alarms_due ON alarms(status, scheduled_at);
CREATE INDEX idx_alarms_user ON alarms(user_id, created_at DESC);

CREATE TYPE drink_status AS ENUM ('verified','unverified','flagged','rejected');
CREATE TABLE drinks (
  id             BIGSERIAL PRIMARY KEY,
  user_id        BIGINT NOT NULL REFERENCES users(id),
  alarm_id       BIGINT REFERENCES alarms(id),
  status         drink_status NOT NULL DEFAULT 'unverified',
  client_score   REAL,                            -- confidence клиентского CV
  server_score   REAL,                            -- confidence серверной перепроверки
  liveness_score REAL,                            -- движение между кадрами
  phash          BIT(64),                         -- perceptual hash ключевого кадра
  frames_count   SMALLINT NOT NULL DEFAULT 0,
  capture_ms     BIGINT,                          -- клиентский timestamp съёмки
  meta           JSONB NOT NULL DEFAULT '{}',     -- bbox, класс объекта, device info
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_drinks_user_day ON drinks(user_id, created_at DESC);
CREATE INDEX idx_drinks_status ON drinks(status);

-- хэши всех кадров серии — для дедупликации
CREATE TABLE drink_frames (
  drink_id BIGINT NOT NULL REFERENCES drinks(id) ON DELETE CASCADE,
  seq      SMALLINT NOT NULL,
  phash    BIT(64) NOT NULL,
  PRIMARY KEY (drink_id, seq)
);

-- Лидерборды считаются в Redis (ZSET), снапшоты — для истории/аналитики
CREATE TABLE leaderboard_snapshots (
  id          BIGSERIAL PRIMARY KEY,
  scope       TEXT NOT NULL,                     -- 'global' | 'squad:<id>'
  period      TEXT NOT NULL,                     -- 'day' | 'week' | 'all'
  period_key  TEXT NOT NULL,                     -- '2026-07-02' / '2026-W27' / 'all'
  user_id     BIGINT NOT NULL REFERENCES users(id),
  drinks      INT NOT NULL,
  rank        INT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_lb_snap ON leaderboard_snapshots(scope, period, period_key, user_id);

CREATE TABLE badges (
  code  TEXT PRIMARY KEY,                        -- 'first_blood','sax_marathon','squad_legend',...
  title TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🏅',
  premium_only BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE user_badges (
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_code TEXT NOT NULL REFERENCES badges(code),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_code)
);

-- ===== Монетизация =====
CREATE TABLE products (
  code        TEXT PRIMARY KEY,                  -- 'premium_month','streak_freeze','alarm_skip','boost_day','profile_neon'
  title       TEXT NOT NULL,
  kind        TEXT NOT NULL,                     -- 'subscription' | 'item' | 'cosmetic' | 'boost'
  stars_price INT NOT NULL,
  meta        JSONB NOT NULL DEFAULT '{}'
);

CREATE TYPE tx_status AS ENUM ('pending','paid','refunded','failed');
CREATE TABLE transactions (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id),
  product_code  TEXT NOT NULL REFERENCES products(code),
  stars_amount  INT NOT NULL,
  status        tx_status NOT NULL DEFAULT 'pending',
  invoice_payload TEXT NOT NULL UNIQUE,          -- наш uuid, летит в invoice
  tg_charge_id  TEXT UNIQUE,                     -- telegram_payment_charge_id
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at       TIMESTAMPTZ
);
CREATE INDEX idx_tx_user ON transactions(user_id, created_at DESC);

CREATE TABLE subscriptions (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id),
  tx_id      BIGINT NOT NULL REFERENCES transactions(id),
  plan       TEXT NOT NULL DEFAULT 'premium_month',
  starts_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active'      -- active | expired | refunded
);
CREATE INDEX idx_subs_user ON subscriptions(user_id, expires_at DESC);

CREATE TABLE inventory (
  user_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL REFERENCES products(code),
  qty       INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, item_code)
);

-- ===== Реклама (бары / бренды) =====
CREATE TABLE ad_campaigns (
  id         BIGSERIAL PRIMARY KEY,
  advertiser TEXT NOT NULL,
  kind       TEXT NOT NULL,                      -- 'drink_of_week' | 'coupon' | 'leaderboard_slot' | 'squad_challenge'
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  image_url  TEXT,
  cta_url    TEXT,
  coupon_code TEXT,
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ NOT NULL,
  daily_cap  INT NOT NULL DEFAULT 10000,         -- лимит показов/день
  status     TEXT NOT NULL DEFAULT 'active',
  meta       JSONB NOT NULL DEFAULT '{}'         -- условия челленджа, гео и т.п.
);
CREATE INDEX idx_ads_active ON ad_campaigns(status, starts_at, ends_at);

CREATE TABLE ad_events (
  id          BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES ad_campaigns(id),
  user_id     BIGINT REFERENCES users(id),
  event       TEXT NOT NULL,                     -- 'impression' | 'click' | 'coupon_redeem' | 'challenge_join' | 'challenge_done'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta        JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_ad_events ON ad_events(campaign_id, event, created_at);

-- ===== Репорты (соц. антифрод) =====
CREATE TYPE report_status AS ENUM ('open','upheld','dismissed');
CREATE TABLE reports (
  id          BIGSERIAL PRIMARY KEY,
  drink_id    BIGINT NOT NULL REFERENCES drinks(id) ON DELETE CASCADE,
  reporter_id BIGINT NOT NULL REFERENCES users(id),
  reason      TEXT NOT NULL DEFAULT 'suspicious',
  status      report_status NOT NULL DEFAULT 'open',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (drink_id, reporter_id)
);

-- ===== Сиды =====
INSERT INTO products (code, title, kind, stars_price, meta) VALUES
 ('premium_month','Sax Premium · месяц','subscription',250,'{"days":30}'),
 ('streak_freeze','Заморозка стрика','item',50,'{}'),
 ('alarm_skip','Пропуск будильника','item',30,'{}'),
 ('boost_day','Буст лидерборда ×2 на день','boost',100,'{"multiplier":2}'),
 ('profile_neon','Неоновая рамка профиля','cosmetic',75,'{}'),
 ('profile_gold_sax','Золотой саксофон в профиле','cosmetic',150,'{}');

INSERT INTO badges (code, title, emoji, premium_only) VALUES
 ('first_blood','Первый дринк','🥃',false),
 ('week_streak','7 дней подряд','🔥',false),
 ('sax_marathon','30 дней подряд','🎷',false),
 ('squad_legend','Топ-1 сквада за неделю','👑',false),
 ('night_owl','Дринк в последнюю минуту окна','🦉',false),
 ('velvet_note','Бархатная нота','💜',true),
 ('golden_reed','Золотая трость','🏆',true);
