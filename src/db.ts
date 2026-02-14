import Database from 'better-sqlite3';
import path from 'path';

// Use persistent volume path on Railway, fallback to local for dev
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', 'shadowfeed.db');
const db: InstanceType<typeof Database> = new Database(DB_PATH);

// Enable WAL mode for better concurrent reads
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
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
`);

// Migration: add response_data column if missing
try {
  db.exec('ALTER TABLE queries ADD COLUMN response_data TEXT');
} catch {}

// Initialize feed stats for known feeds
const initFeed = db.prepare(`
  INSERT OR IGNORE INTO feed_stats (feed_id, total_queries, total_errors, avg_response_ms)
  VALUES (?, 0, 0, 0)
`);

for (const feedId of ['whale-alerts', 'btc-sentiment', 'defi-scores']) {
  initFeed.run(feedId);
}

export function recordQuery(feedId: string, payer: string | undefined, txHash: string | undefined, responseMs: number, responseData?: any) {
  const insertQuery = db.prepare(`
    INSERT INTO queries (feed_id, payer, tx_hash, response_ms, response_data) VALUES (?, ?, ?, ?, ?)
  `);

  const updateStats = db.prepare(`
    UPDATE feed_stats SET
      total_queries = total_queries + 1,
      avg_response_ms = (avg_response_ms * total_queries + ?) / (total_queries + 1),
      last_query_at = unixepoch()
    WHERE feed_id = ?
  `);

  const dataJson = responseData ? JSON.stringify(responseData) : null;

  const transaction = db.transaction(() => {
    insertQuery.run(feedId, payer || null, txHash || null, responseMs, dataJson);
    updateStats.run(responseMs, feedId);
  });

  transaction();
}

export function getFeedStats() {
  return db.prepare('SELECT * FROM feed_stats').all() as Array<{
    feed_id: string;
    total_queries: number;
    total_errors: number;
    avg_response_ms: number;
    last_query_at: number | null;
  }>;
}

export function getTotalQueries(): number {
  const row = db.prepare('SELECT SUM(total_queries) as total FROM feed_stats').get() as { total: number };
  return row.total || 0;
}

export function getRecentQueries(limit: number = 50) {
  return db.prepare('SELECT * FROM queries ORDER BY created_at DESC, id DESC LIMIT ?').all(limit) as Array<{
    id: number;
    feed_id: string;
    payer: string | null;
    tx_hash: string | null;
    response_ms: number;
    created_at: number;
  }>;
}

export function getQueryById(id: number) {
  return db.prepare('SELECT * FROM queries WHERE id = ?').get(id) as {
    id: number;
    feed_id: string;
    payer: string | null;
    tx_hash: string | null;
    response_ms: number;
    response_data: string | null;
    created_at: number;
  } | undefined;
}

export function getUniqueAgents(): number {
  const row = db.prepare('SELECT COUNT(DISTINCT payer) as count FROM queries WHERE payer IS NOT NULL').get() as { count: number };
  return row.count || 0;
}

export function getAgentLeaderboard(limit: number = 10) {
  return db.prepare(`
    SELECT
      payer as address,
      COUNT(*) as total_queries,
      SUM(CASE WHEN feed_id = 'whale-alerts' THEN 1 ELSE 0 END) as whale_queries,
      SUM(CASE WHEN feed_id = 'btc-sentiment' THEN 1 ELSE 0 END) as sentiment_queries,
      SUM(CASE WHEN feed_id = 'defi-scores' THEN 1 ELSE 0 END) as defi_queries,
      ROUND(AVG(response_ms), 0) as avg_response_ms,
      MIN(created_at) as first_seen,
      MAX(created_at) as last_seen
    FROM queries
    WHERE payer IS NOT NULL
    GROUP BY payer
    ORDER BY total_queries DESC
    LIMIT ?
  `).all(limit) as Array<{
    address: string;
    total_queries: number;
    whale_queries: number;
    sentiment_queries: number;
    defi_queries: number;
    avg_response_ms: number;
    first_seen: number;
    last_seen: number;
  }>;
}

export function getTotalRevenue() {
  const feedPrices: Record<string, number> = {
    'whale-alerts': 0.005,
    'btc-sentiment': 0.003,
    'defi-scores': 0.01,
  };
  const stats = getFeedStats();
  let total = 0;
  for (const s of stats) {
    total += s.total_queries * (feedPrices[s.feed_id] || 0);
  }
  return total;
}

export default db;
