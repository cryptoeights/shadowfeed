import type { Env, QueryRow, FeedStatRow, LeaderboardRow } from './types';

// Valid values for the source_type column on queries and provider_query_log.
export type SourceType = 'real_onchain' | 'demo' | 'simulation' | 'unknown';

/**
 * Derive the source_type from a tx_hash value.
 * Rules mirror the backfill SQL in 004_activity_source_tagging.sql exactly so
 * newly inserted rows are consistent with the backfilled historical data.
 */
export function deriveSourceType(txHash: string | undefined | null): SourceType {
  if (!txHash) return 'simulation';
  if (txHash.startsWith('demo_')) return 'demo';
  if (txHash.length >= 60 && /^[0-9a-fA-F]+$/.test(txHash)) return 'real_onchain';
  return 'unknown';
}

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
  responseData?: unknown,
  sourceType?: SourceType,
): Promise<void> {
  const dataJson = responseData ? JSON.stringify(responseData) : null;
  const resolvedSource: SourceType = sourceType ?? deriveSourceType(txHash);

  await db.batch([
    db.prepare(
      'INSERT INTO queries (feed_id, payer, tx_hash, response_ms, response_data, source_type) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(feedId, payer ?? null, txHash ?? null, responseMs, dataJson, resolvedSource),
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

export async function getRecentQueries(
  db: D1Database,
  limit: number = 50,
  sourceTypeFilter: SourceType | 'all' = 'real_onchain',
): Promise<QueryRow[]> {
  const sql =
    sourceTypeFilter === 'all'
      ? 'SELECT * FROM queries ORDER BY created_at DESC, id DESC LIMIT ?'
      : 'SELECT * FROM queries WHERE source_type = ? ORDER BY created_at DESC, id DESC LIMIT ?';

  const { results } =
    sourceTypeFilter === 'all'
      ? await db.prepare(sql).bind(limit).all<QueryRow>()
      : await db.prepare(sql).bind(sourceTypeFilter, limit).all<QueryRow>();
  return results;
}

export async function getQueryById(db: D1Database, id: number): Promise<QueryRow | null> {
  return await db.prepare('SELECT * FROM queries WHERE id = ?').bind(id).first<QueryRow>();
}

export async function getUniqueAgents(
  db: D1Database,
  sourceTypeFilter: SourceType | 'all' = 'real_onchain',
): Promise<number> {
  const sql =
    sourceTypeFilter === 'all'
      ? 'SELECT COUNT(DISTINCT payer) as count FROM queries WHERE payer IS NOT NULL'
      : 'SELECT COUNT(DISTINCT payer) as count FROM queries WHERE payer IS NOT NULL AND source_type = ?';

  const row =
    sourceTypeFilter === 'all'
      ? await db.prepare(sql).first<{ count: number }>()
      : await db.prepare(sql).bind(sourceTypeFilter).first<{ count: number }>();
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

// ────────────────────────────────────────────────────────────────────────
// External provider query log helpers — same shape concept as platform
// queries, but stored in provider_query_log with explicit revenue split.
// Used so /activity, /leaderboard, /stats can include external traffic.
// ────────────────────────────────────────────────────────────────────────

export interface ProviderActivityRow {
  readonly id: number;
  readonly feed_id: string;       // composite: '<handle>/<feed-slug>'
  readonly payer: string | null;
  readonly tx_hash: string | null;
  readonly response_ms: number;
  readonly created_at: number;
  readonly price_stx: number;     // gross paid by buyer (not split)
  readonly upstream_status: number | null;
  readonly source_type: SourceType;
}

export async function getRecentProviderQueries(
  db: D1Database,
  limit: number = 50,
  sourceTypeFilter: SourceType | 'all' = 'real_onchain',
): Promise<ProviderActivityRow[]> {
  const whereClause =
    sourceTypeFilter === 'all'
      ? ''
      : 'AND pql.source_type = ?';

  const sql = `
    SELECT
      pql.id,
      p.handle || '/' || f.slug AS feed_id,
      pql.payer,
      pql.tx_hash,
      pql.response_ms,
      pql.created_at,
      pql.gross_microstx / 1000000.0 AS price_stx,
      pql.upstream_status,
      pql.source_type
    FROM provider_query_log pql
    JOIN providers p ON p.id = pql.provider_id
    JOIN provider_feeds f ON f.id = pql.feed_id
    WHERE 1=1 ${whereClause}
    ORDER BY pql.created_at DESC, pql.id DESC
    LIMIT ?
  `;

  const { results } =
    sourceTypeFilter === 'all'
      ? await db.prepare(sql).bind(limit).all<ProviderActivityRow>()
      : await db.prepare(sql).bind(sourceTypeFilter, limit).all<ProviderActivityRow>();
  return results;
}

export async function getProviderUniquePayers(
  db: D1Database,
  sourceTypeFilter: SourceType | 'all' = 'real_onchain',
): Promise<number> {
  const sql =
    sourceTypeFilter === 'all'
      ? 'SELECT COUNT(DISTINCT payer) as count FROM provider_query_log WHERE payer IS NOT NULL'
      : 'SELECT COUNT(DISTINCT payer) as count FROM provider_query_log WHERE payer IS NOT NULL AND source_type = ?';

  const row =
    sourceTypeFilter === 'all'
      ? await db.prepare(sql).first<{ count: number }>()
      : await db.prepare(sql).bind(sourceTypeFilter).first<{ count: number }>();
  return row?.count ?? 0;
}

export async function getProviderTotalGross(
  db: D1Database,
  sourceTypeFilter: SourceType | 'all' = 'real_onchain',
): Promise<number> {
  const sql =
    sourceTypeFilter === 'all'
      ? 'SELECT COALESCE(SUM(gross_microstx), 0) as total FROM provider_query_log'
      : 'SELECT COALESCE(SUM(gross_microstx), 0) as total FROM provider_query_log WHERE source_type = ?';

  const row =
    sourceTypeFilter === 'all'
      ? await db.prepare(sql).first<{ total: number }>()
      : await db.prepare(sql).bind(sourceTypeFilter).first<{ total: number }>();
  return (row?.total ?? 0) / 1_000_000;
}

export interface ProviderLeaderboardRow {
  readonly address: string;
  readonly total_queries: number;
  readonly total_spent_microstx: number;
  readonly avg_response_ms: number;
  readonly first_seen: number;
  readonly last_seen: number;
}

export async function getProviderAgentLeaderboard(
  db: D1Database,
  limit: number = 50,
): Promise<ProviderLeaderboardRow[]> {
  const { results } = await db
    .prepare(`
      SELECT
        payer AS address,
        COUNT(*) AS total_queries,
        SUM(gross_microstx) AS total_spent_microstx,
        ROUND(AVG(response_ms), 0) AS avg_response_ms,
        MIN(created_at) AS first_seen,
        MAX(created_at) AS last_seen
      FROM provider_query_log
      WHERE payer IS NOT NULL
      GROUP BY payer
      ORDER BY total_queries DESC
      LIMIT ?
    `)
    .bind(limit)
    .all<ProviderLeaderboardRow>();
  return results;
}

export interface ProviderFeedStatsRow {
  readonly feed_id: string;        // composite handle/slug
  readonly total_queries: number;
  readonly avg_response_ms: number;
  readonly error_rate: number;
}

export async function getProviderFeedStats(db: D1Database): Promise<ProviderFeedStatsRow[]> {
  const { results } = await db
    .prepare(`
      SELECT
        p.handle || '/' || f.slug AS feed_id,
        COUNT(*) AS total_queries,
        ROUND(AVG(pql.response_ms), 0) AS avg_response_ms,
        AVG(CASE WHEN pql.upstream_status >= 400 THEN 1.0 ELSE 0.0 END) AS error_rate
      FROM provider_query_log pql
      JOIN providers p ON p.id = pql.provider_id
      JOIN provider_feeds f ON f.id = pql.feed_id
      GROUP BY p.handle, f.slug
      ORDER BY total_queries DESC
    `)
    .all<ProviderFeedStatsRow>();
  return results;
}

export async function getTotalRevenue(
  db: D1Database,
  sourceTypeFilter: SourceType | 'all' = 'real_onchain',
): Promise<number> {
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

  // For source-filtered revenue we need per-feed query counts by source_type.
  // The feed_stats table aggregates all queries without source tag, so we query
  // the queries table directly when filtering.
  if (sourceTypeFilter !== 'all') {
    const { results } = await db
      .prepare(
        'SELECT feed_id, COUNT(*) as n FROM queries WHERE source_type = ? GROUP BY feed_id',
      )
      .bind(sourceTypeFilter)
      .all<{ feed_id: string; n: number }>();
    let total = 0;
    for (const row of results) {
      total += row.n * (feedPrices[row.feed_id] ?? 0);
    }
    return total;
  }

  const stats = await getFeedStats(db);
  let total = 0;
  for (const s of stats) {
    total += s.total_queries * (feedPrices[s.feed_id] ?? 0);
  }
  return total;
}

// ────────────────────────────────────────────────────────────────────────
// CSV export helpers — real_onchain rows only across both tables.
// ────────────────────────────────────────────────────────────────────────

export interface CsvExportRow {
  readonly timestamp_iso: string;
  readonly buyer_wallet: string;
  readonly feed: string;
  readonly provider: string;
  readonly price_microstx: number;
  readonly price_stx: number;
  readonly tx_hash: string;
  readonly explorer_url: string;
  readonly source_type: string;
}

export async function getRealOnchainSettlements(
  db: D1Database,
  network: string,
): Promise<CsvExportRow[]> {
  // Platform queries — real_onchain only.
  const { results: platformRows } = await db
    .prepare(`
      SELECT
        datetime(created_at, 'unixepoch') AS ts,
        COALESCE(payer, 'unknown') AS payer,
        feed_id,
        tx_hash
      FROM queries
      WHERE source_type = 'real_onchain'
        AND tx_hash IS NOT NULL
        AND payer IS NOT NULL
      ORDER BY created_at ASC
    `)
    .all<{ ts: string; payer: string; feed_id: string; tx_hash: string }>();

  // Provider query log — real_onchain only, with feed composite name.
  const { results: providerRows } = await db
    .prepare(`
      SELECT
        datetime(pql.created_at, 'unixepoch') AS ts,
        COALESCE(pql.payer, 'unknown') AS payer,
        p.handle || '/' || f.slug AS feed_id,
        p.handle AS provider_handle,
        pql.tx_hash,
        pql.gross_microstx
      FROM provider_query_log pql
      JOIN providers p ON p.id = pql.provider_id
      JOIN provider_feeds f ON f.id = pql.feed_id
      WHERE pql.source_type = 'real_onchain'
        AND pql.tx_hash IS NOT NULL
        AND pql.payer IS NOT NULL
      ORDER BY pql.created_at ASC
    `)
    .all<{
      ts: string;
      payer: string;
      feed_id: string;
      provider_handle: string;
      tx_hash: string;
      gross_microstx: number;
    }>();

  const FEED_PRICES_MICROSTX: Record<string, number> = {
    'whale-alerts': 5000,
    'btc-sentiment': 3000,
    'defi-scores': 10000,
    'smart-money-flows': 80000,
    'token-intel': 50000,
    'wallet-profiler': 50000,
    'smart-money-holdings': 50000,
    'dex-trades': 80000,
    'liquidation-alerts': 8000,
    'gas-prediction': 3000,
    'token-launches': 5000,
    'governance': 5000,
    'stablecoin-flows': 5000,
    'security-alerts': 5000,
    'dev-activity': 3000,
    'bridge-flows': 5000,
  };

  const platformCsv: CsvExportRow[] = platformRows.map((r) => {
    const priceMicrostx = FEED_PRICES_MICROSTX[r.feed_id] ?? 0;
    return {
      timestamp_iso: `${r.ts.replace(' ', 'T')}Z`,
      buyer_wallet: r.payer,
      feed: r.feed_id,
      provider: 'shadowfeed',
      price_microstx: priceMicrostx,
      price_stx: priceMicrostx / 1_000_000,
      tx_hash: r.tx_hash,
      explorer_url: `https://explorer.hiro.so/txid/${r.tx_hash}?chain=${network}`,
      source_type: 'real_onchain',
    };
  });

  const providerCsv: CsvExportRow[] = providerRows.map((r) => ({
    timestamp_iso: `${r.ts.replace(' ', 'T')}Z`,
    buyer_wallet: r.payer,
    feed: r.feed_id,
    provider: r.provider_handle,
    price_microstx: r.gross_microstx,
    price_stx: r.gross_microstx / 1_000_000,
    tx_hash: r.tx_hash,
    explorer_url: `https://explorer.hiro.so/txid/${r.tx_hash}?chain=${network}`,
    source_type: 'real_onchain',
  }));

  // Merge and sort chronologically.
  return [...platformCsv, ...providerCsv].sort((a, b) =>
    a.timestamp_iso.localeCompare(b.timestamp_iso),
  );
}
