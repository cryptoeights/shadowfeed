// Repository layer for the external provider system. All D1 queries for
// providers live here so route handlers, the feed proxy, and the withdrawal
// engine share consistent shapes.

import { newUuid } from './crypto';

export type ProviderMode = 'partner_bridge' | 'hosted_mirror';
export type ProviderStatus = 'pending' | 'active' | 'paused' | 'banned';

export interface ProviderRow {
  readonly id: string;
  readonly user_id: string;
  readonly handle: string;
  readonly name: string;
  readonly description: string | null;
  readonly logo_url: string | null;
  readonly website: string | null;
  readonly twitter_handle: string | null;
  readonly contact_email: string | null;
  readonly custodial_address: string;
  readonly custodial_encrypted_key: string;
  readonly custodial_iv: string;
  readonly linked_withdrawal_address: string | null;
  readonly linked_at: number | null;
  readonly mode: ProviderMode;
  readonly partner_endpoint: string | null;
  readonly hmac_secret_hash: string | null;
  readonly hmac_rotated_at: number | null;
  readonly status: ProviderStatus;
  readonly verified: number;
  readonly pending_revenue_microstx: number;
  readonly total_earned_microstx: number;
  readonly total_withdrawn_microstx: number;
  readonly created_at: number;
  readonly activated_at: number | null;
}

export type FeedSourceType = 'r2_url' | 'github_raw' | 'webhook_push' | 'manual_upload';

export interface ProviderFeedRow {
  readonly id: string;
  readonly provider_id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: string | null;
  readonly price_microstx: number;
  readonly source_path: string | null;
  readonly source_method: string | null;
  readonly source_type: FeedSourceType | null;
  readonly source_url: string | null;
  readonly poll_interval_seconds: number | null;
  readonly last_polled_at: number | null;
  readonly last_poll_status: string | null;
  readonly total_queries: number;
  readonly total_revenue_microstx: number;
  readonly last_query_at: number | null;
  readonly active: number;
  readonly created_at: number;
}

export interface WithdrawalRow {
  readonly id: string;
  readonly provider_id: string;
  readonly amount_microstx: number;
  readonly destination_address: string;
  readonly fee_microstx: number | null;
  readonly tx_hash: string | null;
  readonly status: 'pending' | 'broadcast' | 'confirmed' | 'failed' | 'cancelled';
  readonly error_message: string | null;
  readonly created_at: number;
  readonly broadcast_at: number | null;
  readonly confirmed_at: number | null;
  readonly idempotency_key: string;
}

// --------------------------------- Providers ---------------------------------

export interface CreateProviderInput {
  readonly user_id: string;
  readonly handle: string;
  readonly name: string;
  readonly description?: string;
  readonly logo_url?: string;
  readonly website?: string;
  readonly twitter_handle?: string;
  readonly contact_email?: string;
  readonly mode: ProviderMode;
  readonly partner_endpoint?: string;
  readonly hmac_secret_hash?: string;
  readonly custodial_address: string;
  readonly custodial_encrypted_key: string;
  readonly custodial_iv: string;
}

export async function insertProvider(
  db: D1Database,
  input: CreateProviderInput,
): Promise<ProviderRow> {
  const id = newUuid();
  const now = Math.floor(Date.now() / 1000);

  await db
    .prepare(`
      INSERT INTO providers (
        id, user_id, handle, name, description, logo_url, website,
        twitter_handle, contact_email,
        custodial_address, custodial_encrypted_key, custodial_iv,
        mode, partner_endpoint, hmac_secret_hash, hmac_rotated_at,
        status, created_at, activated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL)
    `)
    .bind(
      id,
      input.user_id,
      input.handle,
      input.name,
      input.description ?? null,
      input.logo_url ?? null,
      input.website ?? null,
      input.twitter_handle ?? null,
      input.contact_email ?? null,
      input.custodial_address,
      input.custodial_encrypted_key,
      input.custodial_iv,
      input.mode,
      input.partner_endpoint ?? null,
      input.hmac_secret_hash ?? null,
      input.hmac_secret_hash ? now : null,
      now,
    )
    .run();

  const row = await getProviderById(db, id);
  if (!row) throw new Error('Inserted provider disappeared');
  return row;
}

export async function getProviderById(
  db: D1Database,
  id: string,
): Promise<ProviderRow | null> {
  return db
    .prepare('SELECT * FROM providers WHERE id = ?')
    .bind(id)
    .first<ProviderRow>();
}

export async function getProviderByHandle(
  db: D1Database,
  handle: string,
): Promise<ProviderRow | null> {
  return db
    .prepare('SELECT * FROM providers WHERE handle = ?')
    .bind(handle)
    .first<ProviderRow>();
}

export async function getProvidersByUser(
  db: D1Database,
  userId: string,
): Promise<ProviderRow[]> {
  const result = await db
    .prepare('SELECT * FROM providers WHERE user_id = ? ORDER BY created_at DESC')
    .bind(userId)
    .all<ProviderRow>();
  return result.results ?? [];
}

export async function listActiveProviders(
  db: D1Database,
): Promise<ProviderRow[]> {
  const result = await db
    .prepare(`SELECT * FROM providers WHERE status = 'active' ORDER BY created_at DESC`)
    .all<ProviderRow>();
  return result.results ?? [];
}

export async function activateProvider(
  db: D1Database,
  id: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `UPDATE providers SET status = 'active', activated_at = ? WHERE id = ? AND status = 'pending'`,
    )
    .bind(now, id)
    .run();
}

export async function linkWithdrawalWallet(
  db: D1Database,
  providerId: string,
  walletAddress: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `UPDATE providers SET linked_withdrawal_address = ?, linked_at = ? WHERE id = ?`,
    )
    .bind(walletAddress, now, providerId)
    .run();
}

export async function updateHmacSecret(
  db: D1Database,
  providerId: string,
  secretHash: string,
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(`UPDATE providers SET hmac_secret_hash = ?, hmac_rotated_at = ? WHERE id = ?`)
    .bind(secretHash, now, providerId)
    .run();
}

// Credit revenue to a provider for a paid query. Atomic increment so concurrent
// queries don't lose updates.
export async function creditProviderRevenue(
  db: D1Database,
  providerId: string,
  netMicrostx: number,
): Promise<void> {
  await db
    .prepare(`
      UPDATE providers
      SET pending_revenue_microstx = pending_revenue_microstx + ?,
          total_earned_microstx = total_earned_microstx + ?
      WHERE id = ?
    `)
    .bind(netMicrostx, netMicrostx, providerId)
    .run();
}

// Debit pending revenue when starting a withdrawal. Returns true if balance
// was sufficient (and the debit happened); false if insufficient.
export async function debitPendingRevenue(
  db: D1Database,
  providerId: string,
  amountMicrostx: number,
): Promise<boolean> {
  const result = await db
    .prepare(`
      UPDATE providers
      SET pending_revenue_microstx = pending_revenue_microstx - ?
      WHERE id = ? AND pending_revenue_microstx >= ?
    `)
    .bind(amountMicrostx, providerId, amountMicrostx)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function restorePendingRevenue(
  db: D1Database,
  providerId: string,
  amountMicrostx: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE providers SET pending_revenue_microstx = pending_revenue_microstx + ? WHERE id = ?`,
    )
    .bind(amountMicrostx, providerId)
    .run();
}

export async function bumpTotalWithdrawn(
  db: D1Database,
  providerId: string,
  amountMicrostx: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE providers SET total_withdrawn_microstx = total_withdrawn_microstx + ? WHERE id = ?`,
    )
    .bind(amountMicrostx, providerId)
    .run();
}

// ------------------------------ Provider feeds ------------------------------

export interface CreateProviderFeedInput {
  readonly provider_id: string;
  readonly slug: string;
  readonly name: string;
  readonly description?: string;
  readonly category?: string;
  readonly price_microstx: number;
  readonly source_path?: string;
  readonly source_method?: 'GET' | 'POST';
  readonly source_type?: FeedSourceType;
  readonly source_url?: string;
  readonly poll_interval_seconds?: number;
}

export async function insertProviderFeed(
  db: D1Database,
  input: CreateProviderFeedInput,
): Promise<ProviderFeedRow> {
  const id = newUuid();
  await db
    .prepare(`
      INSERT INTO provider_feeds (
        id, provider_id, slug, name, description, category, price_microstx,
        source_path, source_method, source_type, source_url, poll_interval_seconds,
        active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, unixepoch())
    `)
    .bind(
      id,
      input.provider_id,
      input.slug,
      input.name,
      input.description ?? null,
      input.category ?? null,
      input.price_microstx,
      input.source_path ?? null,
      input.source_method ?? 'GET',
      input.source_type ?? null,
      input.source_url ?? null,
      input.poll_interval_seconds ?? null,
    )
    .run();
  const row = await getProviderFeedById(db, id);
  if (!row) throw new Error('Inserted provider feed disappeared');
  return row;
}

export async function getProviderFeedById(
  db: D1Database,
  id: string,
): Promise<ProviderFeedRow | null> {
  return db
    .prepare('SELECT * FROM provider_feeds WHERE id = ?')
    .bind(id)
    .first<ProviderFeedRow>();
}

export async function getProviderFeedBySlug(
  db: D1Database,
  providerHandle: string,
  feedSlug: string,
): Promise<{ provider: ProviderRow; feed: ProviderFeedRow } | null> {
  const row = await db
    .prepare(`
      SELECT
        p.id as p_id, p.user_id, p.handle, p.name as p_name, p.description as p_description,
        p.logo_url, p.website, p.twitter_handle, p.contact_email,
        p.custodial_address, p.custodial_encrypted_key, p.custodial_iv,
        p.linked_withdrawal_address, p.linked_at,
        p.mode, p.partner_endpoint, p.hmac_secret_hash, p.hmac_rotated_at,
        p.status, p.verified,
        p.pending_revenue_microstx, p.total_earned_microstx, p.total_withdrawn_microstx,
        p.created_at as p_created_at, p.activated_at,
        f.id as f_id, f.slug as f_slug, f.name as f_name, f.description as f_description,
        f.category, f.price_microstx,
        f.source_path, f.source_method, f.source_type, f.source_url, f.poll_interval_seconds,
        f.last_polled_at, f.last_poll_status,
        f.total_queries, f.total_revenue_microstx, f.last_query_at,
        f.active, f.created_at as f_created_at
      FROM provider_feeds f
      JOIN providers p ON p.id = f.provider_id
      WHERE p.handle = ? AND f.slug = ? AND f.active = 1
    `)
    .bind(providerHandle, feedSlug)
    .first<Record<string, unknown>>();

  if (!row) return null;

  return {
    provider: {
      id: row.p_id as string,
      user_id: row.user_id as string,
      handle: row.handle as string,
      name: row.p_name as string,
      description: row.p_description as string | null,
      logo_url: row.logo_url as string | null,
      website: row.website as string | null,
      twitter_handle: row.twitter_handle as string | null,
      contact_email: row.contact_email as string | null,
      custodial_address: row.custodial_address as string,
      custodial_encrypted_key: row.custodial_encrypted_key as string,
      custodial_iv: row.custodial_iv as string,
      linked_withdrawal_address: row.linked_withdrawal_address as string | null,
      linked_at: row.linked_at as number | null,
      mode: row.mode as ProviderMode,
      partner_endpoint: row.partner_endpoint as string | null,
      hmac_secret_hash: row.hmac_secret_hash as string | null,
      hmac_rotated_at: row.hmac_rotated_at as number | null,
      status: row.status as ProviderStatus,
      verified: row.verified as number,
      pending_revenue_microstx: row.pending_revenue_microstx as number,
      total_earned_microstx: row.total_earned_microstx as number,
      total_withdrawn_microstx: row.total_withdrawn_microstx as number,
      created_at: row.p_created_at as number,
      activated_at: row.activated_at as number | null,
    },
    feed: {
      id: row.f_id as string,
      provider_id: row.p_id as string,
      slug: row.f_slug as string,
      name: row.f_name as string,
      description: row.f_description as string | null,
      category: row.category as string | null,
      price_microstx: row.price_microstx as number,
      source_path: row.source_path as string | null,
      source_method: row.source_method as string | null,
      source_type: row.source_type as FeedSourceType | null,
      source_url: row.source_url as string | null,
      poll_interval_seconds: row.poll_interval_seconds as number | null,
      last_polled_at: row.last_polled_at as number | null,
      last_poll_status: row.last_poll_status as string | null,
      total_queries: row.total_queries as number,
      total_revenue_microstx: row.total_revenue_microstx as number,
      last_query_at: row.last_query_at as number | null,
      active: row.active as number,
      created_at: row.f_created_at as number,
    },
  };
}

export async function getFeedsByProvider(
  db: D1Database,
  providerId: string,
): Promise<ProviderFeedRow[]> {
  const result = await db
    .prepare(
      'SELECT * FROM provider_feeds WHERE provider_id = ? ORDER BY created_at DESC',
    )
    .bind(providerId)
    .all<ProviderFeedRow>();
  return result.results ?? [];
}

export async function setFeedActive(
  db: D1Database,
  feedId: string,
  active: boolean,
): Promise<void> {
  await db
    .prepare('UPDATE provider_feeds SET active = ? WHERE id = ?')
    .bind(active ? 1 : 0, feedId)
    .run();
}

export async function recordFeedQuery(
  db: D1Database,
  feedId: string,
  revenueMicrostx: number,
): Promise<void> {
  await db
    .prepare(`
      UPDATE provider_feeds
      SET total_queries = total_queries + 1,
          total_revenue_microstx = total_revenue_microstx + ?,
          last_query_at = unixepoch()
      WHERE id = ?
    `)
    .bind(revenueMicrostx, feedId)
    .run();
}

// Find all hosted_mirror feeds whose poll window has lapsed. Used by the
// scheduled() cron handler to refresh cached data.
export async function findFeedsDueForPoll(
  db: D1Database,
  now: number,
): Promise<ProviderFeedRow[]> {
  const result = await db
    .prepare(`
      SELECT * FROM provider_feeds
      WHERE active = 1
        AND source_type IN ('r2_url', 'github_raw')
        AND poll_interval_seconds IS NOT NULL
        AND (last_polled_at IS NULL OR last_polled_at + poll_interval_seconds <= ?)
    `)
    .bind(now)
    .all<ProviderFeedRow>();
  return result.results ?? [];
}

export async function updatePollState(
  db: D1Database,
  feedId: string,
  status: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE provider_feeds SET last_polled_at = unixepoch(), last_poll_status = ? WHERE id = ?`,
    )
    .bind(status, feedId)
    .run();
}

// ------------------------------ Feed cache ------------------------------

export async function upsertFeedCache(
  db: D1Database,
  feedId: string,
  payloadJson: string,
  payloadSha256: string,
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO feed_cache (feed_id, payload_json, payload_sha256, cached_at)
      VALUES (?, ?, ?, unixepoch())
      ON CONFLICT(feed_id) DO UPDATE SET
        payload_json = excluded.payload_json,
        payload_sha256 = excluded.payload_sha256,
        cached_at = excluded.cached_at
    `)
    .bind(feedId, payloadJson, payloadSha256)
    .run();
}

export async function getFeedCache(
  db: D1Database,
  feedId: string,
): Promise<{ payload_json: string; cached_at: number } | null> {
  return db
    .prepare('SELECT payload_json, cached_at FROM feed_cache WHERE feed_id = ?')
    .bind(feedId)
    .first<{ payload_json: string; cached_at: number }>();
}

// ------------------------------ Query log ------------------------------

export interface LogQueryInput {
  readonly provider_id: string;
  readonly feed_id: string;
  readonly payer: string | null;
  readonly tx_hash: string | null;
  readonly gross_microstx: number;
  readonly platform_fee_microstx: number;
  readonly provider_net_microstx: number;
  readonly response_ms: number;
  readonly upstream_status: number | null;
}

export async function logProviderQuery(
  db: D1Database,
  input: LogQueryInput,
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO provider_query_log
        (provider_id, feed_id, payer, tx_hash,
         gross_microstx, platform_fee_microstx, provider_net_microstx,
         response_ms, upstream_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
    `)
    .bind(
      input.provider_id,
      input.feed_id,
      input.payer,
      input.tx_hash,
      input.gross_microstx,
      input.platform_fee_microstx,
      input.provider_net_microstx,
      input.response_ms,
      input.upstream_status,
    )
    .run();
}

// ------------------------------ Withdrawals ------------------------------

export interface CreateWithdrawalInput {
  readonly provider_id: string;
  readonly amount_microstx: number;
  readonly destination_address: string;
  readonly idempotency_key: string;
}

export async function insertWithdrawal(
  db: D1Database,
  input: CreateWithdrawalInput,
): Promise<WithdrawalRow> {
  const id = newUuid();
  await db
    .prepare(`
      INSERT INTO provider_withdrawals
        (id, provider_id, amount_microstx, destination_address, status,
         created_at, idempotency_key)
      VALUES (?, ?, ?, ?, 'pending', unixepoch(), ?)
    `)
    .bind(
      id,
      input.provider_id,
      input.amount_microstx,
      input.destination_address,
      input.idempotency_key,
    )
    .run();
  const row = await getWithdrawalById(db, id);
  if (!row) throw new Error('Inserted withdrawal disappeared');
  return row;
}

export async function getWithdrawalById(
  db: D1Database,
  id: string,
): Promise<WithdrawalRow | null> {
  return db
    .prepare('SELECT * FROM provider_withdrawals WHERE id = ?')
    .bind(id)
    .first<WithdrawalRow>();
}

export async function getWithdrawalByIdempotencyKey(
  db: D1Database,
  key: string,
): Promise<WithdrawalRow | null> {
  return db
    .prepare('SELECT * FROM provider_withdrawals WHERE idempotency_key = ?')
    .bind(key)
    .first<WithdrawalRow>();
}

export async function getWithdrawalsByProvider(
  db: D1Database,
  providerId: string,
  limit: number = 50,
): Promise<WithdrawalRow[]> {
  const result = await db
    .prepare(`
      SELECT * FROM provider_withdrawals
      WHERE provider_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `)
    .bind(providerId, limit)
    .all<WithdrawalRow>();
  return result.results ?? [];
}

export async function markWithdrawalBroadcast(
  db: D1Database,
  id: string,
  txHash: string,
  feeMicrostx: number,
): Promise<void> {
  await db
    .prepare(`
      UPDATE provider_withdrawals
      SET tx_hash = ?, fee_microstx = ?, status = 'broadcast', broadcast_at = unixepoch()
      WHERE id = ?
    `)
    .bind(txHash, feeMicrostx, id)
    .run();
}

export async function markWithdrawalConfirmed(
  db: D1Database,
  id: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE provider_withdrawals SET status = 'confirmed', confirmed_at = unixepoch() WHERE id = ?`,
    )
    .bind(id)
    .run();
}

export async function markWithdrawalFailed(
  db: D1Database,
  id: string,
  errorMessage: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE provider_withdrawals SET status = 'failed', error_message = ? WHERE id = ?`,
    )
    .bind(errorMessage, id)
    .run();
}

// ------------------------------ Audit log ------------------------------

export async function logAudit(
  db: D1Database,
  providerId: string,
  action: string,
  metadata?: Record<string, unknown>,
  ipAddress?: string,
  userAgent?: string,
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO provider_audit_log (provider_id, action, metadata_json, ip_address, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, unixepoch())
    `)
    .bind(
      providerId,
      action,
      metadata ? JSON.stringify(metadata) : null,
      ipAddress ?? null,
      userAgent ?? null,
    )
    .run();
}

// ------------------------------ Analytics ------------------------------

export interface ProviderAnalytics {
  readonly queries_24h: number;
  readonly queries_7d: number;
  readonly revenue_24h_microstx: number;
  readonly revenue_7d_microstx: number;
  readonly unique_buyers_7d: number;
  readonly avg_response_ms: number;
  readonly error_rate: number;
}

export async function getProviderAnalytics(
  db: D1Database,
  providerId: string,
): Promise<ProviderAnalytics> {
  const now = Math.floor(Date.now() / 1000);
  const d1 = now - 86400;
  const d7 = now - 86400 * 7;

  const stats = await db
    .prepare(`
      SELECT
        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as q24,
        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) as q7,
        SUM(CASE WHEN created_at >= ? THEN provider_net_microstx ELSE 0 END) as r24,
        SUM(CASE WHEN created_at >= ? THEN provider_net_microstx ELSE 0 END) as r7,
        AVG(response_ms) as avg_ms,
        AVG(CASE WHEN upstream_status >= 400 THEN 1.0 ELSE 0.0 END) as err_rate
      FROM provider_query_log
      WHERE provider_id = ?
    `)
    .bind(d1, d7, d1, d7, providerId)
    .first<{
      q24: number | null;
      q7: number | null;
      r24: number | null;
      r7: number | null;
      avg_ms: number | null;
      err_rate: number | null;
    }>();

  const buyersRow = await db
    .prepare(`
      SELECT COUNT(DISTINCT payer) as n
      FROM provider_query_log
      WHERE provider_id = ? AND payer IS NOT NULL AND created_at >= ?
    `)
    .bind(providerId, d7)
    .first<{ n: number }>();

  return {
    queries_24h: stats?.q24 ?? 0,
    queries_7d: stats?.q7 ?? 0,
    revenue_24h_microstx: stats?.r24 ?? 0,
    revenue_7d_microstx: stats?.r7 ?? 0,
    unique_buyers_7d: buyersRow?.n ?? 0,
    avg_response_ms: Math.round(stats?.avg_ms ?? 0),
    error_rate: Math.round((stats?.err_rate ?? 0) * 10000) / 100,  // percent w/ 2dp
  };
}
