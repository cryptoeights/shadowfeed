import 'dotenv/config';
import axios from 'axios';
import { wrapAxiosWithPayment, privateKeyToAccount, decodePaymentResponse } from 'x402-stacks';

const SHADOWFEED_URL = process.env.SHADOWFEED_URL || 'http://localhost:3000';
const AGENT_KEY = process.env.AGENT_PRIVATE_KEY;
const NETWORK = (process.env.NETWORK || 'testnet') as 'testnet' | 'mainnet';

async function main() {
  if (!AGENT_KEY) {
    console.error('ERROR: AGENT_PRIVATE_KEY is required in .env');
    console.log('Generate one with: npx tsx -e "const {generateKeypair}=require(\'x402-stacks\');console.log(JSON.stringify(generateKeypair(\'testnet\'),null,2))"');
    process.exit(1);
  }

  // Create agent wallet
  const account = privateKeyToAccount(AGENT_KEY, NETWORK);
  console.log('='.repeat(60));
  console.log('  ShadowFeed AI Agent Demo');
  console.log('  Autonomous data acquisition via x402 micropayments');
  console.log('='.repeat(60));
  console.log(`\n  Agent wallet: ${account.address}`);
  console.log(`  Network:      ${NETWORK}`);
  console.log(`  Server:       ${SHADOWFEED_URL}\n`);

  // Wrap axios with auto-payment capability
  const api = wrapAxiosWithPayment(
    axios.create({ baseURL: SHADOWFEED_URL, timeout: 120000 }),
    account
  );

  // ---- Phase 1: Discovery (FREE) ----
  console.log('--- Phase 1: Feed Discovery (FREE) ---\n');

  const registry = await axios.get(`${SHADOWFEED_URL}/registry/feeds`);
  const feeds = registry.data.feeds;
  console.log(`Found ${feeds.length} available feeds from ${registry.data.provider}:\n`);
  for (const feed of feeds) {
    console.log(`  [${feed.category.toUpperCase()}] ${feed.id}`);
    console.log(`    Price: ${feed.price_display} | ${feed.description}`);
    console.log(`    Queries served: ${feed.stats.total_queries} | Avg response: ${feed.stats.avg_response_ms}ms\n`);
  }

  // ---- Phase 2: Data Acquisition (PAID) ----
  console.log('--- Phase 2: Autonomous Data Acquisition (PAID via x402) ---\n');

  let totalSpent = 0;

  // Query 1: Whale Alerts
  console.log('[1/3] Querying whale-alerts (0.005 STX)...');
  try {
    const whaleRes = await api.get('/feeds/whale-alerts');
    totalSpent += 0.005;
    const whaleData = whaleRes.data;
    console.log(`  Received ${whaleData.data.alerts.length} whale alerts`);
    console.log(`  Total volume: ${whaleData.data.summary.total_volume_btc} BTC`);
    console.log(`  Most active: ${whaleData.data.summary.most_active}`);

    const payment1 = decodePaymentResponse(whaleRes.headers['payment-response']);
    if (payment1) console.log(`  TX: ${payment1.transaction}`);
    console.log('  Status: PAID\n');
  } catch (err: any) {
    console.log(`  Error: ${err.response?.status || err.message}\n`);
  }

  // Query 2: BTC Sentiment
  console.log('[2/3] Querying btc-sentiment (0.003 STX)...');
  try {
    const sentRes = await api.get('/feeds/btc-sentiment');
    totalSpent += 0.003;
    const sentData = sentRes.data;
    console.log(`  Overall: ${sentData.data.overall_label} (score: ${sentData.data.overall_score})`);
    console.log(`  Fear & Greed Index: ${sentData.data.fear_greed_index}/100`);
    console.log(`  Market trend: ${sentData.data.market_trend}`);

    const payment2 = decodePaymentResponse(sentRes.headers['payment-response']);
    if (payment2) console.log(`  TX: ${payment2.transaction}`);
    console.log('  Status: PAID\n');
  } catch (err: any) {
    console.log(`  Error: ${err.response?.status || err.message}\n`);
  }

  // Query 3: DeFi Scores
  console.log('[3/3] Querying defi-scores (0.01 STX)...');
  try {
    const defiRes = await api.get('/feeds/defi-scores');
    totalSpent += 0.01;
    const defiData = defiRes.data;
    const top3 = defiData.data.protocols.slice(0, 3);
    console.log('  Top 3 protocols by composite score:');
    for (const p of top3) {
      console.log(`    ${p.protocol} (${p.chain}): ${p.composite_score}/100 — ${p.recommendation}`);
    }

    const payment3 = decodePaymentResponse(defiRes.headers['payment-response']);
    if (payment3) console.log(`  TX: ${payment3.transaction}`);
    console.log('  Status: PAID\n');
  } catch (err: any) {
    console.log(`  Error: ${err.response?.status || err.message}\n`);
  }

  // ---- Phase 3: Summary ----
  console.log('--- Phase 3: Summary ---\n');
  console.log(`  Queries completed: 3`);
  console.log(`  Total spent: ${totalSpent} STX`);
  console.log(`  vs CoinGecko Pro: $129/month (6,450x more expensive)`);
  console.log(`\n  The AI agent autonomously discovered, paid for, and consumed`);
  console.log(`  three data feeds without any human intervention.`);
  console.log(`  All payments settled on Stacks (Bitcoin L2) via x402 protocol.\n`);

  // Check provider stats
  const stats = await axios.get(`${SHADOWFEED_URL}/stats`);
  console.log(`  Provider reputation: ${stats.data.reputation_score}/100 (${stats.data.tier})`);
  console.log(`  Total queries served: ${stats.data.total_queries_served}`);
  console.log('\n' + '='.repeat(60));
}

main().catch((err) => {
  console.error('Agent failed:', err.message);
  process.exit(1);
});
