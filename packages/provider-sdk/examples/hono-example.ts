// Hono provider example for @shadowfeed/provider-sdk (Cloudflare Workers compatible)
//
// Run locally with:
//   SHADOWFEED_PARTNER_SECRET=your-secret npx tsx examples/hono-example.ts
//
// Deploy to Cloudflare Workers with wrangler — export default app below.
//
// Verify with:
//   SHADOWFEED_PARTNER_SECRET=your-secret npx shadowfeed verify \
//     --endpoint http://localhost:4001/shadowfeed

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import honoAdapter from '../src/hono.js';
import { ShadowFeedProvider } from '../src/provider.js';

const secret = process.env['SHADOWFEED_PARTNER_SECRET'];
if (!secret) {
  process.stderr.write('Error: SHADOWFEED_PARTNER_SECRET is required\n');
  process.exit(1);
}

const sf = new ShadowFeedProvider({
  handle: 'xona-data',
  secret,
  description: 'Institutional-grade on-chain analytics for BTC and ETH ecosystems.',
  website: 'https://xona.xyz',
});

// Smart money flow signals
sf.feed('smart-money-signals', {
  description: 'Aggregated buy/sell pressure from 500+ tracked smart-money wallets.',
  category: 'on-chain',
  priceStx: 0.008,
  handler: async () => ({
    updated_at: new Date().toISOString(),
    signals: [
      {
        asset: 'BTC',
        net_flow_usd: 42_000_000,
        direction: 'accumulation',
        confidence: 0.87,
        whale_count: 23,
      },
      {
        asset: 'ETH',
        net_flow_usd: -8_500_000,
        direction: 'distribution',
        confidence: 0.74,
        whale_count: 11,
      },
    ],
    market_regime: 'risk_on',
  }),
});

// Cross-chain bridge flow tracker
sf.feed('bridge-flows', {
  description: 'Real-time cross-chain bridge volume and direction tracking.',
  category: 'bridge',
  priceStx: 0.006,
  handler: async () => ({
    updated_at: new Date().toISOString(),
    window: '1h',
    flows: [
      {
        bridge: 'Stargate',
        from_chain: 'ethereum',
        to_chain: 'base',
        volume_usd: 18_900_000,
        tx_count: 342,
        dominant_asset: 'USDC',
      },
      {
        bridge: 'Hop',
        from_chain: 'arbitrum',
        to_chain: 'optimism',
        volume_usd: 4_200_000,
        tx_count: 98,
        dominant_asset: 'ETH',
      },
    ],
    total_bridged_usd: 23_100_000,
  }),
});

const app = new Hono();
app.route('/shadowfeed', honoAdapter(sf));

// Export for Cloudflare Workers:
export default app;

// Local dev server (comment out when deploying to Workers):
const PORT = parseInt(process.env['PORT'] ?? '4001', 10);
serve({ fetch: app.fetch, port: PORT }, () => {
  process.stdout.write(`Xona provider running at http://localhost:${PORT}\n`);
  process.stdout.write(
    `Manifest: http://localhost:${PORT}/shadowfeed/.well-known/shadowfeed-feeds.json\n`,
  );
  process.stdout.write(`Feeds: smart-money-signals, bridge-flows\n`);
});
