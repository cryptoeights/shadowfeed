import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import axios from 'axios';
import { paymentMiddleware, STXtoMicroSTX, getPayment } from 'x402-stacks';
import { deserializeTransaction, broadcastTransaction } from '@stacks/transactions';
import { STACKS_TESTNET, STACKS_MAINNET } from '@stacks/network';

import { recordQuery, getRecentQueries, getUniqueAgents, getAgentLeaderboard, getTotalRevenue, getQueryById } from './db';
import { getRegistry } from './registry';
import { getProviderReputation } from './reputation';
import { generateWhaleAlerts } from './feeds/whale-alerts';
import { generateSentimentScore } from './feeds/btc-sentiment';
import { generateDeFiScores } from './feeds/defi-scores';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors());

// Serve static frontend
// When compiled: __dirname = dist/src/, so go up 2 levels to project root
// When running with tsx: __dirname = src/, so go up 1 level
const publicDir = path.join(__dirname, '..', 'public');
const publicDir2 = path.join(__dirname, '..', '..', 'public');
const fs = require('fs');
app.use(express.static(fs.existsSync(publicDir) ? publicDir : publicDir2));

// Agent name generator — deterministic names from addresses
const AGENT_PREFIXES = ['Shadow', 'Cyber', 'Quantum', 'Neural', 'Alpha', 'Omega', 'Phantom', 'Nova', 'Stellar', 'Hyper', 'Crypto', 'Digital', 'Apex', 'Nexus', 'Vector', 'Sigma', 'Delta', 'Turbo', 'Nano', 'Onyx'];
const AGENT_SUFFIXES = ['Bot', 'Agent', 'Scout', 'Miner', 'Seeker', 'Hunter', 'Walker', 'Runner', 'Pilot', 'Guard', 'Hawk', 'Wolf', 'Fox', 'Lynx', 'Viper', 'Raven', 'Spark', 'Node', 'Core', 'Byte'];

function getAgentName(address: string): string {
  if (!address) return 'Unknown';
  // Simple hash from address to pick prefix + suffix deterministically
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = ((hash << 5) - hash + address.charCodeAt(i)) | 0;
  }
  const prefixIdx = Math.abs(hash) % AGENT_PREFIXES.length;
  const suffixIdx = Math.abs(hash >> 8) % AGENT_SUFFIXES.length;
  const num = Math.abs(hash >> 16) % 100;
  return `${AGENT_PREFIXES[prefixIdx]}${AGENT_SUFFIXES[suffixIdx]}-${num}`;
}

const PROVIDER_ADDRESS = process.env.SERVER_ADDRESS!;
const PORT = parseInt(process.env.PORT || '3000', 10);
const NETWORK = (process.env.NETWORK || 'testnet') as 'testnet' | 'mainnet';
// Facilitator points to self (merged into this server)
const FACILITATOR = process.env.FACILITATOR_URL || `http://localhost:${PORT}`;

if (!PROVIDER_ADDRESS) {
  console.error('ERROR: SERVER_ADDRESS is required in .env');
  process.exit(1);
}

// ============================================
// EMBEDDED FACILITATOR — x402 payment verification
// ============================================

const STACKS_API_TESTNET = 'https://api.testnet.hiro.so';
const STACKS_API_MAINNET = 'https://api.hiro.so';

app.get('/supported', (_req, res) => {
  res.json({
    kinds: [
      { x402Version: 2, scheme: 'exact', network: 'stacks:2147483648' },
      { x402Version: 2, scheme: 'exact', network: 'stacks:1' },
    ],
    extensions: [],
    signers: {},
  });
});

app.post('/verify', async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body;
    if (!paymentPayload || !paymentRequirements) {
      return res.status(400).json({ isValid: false, errorReason: 'Missing paymentPayload or paymentRequirements' });
    }
    const txHex = paymentPayload?.payload?.transaction || paymentPayload?.transaction;
    if (!txHex) {
      return res.status(400).json({ isValid: false, errorReason: 'No transaction found in payload' });
    }
    const tx = deserializeTransaction(txHex);
    const txPayload = tx.payload as any;
    const requiredAmount = BigInt(paymentRequirements.amount || '0');
    const txAmount = BigInt(txPayload.amount || 0);
    if (txAmount < requiredAmount) {
      return res.json({ isValid: false, errorReason: `Insufficient: tx=${txAmount} required=${requiredAmount}` });
    }
    const payer = extractPayer(tx);
    console.log(`[VERIFY] Valid: ${txAmount} microSTX from ${payer}`);
    res.json({ isValid: true, payer });
  } catch (err: any) {
    console.error('[VERIFY] Error:', err.message);
    res.status(400).json({ isValid: false, errorReason: err.message });
  }
});

app.post('/settle', async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body;
    if (!paymentPayload || !paymentRequirements) {
      return res.status(400).json({ success: false, errorReason: 'Missing payload or requirements' });
    }
    const txHex = paymentPayload?.payload?.transaction || paymentPayload?.transaction;
    if (!txHex) {
      return res.status(400).json({ success: false, errorReason: 'No transaction in payload' });
    }
    const networkId = paymentRequirements.network || 'stacks:2147483648';
    const isMainnet = networkId === 'stacks:1';
    const apiUrl = isMainnet ? STACKS_API_MAINNET : STACKS_API_TESTNET;
    const tx = deserializeTransaction(txHex);
    const payer = extractPayer(tx);
    console.log(`[SETTLE] Broadcasting from ${payer} on ${isMainnet ? 'mainnet' : 'testnet'}...`);
    const result = await broadcastTransaction({
      transaction: tx,
      client: { baseUrl: apiUrl },
    } as any);
    const txId = typeof result === 'string' ? result : (result as any).txid;
    const error = typeof result === 'object' ? (result as any).error : null;
    if (error) {
      const reason = (result as any).reason || error;
      console.error(`[SETTLE] Broadcast failed: ${reason}`);
      return res.status(400).json({ success: false, errorReason: reason });
    }
    console.log(`[SETTLE] Broadcast OK: ${txId}`);
    const confirmed = await waitForTx(apiUrl, txId, 180000);
    console.log(`[SETTLE] ${confirmed ? 'Confirmed' : 'Pending (mempool)'}: ${txId}`);
    res.json({ success: true, payer, transaction: txId, network: networkId });
  } catch (err: any) {
    console.error('[SETTLE] Error:', err.message);
    res.status(500).json({ success: false, errorReason: err.message });
  }
});

function extractPayer(tx: any): string {
  try {
    const signer = tx.auth?.spendingCondition?.signer;
    if (signer) return `ST${signer.slice(0, 38)}`;
    if (tx.auth?.spendingCondition?.address) return tx.auth.spendingCondition.address;
  } catch {}
  return 'unknown';
}

async function waitForTx(apiUrl: string, txId: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await axios.get(`${apiUrl}/extended/v1/tx/${txId}`, { timeout: 5000 });
      const status = r.data?.tx_status;
      if (status === 'success') return true;
      if (status?.startsWith('abort')) return false;
    } catch {}
    await new Promise(r => setTimeout(r, 5000));
  }
  return false;
}

// Dismiss Chrome DevTools probe requests
app.get('/.well-known/*', (_req, res) => res.status(404).end());

// ============================================
// FREE ENDPOINTS — Discovery & Health
// ============================================

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'shadowfeed',
    timestamp: Date.now(),
    network: NETWORK,
    provider: PROVIDER_ADDRESS,
  });
});

app.get('/registry/feeds', (_req, res) => {
  res.json(getRegistry(PROVIDER_ADDRESS));
});

app.get('/stats', (_req, res) => {
  res.json(getProviderReputation(PROVIDER_ADDRESS));
});

// Activity feed — recent queries with tx details
app.get('/activity', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const queries = getRecentQueries(limit);
  const feedPrices: Record<string, number> = { 'whale-alerts': 0.005, 'btc-sentiment': 0.003, 'defi-scores': 0.01 };

  res.json({
    activity: queries.map(q => {
      const isDemo = q.tx_hash?.startsWith('demo_') || false;
      const isReal = q.tx_hash && !isDemo;
      return {
        id: q.id,
        feed: q.feed_id,
        agent: q.payer,
        agent_name: getAgentName(q.payer || ''),
        agent_short: q.payer ? `${q.payer.slice(0, 8)}...${q.payer.slice(-6)}` : 'unknown',
        tx_hash: q.tx_hash,
        tx_explorer: isReal ? `https://explorer.hiro.so/txid/${q.tx_hash}?chain=${NETWORK}` : null,
        is_demo: isDemo,
        is_onchain: isReal,
        price_stx: feedPrices[q.feed_id] || 0,
        response_ms: q.response_ms,
        timestamp: q.created_at * 1000,
        time_ago: formatTimeAgo(q.created_at * 1000),
      };
    }),
    total_queries: queries.length,
    unique_agents: getUniqueAgents(),
    total_revenue_stx: Math.round(getTotalRevenue() * 1000) / 1000,
  });
});

// Query data detail — view the actual data returned for a specific query
app.get('/activity/:id/data', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid query ID' });

  const query = getQueryById(id);
  if (!query) return res.status(404).json({ error: 'Query not found' });

  const feedPrices: Record<string, number> = { 'whale-alerts': 0.005, 'btc-sentiment': 0.003, 'defi-scores': 0.01 };
  const isDemo = query.tx_hash?.startsWith('demo_') || false;

  res.json({
    id: query.id,
    feed: query.feed_id,
    agent: query.payer,
    tx_hash: query.tx_hash,
    is_demo: isDemo,
    is_onchain: !!(query.tx_hash && !isDemo),
    price_stx: feedPrices[query.feed_id] || 0,
    response_ms: query.response_ms,
    timestamp: query.created_at * 1000,
    data: query.response_data ? JSON.parse(query.response_data) : null,
  });
});

// Agent leaderboard
app.get('/leaderboard', (_req, res) => {
  const agents = getAgentLeaderboard(20);
  const feedPrices: Record<string, number> = { 'whale-alerts': 0.005, 'btc-sentiment': 0.003, 'defi-scores': 0.01 };

  res.json({
    agents: agents.map((a, idx) => ({
      rank: idx + 1,
      address: a.address,
      agent_name: getAgentName(a.address),
      address_short: `${a.address.slice(0, 8)}...${a.address.slice(-6)}`,
      total_queries: a.total_queries,
      total_spent_stx: Math.round(
        (a.whale_queries * feedPrices['whale-alerts'] +
         a.sentiment_queries * feedPrices['btc-sentiment'] +
         a.defi_queries * feedPrices['defi-scores']) * 1000
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

function formatTimeAgo(timestampMs: number): string {
  const diff = Date.now() - timestampMs;
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// ============================================
// PAID ENDPOINTS — x402 Protected Data Feeds
// ============================================

// Feed 1: Whale Alerts — 0.005 STX per query
app.get(
  '/feeds/whale-alerts',
  paymentMiddleware({
    amount: STXtoMicroSTX(0.005),
    payTo: PROVIDER_ADDRESS,
    network: NETWORK,
    asset: 'STX',
    facilitatorUrl: FACILITATOR,
    description: 'ShadowFeed: Real-time whale movement alerts',
    mimeType: 'application/json',
  }),
  async (req, res) => {
    const start = Date.now();
    const payment = getPayment(req);

    const data = await generateWhaleAlerts();
    const responseMs = Date.now() - start;

    recordQuery('whale-alerts', payment?.payer, payment?.transaction, responseMs, data);

    res.json({
      feed: 'whale-alerts',
      provider: PROVIDER_ADDRESS,
      price: '0.005 STX',
      timestamp: Date.now(),
      paid_by: payment?.payer || 'unknown',
      tx: payment?.transaction || null,
      data,
    });
  }
);

// Feed 2: BTC Sentiment — 0.003 STX per query
app.get(
  '/feeds/btc-sentiment',
  paymentMiddleware({
    amount: STXtoMicroSTX(0.003),
    payTo: PROVIDER_ADDRESS,
    network: NETWORK,
    asset: 'STX',
    facilitatorUrl: FACILITATOR,
    description: 'ShadowFeed: BTC social sentiment analysis',
    mimeType: 'application/json',
  }),
  async (req, res) => {
    const start = Date.now();
    const payment = getPayment(req);

    const data = await generateSentimentScore();
    const responseMs = Date.now() - start;

    recordQuery('btc-sentiment', payment?.payer, payment?.transaction, responseMs, data);

    res.json({
      feed: 'btc-sentiment',
      provider: PROVIDER_ADDRESS,
      price: '0.003 STX',
      timestamp: Date.now(),
      paid_by: payment?.payer || 'unknown',
      tx: payment?.transaction || null,
      data,
    });
  }
);

// Feed 3: DeFi Scores — 0.01 STX per query
app.get(
  '/feeds/defi-scores',
  paymentMiddleware({
    amount: STXtoMicroSTX(0.01),
    payTo: PROVIDER_ADDRESS,
    network: NETWORK,
    asset: 'STX',
    facilitatorUrl: FACILITATOR,
    description: 'ShadowFeed: DeFi protocol risk and opportunity scores',
    mimeType: 'application/json',
  }),
  async (req, res) => {
    const start = Date.now();
    const payment = getPayment(req);

    const data = await generateDeFiScores();
    const responseMs = Date.now() - start;

    recordQuery('defi-scores', payment?.payer, payment?.transaction, responseMs, data);

    res.json({
      feed: 'defi-scores',
      provider: PROVIDER_ADDRESS,
      price: '0.01 STX',
      timestamp: Date.now(),
      paid_by: payment?.payer || 'unknown',
      tx: payment?.transaction || null,
      data,
    });
  }
);

// ============================================
// WALLET ENDPOINTS — Browser wallet purchases
// ============================================

// After user pays via Leather/Xverse wallet, they send txId here to get data
app.post('/wallet/buy', async (req, res) => {
  const { feedId, txId, senderAddress } = req.body;

  if (!feedId || !txId || !senderAddress) {
    return res.status(400).json({ error: 'Missing feedId, txId, or senderAddress' });
  }

  const validFeeds = ['whale-alerts', 'btc-sentiment', 'defi-scores'];
  if (!validFeeds.includes(feedId)) {
    return res.status(400).json({ error: 'Invalid feed ID' });
  }

  const start = Date.now();

  try {
    let data: any;
    if (feedId === 'whale-alerts') data = await generateWhaleAlerts();
    else if (feedId === 'btc-sentiment') data = await generateSentimentScore();
    else data = await generateDeFiScores();

    const responseMs = Date.now() - start;
    recordQuery(feedId, senderAddress, txId, responseMs, data);

    const feedPrices: Record<string, string> = { 'whale-alerts': '0.005 STX', 'btc-sentiment': '0.003 STX', 'defi-scores': '0.01 STX' };

    res.json({
      feed: feedId,
      provider: PROVIDER_ADDRESS,
      price: feedPrices[feedId],
      timestamp: Date.now(),
      paid_by: senderAddress,
      tx: txId,
      tx_explorer: `https://explorer.hiro.so/txid/${txId}?chain=${NETWORK}`,
      wallet_payment: true,
      data,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate feed data', detail: err.message });
  }
});

// ============================================
// DEMO ENDPOINTS — Bypass x402 for simulation
// ============================================

const DEMO_MODE = process.env.DEMO_MODE === 'true';

if (DEMO_MODE) {
  app.get('/demo/feeds/whale-alerts', async (req, res) => {
    const start = Date.now();
    const payer = req.headers['x-agent-address'] as string || 'demo-agent';
    const data = await generateWhaleAlerts();
    const responseMs = Date.now() - start + Math.floor(Math.random() * 150);
    recordQuery('whale-alerts', payer, `demo_${Math.random().toString(36).slice(2, 14)}`, responseMs, data);
    res.json({ feed: 'whale-alerts', provider: PROVIDER_ADDRESS, price: '0.005 STX', timestamp: Date.now(), paid_by: payer, demo: true, data });
  });

  app.get('/demo/feeds/btc-sentiment', async (req, res) => {
    const start = Date.now();
    const payer = req.headers['x-agent-address'] as string || 'demo-agent';
    const data = await generateSentimentScore();
    const responseMs = Date.now() - start + Math.floor(Math.random() * 200);
    recordQuery('btc-sentiment', payer, `demo_${Math.random().toString(36).slice(2, 14)}`, responseMs, data);
    res.json({ feed: 'btc-sentiment', provider: PROVIDER_ADDRESS, price: '0.003 STX', timestamp: Date.now(), paid_by: payer, demo: true, data });
  });

  app.get('/demo/feeds/defi-scores', async (req, res) => {
    const start = Date.now();
    const payer = req.headers['x-agent-address'] as string || 'demo-agent';
    const data = await generateDeFiScores();
    const responseMs = Date.now() - start + Math.floor(Math.random() * 300);
    recordQuery('defi-scores', payer, `demo_${Math.random().toString(36).slice(2, 14)}`, responseMs, data);
    res.json({ feed: 'defi-scores', provider: PROVIDER_ADDRESS, price: '0.01 STX', timestamp: Date.now(), paid_by: payer, demo: true, data });
  });

  console.log('  DEMO MODE ENABLED — /demo/feeds/* endpoints available');
}

// ============================================
// Start Server
// ============================================

app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════╗
  ║           ShadowFeed Data Marketplace         ║
  ║         Powered by x402-stacks Protocol       ║
  ╠═══════════════════════════════════════════════╣
  ║  Server:      http://localhost:${PORT}            ║
  ║  Network:     ${NETWORK.padEnd(31)}║
  ║  Provider:    ${PROVIDER_ADDRESS.slice(0, 20)}...${' '.repeat(8)}║
  ║  Facilitator: embedded (same port)            ║
  ╠═══════════════════════════════════════════════╣
  ║  FREE:  /health  /registry/feeds  /stats      ║
  ║  PAID:  /feeds/whale-alerts     0.005 STX     ║
  ║         /feeds/btc-sentiment    0.003 STX     ║
  ║         /feeds/defi-scores      0.01  STX     ║
  ║  x402:  /supported  /verify  /settle          ║
  ╚═══════════════════════════════════════════════╝
  `);
});
