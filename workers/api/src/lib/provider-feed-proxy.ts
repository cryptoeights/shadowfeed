// Paid feed handler for external providers. Sits in front of every
// `/feeds/p/:providerHandle/:feedSlug` endpoint and:
//
//   1. Looks up the provider + feed by handle/slug.
//   2. Runs the x402 v2 payment flow (same shape as platform-owned feeds).
//   3. After payment broadcast, fetches data:
//        - partner_bridge → HMAC-signed call to provider's partner endpoint.
//        - hosted_mirror  → reads from KV/D1 feed_cache (already populated by
//                            the scheduled poller).
//   4. Credits 97% of the paid amount to the provider's pending revenue
//      counter; the remaining 3% stays on the platform wallet as fee.
//   5. Logs the query for analytics + dispute resolution.
//
// The full payment (100%) lands on the platform's SERVER_ADDRESS wallet —
// settlement to the provider happens later via the withdrawal flow which
// signs a STX transfer from the *provider's* custodial wallet (which we
// top up from the platform wallet on a sweep cycle, see provider-withdraw.ts).
//
// Why this indirection? You can't atomically split one inbound STX tx into
// two recipient transfers without a smart contract. Doing it bookkeeping-only
// lets us batch settlement, save fees, and reconcile cleanly.

import {
  deserializeTransaction,
  addressFromVersionHash,
  addressToString,
  AddressVersion,
} from '@stacks/transactions';
import { STXtoMicroSTX } from 'x402-stacks';
import type { Context } from 'hono';
import type { Env } from '../types';
import { signPartnerRequest } from './hmac';
import { loadPlatformHmacSecret } from './provider-routes';
import {
  creditProviderRevenue,
  getFeedCache,
  getProviderFeedBySlug,
  logProviderQuery,
  recordFeedQuery,
  type ProviderFeedRow,
  type ProviderRow,
} from './providers-repo';

const STACKS_API_MAINNET = 'https://api.hiro.so';
const STACKS_API_TESTNET = 'https://api.testnet.hiro.so';

// 3% platform fee. Stored as basis points (300) to avoid float drift on big numbers.
const PLATFORM_FEE_BPS = 300;
const BPS_DENOMINATOR = 10_000;

function safeBtoa(str: string): string {
  return Buffer.from(str, 'utf-8').toString('base64');
}

function getStacksApiHeaders(env: Env): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.HIRO_API_KEY) headers['x-hiro-api-key'] = env.HIRO_API_KEY;
  return headers;
}

function extractPayer(tx: any, isMainnet: boolean): string {
  try {
    const signer = tx.auth?.spendingCondition?.signer;
    if (signer) {
      const version = isMainnet
        ? AddressVersion.MainnetSingleSig
        : AddressVersion.TestnetSingleSig;
      const addr = addressFromVersionHash(version, signer);
      return addressToString(addr);
    }
    if (tx.auth?.spendingCondition?.address) return tx.auth.spendingCondition.address;
  } catch {}
  return 'unknown';
}

function splitFee(grossMicrostx: number): { fee: number; net: number } {
  const fee = Math.floor((grossMicrostx * PLATFORM_FEE_BPS) / BPS_DENOMINATOR);
  return { fee, net: grossMicrostx - fee };
}

// Fetch data from the provider's partner endpoint with an HMAC-signed request.
// The secret is stored ONLY as a hash in DB — the actual plaintext lives in
// Worker memory only during the request lifetime of the provider's initial
// onboarding response. For runtime calls we depend on the partner having stored
// the same secret on their side, and we re-derive HMAC freshly per request.
//
// IMPORTANT: this proxy doesn't itself need to know the plaintext secret —
// instead, the partner secret is stored as a Cloudflare Worker secret keyed by
// `PARTNER_SECRET_<provider.handle.toUpperCase()>`. This means rotating a
// secret is a 2-step op: (a) regenerate via /hmac/rotate (rehashes DB), (b)
// the partner updates their copy and the platform admin sets the new
// PARTNER_SECRET_<HANDLE> worker secret. M2 stays simple — for the Hyre pilot
// we'll set this manually as part of onboarding.
async function callPartnerEndpoint(opts: {
  provider: ProviderRow;
  feed: ProviderFeedRow;
  env: Env;
}): Promise<{ status: number; body: unknown; latencyMs: number }> {
  const { provider, feed, env } = opts;
  if (!provider.partner_endpoint || !feed.source_path) {
    return { status: 500, body: { error: 'provider misconfigured' }, latencyMs: 0 };
  }

  // Load HMAC secret from encrypted DB column (preferred) or worker env (fallback).
  const secret = await loadPlatformHmacSecret(env, provider);
  if (!secret) {
    return {
      status: 500,
      body: {
        error: 'platform partner secret not configured — rotate from the provider dashboard to store it encrypted',
      },
      latencyMs: 0,
    };
  }

  const method = (feed.source_method ?? 'GET') as 'GET' | 'POST';
  const body = ''; // M2 only forwards GETs without bodies.
  const headers = await signPartnerRequest({
    method,
    path: feed.source_path,
    body,
    secret,
    partnerName: 'shadowfeed',
  });

  const start = Date.now();
  try {
    const res = await fetch(`${provider.partner_endpoint}${feed.source_path}`, {
      method,
      headers: {
        ...headers,
        'accept': 'application/json',
      },
    });
    const latencyMs = Date.now() - start;
    const text = await res.text();
    const parsed = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
    return { status: res.status, body: parsed, latencyMs };
  } catch (err) {
    return {
      status: 502,
      body: { error: 'upstream fetch failed', detail: String(err) },
      latencyMs: Date.now() - start,
    };
  }
}

// Read hosted_mirror cached payload. KV is the hot path; D1 is the fallback.
async function readHostedMirror(opts: {
  feed: ProviderFeedRow;
  env: Env;
}): Promise<{ status: number; body: unknown; latencyMs: number }> {
  const { feed, env } = opts;
  const start = Date.now();
  // Try KV first.
  const kvKey = `feed-cache:${feed.id}`;
  const kvHit = await env.CACHE.get(kvKey);
  if (kvHit) {
    try {
      return { status: 200, body: JSON.parse(kvHit), latencyMs: Date.now() - start };
    } catch {
      // Fall through to D1.
    }
  }
  // KV miss → read from D1 + repopulate KV.
  const row = await getFeedCache(env.DB, feed.id);
  if (!row) {
    return {
      status: 503,
      body: { error: 'feed not yet populated', hint: 'wait for next poll cycle' },
      latencyMs: Date.now() - start,
    };
  }
  await env.CACHE.put(kvKey, row.payload_json, { expirationTtl: 600 });
  try {
    return { status: 200, body: JSON.parse(row.payload_json), latencyMs: Date.now() - start };
  } catch {
    return {
      status: 500,
      body: { error: 'cached payload not valid JSON' },
      latencyMs: Date.now() - start,
    };
  }
}

// The main handler. Mounted from index.ts as
//   app.get('/feeds/p/:providerHandle/:feedSlug', providerFeedHandler)
export async function providerFeedHandler(c: Context<{ Bindings: Env }>) {
  const env = c.env;
  const providerHandle = c.req.param('providerHandle');
  const feedSlug = c.req.param('feedSlug');

  if (!providerHandle || !feedSlug) {
    return c.json({ error: 'missing provider or feed slug' }, 400);
  }

  const lookup = await getProviderFeedBySlug(env.DB, providerHandle, feedSlug);
  if (!lookup) return c.json({ error: 'feed not found' }, 404);
  const { provider, feed } = lookup;

  if (provider.status !== 'active') {
    return c.json({ error: 'provider inactive' }, 503);
  }
  if (!feed.active) {
    return c.json({ error: 'feed paused' }, 503);
  }

  const network = env.NETWORK === 'mainnet' ? 'stacks:1' : 'stacks:2147483648';
  const isMainnet = env.NETWORK === 'mainnet';
  const apiUrl = isMainnet ? STACKS_API_MAINNET : STACKS_API_TESTNET;

  const paymentSignatureHeader = c.req.header('payment-signature');
  if (!paymentSignatureHeader) {
    const paymentRequired = {
      x402Version: 2,
      resource: {
        url: c.req.url,
        description: `${provider.name}: ${feed.name}`,
        mimeType: 'application/json',
      },
      accepts: [{
        scheme: 'exact',
        network,
        amount: String(feed.price_microstx),
        asset: 'STX',
        payTo: env.SERVER_ADDRESS,  // settlement always lands on platform first
        maxTimeoutSeconds: 300,
      }],
    };
    return c.json(paymentRequired, 402, {
      'payment-required': safeBtoa(JSON.stringify(paymentRequired)),
    });
  }

  // Decode + verify payment.
  let paymentPayload: any;
  try {
    paymentPayload = JSON.parse(atob(paymentSignatureHeader));
  } catch {
    return c.json({ error: 'invalid payment-signature header' }, 400);
  }
  if (paymentPayload.x402Version !== 2) {
    return c.json({ error: 'only x402 v2 is supported' }, 400);
  }
  const txHex = paymentPayload?.payload?.transaction;
  if (!txHex) return c.json({ error: 'no transaction in payment payload' }, 400);

  const tx = deserializeTransaction(txHex);
  const txPayload = tx.payload as any;
  const requiredAmount = BigInt(feed.price_microstx);
  const txAmount = BigInt(txPayload.amount || 0);
  if (txAmount < requiredAmount) {
    return c.json(
      { error: `insufficient payment: ${txAmount} < ${requiredAmount}` },
      402,
    );
  }

  // Broadcast settlement (best-effort with retry for rate limits).
  const payer = extractPayer(tx, isMainnet);
  let txId: string | null = null;
  try {
    const rawBytes = Uint8Array.from(Buffer.from(txHex, 'hex'));
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch(`${apiUrl}/v2/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          ...getStacksApiHeaders(env),
        },
        body: rawBytes,
      });
      const text = await res.text();
      if (res.ok) {
        txId = text.replace(/"/g, '');
        break;
      }
      if (res.status === 429 && attempt < 2) {
        await new Promise((r) => setTimeout(r, (attempt + 1) * 5000));
        continue;
      }
      break;
    }
  } catch {
    // Swallow — we still deliver data so the payer isn't penalized for
    // platform-side broadcast hiccups. Reconcile via cron.
  }

  // Fetch data from the provider.
  const upstream = provider.mode === 'partner_bridge'
    ? await callPartnerEndpoint({ provider, feed, env })
    : await readHostedMirror({ feed, env });

  // If upstream fully failed (5xx), don't credit the provider. The buyer still
  // paid — we'll refund via withdrawal credit or platform fee waiver in M3.
  const success = upstream.status >= 200 && upstream.status < 400;
  const { fee, net } = splitFee(feed.price_microstx);

  if (success) {
    await Promise.all([
      creditProviderRevenue(env.DB, provider.id, net),
      recordFeedQuery(env.DB, feed.id, net),
    ]);
  }

  // Cache the buyer's display name (parity with the platform x402 handler).
  // Without this, wallets that only hit provider feeds keep a stale cached
  // name and never reflect the x-agent-name they send.
  const agentName = c.req.header('x-agent-name');
  if (agentName && payer !== 'unknown') {
    await env.CACHE.put(`agent-name:${payer}`, agentName, {
      expirationTtl: 86400 * 365,
    });
  }

  await logProviderQuery(env.DB, {
    provider_id: provider.id,
    feed_id: feed.id,
    payer: payer === 'unknown' ? null : payer,
    tx_hash: txId,
    gross_microstx: feed.price_microstx,
    platform_fee_microstx: fee,
    provider_net_microstx: success ? net : 0,
    response_ms: upstream.latencyMs,
    upstream_status: upstream.status,
  });

  const paymentResponse = {
    success,
    payer,
    transaction: txId,
    network,
  };

  return c.json(
    {
      feed: `${provider.handle}/${feed.slug}`,
      provider: {
        handle: provider.handle,
        name: provider.name,
        wallet: provider.custodial_address,
      },
      price: `${feed.price_microstx / 1_000_000} STX`,
      revenue_split: {
        platform_fee_microstx: fee,
        provider_net_microstx: success ? net : 0,
      },
      paid_by: payer,
      tx: txId,
      timestamp: Date.now(),
      data: upstream.body,
      upstream_status: upstream.status,
    },
    success ? 200 : 502,
    { 'payment-response': safeBtoa(JSON.stringify(paymentResponse)) },
  );
}
