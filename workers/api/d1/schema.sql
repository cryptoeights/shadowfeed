CREATE TABLE IF NOT EXISTS queries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_id TEXT NOT NULL,
  payer TEXT,
  tx_hash TEXT,
  response_ms INTEGER NOT NULL,
  response_data TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS feed_stats (
  feed_id TEXT PRIMARY KEY,
  total_queries INTEGER NOT NULL DEFAULT 0,
  total_errors INTEGER NOT NULL DEFAULT 0,
  avg_response_ms REAL NOT NULL DEFAULT 0,
  last_query_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_queries_feed ON queries(feed_id);
CREATE INDEX IF NOT EXISTS idx_queries_payer ON queries(payer);
CREATE INDEX IF NOT EXISTS idx_queries_created ON queries(created_at);

INSERT OR IGNORE INTO feed_stats (feed_id, total_queries, total_errors, avg_response_ms) VALUES ('whale-alerts', 0, 0, 0);
INSERT OR IGNORE INTO feed_stats (feed_id, total_queries, total_errors, avg_response_ms) VALUES ('btc-sentiment', 0, 0, 0);
INSERT OR IGNORE INTO feed_stats (feed_id, total_queries, total_errors, avg_response_ms) VALUES ('defi-scores', 0, 0, 0);
