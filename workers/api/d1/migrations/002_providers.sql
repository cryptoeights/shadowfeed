-- Provider portal tables. Run with:
--   wrangler d1 execute shadowfeed --local --file=./d1/migrations/002_providers.sql
-- Or for production:
--   wrangler d1 execute shadowfeed --remote --file=./d1/migrations/002_providers.sql

-- Providers — external data vendors that publish feeds on the marketplace.
-- Each provider gets a custodial Stacks wallet (encrypted private key stored here)
-- so they can onboard without owning a wallet upfront. They link a withdrawal
-- wallet later when ready to cash out.
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,                  -- UUID
  user_id TEXT NOT NULL REFERENCES users(id),  -- reuse SIWS auth user record
  handle TEXT UNIQUE NOT NULL,          -- url-safe slug, e.g. 'hyre', 'defillama'
  name TEXT NOT NULL,                   -- display name
  description TEXT,
  logo_url TEXT,
  website TEXT,
  twitter_handle TEXT,
  contact_email TEXT,

  -- Custodial wallet (auto-generated on signup, mirror agent-wallet.ts pattern)
  custodial_address TEXT UNIQUE NOT NULL,
  custodial_encrypted_key TEXT NOT NULL,  -- AES-GCM ciphertext (base64)
  custodial_iv TEXT NOT NULL,             -- AES-GCM IV (base64)

  -- Linked withdrawal wallet (provider's personal Stacks address; verified via SIWS).
  -- Nullable until provider initiates first withdrawal.
  linked_withdrawal_address TEXT,
  linked_at INTEGER,

  -- Integration mode — only 2 modes for M2.
  mode TEXT NOT NULL CHECK (mode IN ('partner_bridge', 'hosted_mirror')),

  -- For partner_bridge mode:
  partner_endpoint TEXT,                -- e.g. 'https://partner.hyreagent.fun'
  hmac_secret_hash TEXT,                -- sha256 hash of secret (verify only)
  hmac_rotated_at INTEGER,

  -- Status lifecycle
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'banned')),
  verified INTEGER NOT NULL DEFAULT 0,   -- "Verified" badge for trusted providers

  -- Revenue accounting (micro-STX)
  pending_revenue_microstx INTEGER NOT NULL DEFAULT 0,
  total_earned_microstx INTEGER NOT NULL DEFAULT 0,
  total_withdrawn_microstx INTEGER NOT NULL DEFAULT 0,

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  activated_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_providers_user ON providers(user_id);
CREATE INDEX IF NOT EXISTS idx_providers_handle ON providers(handle);
CREATE INDEX IF NOT EXISTS idx_providers_status ON providers(status);
CREATE INDEX IF NOT EXISTS idx_providers_custodial ON providers(custodial_address);

-- Provider feeds — each feed a provider offers for sale.
CREATE TABLE IF NOT EXISTS provider_feeds (
  id TEXT PRIMARY KEY,                  -- UUID
  provider_id TEXT NOT NULL REFERENCES providers(id),
  slug TEXT NOT NULL,                   -- per-provider unique, e.g. 'pumpfun-launches'
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,                        -- 'on-chain' | 'analytics' | 'discovery' | etc.
  price_microstx INTEGER NOT NULL,

  -- For partner_bridge mode: relative path on partner endpoint
  source_path TEXT,                     -- e.g. '/v1/trenches/new-tokens'
  source_method TEXT DEFAULT 'GET',     -- 'GET' | 'POST'

  -- For hosted_mirror mode: where we pull/receive data from
  source_type TEXT,                     -- 'r2_url' | 'github_raw' | 'webhook_push' | 'manual_upload'
  source_url TEXT,                      -- the actual URL we poll (or null for push/upload)
  poll_interval_seconds INTEGER,        -- how often we re-fetch (60 to 86400)
  last_polled_at INTEGER,
  last_poll_status TEXT,                -- 'ok' | 'error: ...'

  -- Denormalized stats
  total_queries INTEGER NOT NULL DEFAULT 0,
  total_revenue_microstx INTEGER NOT NULL DEFAULT 0,
  last_query_at INTEGER,

  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),

  UNIQUE(provider_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_provider_feeds_provider ON provider_feeds(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_feeds_active ON provider_feeds(active);
CREATE INDEX IF NOT EXISTS idx_provider_feeds_slug ON provider_feeds(provider_id, slug);

-- Cached payload for hosted_mirror feeds. KV is the hot-path cache; this is the
-- durable copy + history root.
CREATE TABLE IF NOT EXISTS feed_cache (
  feed_id TEXT PRIMARY KEY REFERENCES provider_feeds(id),
  payload_json TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,         -- integrity check + change detection
  cached_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Per-query revenue events. Append-only ledger for auditability + analytics.
-- Each row = one paid query that routed revenue to a provider.
CREATE TABLE IF NOT EXISTS provider_query_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id TEXT NOT NULL REFERENCES providers(id),
  feed_id TEXT NOT NULL REFERENCES provider_feeds(id),
  payer TEXT,                           -- buyer wallet address
  tx_hash TEXT,                         -- on-chain settlement tx
  gross_microstx INTEGER NOT NULL,      -- full price the buyer paid
  platform_fee_microstx INTEGER NOT NULL,  -- 3% to ShadowFeed
  provider_net_microstx INTEGER NOT NULL,  -- 97% credited to provider
  response_ms INTEGER NOT NULL,
  upstream_status INTEGER,              -- HTTP status from provider endpoint
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_pql_provider ON provider_query_log(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pql_feed ON provider_query_log(feed_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pql_payer ON provider_query_log(payer);

-- Withdrawals — provider initiates, we sign + broadcast, then poll for confirmation.
CREATE TABLE IF NOT EXISTS provider_withdrawals (
  id TEXT PRIMARY KEY,                  -- UUID
  provider_id TEXT NOT NULL REFERENCES providers(id),
  amount_microstx INTEGER NOT NULL,
  destination_address TEXT NOT NULL,
  fee_microstx INTEGER,                 -- network fee paid
  tx_hash TEXT,                         -- nullable until broadcast
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'broadcast', 'confirmed', 'failed', 'cancelled')),
  error_message TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  broadcast_at INTEGER,
  confirmed_at INTEGER,

  -- Idempotency key prevents accidental double-spends from retries.
  idempotency_key TEXT UNIQUE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_provider ON provider_withdrawals(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON provider_withdrawals(status, broadcast_at);

-- HMAC nonces — short-lived (5min) cache to prevent replay attacks on partner
-- endpoint calls. Stored in D1 instead of KV so it shares the same tx boundary
-- as the feed query for stronger atomicity (KV is eventual).
-- Cleanup via cron sweep.
CREATE TABLE IF NOT EXISTS hmac_nonces (
  nonce TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,             -- which provider used it
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_hmac_nonces_expires ON hmac_nonces(expires_at);

-- Audit log — security-relevant events on a provider account.
CREATE TABLE IF NOT EXISTS provider_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id TEXT NOT NULL REFERENCES providers(id),
  action TEXT NOT NULL,                 -- 'login' | 'feed_create' | 'withdraw_init' | 'hmac_rotate' | etc.
  metadata_json TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_pal_provider ON provider_audit_log(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pal_action ON provider_audit_log(action);
