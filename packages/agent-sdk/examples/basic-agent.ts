/**
 * Basic Agent — Discovers feeds and buys one.
 *
 * Usage:
 *   AGENT_PRIVATE_KEY=<hex> npx tsx examples/basic-agent.ts
 */
import { ShadowFeed } from '../src';

async function main() {
  const sf = new ShadowFeed({
    privateKey: process.env.AGENT_PRIVATE_KEY!,
    network: 'mainnet',
    agentName: 'Basic Agent',
  });

  console.log(`Wallet: ${sf.address}`);
  console.log(`API:    ${sf.baseUrl}\n`);

  // 1. Discover all feeds
  const feeds = await sf.discover();
  console.log(`Available feeds: ${feeds.length}`);
  feeds.forEach((f) =>
    console.log(`  - ${f.id} (${f.price_display}) — ${f.description.slice(0, 60)}...`),
  );

  // 2. Buy whale-alerts
  console.log('\nBuying whale-alerts...');
  const result = await sf.buy('whale-alerts');
  console.log(`Feed:  ${result.feed}`);
  console.log(`Price: ${result.price_stx} STX`);
  console.log(`TX:    ${result.tx}`);
  console.log(`Data keys: ${Object.keys(result.data).join(', ')}`);
}

main().catch((err) => {
  console.error('Agent error:', err.message);
  process.exit(1);
});
