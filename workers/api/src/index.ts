import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { paymentMiddleware, STXtoMicroSTX, getPayment } from 'x402-stacks';
import { deserializeTransaction, addressFromVersionHash, addressToString, AddressVersion } from '@stacks/transactions';

import type { Env } from './types';
import { initDb, ensureFeedStats, recordQuery, getRecentQueries, getUniqueAgents, getAgentLeaderboard, getTotalRevenue, getQueryById, getRecentProviderQueries, getProviderUniquePayers, getProviderTotalGross, getProviderAgentLeaderboard, getProviderFeedStats, getRealOnchainSettlements, deriveSourceType, type SourceType } from './db';
import { getRegistry } from './registry';
import { getProviderReputation } from './reputation';
import { generateWhaleAlerts } from './feeds/whale-alerts';
import { generateSentimentScore } from './feeds/btc-sentiment';
import { generateDeFiScores } from './feeds/defi-scores';
import { generateSmartMoneyFlows } from './feeds/nansen-smart-money';
import { generateTokenIntelligence } from './feeds/nansen-token-intel';
import { generateWalletProfile } from './feeds/nansen-wallet-profiler';
import { generateSmartMoneyHoldings } from './feeds/nansen-holdings';
import { generateDexTradingIntel } from './feeds/nansen-dex-trades';
import { generateLiquidationAlerts } from './feeds/liquidation-alerts';
import { generateGasPrediction } from './feeds/gas-prediction';
import { generateTokenLaunches } from './feeds/token-launches';
import { generateGovernanceActivity } from './feeds/governance';
import { generateStablecoinFlows } from './feeds/stablecoin-flows';
import { generateSecurityAlerts } from './feeds/security-alerts';
import { generateDevActivity } from './feeds/dev-activity';
import { generateBridgeFlows } from './feeds/bridge-flows';
import { generateAlexPriceFeed } from './feeds/alex-price-feed';
import { generateAlexPoolAnalytics } from './feeds/alex-pool-analytics';
import { generateAlexTvlFlows } from './feeds/alex-tvl-flows';
import { generateAlexSwapActivity } from './feeds/alex-swap-activity';
import { generateAlexPairsOverview } from './feeds/alex-pairs-overview';
import { enhanceFeedData } from './lib/enhance-feed';
import { agentRoutes } from './lib/agent-routes';
import { findActiveAgents } from './lib/agents-repo';
import { cronMatches, executeAgent, defaultWebhookDelivery } from './lib/agent-engine';
import { providerRoutes } from './lib/provider-routes';
import { providerWithdrawRoutes, pollPendingWithdrawals } from './lib/provider-withdraw';
import { providerFeedHandler } from './lib/provider-feed-proxy';
import { runHostedMirrorPoller } from './lib/provider-poller';
import { sweepExpiredNonces } from './lib/hmac';

const app = new Hono<{ Bindings: Env }>();

// Maps feed_id → category so enhance-feed.ts can select the right prompt frame.
// Keep this in sync with the `FEED_DEFINITIONS` in registry.ts.
const FEED_CATEGORIES: Record<string, string> = {
  'whale-alerts': 'on-chain',
  'btc-sentiment': 'social',
  'defi-scores': 'analytics',
  'smart-money-flows': 'on-chain',
  'token-intel': 'analytics',
  'wallet-profiler': 'on-chain',
  'smart-money-holdings': 'on-chain',
  'dex-trades': 'on-chain',
  'liquidation-alerts': 'derivatives',
  'gas-prediction': 'infrastructure',
  'token-launches': 'discovery',
  'governance': 'governance',
  'stablecoin-flows': 'analytics',
  'security-alerts': 'security',
  'dev-activity': 'development',
  'bridge-flows': 'cross-chain',
  'alex-price-feed': 'stacks-defi',
  'alex-pool-analytics': 'stacks-defi',
  'alex-tvl-flows': 'stacks-defi',
  'alex-swap-activity': 'stacks-defi',
  'alex-pairs-overview': 'stacks-defi',
};

// Multiplier applied to the base feed price when the client requests
// `?enhance=true`. Pays for Gemini inference + premium UX tier.
const ENHANCE_PRICE_MULTIPLIER = 3;

app.use('*', cors());

// DB init on first request
let dbInitialized = false;
app.use('*', async (c, next) => {
  if (!dbInitialized) {
    await initDb(c.env.DB);
    await ensureFeedStats(c.env.DB, [
      'whale-alerts', 'btc-sentiment', 'defi-scores',
      'smart-money-flows', 'token-intel', 'wallet-profiler', 'smart-money-holdings', 'dex-trades',
      'liquidation-alerts', 'gas-prediction', 'token-launches', 'governance',
      'stablecoin-flows', 'security-alerts', 'dev-activity', 'bridge-flows',
      'alex-price-feed', 'alex-pool-analytics', 'alex-tvl-flows', 'alex-swap-activity', 'alex-pairs-overview',
    ]);
    dbInitialized = true;
  }
  await next();
});

// ============================================
// Agent name generator
// ============================================

const AGENT_PREFIXES = ['Shadow', 'Cyber', 'Quantum', 'Neural', 'Alpha', 'Omega', 'Phantom', 'Nova', 'Stellar', 'Hyper', 'Crypto', 'Digital', 'Apex', 'Nexus', 'Vector', 'Sigma', 'Delta', 'Turbo', 'Nano', 'Onyx'];
const AGENT_SUFFIXES = ['Bot', 'Agent', 'Scout', 'Miner', 'Seeker', 'Hunter', 'Walker', 'Runner', 'Pilot', 'Guard', 'Hawk', 'Wolf', 'Fox', 'Lynx', 'Viper', 'Raven', 'Spark', 'Node', 'Core', 'Byte'];

function getAgentName(address: string): string {
  if (!address) return 'Unknown';
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = ((hash << 5) - hash + address.charCodeAt(i)) | 0;
  }
  const prefixIdx = Math.abs(hash) % AGENT_PREFIXES.length;
  const suffixIdx = Math.abs(hash >> 8) % AGENT_SUFFIXES.length;
  const num = Math.abs(hash >> 16) % 100;
  return `${AGENT_PREFIXES[prefixIdx]}${AGENT_SUFFIXES[suffixIdx]}-${num}`;
}

function formatTimeAgo(timestampMs: number): string {
  const diff = Date.now() - timestampMs;
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// Unicode-safe base64 encoder — btoa() only supports Latin-1, so we encode via UTF-8 bytes first.
function safeBtoa(str: string): string {
  return Buffer.from(str, 'utf-8').toString('base64');
}

const FEED_PRICES: Record<string, number> = {
  // Original feeds
  'whale-alerts': 0.005,
  'btc-sentiment': 0.003,
  'defi-scores': 0.01,
  // Nansen-powered feeds (premium — 50 credits/call, $0.05-0.10 cost)
  'smart-money-flows': 0.08,   // 100 credits (2 calls)
  'token-intel': 0.05,         // 50 credits (1 call)
  'wallet-profiler': 0.05,     // 50 credits (1 call)
  'smart-money-holdings': 0.05, // 50 credits (1 call)
  'dex-trades': 0.08,          // 100 credits (2 calls)
  // Free API feeds
  'liquidation-alerts': 0.008,
  'gas-prediction': 0.003,
  'token-launches': 0.005,
  'governance': 0.005,
  'stablecoin-flows': 0.005,
  'security-alerts': 0.005,
  'dev-activity': 0.003,
  'bridge-flows': 0.005,
  // ALEX Lab Stacks DeFi feeds
  'alex-price-feed': 0.003,
  'alex-pool-analytics': 0.005,
  'alex-tvl-flows': 0.005,
  'alex-swap-activity': 0.005,
  'alex-pairs-overview': 0.003,
};

// ============================================
// EMBEDDED FACILITATOR — x402 payment verification
// ============================================

const STACKS_API_TESTNET = 'https://api.testnet.hiro.so';
const STACKS_API_MAINNET = 'https://api.hiro.so';

function getStacksApiHeaders(env: Env): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.HIRO_API_KEY) {
    headers['x-hiro-api-key'] = env.HIRO_API_KEY;
  }
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

async function waitForTx(apiUrl: string, txId: string, timeoutMs: number, headers: Record<string, string> = {}): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${apiUrl}/extended/v1/tx/${txId}`, { headers });
      if (r.ok) {
        const data = await r.json() as { tx_status?: string };
        const status = data?.tx_status;
        if (status === 'success') return true;
        if (status?.startsWith('abort')) return false;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 5000));
  }
  return false;
}

app.get('/supported', (c) => {
  return c.json({
    kinds: [
      { x402Version: 2, scheme: 'exact', network: 'stacks:2147483648' },
      { x402Version: 2, scheme: 'exact', network: 'stacks:1' },
    ],
    extensions: [],
    signers: {},
  });
});

app.post('/verify', async (c) => {
  try {
    const body = await c.req.json();
    const { paymentPayload, paymentRequirements } = body;
    if (!paymentPayload || !paymentRequirements) {
      return c.json({ isValid: false, errorReason: 'Missing paymentPayload or paymentRequirements' }, 400);
    }
    const txHex = paymentPayload?.payload?.transaction || paymentPayload?.transaction;
    if (!txHex) {
      return c.json({ isValid: false, errorReason: 'No transaction found in payload' }, 400);
    }
    const tx = deserializeTransaction(txHex);
    const txPayload = tx.payload as any;
    const requiredAmount = BigInt(paymentRequirements.amount || '0');
    const txAmount = BigInt(txPayload.amount || 0);
    if (txAmount < requiredAmount) {
      return c.json({ isValid: false, errorReason: `Insufficient: tx=${txAmount} required=${requiredAmount}` });
    }
    const verifyNetwork = paymentRequirements.network || 'stacks:2147483648';
    const payer = extractPayer(tx, verifyNetwork === 'stacks:1');
    console.log(`[VERIFY] Valid: ${txAmount} microSTX from ${payer}`);
    return c.json({ isValid: true, payer });
  } catch (err: any) {
    console.error('[VERIFY] Error:', err.message);
    return c.json({ isValid: false, errorReason: err.message }, 400);
  }
});

app.post('/settle', async (c) => {
  try {
    const body = await c.req.json();
    const { paymentPayload, paymentRequirements } = body;
    if (!paymentPayload || !paymentRequirements) {
      return c.json({ success: false, errorReason: 'Missing payload or requirements' }, 400);
    }
    const txHex = paymentPayload?.payload?.transaction || paymentPayload?.transaction;
    if (!txHex) {
      return c.json({ success: false, errorReason: 'No transaction in payload' }, 400);
    }
    const networkId = paymentRequirements.network || 'stacks:2147483648';
    const isMainnet = networkId === 'stacks:1';
    const apiUrl = isMainnet ? STACKS_API_MAINNET : STACKS_API_TESTNET;
    const tx = deserializeTransaction(txHex);
    const payer = extractPayer(tx, isMainnet);
    console.log(`[SETTLE] Broadcasting from ${payer} on ${isMainnet ? 'mainnet' : 'testnet'}...`);
    const rawBytes = Uint8Array.from(Buffer.from(txHex, 'hex'));
    const broadcastRes = await fetch(`${apiUrl}/v2/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', ...getStacksApiHeaders(c.env) },
      body: rawBytes,
    });
    const broadcastText = await broadcastRes.text();
    if (!broadcastRes.ok) {
      console.error(`[SETTLE] Broadcast failed: ${broadcastText}`);
      return c.json({ success: false, errorReason: broadcastText }, 400);
    }
    const txId = broadcastText.replace(/"/g, '');
    console.log(`[SETTLE] Broadcast OK: ${txId}`);
    // Poll max 30s in Workers (Workers have execution time limits)
    const confirmed = await waitForTx(apiUrl, txId, 25000);
    console.log(`[SETTLE] ${confirmed ? 'Confirmed' : 'Pending (mempool)'}: ${txId}`);
    return c.json({ success: true, payer, transaction: txId, network: networkId });
  } catch (err: any) {
    console.error('[SETTLE] Error:', err.message);
    return c.json({ success: false, errorReason: err.message }, 500);
  }
});

// ============================================
// FREE ENDPOINTS — Discovery & Health
// ============================================

app.get('/', (c) => {
  return c.json({
    name: 'ShadowFeed API',
    description: 'Decentralized data marketplace for AI agents via x402 micropayments',
    version: '1.0.0',
    network: c.env.NETWORK,
    endpoints: {
      health: '/health',
      feeds: '/registry/feeds',
      stats: '/stats',
      activity: '/activity',
      leaderboard: '/leaderboard',
      docs: 'https://shadowfeed.app',
    },
    feeds_available: 21,
    payment_protocol: 'x402-stacks',
  });
});

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'shadowfeed',
    timestamp: Date.now(),
    network: c.env.NETWORK,
    provider: c.env.SERVER_ADDRESS,
    runtime: 'cloudflare-workers',
  });
});

app.get('/registry/feeds', async (c) => {
  const tierParam = c.req.query('tier');
  const tier = tierParam === 'verified' || tierParam === 'community' ? tierParam : 'all';
  const registry = await getRegistry(c.env.DB, c.env.SERVER_ADDRESS, tier);
  return c.json(registry);
});

app.get('/stats', async (c) => {
  const rep = await getProviderReputation(c.env.DB, c.env.SERVER_ADDRESS);
  return c.json(rep);
});

app.get('/activity', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);

  // ?include=all shows every row (sim + demo + real), each tagged source_type.
  // ?source=<value> filters to that specific source_type.
  // Default (no params): only real_onchain rows.
  const includeAll = c.req.query('include') === 'all';
  const sourceParam = c.req.query('source') as SourceType | undefined;
  const shownFilter: SourceType | 'all' =
    includeAll ? 'all' : (sourceParam ?? 'real_onchain');

  // Pull from both platform queries AND external provider proxy queries.
  // Shown rows use the requested filter; totals always reflect real_onchain only.
  const [platformQ, providerQ, realUniquePlatform, realUniqueProvider, realRevenuePlatform, realGrossProvider] = await Promise.all([
    getRecentQueries(c.env.DB, limit, shownFilter),
    getRecentProviderQueries(c.env.DB, limit, shownFilter),
    getUniqueAgents(c.env.DB, 'real_onchain'),
    getProviderUniquePayers(c.env.DB, 'real_onchain'),
    getTotalRevenue(c.env.DB, 'real_onchain'),
    getProviderTotalGross(c.env.DB, 'real_onchain'),
  ]);

  const network = c.env.NETWORK;

  type ActivityItem = {
    id: string;
    source: 'platform' | 'provider';
    feed: string;
    agent: string | null;
    tx_hash: string | null;
    response_ms: number;
    price_stx: number;
    created_at: number;
    source_type: SourceType;
  };

  const items: ActivityItem[] = [
    ...platformQ.map((q): ActivityItem => ({
      id: `p:${q.id}`,
      source: 'platform',
      feed: q.feed_id,
      agent: q.payer ?? null,
      tx_hash: q.tx_hash ?? null,
      response_ms: q.response_ms,
      price_stx: FEED_PRICES[q.feed_id] ?? 0,
      created_at: q.created_at,
      source_type: (q as any).source_type ?? deriveSourceType(q.tx_hash),
    })),
    ...providerQ.map((q): ActivityItem => ({
      id: `e:${q.id}`,
      source: 'provider',
      feed: q.feed_id,
      agent: q.payer,
      tx_hash: q.tx_hash,
      response_ms: q.response_ms,
      price_stx: q.price_stx,
      created_at: q.created_at,
      source_type: q.source_type ?? deriveSourceType(q.tx_hash),
    })),
  ];

  items.sort((a, b) => b.created_at - a.created_at);
  const merged = items.slice(0, limit);

  // Resolve custom agent names once across the merged set.
  const uniquePayers = [...new Set(merged.map((q) => q.agent).filter(Boolean))] as string[];
  const agentNames: Record<string, string> = {};
  await Promise.all(uniquePayers.map(async (addr) => {
    const name = await c.env.CACHE.get(`agent-name:${addr}`);
    if (name) agentNames[addr] = name;
  }));

  // Real on-chain distinct buyer union (THE M2 traction number).
  const realBuyersRow = await c.env.DB
    .prepare(`
      SELECT COUNT(DISTINCT payer) AS n FROM (
        SELECT payer FROM queries WHERE source_type = 'real_onchain' AND payer IS NOT NULL
        UNION
        SELECT payer FROM provider_query_log WHERE source_type = 'real_onchain' AND payer IS NOT NULL
      )
    `)
    .first<{ n: number }>();
  const uniqueAgentsRealOnchain = realBuyersRow?.n ?? Math.max(realUniquePlatform, realUniqueProvider);

  return c.json({
    activity: merged.map((q) => {
      const isDemo = q.source_type === 'demo';
      const isReal = q.source_type === 'real_onchain';
      const customName = q.agent ? agentNames[q.agent] : null;
      return {
        id: q.id,
        source: q.source,
        source_type: q.source_type,
        feed: q.feed,
        agent: q.agent,
        agent_name: customName || getAgentName(q.agent || ''),
        agent_short: q.agent ? `${q.agent.slice(0, 8)}...${q.agent.slice(-6)}` : 'unknown',
        tx_hash: q.tx_hash,
        tx_explorer: isReal ? `https://explorer.hiro.so/txid/${q.tx_hash}?chain=${network}` : null,
        is_demo: isDemo,
        is_onchain: isReal,
        price_stx: q.price_stx,
        response_ms: q.response_ms,
        timestamp: q.created_at * 1000,
        time_ago: formatTimeAgo(q.created_at * 1000),
      };
    }),
    shown_count: merged.length,
    shown_filter: shownFilter,
    // Totals always reflect only real_onchain regardless of shown_filter.
    totals_filter: 'real_onchain (always)',
    unique_agents_real_onchain: uniqueAgentsRealOnchain,
    total_revenue_stx_real_onchain: Math.round((realRevenuePlatform + realGrossProvider) * 1000) / 1000,
    // Legacy fields kept for backward compatibility — always real_onchain values.
    total_queries: merged.length,
    unique_agents: uniqueAgentsRealOnchain,
    total_revenue_stx: Math.round((realRevenuePlatform + realGrossProvider) * 1000) / 1000,
    note: 'Default view shows only real on-chain mainnet transactions with verifiable tx hashes. Use ?include=all to see simulation/demo entries (clearly tagged). Totals always reflect real_onchain only.',
  });
});

// ── CSV export: real on-chain settlements only ──────────────────────────────
// Intentionally public — all data is on-chain anyway. Provides a downloadable
// evidence artifact for grant reviewers (e.g. Adam Haun / Stacks Labs).
// Mount before the parameterized /activity/:id/data route to avoid conflicts.
app.get('/admin/provider_query_log.csv', async (c) => {
  const rows = await getRealOnchainSettlements(c.env.DB, c.env.NETWORK);

  const header = 'timestamp_iso,buyer_wallet,feed,provider,price_microstx,price_stx,tx_hash,explorer_url,source_type';

  const csvRows = rows.map((r) => {
    // Escape any commas or quotes in string fields defensively.
    const esc = (v: string) => (v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v);
    return [
      esc(r.timestamp_iso),
      esc(r.buyer_wallet),
      esc(r.feed),
      esc(r.provider),
      String(r.price_microstx),
      String(r.price_stx),
      esc(r.tx_hash),
      esc(r.explorer_url),
      esc(r.source_type),
    ].join(',');
  });

  // Summary footer.
  const distinctWallets = new Set(rows.map((r) => r.buyer_wallet)).size;
  const totalMicrostx = rows.reduce((sum, r) => sum + r.price_microstx, 0);
  const firstSettle = rows.length > 0 ? rows[0].timestamp_iso : 'n/a';
  const lastSettle = rows.length > 0 ? rows[rows.length - 1].timestamp_iso : 'n/a';

  const footer = [
    '# distinct_buyer_wallets,total_paid_microstx,first_settle_iso,last_settle_iso',
    `# ${distinctWallets},${totalMicrostx},${firstSettle},${lastSettle}`,
  ].join('\n');

  const csv = [header, ...csvRows, footer].join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="provider_query_log.csv"',
    },
  });
});

app.get('/activity/:id/data', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (isNaN(id)) return c.json({ error: 'Invalid query ID' }, 400);

  const query = await getQueryById(c.env.DB, id);
  if (!query) return c.json({ error: 'Query not found' }, 404);

  const isDemo = query.tx_hash?.startsWith('demo_') || false;

  return c.json({
    id: query.id,
    feed: query.feed_id,
    agent: query.payer,
    tx_hash: query.tx_hash,
    is_demo: isDemo,
    is_onchain: !!(query.tx_hash && !isDemo),
    price_stx: FEED_PRICES[query.feed_id] || 0,
    response_ms: query.response_ms,
    timestamp: query.created_at * 1000,
    data: query.response_data ? JSON.parse(query.response_data) : null,
  });
});

app.get('/leaderboard', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);

  // Build a unified leaderboard from both platform queries and external
  // provider proxy queries. Same wallet appearing in both gets merged.
  const [platformAgents, providerAgents] = await Promise.all([
    getAgentLeaderboard(c.env.DB, 200),
    getProviderAgentLeaderboard(c.env.DB, 200),
  ]);

  interface Aggregate {
    address: string;
    total_queries: number;
    total_spent_microstx: number;
    platform_queries: number;
    provider_queries: number;
    whale_queries: number;
    sentiment_queries: number;
    defi_queries: number;
    response_ms_sum: number;
    response_ms_count: number;
    first_seen: number;
    last_seen: number;
  }

  const byAddr = new Map<string, Aggregate>();

  for (const a of platformAgents) {
    const spentStx =
      a.whale_queries * (FEED_PRICES['whale-alerts'] ?? 0) +
      a.sentiment_queries * (FEED_PRICES['btc-sentiment'] ?? 0) +
      a.defi_queries * (FEED_PRICES['defi-scores'] ?? 0);
    byAddr.set(a.address, {
      address: a.address,
      total_queries: a.total_queries,
      total_spent_microstx: Math.round(spentStx * 1_000_000),
      platform_queries: a.total_queries,
      provider_queries: 0,
      whale_queries: a.whale_queries,
      sentiment_queries: a.sentiment_queries,
      defi_queries: a.defi_queries,
      response_ms_sum: a.avg_response_ms * a.total_queries,
      response_ms_count: a.total_queries,
      first_seen: a.first_seen,
      last_seen: a.last_seen,
    });
  }

  for (const p of providerAgents) {
    const existing = byAddr.get(p.address);
    if (existing) {
      existing.total_queries += p.total_queries;
      existing.provider_queries = p.total_queries;
      existing.total_spent_microstx += p.total_spent_microstx;
      existing.response_ms_sum += p.avg_response_ms * p.total_queries;
      existing.response_ms_count += p.total_queries;
      existing.first_seen = Math.min(existing.first_seen, p.first_seen);
      existing.last_seen = Math.max(existing.last_seen, p.last_seen);
    } else {
      byAddr.set(p.address, {
        address: p.address,
        total_queries: p.total_queries,
        total_spent_microstx: p.total_spent_microstx,
        platform_queries: 0,
        provider_queries: p.total_queries,
        whale_queries: 0,
        sentiment_queries: 0,
        defi_queries: 0,
        response_ms_sum: p.avg_response_ms * p.total_queries,
        response_ms_count: p.total_queries,
        first_seen: p.first_seen,
        last_seen: p.last_seen,
      });
    }
  }

  const ranked = [...byAddr.values()]
    .sort((a, b) => b.total_queries - a.total_queries)
    .slice(0, limit);

  // Resolve custom names
  const leaderNames: Record<string, string> = {};
  await Promise.all(ranked.map(async (a) => {
    const name = await c.env.CACHE.get(`agent-name:${a.address}`);
    if (name) leaderNames[a.address] = name;
  }));

  return c.json({
    agents: ranked.map((a, idx) => ({
      rank: idx + 1,
      address: a.address,
      agent_name: leaderNames[a.address] || getAgentName(a.address),
      address_short: `${a.address.slice(0, 8)}...${a.address.slice(-6)}`,
      total_queries: a.total_queries,
      total_spent_stx: Math.round((a.total_spent_microstx / 1_000_000) * 1000) / 1000,
      platform_queries: a.platform_queries,
      provider_queries: a.provider_queries,
      feeds: {
        whale_alerts: a.whale_queries,
        btc_sentiment: a.sentiment_queries,
        defi_scores: a.defi_queries,
      },
      avg_response_ms: a.response_ms_count > 0
        ? Math.round(a.response_ms_sum / a.response_ms_count)
        : 0,
      first_seen: a.first_seen * 1000,
      last_seen: a.last_seen * 1000,
    })),
  });
});

// ============================================
// Feed generator dispatch
// ============================================

async function generateFeedById(feedId: string, kv: KVNamespace, nansenKey?: string): Promise<any> {
  switch (feedId) {
    case 'whale-alerts': return generateWhaleAlerts(kv);
    case 'btc-sentiment': return generateSentimentScore(kv);
    case 'defi-scores': return generateDeFiScores(kv);
    case 'smart-money-flows': return generateSmartMoneyFlows(kv, nansenKey ?? '');
    case 'token-intel': return generateTokenIntelligence(kv, nansenKey ?? '');
    case 'wallet-profiler': return generateWalletProfile(kv, nansenKey ?? '');
    case 'smart-money-holdings': return generateSmartMoneyHoldings(kv, nansenKey ?? '');
    case 'dex-trades': return generateDexTradingIntel(kv, nansenKey ?? '');
    case 'liquidation-alerts': return generateLiquidationAlerts(kv);
    case 'gas-prediction': return generateGasPrediction(kv);
    case 'token-launches': return generateTokenLaunches(kv);
    case 'governance': return generateGovernanceActivity(kv);
    case 'stablecoin-flows': return generateStablecoinFlows(kv);
    case 'security-alerts': return generateSecurityAlerts(kv);
    case 'dev-activity': return generateDevActivity(kv);
    case 'bridge-flows': return generateBridgeFlows(kv);
    case 'alex-price-feed': return generateAlexPriceFeed(kv);
    case 'alex-pool-analytics': return generateAlexPoolAnalytics(kv);
    case 'alex-tvl-flows': return generateAlexTvlFlows(kv);
    case 'alex-swap-activity': return generateAlexSwapActivity(kv);
    case 'alex-pairs-overview': return generateAlexPairsOverview(kv);
    default: throw new Error(`Unknown feed: ${feedId}`);
  }
}

// ============================================
// PAID ENDPOINTS — x402 Protected Data Feeds
// ============================================

// NOTE: x402-stacks paymentMiddleware is Express-based.
// For Hono/Workers, we implement the x402 flow manually.
// The flow: return 402 with payment requirements, client pays, sends payment header, we verify+settle.

async function x402Handler(
  c: any,
  feedId: string,
  priceStx: number,
  description: string,
  generateFn: (kv: KVNamespace) => Promise<any>
) {
  const env: Env = c.env;
  const network = env.NETWORK === 'mainnet' ? 'stacks:1' : 'stacks:2147483648';

  // Check if client requested AI-enhanced insights (?enhance=true)
  // Enhanced feeds cost 3x base price and include a Gemini-generated
  // summary + signal analysis alongside the raw data.
  const wantsEnhance = c.req.query('enhance') === 'true' || c.req.query('enhance') === '1';
  const effectivePrice = wantsEnhance ? priceStx * ENHANCE_PRICE_MULTIPLIER : priceStx;
  const effectiveDescription = wantsEnhance
    ? `${description} (AI-enhanced with Gemini insights)`
    : description;

  // x402 v2: check for payment-signature header (base64-encoded)
  const paymentSignatureHeader = c.req.header('payment-signature');

  if (!paymentSignatureHeader) {
    // Return 402 with x402 v2 payment requirements
    const paymentRequired = {
      x402Version: 2,
      resource: {
        url: c.req.url,
        description: effectiveDescription,
        mimeType: 'application/json',
      },
      accepts: [{
        scheme: 'exact',
        network,
        amount: String(STXtoMicroSTX(effectivePrice)),
        asset: 'STX',
        payTo: env.SERVER_ADDRESS,
        maxTimeoutSeconds: 300,
      }],
    };

    // Header: base64-encoded JSON, Body: same JSON object
    const headerValue = safeBtoa(JSON.stringify(paymentRequired));

    return c.json(paymentRequired, 402, { 'payment-required': headerValue });
  }

  // Decode payment-signature from base64
  let paymentPayload: any;
  try {
    const decoded = atob(paymentSignatureHeader);
    paymentPayload = JSON.parse(decoded);
  } catch {
    return c.json({ error: 'Invalid payment-signature header: failed to decode' }, 400);
  }

  if (paymentPayload.x402Version !== 2) {
    return c.json({ error: 'Only x402 v2 is supported' }, 400);
  }

  const txHex = paymentPayload?.payload?.transaction;
  if (!txHex) {
    return c.json({ error: 'No transaction in payment payload' }, 400);
  }

  const tx = deserializeTransaction(txHex);
  const txPayload = tx.payload as any;
  const requiredAmount = BigInt(STXtoMicroSTX(effectivePrice));
  const txAmount = BigInt(txPayload.amount || 0);

  if (txAmount < requiredAmount) {
    return c.json({ error: `Insufficient payment: ${txAmount} < ${requiredAmount}` }, 402);
  }

  // Broadcast transaction (settle)
  const isMainnet = env.NETWORK === 'mainnet';
  const payer = extractPayer(tx, isMainnet);
  const apiUrl = isMainnet ? STACKS_API_MAINNET : STACKS_API_TESTNET;

  let txId: string | null = null;
  try {
    // Use original hex from payment payload — avoid re-serialization issues
    const rawBytes = Uint8Array.from(Buffer.from(txHex, 'hex'));

    // Retry up to 3 times with backoff for rate limits
    for (let attempt = 0; attempt < 3; attempt++) {
      const broadcastRes = await fetch(`${apiUrl}/v2/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', ...getStacksApiHeaders(env) },
        body: rawBytes,
      });
      const broadcastText = await broadcastRes.text();
      if (broadcastRes.ok) {
        txId = broadcastText.replace(/"/g, '');
        console.log(`[SETTLE] Broadcast OK: ${txId}`);
        break;
      }
      if (broadcastRes.status === 429 && attempt < 2) {
        console.log(`[SETTLE] Rate limited, retrying in ${(attempt + 1) * 5}s...`);
        await new Promise(r => setTimeout(r, (attempt + 1) * 5000));
        continue;
      }
      console.error(`[SETTLE] Broadcast failed (${broadcastRes.status}): ${broadcastText}`);
      break;
    }
  } catch (err: any) {
    console.error(`[SETTLE] Error: ${err.message}`);
  }

  // Generate feed data
  const start = Date.now();
  const data = await generateFn(env.CACHE);
  const responseMs = Date.now() - start;

  // Optionally run data through Gemini for AI insights.
  // If Gemini fails for any reason we still return the raw data — the user
  // paid the enhanced price, but we prefer delivering partial value over nothing.
  // The response includes ai_insights.error so agents can detect degraded mode.
  let aiInsights: any = undefined;
  let aiError: any = undefined;
  if (wantsEnhance) {
    const category = FEED_CATEGORIES[feedId] || 'analytics';
    const result = await enhanceFeedData(feedId, category, data, env.GEMINI_API_KEY, env.CACHE, 300);
    if (result.insights) {
      aiInsights = result.insights;
    } else if (result.error) {
      aiError = { code: result.error.code, message: result.error.message };
      console.warn(`[enhance] Failed for ${feedId}: ${result.error.code} - ${result.error.message}`);
    }
  }

  // Store agent name if provided via header
  const agentName = c.req.header('x-agent-name');
  if (agentName && payer !== 'unknown') {
    await env.CACHE.put(`agent-name:${payer}`, agentName, { expirationTtl: 86400 * 365 });
  }

  // source_type: real_onchain when broadcast succeeded, simulation when txId is null
  // (broadcast failed but we still served data). deriveSourceType handles this correctly.
  await recordQuery(env.DB, feedId, payer, txId ?? undefined, responseMs, data);

  // Return with payment-response header
  const paymentResponse = {
    success: true,
    payer,
    transaction: txId,
    network,
  };
  const paymentResponseHeader = safeBtoa(JSON.stringify(paymentResponse));

  const responseBody: Record<string, unknown> = {
    feed: feedId,
    provider: env.SERVER_ADDRESS,
    price: `${effectivePrice} STX`,
    enhanced: wantsEnhance,
    timestamp: Date.now(),
    paid_by: payer,
    tx: txId,
    data,
  };
  if (aiInsights) responseBody.ai_insights = aiInsights;
  if (aiError) responseBody.ai_error = aiError;

  return c.json(responseBody, 200, { 'payment-response': paymentResponseHeader });
}

// --- Original feeds ---
app.get('/feeds/whale-alerts', (c) =>
  x402Handler(c, 'whale-alerts', 0.005, 'ShadowFeed: Real-time whale movement alerts', (kv) => generateWhaleAlerts(kv))
);

app.get('/feeds/btc-sentiment', (c) =>
  x402Handler(c, 'btc-sentiment', 0.003, 'ShadowFeed: BTC social sentiment analysis', (kv) => generateSentimentScore(kv))
);

app.get('/feeds/defi-scores', (c) =>
  x402Handler(c, 'defi-scores', 0.01, 'ShadowFeed: DeFi protocol risk and opportunity scores', (kv) => generateDeFiScores(kv))
);

// --- Nansen-powered feeds (premium) ---
app.get('/feeds/smart-money-flows', (c) =>
  x402Handler(c, 'smart-money-flows', 0.08, 'ShadowFeed: Smart money net flows and trading signals',
    (kv) => generateSmartMoneyFlows(kv, c.env.NANSEN_API_KEY))
);

app.get('/feeds/token-intel', (c) => {
  const tokenAddress = c.req.query('address');
  const chain = c.req.query('chain');
  return x402Handler(c, 'token-intel', 0.05, 'ShadowFeed: Token intelligence from Nansen TGM',
    (kv) => generateTokenIntelligence(kv, c.env.NANSEN_API_KEY, tokenAddress, chain));
});

app.get('/feeds/wallet-profiler', (c) => {
  const address = c.req.query('address');
  const chain = c.req.query('chain');
  return x402Handler(c, 'wallet-profiler', 0.05, 'ShadowFeed: Wallet portfolio analysis via Nansen',
    (kv) => generateWalletProfile(kv, c.env.NANSEN_API_KEY, address, chain));
});

app.get('/feeds/smart-money-holdings', (c) =>
  x402Handler(c, 'smart-money-holdings', 0.05, 'ShadowFeed: Smart money top holdings and signals',
    (kv) => generateSmartMoneyHoldings(kv, c.env.NANSEN_API_KEY))
);

app.get('/feeds/dex-trades', (c) =>
  x402Handler(c, 'dex-trades', 0.08, 'ShadowFeed: Smart money DEX and perp trades',
    (kv) => generateDexTradingIntel(kv, c.env.NANSEN_API_KEY))
);

// --- Free API feeds ---
app.get('/feeds/liquidation-alerts', (c) =>
  x402Handler(c, 'liquidation-alerts', 0.008, 'ShadowFeed: Futures liquidation alerts', (kv) => generateLiquidationAlerts(kv))
);

app.get('/feeds/gas-prediction', (c) =>
  x402Handler(c, 'gas-prediction', 0.003, 'ShadowFeed: ETH gas and BTC fee predictions', (kv) => generateGasPrediction(kv))
);

app.get('/feeds/token-launches', (c) =>
  x402Handler(c, 'token-launches', 0.005, 'ShadowFeed: New token launches and trending tokens', (kv) => generateTokenLaunches(kv))
);

app.get('/feeds/governance', (c) =>
  x402Handler(c, 'governance', 0.005, 'ShadowFeed: DAO governance proposals and votes', (kv) => generateGovernanceActivity(kv))
);

app.get('/feeds/stablecoin-flows', (c) =>
  x402Handler(c, 'stablecoin-flows', 0.005, 'ShadowFeed: Stablecoin market cap and flow analysis', (kv) => generateStablecoinFlows(kv))
);

app.get('/feeds/security-alerts', (c) =>
  x402Handler(c, 'security-alerts', 0.005, 'ShadowFeed: DeFi security incidents and hack alerts', (kv) => generateSecurityAlerts(kv))
);

app.get('/feeds/dev-activity', (c) =>
  x402Handler(c, 'dev-activity', 0.003, 'ShadowFeed: Blockchain developer activity tracker', (kv) => generateDevActivity(kv))
);

app.get('/feeds/bridge-flows', (c) =>
  x402Handler(c, 'bridge-flows', 0.005, 'ShadowFeed: Cross-chain bridge volume and flows', (kv) => generateBridgeFlows(kv))
);

// --- ALEX Lab Stacks DeFi feeds ---
app.get('/feeds/alex-price-feed', (c) =>
  x402Handler(c, 'alex-price-feed', 0.003, 'ShadowFeed: ALEX Lab token prices for Stacks ecosystem', (kv) => generateAlexPriceFeed(kv))
);

app.get('/feeds/alex-pool-analytics', (c) =>
  x402Handler(c, 'alex-pool-analytics', 0.005, 'ShadowFeed: ALEX Lab pool analytics - liquidity, APY, volume rankings', (kv) => generateAlexPoolAnalytics(kv))
);

app.get('/feeds/alex-tvl-flows', (c) =>
  x402Handler(c, 'alex-tvl-flows', 0.005, 'ShadowFeed: ALEX Lab TVL flows and pool concentration analysis', (kv) => generateAlexTvlFlows(kv))
);

app.get('/feeds/alex-swap-activity', (c) =>
  x402Handler(c, 'alex-swap-activity', 0.005, 'ShadowFeed: ALEX Lab swap activity and trending pairs', (kv) => generateAlexSwapActivity(kv))
);

app.get('/feeds/alex-pairs-overview', (c) =>
  x402Handler(c, 'alex-pairs-overview', 0.003, 'ShadowFeed: ALEX Lab trading pairs overview', (kv) => generateAlexPairsOverview(kv))
);

// ============================================
// WALLET ENDPOINTS — Browser wallet purchases
// ============================================

app.post('/wallet/buy', async (c) => {
  const body = await c.req.json();
  const { feedId, txId, senderAddress, enhance } = body;

  if (!feedId || !txId || !senderAddress) {
    return c.json({ error: 'Missing feedId, txId, or senderAddress' }, 400);
  }

  if (!(feedId in FEED_PRICES)) {
    return c.json({ error: 'Invalid feed ID' }, 400);
  }

  const wantsEnhance = enhance === true || enhance === 'true';
  const basePrice = FEED_PRICES[feedId];
  const effectivePrice = wantsEnhance ? basePrice * ENHANCE_PRICE_MULTIPLIER : basePrice;

  const start = Date.now();

  try {
    const data = await generateFeedById(feedId, c.env.CACHE, c.env.NANSEN_API_KEY);

    // Run through Gemini if the client paid for enhancement. Non-blocking
    // semantics: raw data always wins, insights are a bonus layer.
    let aiInsights: any = undefined;
    let aiError: any = undefined;
    if (wantsEnhance) {
      const category = FEED_CATEGORIES[feedId] || 'analytics';
      const result = await enhanceFeedData(feedId, category, data, c.env.GEMINI_API_KEY, c.env.CACHE, 300);
      if (result.insights) aiInsights = result.insights;
      else if (result.error) aiError = { code: result.error.code, message: result.error.message };
    }

    const responseMs = Date.now() - start;
    // SIWS wallet path: txId is always the broadcast result — real_onchain.
    await recordQuery(c.env.DB, feedId, senderAddress, txId, responseMs, data, 'real_onchain');

    const responseBody: Record<string, unknown> = {
      feed: feedId,
      provider: c.env.SERVER_ADDRESS,
      price: `${effectivePrice} STX`,
      enhanced: wantsEnhance,
      timestamp: Date.now(),
      paid_by: senderAddress,
      tx: txId,
      tx_explorer: `https://explorer.hiro.so/txid/${txId}?chain=${c.env.NETWORK}`,
      wallet_payment: true,
      data,
    };
    if (aiInsights) responseBody.ai_insights = aiInsights;
    if (aiError) responseBody.ai_error = aiError;

    return c.json(responseBody);
  } catch (err: any) {
    return c.json({ error: 'Failed to generate feed data', detail: err.message }, 500);
  }
});

// ============================================
// DEMO ENDPOINTS
// ============================================

app.get('/demo/feeds/:feedId', async (c) => {
  if (c.env.DEMO_MODE !== 'true') {
    return c.json({ error: 'Demo mode not enabled' }, 404);
  }

  const feedId = c.req.param('feedId');
  if (!(feedId in FEED_PRICES)) {
    return c.json({ error: 'Invalid feed ID' }, 400);
  }

  const start = Date.now();
  const payer = c.req.header('x-agent-address') || 'demo-agent';

  const data = await generateFeedById(feedId, c.env.CACHE, c.env.NANSEN_API_KEY);

  const responseMs = Date.now() - start + Math.floor(Math.random() * 200);
  await recordQuery(c.env.DB, feedId, payer, `demo_${Math.random().toString(36).slice(2, 14)}`, responseMs, data, 'demo');

  return c.json({
    feed: feedId,
    provider: c.env.SERVER_ADDRESS,
    price: `${FEED_PRICES[feedId]} STX`,
    timestamp: Date.now(),
    paid_by: payer,
    demo: true,
    data,
  });
});

// ============================================
// AGENT PLATFORM — auth, CRUD, public discovery
// ============================================
app.route('/', agentRoutes);

// ============================================
// PROVIDER PORTAL — onboarding, dashboard, paid proxy feeds
// ============================================
app.route('/', providerRoutes);
app.route('/', providerWithdrawRoutes);

// Paid proxy feed for any registered external provider.
// URL shape: /feeds/p/:providerHandle/:feedSlug
app.get('/feeds/p/:providerHandle/:feedSlug', providerFeedHandler);

// Dismiss .well-known probes
app.get('/.well-known/*', (c) => c.text('', 404));

// ============================================
// CRON HANDLER — runs every minute, executes due agents
// ============================================
//
// We over-fetch active agents and filter by cron in JS (D1 has no cron parser).
// Each agent's run is wrapped in waitUntil so failures don't tank the batch.
export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const now = new Date(event.scheduledTime);
    const agents = await findActiveAgents(env.DB, 500);
    const due = agents.filter(a => cronMatches(a.schedule_cron, now));
    console.log(`[cron] tick at ${now.toISOString()} — ${due.length}/${agents.length} agents due`);

    // Internal feed fetcher — bypasses x402 (we own this request).
    const fetchFeed = async (feedId: string) => {
      return generateFeedById(feedId, env.CACHE, env.NANSEN_API_KEY);
    };

    // Execute each agent in parallel but bounded (avoid blowing CPU budget).
    const BATCH = 10;
    for (let i = 0; i < due.length; i += BATCH) {
      const slice = due.slice(i, i + BATCH);
      await Promise.allSettled(
        slice.map(agent =>
          executeAgent(agent, {
            env,
            fetchFeed,
            deliverWebhook: defaultWebhookDelivery,
          }).catch(err => {
            console.error(`[cron] agent ${agent.id} crashed:`, err?.message ?? err);
          }),
        ),
      );
    }

    // Provider portal maintenance — runs every minute alongside agent cron.
    // All independent of agent execution; failures here shouldn't crash agents.
    await Promise.allSettled([
      runHostedMirrorPoller(env).then((r) =>
        console.log(`[cron] poller polled=${r.polled} ok=${r.ok} failed=${r.failed}`),
      ),
      pollPendingWithdrawals(env).then((r) =>
        console.log(`[cron] withdrawals checked=${r.checked} confirmed=${r.confirmed}`),
      ),
      sweepExpiredNonces(env.DB).then((n) =>
        n > 0 && console.log(`[cron] swept ${n} expired hmac nonces`),
      ),
    ]);
  },
};
