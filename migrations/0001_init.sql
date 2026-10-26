-- Skema D1 untuk PeakAlpha.
-- Satu tabel per koleksi pada kontrak Dataset (lib/types.ts).
-- Jalankan dengan: npx wrangler d1 migrations apply hanamasak --local

CREATE TABLE dataset_meta (
  id TEXT PRIMARY KEY,
  range_start TEXT NOT NULL,
  range_end TEXT NOT NULL,
  range_days INTEGER NOT NULL,
  history_start TEXT NOT NULL,
  history_end TEXT NOT NULL,
  history_days INTEGER NOT NULL,
  generated_at TEXT NOT NULL
);

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  display_name TEXT NOT NULL,
  followers INTEGER NOT NULL,
  followers_start INTEGER NOT NULL,
  connection TEXT NOT NULL,
  -- Array scope OAuth disimpan sebagai JSON.
  scopes TEXT NOT NULL,
  last_sync_at TEXT,
  limitation TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE social_daily (
  date TEXT NOT NULL,
  platform TEXT NOT NULL,
  views INTEGER NOT NULL,
  reach INTEGER NOT NULL,
  impressions INTEGER NOT NULL,
  likes INTEGER NOT NULL,
  comments INTEGER NOT NULL,
  shares INTEGER NOT NULL,
  saves INTEGER NOT NULL,
  followers_gained INTEGER NOT NULL,
  profile_visits INTEGER NOT NULL,
  link_clicks INTEGER NOT NULL,
  PRIMARY KEY (date, platform)
);

CREATE INDEX idx_social_daily_platform_date ON social_daily (platform, date);

CREATE TABLE content (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  title TEXT NOT NULL,
  format TEXT NOT NULL,
  topic TEXT NOT NULL,
  published_at TEXT NOT NULL,
  views INTEGER NOT NULL,
  likes INTEGER NOT NULL,
  comments INTEGER NOT NULL,
  shares INTEGER NOT NULL,
  saves INTEGER NOT NULL,
  link_clicks INTEGER NOT NULL
);

CREATE INDEX idx_content_published_at ON content (published_at DESC);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  topic TEXT NOT NULL,
  text TEXT NOT NULL,
  author TEXT NOT NULL,
  sentiment TEXT NOT NULL,
  intent TEXT NOT NULL,
  created_at TEXT NOT NULL,
  likes INTEGER NOT NULL
);

CREATE INDEX idx_comments_created_at ON comments (created_at DESC);

CREATE TABLE web_daily (
  date TEXT PRIMARY KEY,
  sessions INTEGER NOT NULL,
  users INTEGER NOT NULL,
  new_users INTEGER NOT NULL,
  page_views INTEGER NOT NULL,
  bounce_rate REAL NOT NULL,
  avg_session_seconds INTEGER NOT NULL,
  conversions INTEGER NOT NULL
);

CREATE TABLE sources (
  source TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  -- NULL untuk kanal non-sosial (organic, direct, referral, paid, email).
  platform TEXT,
  sessions INTEGER NOT NULL,
  sessions_prev INTEGER NOT NULL,
  conversions INTEGER NOT NULL,
  conversions_prev INTEGER NOT NULL,
  bounce_rate REAL NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE pages (
  path TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  views30 INTEGER NOT NULL,
  views30_prev INTEGER NOT NULL,
  conversions30 INTEGER NOT NULL,
  conversions30_prev INTEGER NOT NULL,
  conversions7 INTEGER NOT NULL,
  conversions7_prev INTEGER NOT NULL,
  avg_seconds INTEGER NOT NULL,
  exit_rate REAL NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE search (
  query TEXT PRIMARY KEY,
  impressions INTEGER NOT NULL,
  clicks INTEGER NOT NULL,
  clicks_prev INTEGER NOT NULL,
  ctr REAL NOT NULL,
  position REAL NOT NULL,
  position_prev REAL NOT NULL,
  sort_order INTEGER NOT NULL
);
