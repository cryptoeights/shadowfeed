import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { paymentMiddleware, STXtoMicroSTX, getPayment } from 'x402-stacks';
import { deserializeTransaction, addressFromVersionHash, addressToString, AddressVersion } from '@stacks/transactions';

import type { Env } from './types';
import { initDb, ensureFeedStats, recordQuery, getRecentQueries, getUniqueAgents, getAgentLeaderboard, getTotalRevenue, getQueryById } from './db';
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

const app = new Hono<{ Bindings: Env }>();

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
    feeds_available: 16,
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
  const registry = await getRegistry(c.env.DB, c.env.SERVER_ADDRESS);
  return c.json(registry);
});

app.get('/stats', async (c) => {
  const rep = await getProviderReputation(c.env.DB, c.env.SERVER_ADDRESS);
  return c.json(rep);
});

app.get('/activity', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
  const queries = await getRecentQueries(c.env.DB, limit);
  const [uniqueAgents, totalRevenue] = await Promise.all([
    getUniqueAgents(c.env.DB),
    getTotalRevenue(c.env.DB),
  ]);

  // Resolve custom agent names from KV
  const uniquePayers = [...new Set(queries.map(q => q.payer).filter(Boolean))] as string[];
  const agentNames: Record<string, string> = {};
  await Promise.all(uniquePayers.map(async (addr) => {
    const name = await c.env.CACHE.get(`agent-name:${addr}`);
    if (name) agentNames[addr] = name;
  }));

  return c.json({
    activity: queries.map(q => {
      const isDemo = q.tx_hash?.startsWith('demo_') || false;
      const isReal = q.tx_hash && !isDemo;
      const customName = q.payer ? agentNames[q.payer] : null;
      return {
        id: q.id,
        feed: q.feed_id,
        agent: q.payer,
        agent_name: customName || getAgentName(q.payer || ''),
        agent_short: q.payer ? `${q.payer.slice(0, 8)}...${q.payer.slice(-6)}` : 'unknown',
        tx_hash: q.tx_hash,
        tx_explorer: isReal ? `https://explorer.hiro.so/txid/${q.tx_hash}?chain=${c.env.NETWORK}` : null,
        is_demo: isDemo,
        is_onchain: isReal,
        price_stx: FEED_PRICES[q.feed_id] || 0,
        response_ms: q.response_ms,
        timestamp: q.created_at * 1000,
        time_ago: formatTimeAgo(q.created_at * 1000),
      };
    }),
    total_queries: queries.length,
    unique_agents: uniqueAgents,
    total_revenue_stx: Math.round(totalRevenue * 1000) / 1000,
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
  const agents = await getAgentLeaderboard(c.env.DB, 20);

  // Resolve custom names
  const leaderNames: Record<string, string> = {};
  await Promise.all(agents.map(async (a) => {
    const name = await c.env.CACHE.get(`agent-name:${a.address}`);
    if (name) leaderNames[a.address] = name;
  }));

  return c.json({
    agents: agents.map((a, idx) => ({
      rank: idx + 1,
      address: a.address,
      agent_name: leaderNames[a.address] || getAgentName(a.address),
      address_short: `${a.address.slice(0, 8)}...${a.address.slice(-6)}`,
      total_queries: a.total_queries,
      total_spent_stx: Math.round(
        (a.whale_queries * FEED_PRICES['whale-alerts'] +
         a.sentiment_queries * FEED_PRICES['btc-sentiment'] +
         a.defi_queries * FEED_PRICES['defi-scores']) * 1000
      ) / 1000,
      feeds: {
        whale_alerts: a.whale_queries,
        btc_sentiment: a.sentiment_queries,
        defi_scores: a.defi_queries,
      },
      avg_response_ms: a.avg_response_ms,
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

  // x402 v2: check for payment-signature header (base64-encoded)
  const paymentSignatureHeader = c.req.header('payment-signature');

  if (!paymentSignatureHeader) {
    // Return 402 with x402 v2 payment requirements
    const paymentRequired = {
      x402Version: 2,
      resource: {
        url: c.req.url,
        description,
        mimeType: 'application/json',
      },
      accepts: [{
        scheme: 'exact',
        network,
        amount: String(STXtoMicroSTX(priceStx)),
        asset: 'STX',
        payTo: env.SERVER_ADDRESS,
        maxTimeoutSeconds: 300,
      }],
    };

    // Header: base64-encoded JSON, Body: same JSON object
    const headerValue = btoa(JSON.stringify(paymentRequired));

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
  const requiredAmount = BigInt(STXtoMicroSTX(priceStx));
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

  // Store agent name if provided via header
  const agentName = c.req.header('x-agent-name');
  if (agentName && payer !== 'unknown') {
    await env.CACHE.put(`agent-name:${payer}`, agentName, { expirationTtl: 86400 * 365 });
  }

  await recordQuery(env.DB, feedId, payer, txId ?? undefined, responseMs, data);

  // Return with payment-response header
  const paymentResponse = {
    success: true,
    payer,
    transaction: txId,
    network,
  };
  const paymentResponseHeader = btoa(JSON.stringify(paymentResponse));

  return c.json({
    feed: feedId,
    provider: env.SERVER_ADDRESS,
    price: `${priceStx} STX`,
    timestamp: Date.now(),
    paid_by: payer,
    tx: txId,
    data,
  }, 200, { 'payment-response': paymentResponseHeader });
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

// ============================================
// WALLET ENDPOINTS — Browser wallet purchases
// ============================================

app.post('/wallet/buy', async (c) => {
  const body = await c.req.json();
  const { feedId, txId, senderAddress } = body;

  if (!feedId || !txId || !senderAddress) {
    return c.json({ error: 'Missing feedId, txId, or senderAddress' }, 400);
  }

  if (!(feedId in FEED_PRICES)) {
    return c.json({ error: 'Invalid feed ID' }, 400);
  }

  const start = Date.now();

  try {
    const data = await generateFeedById(feedId, c.env.CACHE, c.env.NANSEN_API_KEY);

    const responseMs = Date.now() - start;
    await recordQuery(c.env.DB, feedId, senderAddress, txId, responseMs, data);

    return c.json({
      feed: feedId,
      provider: c.env.SERVER_ADDRESS,
      price: `${FEED_PRICES[feedId]} STX`,
      timestamp: Date.now(),
      paid_by: senderAddress,
      tx: txId,
      tx_explorer: `https://explorer.hiro.so/txid/${txId}?chain=${c.env.NETWORK}`,
      wallet_payment: true,
      data,
    });
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
  await recordQuery(c.env.DB, feedId, payer, `demo_${Math.random().toString(36).slice(2, 14)}`, responseMs, data);

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

// Dismiss .well-known probes
app.get('/.well-known/*', (c) => c.text('', 404));

export default app;
