// Provider portal HTTP routes — onboarding, profile, feed catalog, analytics.
// Auth reuses the SIWS sessions from agent platform: a `user` can have both
// agents and providers tied to the same wallet identity.
//
// Withdrawal endpoints live in provider-withdraw.ts (signs + broadcasts on-chain).
// Feed-serving (paid proxy) lives in provider-feed-proxy.ts.

import { Hono } from 'hono';
import type { Env } from '../types';
import {
  authenticate,
  buildAuthMessage,
  consumeNonce,
  issueNonce,
  verifyStacksSignature,
} from './auth';
import { createProviderWallet, getProviderBalance } from './provider-wallet';
import { generatePartnerSecret, hashPartnerSecret, signPartnerRequest } from './hmac';
import { discoverFeeds } from './provider-discovery';
import {
  activateProvider,
  getFeedsByProvider,
  getProviderAnalytics,
  getProviderById,
  getProviderByHandle,
  getProvidersByUser,
  getWithdrawalsByProvider,
  insertProvider,
  insertProviderFeed,
  linkWithdrawalWallet,
  listActiveProviders,
  logAudit,
  setFeedActive,
  updateHmacSecret,
  type ProviderFeedRow,
  type ProviderMode,
  type ProviderRow,
} from './providers-repo';

export const providerRoutes = new Hono<{ Bindings: Env }>();

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function bearerToken(authHeader: string | undefined): string | undefined {
  if (!authHeader) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  return m ? m[1] : undefined;
}

async function requireAuth(c: any) {
  const token = bearerToken(c.req.header('Authorization'));
  const me = await authenticate(c.env.DB, token);
  return me;
}

// Strict slug rule for provider handles + feed slugs: lowercase, alphanumeric +
// hyphens, 3-32 chars. Keeps URLs clean and prevents collisions with reserved paths.
function isValidSlug(s: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/.test(s);
}

const RESERVED_HANDLES = new Set([
  'admin', 'api', 'app', 'auth', 'dashboard', 'docs', 'help',
  'login', 'logout', 'new', 'onboard', 'public', 'register',
  'settings', 'shadowfeed', 'support', 'system',
]);

// Public view — strips secret/encrypted fields, ready to ship to client.
function publicProviderView(row: ProviderRow, includePrivate = false) {
  const base = {
    id: row.id,
    handle: row.handle,
    name: row.name,
    description: row.description,
    logo_url: row.logo_url,
    website: row.website,
    twitter_handle: row.twitter_handle,
    mode: row.mode,
    status: row.status,
    verified: !!row.verified,
    created_at: row.created_at,
    activated_at: row.activated_at,
  };
  if (!includePrivate) return base;
  return {
    ...base,
    user_id: row.user_id,
    contact_email: row.contact_email,
    custodial_address: row.custodial_address,
    linked_withdrawal_address: row.linked_withdrawal_address,
    linked_at: row.linked_at,
    partner_endpoint: row.partner_endpoint,
    hmac_configured: !!row.hmac_secret_hash,
    hmac_rotated_at: row.hmac_rotated_at,
    revenue: {
      pending_microstx: row.pending_revenue_microstx,
      pending_stx: row.pending_revenue_microstx / 1_000_000,
      total_earned_microstx: row.total_earned_microstx,
      total_earned_stx: row.total_earned_microstx / 1_000_000,
      total_withdrawn_microstx: row.total_withdrawn_microstx,
      total_withdrawn_stx: row.total_withdrawn_microstx / 1_000_000,
    },
  };
}

function publicFeedView(row: ProviderFeedRow) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category,
    price_microstx: row.price_microstx,
    price_stx: row.price_microstx / 1_000_000,
    source_type: row.source_type,
    poll_interval_seconds: row.poll_interval_seconds,
    last_polled_at: row.last_polled_at,
    last_poll_status: row.last_poll_status,
    stats: {
      total_queries: row.total_queries,
      total_revenue_stx: row.total_revenue_microstx / 1_000_000,
      last_query_at: row.last_query_at,
    },
    active: !!row.active,
    created_at: row.created_at,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Public discovery
// ────────────────────────────────────────────────────────────────────────────

providerRoutes.get('/providers', async (c) => {
  const rows = await listActiveProviders(c.env.DB);
  return c.json({ providers: rows.map((r) => publicProviderView(r)) });
});

providerRoutes.get('/providers/:handle', async (c) => {
  const handle = c.req.param('handle');
  const row = await getProviderByHandle(c.env.DB, handle);
  if (!row) return c.json({ error: 'provider not found' }, 404);
  const feeds = await getFeedsByProvider(c.env.DB, row.id);
  return c.json({
    provider: publicProviderView(row),
    feeds: feeds.filter((f) => f.active).map(publicFeedView),
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Authenticated — Provider account management
// ────────────────────────────────────────────────────────────────────────────

// Create new provider account. Auth required (user must be SIWS'd in).
providerRoutes.post('/providers', async (c) => {
  const me = await requireAuth(c);
  if (!me) return c.json({ error: 'unauthenticated' }, 401);

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const handle = String(body.handle ?? '').toLowerCase().trim();
  const name = String(body.name ?? '').trim().slice(0, 100);
  const mode = String(body.mode ?? '') as ProviderMode;

  if (!isValidSlug(handle) || RESERVED_HANDLES.has(handle)) {
    return c.json({ error: 'invalid or reserved handle (3-32 chars, a-z0-9-)' }, 400);
  }
  if (!name) {
    return c.json({ error: 'name required' }, 400);
  }
  if (mode !== 'partner_bridge' && mode !== 'hosted_mirror') {
    return c.json({ error: 'mode must be partner_bridge or hosted_mirror' }, 400);
  }

  const existing = await getProviderByHandle(c.env.DB, handle);
  if (existing) {
    return c.json({ error: 'handle already taken' }, 409);
  }

  if (!c.env.AGENT_MASTER_KEY) {
    return c.json({ error: 'AGENT_MASTER_KEY not configured on server' }, 500);
  }

  // Partner bridge requires endpoint URL + we generate the HMAC secret here
  // and return the plaintext exactly once.
  let partnerEndpoint: string | undefined;
  let plaintextSecret: string | undefined;
  let secretHash: string | undefined;
  if (mode === 'partner_bridge') {
    const ep = String(body.partner_endpoint ?? '').trim();
    if (!/^https:\/\/[^\s]+/.test(ep)) {
      return c.json({ error: 'partner_endpoint must be https://...' }, 400);
    }
    partnerEndpoint = ep.replace(/\/+$/, '');  // trim trailing slash
    plaintextSecret = generatePartnerSecret();
    secretHash = await hashPartnerSecret(plaintextSecret);
  }

  const network = (c.env.NETWORK === 'mainnet' ? 'mainnet' : 'testnet') as 'mainnet' | 'testnet';
  const wallet = await createProviderWallet(c.env.AGENT_MASTER_KEY, network);

  const provider = await insertProvider(c.env.DB, {
    user_id: me.user_id,
    handle,
    name,
    description: body.description ? String(body.description).slice(0, 500) : undefined,
    logo_url: body.logo_url ? String(body.logo_url).slice(0, 500) : undefined,
    website: body.website ? String(body.website).slice(0, 500) : undefined,
    twitter_handle: body.twitter_handle ? String(body.twitter_handle).slice(0, 50) : undefined,
    contact_email: body.contact_email ? String(body.contact_email).slice(0, 200) : undefined,
    mode,
    partner_endpoint: partnerEndpoint,
    hmac_secret_hash: secretHash,
    custodial_address: wallet.address,
    custodial_encrypted_key: wallet.encryptedKey,
    custodial_iv: wallet.iv,
  });

  await logAudit(c.env.DB, provider.id, 'provider_created', {
    mode,
    handle,
  });

  return c.json({
    provider: publicProviderView(provider, true),
    // Plaintext secret only returned ONCE here — never recoverable.
    hmac_secret: plaintextSecret,
    hmac_warning: plaintextSecret
      ? 'Save this secret now. We do not store the plaintext and you cannot retrieve it later.'
      : undefined,
  }, 201);
});

// Probe a partner endpoint for advertised feeds + pricing. Used by the
// onboarding wizard so the user doesn't have to type each feed manually.
//
// Tries: well-known JSON manifest → curated catalog → x402 probing → manual.
// Returns a DiscoveryResult including `source` so the UI can show provenance
// ("Imported from .well-known/...", "Curated catalog for api.hyreagent.fun", etc.).
providerRoutes.post('/providers/discover', async (c) => {
  const me = await requireAuth(c);
  if (!me) return c.json({ error: 'unauthenticated' }, 401);

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const endpoint = String(body.endpoint ?? '').trim();
  if (!/^https:\/\/[^\s]+$/.test(endpoint)) {
    return c.json({ error: 'endpoint must be https://...' }, 400);
  }

  const result = await discoverFeeds(endpoint);
  return c.json(result);
});

// Bulk-import a set of feeds discovered via /providers/discover. Used by the
// onboarding wizard to add 5-20 feeds at once after the partner enters their
// endpoint URL.
providerRoutes.post('/providers/id/:id/feeds/bulk', async (c) => {
  const result = await getOwnedProvider(c, c.req.param('id'));
  if ('error' in result) return c.json({ error: result.error }, result.status as 401 | 403 | 404);

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const rawFeeds = Array.isArray(body.feeds) ? body.feeds : [];
  if (rawFeeds.length === 0) {
    return c.json({ error: 'feeds[] required (non-empty)' }, 400);
  }
  if (rawFeeds.length > 50) {
    return c.json({ error: 'max 50 feeds per request' }, 400);
  }

  const inserted: ProviderFeedRow[] = [];
  const skipped: Array<{ slug: string; reason: string }> = [];

  for (const raw of rawFeeds) {
    const slug = String((raw as any)?.slug ?? '').toLowerCase().trim();
    const name = String((raw as any)?.name ?? '').trim().slice(0, 100);
    const priceStx = Number((raw as any)?.price_stx ?? 0);
    if (!isValidSlug(slug)) { skipped.push({ slug, reason: 'invalid slug' }); continue; }
    if (!name) { skipped.push({ slug, reason: 'name required' }); continue; }
    if (!Number.isFinite(priceStx) || priceStx <= 0 || priceStx > 100) {
      skipped.push({ slug, reason: 'invalid price' }); continue;
    }
    const price_microstx = Math.round(priceStx * 1_000_000);

    // Mode-specific fields
    let source_path: string | undefined;
    let source_method: 'GET' | 'POST' | undefined;
    let source_type: 'r2_url' | 'github_raw' | 'webhook_push' | 'manual_upload' | undefined;
    let source_url: string | undefined;
    let poll_interval_seconds: number | undefined;

    if (result.provider.mode === 'partner_bridge') {
      const path = String((raw as any)?.source_path ?? '').trim();
      if (!path.startsWith('/')) {
        skipped.push({ slug, reason: 'source_path must start with /' }); continue;
      }
      source_path = path;
      const method = String((raw as any)?.source_method ?? 'GET').toUpperCase();
      source_method = (method === 'POST' ? 'POST' : 'GET') as 'GET' | 'POST';
    } else {
      const stype = String((raw as any)?.source_type ?? '');
      if (!['r2_url', 'github_raw', 'webhook_push', 'manual_upload'].includes(stype)) {
        skipped.push({ slug, reason: 'invalid source_type' }); continue;
      }
      source_type = stype as typeof source_type;
      if (stype === 'r2_url' || stype === 'github_raw') {
        const url = String((raw as any)?.source_url ?? '').trim();
        if (!/^https:\/\//.test(url)) {
          skipped.push({ slug, reason: 'source_url must be https://...' }); continue;
        }
        source_url = url;
        const poll = Number((raw as any)?.poll_interval_seconds ?? 300);
        poll_interval_seconds = Math.max(60, Math.min(86400, Math.round(poll)));
      }
    }

    // Skip duplicates rather than abort the whole batch.
    const existing = await c.env.DB
      .prepare('SELECT id FROM provider_feeds WHERE provider_id = ? AND slug = ?')
      .bind(result.provider.id, slug)
      .first();
    if (existing) { skipped.push({ slug, reason: 'already exists' }); continue; }

    try {
      const feed = await insertProviderFeed(c.env.DB, {
        provider_id: result.provider.id,
        slug,
        name,
        description: (raw as any)?.description ? String((raw as any).description).slice(0, 500) : undefined,
        category: (raw as any)?.category ? String((raw as any).category).slice(0, 50) : undefined,
        price_microstx,
        source_path,
        source_method,
        source_type,
        source_url,
        poll_interval_seconds,
      });
      inserted.push(feed);
    } catch (e) {
      skipped.push({ slug, reason: e instanceof Error ? e.message : 'insert failed' });
    }
  }

  // Activate provider if it was pending and we inserted at least one feed.
  if (inserted.length > 0 && result.provider.status === 'pending') {
    await activateProvider(c.env.DB, result.provider.id);
  }

  await logAudit(c.env.DB, result.provider.id, 'feeds_bulk_imported', {
    inserted_count: inserted.length,
    skipped_count: skipped.length,
  });

  return c.json({
    inserted: inserted.map(publicFeedView),
    skipped,
  }, 201);
});

// List providers owned by current user.
providerRoutes.get('/me/providers', async (c) => {
  const me = await requireAuth(c);
  if (!me) return c.json({ error: 'unauthenticated' }, 401);
  const rows = await getProvidersByUser(c.env.DB, me.user_id);
  return c.json({ providers: rows.map((r) => publicProviderView(r, true)) });
});

// Helper: get owned provider or 403/404.
async function getOwnedProvider(c: any, providerId: string) {
  const me = await requireAuth(c);
  if (!me) return { error: 'unauthenticated' as const, status: 401 };
  const row = await getProviderById(c.env.DB, providerId);
  if (!row) return { error: 'provider not found' as const, status: 404 };
  if (row.user_id !== me.user_id) return { error: 'forbidden' as const, status: 403 };
  return { me, provider: row };
}

// Provider detail (private — owner view with revenue + custodial wallet address).
providerRoutes.get('/providers/id/:id', async (c) => {
  const result = await getOwnedProvider(c, c.req.param('id'));
  if ('error' in result) return c.json({ error: result.error }, result.status as 401 | 403 | 404);

  const feeds = await getFeedsByProvider(c.env.DB, result.provider.id);
  const analytics = await getProviderAnalytics(c.env.DB, result.provider.id);
  const network = (c.env.NETWORK === 'mainnet' ? 'mainnet' : 'testnet') as 'mainnet' | 'testnet';
  const balance = await getProviderBalance(
    result.provider.custodial_address,
    network,
    c.env.HIRO_API_KEY,
  );

  return c.json({
    provider: publicProviderView(result.provider, true),
    feeds: feeds.map(publicFeedView),
    analytics,
    on_chain_balance: balance,
  });
});

// Add a feed under this provider.
providerRoutes.post('/providers/id/:id/feeds', async (c) => {
  const result = await getOwnedProvider(c, c.req.param('id'));
  if ('error' in result) return c.json({ error: result.error }, result.status as 401 | 403 | 404);

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const slug = String(body.slug ?? '').toLowerCase().trim();
  const name = String(body.name ?? '').trim().slice(0, 100);
  const priceStx = Number(body.price_stx ?? 0);

  if (!isValidSlug(slug)) return c.json({ error: 'invalid slug (3-32 chars, a-z0-9-)' }, 400);
  if (!name) return c.json({ error: 'name required' }, 400);
  if (!Number.isFinite(priceStx) || priceStx <= 0 || priceStx > 100) {
    return c.json({ error: 'price_stx must be > 0 and ≤ 100' }, 400);
  }
  const price_microstx = Math.round(priceStx * 1_000_000);

  // Mode-specific validation
  let source_path: string | undefined;
  let source_method: 'GET' | 'POST' | undefined;
  let source_type: 'r2_url' | 'github_raw' | 'webhook_push' | 'manual_upload' | undefined;
  let source_url: string | undefined;
  let poll_interval_seconds: number | undefined;

  if (result.provider.mode === 'partner_bridge') {
    const path = String(body.source_path ?? '').trim();
    if (!path.startsWith('/')) return c.json({ error: 'source_path must start with /' }, 400);
    source_path = path;
    const method = String(body.source_method ?? 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'POST') {
      return c.json({ error: 'source_method must be GET or POST' }, 400);
    }
    source_method = method;
  } else {
    const stype = String(body.source_type ?? '');
    if (!['r2_url', 'github_raw', 'webhook_push', 'manual_upload'].includes(stype)) {
      return c.json({ error: 'invalid source_type' }, 400);
    }
    source_type = stype as typeof source_type;
    if (stype === 'r2_url' || stype === 'github_raw') {
      const url = String(body.source_url ?? '').trim();
      if (!/^https:\/\//.test(url)) {
        return c.json({ error: 'source_url must be https://...' }, 400);
      }
      source_url = url;
      const poll = Number(body.poll_interval_seconds ?? 300);
      if (!Number.isFinite(poll) || poll < 60 || poll > 86400) {
        return c.json({ error: 'poll_interval_seconds must be 60-86400' }, 400);
      }
      poll_interval_seconds = Math.round(poll);
    }
  }

  // Uniqueness check before insert (D1 will also reject via UNIQUE constraint).
  const existing = await c.env.DB
    .prepare('SELECT id FROM provider_feeds WHERE provider_id = ? AND slug = ?')
    .bind(result.provider.id, slug)
    .first();
  if (existing) return c.json({ error: 'feed slug already exists for this provider' }, 409);

  const feed = await insertProviderFeed(c.env.DB, {
    provider_id: result.provider.id,
    slug,
    name,
    description: body.description ? String(body.description).slice(0, 500) : undefined,
    category: body.category ? String(body.category).slice(0, 50) : undefined,
    price_microstx,
    source_path,
    source_method,
    source_type,
    source_url,
    poll_interval_seconds,
  });

  await logAudit(c.env.DB, result.provider.id, 'feed_created', { slug });

  // Activate the provider on first feed so it shows up in /providers.
  if (result.provider.status === 'pending') {
    await activateProvider(c.env.DB, result.provider.id);
  }

  return c.json({ feed: publicFeedView(feed) }, 201);
});

// Pause / resume a feed.
providerRoutes.patch('/providers/id/:id/feeds/:feedId/state', async (c) => {
  const result = await getOwnedProvider(c, c.req.param('id'));
  if ('error' in result) return c.json({ error: result.error }, result.status as 401 | 403 | 404);

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const active = !!body.active;

  // Verify feed belongs to this provider.
  const feed = await c.env.DB
    .prepare('SELECT id FROM provider_feeds WHERE id = ? AND provider_id = ?')
    .bind(c.req.param('feedId'), result.provider.id)
    .first();
  if (!feed) return c.json({ error: 'feed not found' }, 404);

  await setFeedActive(c.env.DB, c.req.param('feedId'), active);
  await logAudit(c.env.DB, result.provider.id, active ? 'feed_resumed' : 'feed_paused', {
    feed_id: c.req.param('feedId'),
  });
  return c.json({ ok: true });
});

// Analytics endpoint for dashboard.
providerRoutes.get('/providers/id/:id/analytics', async (c) => {
  const result = await getOwnedProvider(c, c.req.param('id'));
  if ('error' in result) return c.json({ error: result.error }, result.status as 401 | 403 | 404);

  const analytics = await getProviderAnalytics(c.env.DB, result.provider.id);
  return c.json({ analytics });
});

// HMAC connection handshake — signs a no-payment HEAD/GET against the first
// active feed on the provider's endpoint to verify the partner's verifier is
// wired up correctly.
//
// Returns a structured result the UI can show as ✓ / ⚠ / ✗ in the dashboard.
//
// NOTE: requires the platform admin to have set PARTNER_SECRET_<HANDLE> as a
// Worker secret. If not set, returns a structured error explaining what to do.
providerRoutes.post('/providers/id/:id/hmac/test', async (c) => {
  const result = await getOwnedProvider(c, c.req.param('id'));
  if ('error' in result) return c.json({ error: result.error }, result.status as 401 | 403 | 404);

  const provider = result.provider;
  if (provider.mode !== 'partner_bridge') {
    return c.json({
      ok: false,
      stage: 'config',
      reason: 'Only partner_bridge providers have HMAC. Hosted mirror needs no connection test.',
    }, 400);
  }
  if (!provider.partner_endpoint) {
    return c.json({ ok: false, stage: 'config', reason: 'partner_endpoint not configured' }, 400);
  }

  // Pick a feed to probe. Prefer the first active feed.
  const probe = await c.env.DB
    .prepare(`SELECT slug, source_path, source_method FROM provider_feeds WHERE provider_id = ? AND active = 1 ORDER BY created_at ASC LIMIT 1`)
    .bind(provider.id)
    .first<{ slug: string; source_path: string; source_method: string | null }>();
  if (!probe || !probe.source_path) {
    return c.json({
      ok: false,
      stage: 'config',
      reason: 'No active feed to test. Add a feed first so we have a path to probe.',
    }, 400);
  }

  // Fetch the platform-side copy of the HMAC secret from worker env.
  const envKey = `PARTNER_SECRET_${provider.handle.toUpperCase().replace(/-/g, '_')}`;
  const secret = (c.env as unknown as Record<string, string | undefined>)[envKey];
  if (!secret) {
    return c.json({
      ok: false,
      stage: 'platform_secret_missing',
      env_key: envKey,
      reason: `Platform HMAC secret not configured. Set it via: wrangler secret put ${envKey} (on the ShadowFeed worker), pasting the secret you saved when this provider was created.`,
    }, 200);
  }

  const method = (probe.source_method === 'POST' ? 'POST' : 'GET') as 'GET' | 'POST';
  const path = probe.source_path;

  let signed: Record<string, string>;
  try {
    signed = (await signPartnerRequest({
      method,
      path,
      body: '',
      secret,
      partnerName: 'shadowfeed',
    })) as unknown as Record<string, string>;
  } catch (e) {
    return c.json({
      ok: false,
      stage: 'sign_failed',
      reason: e instanceof Error ? e.message : 'failed to sign request',
    }, 500);
  }

  const start = Date.now();
  let upstreamStatus = 0;
  let upstreamBody = '';
  try {
    const res = await fetch(`${provider.partner_endpoint}${path}`, {
      method,
      headers: { ...signed, accept: 'application/json' },
    });
    upstreamStatus = res.status;
    upstreamBody = (await res.text()).slice(0, 500);
  } catch (e) {
    return c.json({
      ok: false,
      stage: 'network',
      latency_ms: Date.now() - start,
      reason: e instanceof Error ? e.message : 'fetch failed',
    }, 200);
  }
  const latency_ms = Date.now() - start;

  if (upstreamStatus >= 200 && upstreamStatus < 300) {
    await logAudit(c.env.DB, provider.id, 'hmac_test_ok', {
      feed_slug: probe.slug,
      latency_ms,
      upstream_status: upstreamStatus,
    });
    return c.json({
      ok: true,
      stage: 'ok',
      probed_feed: probe.slug,
      probed_path: path,
      upstream_status: upstreamStatus,
      latency_ms,
      body_preview: upstreamBody.slice(0, 300),
    });
  }

  if (upstreamStatus === 401 || upstreamStatus === 403) {
    return c.json({
      ok: false,
      stage: 'hmac_rejected',
      probed_feed: probe.slug,
      probed_path: path,
      upstream_status: upstreamStatus,
      latency_ms,
      body_preview: upstreamBody.slice(0, 300),
      reason: `Partner rejected the signed request (HTTP ${upstreamStatus}). Most likely cause: SHADOWFEED_PARTNER_SECRET on your server doesn't match what's set on ShadowFeed. Rotate from this dashboard and update both sides.`,
    }, 200);
  }

  return c.json({
    ok: false,
    stage: 'upstream_error',
    probed_feed: probe.slug,
    probed_path: path,
    upstream_status: upstreamStatus,
    latency_ms,
    body_preview: upstreamBody.slice(0, 300),
    reason: `Partner returned HTTP ${upstreamStatus}. Check your verifier middleware ordering and that the route exists.`,
  }, 200);
});

// Rotate HMAC secret for partner_bridge providers.
providerRoutes.post('/providers/id/:id/hmac/rotate', async (c) => {
  const result = await getOwnedProvider(c, c.req.param('id'));
  if ('error' in result) return c.json({ error: result.error }, result.status as 401 | 403 | 404);

  if (result.provider.mode !== 'partner_bridge') {
    return c.json({ error: 'HMAC only applies to partner_bridge mode' }, 400);
  }

  const plaintext = generatePartnerSecret();
  const hash = await hashPartnerSecret(plaintext);
  await updateHmacSecret(c.env.DB, result.provider.id, hash);
  await logAudit(c.env.DB, result.provider.id, 'hmac_rotated');

  return c.json({
    hmac_secret: plaintext,
    hmac_warning:
      'Save this secret now. We do not store the plaintext and you cannot retrieve it later. ' +
      'Update your partner endpoint to use this new secret immediately — the old one is invalidated.',
  });
});

// Link a withdrawal wallet via SIWS signature. Provider proves they control
// the destination address by signing a server-issued nonce.
//
// Two-step flow:
//   1. POST /providers/id/:id/link-wallet/nonce  → returns nonce + message to sign
//   2. POST /providers/id/:id/link-wallet         → posts signature, we verify + persist
providerRoutes.post('/providers/id/:id/link-wallet/nonce', async (c) => {
  const result = await getOwnedProvider(c, c.req.param('id'));
  if ('error' in result) return c.json({ error: result.error }, result.status as 401 | 403 | 404);

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const wallet = String(body.wallet_address ?? '').trim();
  if (!/^S[PT][0-9A-Z]{38,40}$/.test(wallet)) {
    return c.json({ error: 'invalid wallet_address' }, 400);
  }
  const issued = await issueNonce(c.env.DB, wallet);
  return c.json(issued);
});

providerRoutes.post('/providers/id/:id/link-wallet', async (c) => {
  const result = await getOwnedProvider(c, c.req.param('id'));
  if ('error' in result) return c.json({ error: result.error }, result.status as 401 | 403 | 404);

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const wallet = String(body.wallet_address ?? '').trim();
  const nonce = String(body.nonce ?? '').trim();
  const signature = String(body.signature ?? '').trim();
  const publicKey = String(body.public_key ?? '').trim();

  if (!wallet || !nonce || !signature || !publicKey) {
    return c.json({ error: 'missing wallet_address, nonce, signature, or public_key' }, 400);
  }

  const fresh = await consumeNonce(c.env.DB, nonce, wallet);
  if (!fresh) return c.json({ error: 'nonce invalid, expired, or already used' }, 400);

  const message = buildAuthMessage(nonce, wallet);
  const ok = verifyStacksSignature({ message, signature, publicKey });
  if (!ok) return c.json({ error: 'signature verification failed' }, 401);

  await linkWithdrawalWallet(c.env.DB, result.provider.id, wallet);
  await logAudit(c.env.DB, result.provider.id, 'wallet_linked', { wallet });
  return c.json({ ok: true, linked_address: wallet });
});

// Withdrawal history (the initiate-withdrawal POST lives in provider-withdraw.ts).
providerRoutes.get('/providers/id/:id/withdrawals', async (c) => {
  const result = await getOwnedProvider(c, c.req.param('id'));
  if ('error' in result) return c.json({ error: result.error }, result.status as 401 | 403 | 404);

  const rows = await getWithdrawalsByProvider(c.env.DB, result.provider.id, 100);
  return c.json({
    withdrawals: rows.map((r) => ({
      id: r.id,
      amount_microstx: r.amount_microstx,
      amount_stx: r.amount_microstx / 1_000_000,
      destination_address: r.destination_address,
      fee_microstx: r.fee_microstx,
      tx_hash: r.tx_hash,
      status: r.status,
      error_message: r.error_message,
      created_at: r.created_at,
      broadcast_at: r.broadcast_at,
      confirmed_at: r.confirmed_at,
    })),
  });
});
