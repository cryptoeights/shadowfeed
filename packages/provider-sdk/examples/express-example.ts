// Express provider example for @shadowfeed/provider-sdk
//
// Run with:
//   SHADOWFEED_PARTNER_SECRET=your-secret npx tsx examples/express-example.ts
//
// Then verify with:
//   SHADOWFEED_PARTNER_SECRET=your-secret npx shadowfeed verify \
//     --endpoint http://localhost:4000/shadowfeed

import express from 'express';
import expressAdapter from '../src/express.js';
import { ShadowFeedProvider } from '../src/provider.js';

const secret = process.env['SHADOWFEED_PARTNER_SECRET'];
if (!secret) {
  process.stderr.write('Error: SHADOWFEED_PARTNER_SECRET is required\n');
  process.exit(1);
}

const sf = new ShadowFeedProvider({
  handle: 'hyre-agent',
  secret,
  description: 'AI-enhanced DeFi data from HYRE — Solana, Base, and SKALE ecosystems.',
  website: 'https://hyreagent.fun',
  twitterHandle: '@Hyre_agent',
});

// Wallet PnL feed — mock data representing 24h portfolio performance
sf.feed('wallet-pnl', {
  description: 'AI-ranked wallet PnL across tracked addresses over the last 24 hours.',
  category: 'analytics',
  priceStx: 0.005,
  handler: async () => ({
    updated_at: new Date().toISOString(),
    window: '24h',
    wallets: [
      {
        address: '0xAbCd...1234',
        pnl_usd: 14_280.5,
        pnl_pct: 12.3,
        top_position: 'SOL',
        ai_tag: 'momentum_trader',
      },
      {
        address: '0xEf01...5678',
        pnl_usd: -3_120.0,
        pnl_pct: -8.1,
        top_position: 'ETH',
        ai_tag: 'hedger',
      },
    ],
  }),
});

// Token launches feed — recent launches on Solana/Base
sf.feed('token-launches', {
  description: 'AI-filtered new token launches across Solana and Base (last 6 hours).',
  category: 'discovery',
  priceStx: 0.003,
  handler: async () => ({
    updated_at: new Date().toISOString(),
    window: '6h',
    launches: [
      {
        symbol: 'MEMEXX',
        chain: 'solana',
        launch_time: '2024-01-15T10:32:00Z',
        initial_liquidity_usd: 45_000,
        ai_risk_score: 72,
        ai_summary: 'High volume meme with whale concentration risk.',
      },
      {
        symbol: 'BASEFI',
        chain: 'base',
        launch_time: '2024-01-15T09:15:00Z',
        initial_liquidity_usd: 120_000,
        ai_risk_score: 35,
        ai_summary: 'Structured liquidity, team KYC verified, low rug risk.',
      },
    ],
  }),
});

// DeFi pool opportunities feed
sf.feed('pool-opportunities', {
  description: 'High-yield DeFi pools with AI-assessed risk/reward scores.',
  category: 'defi',
  priceStx: 0.004,
  handler: async () => ({
    updated_at: new Date().toISOString(),
    pools: [
      {
        protocol: 'Raydium',
        pair: 'SOL-USDC',
        chain: 'solana',
        apy_30d: 28.4,
        tvl_usd: 12_400_000,
        ai_risk: 'low',
        ai_confidence: 0.91,
      },
      {
        protocol: 'Aerodrome',
        pair: 'WETH-USDC',
        chain: 'base',
        apy_30d: 42.1,
        tvl_usd: 3_800_000,
        ai_risk: 'medium',
        ai_confidence: 0.78,
      },
    ],
  }),
});

const app = express();
app.use('/shadowfeed', expressAdapter(sf));

const PORT = parseInt(process.env['PORT'] ?? '4000', 10);
app.listen(PORT, () => {
  process.stdout.write(`HYRE provider running at http://localhost:${PORT}\n`);
  process.stdout.write(
    `Manifest: http://localhost:${PORT}/shadowfeed/.well-known/shadowfeed-feeds.json\n`,
  );
  process.stdout.write(`Feeds: wallet-pnl, token-launches, pool-opportunities\n`);
});
