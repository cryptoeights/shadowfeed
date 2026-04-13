/**
 * Research Agent — Chains multiple premium feeds for deep analysis.
 *
 * Buys 5 feeds across categories, then summarizes findings.
 *
 * Usage:
 *   AGENT_PRIVATE_KEY=<hex> npx tsx examples/research-agent.ts
 */
import { ShadowFeed } from '../src';

async function main() {
  const sf = new ShadowFeed({
    privateKey: process.env.AGENT_PRIVATE_KEY!,
    network: 'mainnet',
    agentName: 'Research Agent',
  });

  console.log(`Research Agent | Wallet: ${sf.address}\n`);

  // Discover premium feeds only (Nansen-powered, > 0.04 STX)
  const premiumFeeds = await sf.discover({ minPrice: 0.04 });
  console.log(`Premium feeds available: ${premiumFeeds.length}`);
  premiumFeeds.forEach((f) =>
    console.log(`  - ${f.id} (${f.price_display})`),
  );

  // Chain: buy multiple feeds for cross-analysis
  const researchFeeds = [
    'btc-sentiment',
    'smart-money-flows',
    'defi-scores',
    'liquidation-alerts',
    'bridge-flows',
  ];

  console.log(`\nChaining ${researchFeeds.length} feeds...\n`);
  const results = await sf.chain(researchFeeds, 2000);

  // Print summary
  console.log('=== Research Summary ===');
  results.feeds.forEach((r) => {
    const keys = Object.keys(r.data);
    console.log(`\n[${r.feed}] — ${r.price_stx} STX`);
    console.log(`  Keys: ${keys.slice(0, 6).join(', ')}${keys.length > 6 ? '...' : ''}`);
    if (r.tx) console.log(`  TX: ${r.tx}`);
  });

  console.log(`\nTotal spent: ${results.total_spent_stx.toFixed(4)} STX`);
  console.log(`Feeds purchased: ${results.feeds.length}`);
  console.log(`Timestamp: ${results.timestamp}`);
  console.log('\nResearch Agent complete.');
}

main().catch((err) => {
  console.error('Agent error:', err.message);
  process.exit(1);
});
