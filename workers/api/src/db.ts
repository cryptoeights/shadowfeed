import type { Env, QueryRow, FeedStatRow, LeaderboardRow } from './types';

export async function initDb(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS queries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        feed_id TEXT NOT NULL,
        payer TEXT,
        tx_hash TEXT,
        response_ms INTEGER NOT NULL,
        response_data TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS feed_stats (
        feed_id TEXT PRIMARY KEY,
        total_queries INTEGER NOT NULL DEFAULT 0,
        total_errors INTEGER NOT NULL DEFAULT 0,
        avg_response_ms REAL NOT NULL DEFAULT 0,
        last_query_at INTEGER
      )
    `),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_queries_feed ON queries(feed_id)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_queries_payer ON queries(payer)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_queries_created ON queries(created_at)`),
  ]);
}

export async function ensureFeedStats(db: D1Database, feedIds: string[]): Promise<void> {
  const stmts = feedIds.map(id =>
    db.prepare('INSERT OR IGNORE INTO feed_stats (feed_id, total_queries, total_errors, avg_response_ms) VALUES (?, 0, 0, 0)').bind(id)
  );
  await db.batch(stmts);
}

export async function recordQuery(
  db: D1Database,
  feedId: string,
  payer: string | undefined,
  txHash: string | undefined,
  responseMs: number,
  responseData?: unknown
): Promise<void> {
  const dataJson = responseData ? JSON.stringify(responseData) : null;

  await db.batch([
    db.prepare(
      'INSERT INTO queries (feed_id, payer, tx_hash, response_ms, response_data) VALUES (?, ?, ?, ?, ?)'
    ).bind(feedId, payer ?? null, txHash ?? null, responseMs, dataJson),
    db.prepare(
      `UPDATE feed_stats SET
        total_queries = total_queries + 1,
        avg_response_ms = (avg_response_ms * total_queries + ?) / (total_queries + 1),
        last_query_at = unixepoch()
      WHERE feed_id = ?`
    ).bind(responseMs, feedId),
  ]);
}

export async function getFeedStats(db: D1Database): Promise<FeedStatRow[]> {
  const { results } = await db.prepare('SELECT * FROM feed_stats').all<FeedStatRow>();
  return results;
}

export async function getTotalQueries(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT SUM(total_queries) as total FROM feed_stats').first<{ total: number }>();
  return row?.total ?? 0;
}

export async function getRecentQueries(db: D1Database, limit: number = 50): Promise<QueryRow[]> {
  const { results } = await db.prepare(
    'SELECT * FROM queries ORDER BY created_at DESC, id DESC LIMIT ?'
  ).bind(limit).all<QueryRow>();
  return results;
}

export async function getQueryById(db: D1Database, id: number): Promise<QueryRow | null> {
  return await db.prepare('SELECT * FROM queries WHERE id = ?').bind(id).first<QueryRow>();
}

export async function getUniqueAgents(db: D1Database): Promise<number> {
  const row = await db.prepare(
    'SELECT COUNT(DISTINCT payer) as count FROM queries WHERE payer IS NOT NULL'
  ).first<{ count: number }>();
  return row?.count ?? 0;
}

export async function getAgentLeaderboard(db: D1Database, limit: number = 10): Promise<LeaderboardRow[]> {
  const { results } = await db.prepare(`
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
  `).bind(limit).all<LeaderboardRow>();
  return results;
}

export async function getTotalRevenue(db: D1Database): Promise<number> {
  const feedPrices: Record<string, number> = {
    'whale-alerts': 0.005,
    'btc-sentiment': 0.003,
    'defi-scores': 0.01,
    'smart-money-flows': 0.08,
    'token-intel': 0.05,
    'wallet-profiler': 0.05,
    'smart-money-holdings': 0.05,
    'dex-trades': 0.08,
    'liquidation-alerts': 0.008,
    'gas-prediction': 0.003,
    'token-launches': 0.005,
    'governance': 0.005,
    'stablecoin-flows': 0.005,
    'security-alerts': 0.005,
    'dev-activity': 0.003,
    'bridge-flows': 0.005,
  };
  const stats = await getFeedStats(db);
  let total = 0;
  for (const s of stats) {
    total += s.total_queries * (feedPrices[s.feed_id] ?? 0);
  }
  return total;
}
