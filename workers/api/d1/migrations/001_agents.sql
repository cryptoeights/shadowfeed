-- Agent platform tables. Run with: wrangler d1 execute shadowfeed --remote --file=./d1/migrations/001_agents.sql

-- Users — identified by their main Stacks wallet address (auth via SIWS).
-- We don't store passwords; users prove ownership by signing a server-issued nonce.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,              -- UUID
  wallet_address TEXT UNIQUE NOT NULL, -- their main Stacks wallet
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_login_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);

-- Auth nonces — short-lived random strings the user signs to prove wallet ownership.
CREATE TABLE IF NOT EXISTS auth_nonces (
  nonce TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_nonces_expires ON auth_nonces(expires_at);

-- Sessions — JWT-like opaque tokens stored server-side for revocability.
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Agents — each agent has its own Stacks wallet that the platform controls
-- on behalf of the user. Agent private keys are stored encrypted with the
-- platform master key; user can withdraw the agent's STX balance back to
-- their main wallet at any time.
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,              -- UUID
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  template_type TEXT NOT NULL,       -- 'whale-tracker' | 'dca-bot' | 'gas-optimizer' | 'liquidation-hunter' | 'stacks-defi-monitor'
  config_json TEXT NOT NULL,         -- template-specific JSON config

  -- Agent's own Stacks wallet (custodial, encrypted at rest)
  agent_wallet_address TEXT UNIQUE NOT NULL,
  agent_wallet_encrypted_key TEXT NOT NULL,  -- AES-GCM ciphertext (base64)
  agent_wallet_iv TEXT NOT NULL,             -- AES-GCM IV (base64)

  -- Schedule + state
  schedule_cron TEXT NOT NULL,       -- e.g. '*/5 * * * *'
  active INTEGER NOT NULL DEFAULT 1,

  -- Notification
  webhook_url TEXT,

  -- Public visibility for /discover
  is_public INTEGER NOT NULL DEFAULT 0,
  public_slug TEXT UNIQUE,

  -- Denormalized stats for fast dashboard queries
  total_runs INTEGER NOT NULL DEFAULT 0,
  total_queries INTEGER NOT NULL DEFAULT 0,
  total_triggered INTEGER NOT NULL DEFAULT 0,
  total_spent_microstx INTEGER NOT NULL DEFAULT 0,
  last_run_at INTEGER,

  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_agents_user ON agents(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_active ON agents(active, last_run_at);
CREATE INDEX IF NOT EXISTS idx_agents_public ON agents(is_public, total_runs DESC);
CREATE INDEX IF NOT EXISTS idx_agents_template ON agents(template_type);
CREATE INDEX IF NOT EXISTS idx_agents_wallet ON agents(agent_wallet_address);

-- Agent runs — one row per cron execution. Used for analytics + history view.
CREATE TABLE IF NOT EXISTS agent_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  status TEXT NOT NULL,              -- 'running' | 'success' | 'failed' | 'condition_not_met' | 'insufficient_funds'
  queries_made INTEGER NOT NULL DEFAULT 0,
  spent_microstx INTEGER NOT NULL DEFAULT 0,
  triggered INTEGER NOT NULL DEFAULT 0,
  webhook_called INTEGER NOT NULL DEFAULT 0,
  webhook_status INTEGER,            -- HTTP status from webhook delivery
  error_message TEXT,
  trigger_snapshot TEXT              -- JSON snapshot of data that triggered (for analytics)
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agent_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
