/**
 * Smart Agent — Conditionally buys feeds based on market conditions.
 *
 * Logic:
 *   1. Buy btc-sentiment (cheap)
 *   2. If fear & greed < 30 (extreme fear) → buy whale-alerts to check for accumulation
 *   3. If fear & greed > 70 (extreme greed) → buy liquidation-alerts to check risk
 *   4. Always buy gas-prediction for timing
 *
 * Usage:
 *   AGENT_PRIVATE_KEY=<hex> npx tsx examples/smart-agent.ts
 */
import { ShadowFeed } from '../src';

async function main() {
  const sf = new ShadowFeed({
    privateKey: process.env.AGENT_PRIVATE_KEY!,
    network: 'mainnet',
    agentName: 'Smart Agent',
  });

  console.log(`Smart Agent | Wallet: ${sf.address}\n`);

  // Step 1: Check sentiment (cheapest feed — 0.003 STX)
  console.log('Step 1: Checking BTC sentiment...');
  const sentiment = await sf.buy<{
    fear_greed_index: number;
    overall_label: string;
    market_trend: string;
  }>('btc-sentiment');

  const fgi = sentiment.data.fear_greed_index ?? 50;
  const label = sentiment.data.overall_label ?? 'neutral';
  const trend = sentiment.data.market_trend ?? 'neutral';
  console.log(`  Fear & Greed: ${fgi} (${label})`);
  console.log(`  Market Trend: ${trend}\n`);

  // Step 2: Conditional buying
  if (fgi < 30) {
    console.log('Extreme fear detected — checking whale accumulation...');
    const whales = await sf.buy('whale-alerts');
    console.log(`  Whale data keys: ${Object.keys(whales.data).join(', ')}`);
    console.log(`  Signal: Smart money may be accumulating\n`);
  } else if (fgi > 70) {
    console.log('Extreme greed detected — checking liquidation risk...');
    const liqs = await sf.buy('liquidation-alerts');
    console.log(`  Liquidation data keys: ${Object.keys(liqs.data).join(', ')}`);
    console.log(`  Signal: Watch for potential correction\n`);
  } else {
    console.log(`Market is ${label} — no extra signals needed.\n`);
  }

  // Step 3: Always check gas for optimal trade timing
  console.log('Step 3: Checking gas/fees for timing...');
  const gas = await sf.buy('gas-prediction');
  console.log(`  Gas data keys: ${Object.keys(gas.data).join(', ')}`);

  console.log('\nSmart Agent complete.');
}

main().catch((err) => {
  console.error('Agent error:', err.message);
  process.exit(1);
});
