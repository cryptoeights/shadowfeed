<p align="center">
  <img src="https://img.shields.io/badge/x402-stacks-orange?style=for-the-badge&logo=bitcoin&logoColor=white" alt="x402-stacks" />
  <img src="https://img.shields.io/badge/Stacks-Mainnet-5546FF?style=for-the-badge&logo=blockstack&logoColor=white" alt="Stacks Mainnet" />
  <img src="https://img.shields.io/npm/v/shadowfeed-agent?style=for-the-badge&color=orange&label=SDK" alt="npm" />
  <img src="https://img.shields.io/badge/Feeds-16_Live-emerald?style=for-the-badge" alt="16 Feeds" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT" />
</p>

<h1 align="center">ShadowFeed</h1>
<h3 align="center">Decentralized Data Marketplace for AI Agents on Bitcoin</h3>

<p align="center">
  <strong>AI agents autonomously discover and purchase real-time crypto intelligence via x402 micropayments on Stacks (Bitcoin L2).</strong><br/>
  No signup. No subscription. No human intervention. Just data for STX.
</p>

<p align="center">
  <a href="https://shadowfeed.app">Dashboard</a> &#x2022;
  <a href="https://api.shadowfeed.app/registry/feeds">API</a> &#x2022;
  <a href="https://www.npmjs.com/package/shadowfeed-agent">npm SDK</a> &#x2022;
  <a href="https://explorer.hiro.so/address/SP1DV3T4ST2A89ZZ07M73B2N4AR5XFMDCNPGKK6CS?chain=mainnet">On-Chain</a>
</p>

---

## Quickstart (5 minutes)

```bash
npm install shadowfeed-agent
```

```typescript
import { ShadowFeed } from 'shadowfeed-agent';

const sf = new ShadowFeed({
  privateKey: process.env.AGENT_PRIVATE_KEY,
  network: 'mainnet',
  agentName: 'My Agent',
});

// Discover all 16 feeds
const feeds = await sf.discover();

// Buy data — payment is automatic via x402
const result = await sf.buy('whale-alerts');
console.log(result.data);
```

Generate a wallet:

```bash
npx tsx -e "const {generateKeypair}=require('x402-stacks'); console.log(generateKeypair('mainnet'))"
```

Fund the `SP...` address with STX from any exchange, then run your agent.

## How It Works

```
   AI Agent                    ShadowFeed API              Stacks (Bitcoin L2)
      │                            │                            │
      │  GET /feeds/whale-alerts   │                            │
      │───────────────────────────>│                            │
      │                            │                            │
      │  HTTP 402 Payment Required │                            │
      │  {amount: 5000, payTo: SP} │                            │
      │<───────────────────────────│                            │
      │                            │                            │
      │  [SDK auto-signs STX TX]   │                            │
      │                            │                            │
      │  GET + payment-signature   │                            │
      │───────────────────────────>│  Verify + Broadcast TX     │
      │                            │───────────────────────────>│
      │                            │  TX Confirmed on Bitcoin   │
      │                            │<───────────────────────────│
      │                            │                            │
      │  200 OK + feed data        │                            │
      │<───────────────────────────│                            │
```

Every payment is a real on-chain STX transaction, verifiable on [Hiro Explorer](https://explorer.hiro.so).

## Available Feeds (16)

### Original Feeds

| Feed | Price | Source |
|------|-------|--------|
| `whale-alerts` | 0.005 STX | CoinGecko + Blockchain.info |
| `btc-sentiment` | 0.003 STX | Alternative.me + CoinGecko |
| `defi-scores` | 0.01 STX | DeFiLlama |

### Nansen Premium Feeds

| Feed | Price | Source |
|------|-------|--------|
| `smart-money-flows` | 0.08 STX | Nansen Smart Money |
| `token-intel` | 0.05 STX | Nansen Token God Mode |
| `wallet-profiler` | 0.05 STX | Nansen Profiler |
| `smart-money-holdings` | 0.05 STX | Nansen Holdings |
| `dex-trades` | 0.08 STX | Nansen DEX + Perps |

### Free API Feeds

| Feed | Price | Source |
|------|-------|--------|
| `liquidation-alerts` | 0.008 STX | Binance Futures |
| `gas-prediction` | 0.003 STX | Blocknative + mempool.space |
| `token-launches` | 0.005 STX | DEXScreener |
| `governance` | 0.005 STX | Snapshot.org |
| `stablecoin-flows` | 0.005 STX | DeFiLlama |
| `security-alerts` | 0.005 STX | DeFiLlama |
| `dev-activity` | 0.003 STX | GitHub API |
| `bridge-flows` | 0.005 STX | DeFiLlama |

## SDK Usage

### Discover feeds

```typescript
const feeds = await sf.discover();
const cheap = await sf.discover({ maxPrice: 0.005 });
const onchain = await sf.discover({ category: 'on-chain' });
```

### Buy a single feed

```typescript
const result = await sf.buy('btc-sentiment');
// result.data → { fear_greed_index, btc_price_usd, market_trend, ... }
// result.price_stx → 0.003
// result.tx → '0xabc123...'
```

### Chain multiple feeds

```typescript
const research = await sf.chain([
  'btc-sentiment',
  'smart-money-flows',
  'defi-scores',
]);
// research.total_spent_stx → 0.093
// research.feeds[0].data → btc-sentiment data
// research.feeds[1].data → smart-money-flows data
```

### Query parameters

```typescript
const wallet = await sf.buy('wallet-profiler', {
  address: '0xb5998e11E666Fd1e7f3B8e8d9122A755eec1E9b7',
  chain: 'ethereum',
});
```

## Free API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Service status |
| `GET /registry/feeds` | All feeds with pricing and stats |
| `GET /stats` | Provider reputation and performance |
| `GET /activity` | Live transaction feed |
| `GET /leaderboard` | Agent rankings |

```bash
curl https://api.shadowfeed.app/registry/feeds
```

## Architecture

```
shadowfeed/
├── workers/
│   ├── api/                   # Cloudflare Worker (Hono) — api.shadowfeed.app
│   │   └── src/
│   │       ├── index.ts       # x402 payment handler + routes
│   │       ├── feeds/         # 16 data feed modules
│   │       ├── registry.ts    # Feed discovery
│   │       ├── db.ts          # D1 database queries
│   │       └── types.ts
│   └── facilitator/           # Cloudflare Worker — facilitator.shadowfeed.app
│       └── src/
│           ├── index.ts       # Verify + settle endpoints
│           └── stacks.ts      # TX validation + broadcast
├── packages/
│   └── agent-sdk/             # npm: shadowfeed-agent
│       ├── src/
│       │   ├── client.ts      # ShadowFeed class
│       │   ├── discovery.ts   # Feed discovery + filtering
│       │   └── types.ts       # TypeScript types
│       └── examples/          # 3 example agents
├── docs/                      # Mintlify documentation (22 pages)
├── contracts/                 # Clarity smart contracts (v1-v3)
├── public/                    # Dashboard SPA — shadowfeed.app
└── client/                    # Agent scripts
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Edge Runtime | Cloudflare Workers |
| Web Framework | Hono |
| Database | Cloudflare D1 (SQLite) |
| Cache | Cloudflare KV |
| Static Hosting | Cloudflare Pages |
| Payments | x402 v2 protocol (x402-stacks SDK) |
| Blockchain | Stacks Mainnet (Bitcoin L2) |
| Smart Contracts | Clarity |
| Agent SDK | TypeScript (npm: shadowfeed-agent) |
| Data Sources | CoinGecko, Nansen, DeFiLlama, Binance, GitHub, Snapshot, DEXScreener |

## Links

| Resource | URL |
|----------|-----|
| Dashboard | https://shadowfeed.app |
| API | https://api.shadowfeed.app |
| Facilitator | https://facilitator.shadowfeed.app |
| npm SDK | https://www.npmjs.com/package/shadowfeed-agent |
| Contract | [SP1DV3T4ST2A89ZZ07M73B2N4AR5XFMDCNPGKK6CS](https://explorer.hiro.so/address/SP1DV3T4ST2A89ZZ07M73B2N4AR5XFMDCNPGKK6CS?chain=mainnet) |
| Contract TX | [198e5930...](https://explorer.hiro.so/txid/198e59303b69582bc4fcef5d284ea0c92264a856855755ee692605dc6dcd9042?chain=mainnet) |

## License

MIT
