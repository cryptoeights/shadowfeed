<p align="center">
  <img src="https://img.shields.io/badge/x402-stacks-orange?style=for-the-badge&logo=bitcoin&logoColor=white" alt="x402-stacks" />
  <img src="https://img.shields.io/badge/Stacks-Bitcoin_L2-5546FF?style=for-the-badge&logo=blockstack&logoColor=white" alt="Stacks" />
  <img src="https://img.shields.io/badge/Clarity-Smart_Contract-00A4FF?style=for-the-badge" alt="Clarity" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT" />
</p>

<h1 align="center">ShadowFeed</h1>
<h3 align="center">The First Decentralized Data Marketplace Where AI Agents Pay With Bitcoin</h3>

<p align="center">
  <strong>AI agents autonomously buy real-time crypto intelligence via x402 micropayments on Stacks (Bitcoin L2).</strong><br/>
  No signup. No subscription. No human intervention. Just data for STX.
</p>

<p align="center">
  <a href="https://shadowfeed-production.up.railway.app">Live Demo</a> &#x2022;
  <a href="https://explorer.hiro.so/txid/0x78445f38499d186f20e766dcc223e9f66af3bb4891d8a9eedcc946464eb80891?chain=testnet">Verified On-Chain TX</a> &#x2022;
  <a href="https://explorer.hiro.so/txid/1a0ebac72aced46a07192016bda09925669ca1beb4897f72e41e216a719d282e?chain=testnet">Smart Contract</a>
</p>

---

## The Insight

There are **1.2 million AI agents** running today, and that number is doubling every quarter. These agents need real-time data to make decisions — market prices, whale movements, DeFi analytics. But here's the problem:

**Every data provider in crypto requires a human to sign up.**

| Provider | Pricing | Agent-Friendly? |
|----------|---------|:---------------:|
| CoinGecko Pro | $129/mo subscription | No — requires signup + credit card |
| Nansen | $150/mo subscription | No — requires KYC verification |
| Arkham Intel | $300/mo subscription | No — requires human authentication |
| **ShadowFeed** | **$0.003/query** | **Yes — fully autonomous** |

AI agents can't create accounts. They can't enter credit cards. They can't complete KYC. They need a payment protocol that speaks their language: **HTTP**.

That's exactly what **x402** does. It turns payment into a standard HTTP header — and ShadowFeed is the first data marketplace built on top of it.

## How It Works

```
   AI Agent                    ShadowFeed                 Stacks (Bitcoin L2)
      │                            │                            │
      │  GET /feeds/whale-alerts   │                            │
      │───────────────────────────>│                            │
      │                            │                            │
      │  HTTP 402 Payment Required │                            │
      │  {amount: 5000, payTo: ST} │                            │
      │<───────────────────────────│                            │
      │                            │                            │
      │  [Auto-signs STX transfer] │                            │
      │                            │                            │
      │  GET + payment header      │                            │
      │───────────────────────────>│  Verify + Broadcast TX     │
      │                            │───────────────────────────>│
      │                            │                            │
      │                            │  TX Confirmed on Bitcoin   │
      │                            │<───────────────────────────│
      │  200 OK + whale alert data │                            │
      │<───────────────────────────│                            │
```

**4 lines of code** is all an AI agent needs:

```typescript
import { wrapAxiosWithPayment, privateKeyToAccount } from 'x402-stacks';

const account = privateKeyToAccount(PRIVATE_KEY, 'testnet');
const api = wrapAxiosWithPayment(axios.create(), account);

// That's it. Every request auto-pays if the server demands it.
const { data } = await api.get('https://shadowfeed-production.up.railway.app/feeds/whale-alerts');
```

## What Makes This Different

### 1. Real Data, Not Mocks

Every feed connects to **production APIs** and enriches raw data with computed analytics:

| Feed | Price | Live Sources | Computed Analytics |
|------|-------|-------------|-------------------|
| **Whale Alerts** | 0.005 STX | CoinGecko + Blockchain.info | Whale movements, exchange flow patterns, significance scoring |
| **BTC Sentiment** | 0.003 STX | Alternative.me + CoinGecko | Fear & Greed Index, social sentiment, market trend analysis |
| **DeFi Scores** | 0.01 STX | DeFiLlama (10 protocols) | Risk/opportunity scores, TVL analysis, protocol recommendations |

### 2. Smart Agent with Decision Logic

Most hackathon demos show agents that blindly buy everything. **Our agent thinks before it spends.**

```
[THINK] Market is in extreme fear (FGI: 9).
        High fear often correlates with whale accumulation.
[DECIDE] BUYING whale-alerts — bearish conditions require whale monitoring
[ACT] Sending x402 payment... ✓ Confirmed: 0x78445f38...

[THINK] 3 whale movements detected, 2 are exchange inflows.
        Could signal further sell pressure. Need DeFi exposure analysis.
[DECIDE] BUYING defi-scores — extreme whale activity requires portfolio risk check
[ACT] Sending x402 payment... ✓ Confirmed: 0xf9b10630...

COST ANALYSIS
  Feeds purchased: 3/3 (conditions triggered all feeds)
  Total spent:     0.018 STX (~$0.02)
  vs CoinGecko Pro: $129/month = 7,167x more expensive
```

The agent **conditionally purchases** data based on market conditions — demonstrating that x402 enables AI agents to make economically rational decisions about what data to buy.

### 3. Wallet Connect for Judges

Not just for AI agents — **humans can try it too**. Connect your Leather or Xverse wallet directly in the dashboard and buy data with a single click.

### 4. On-Chain Everything

Every payment is a real STX transaction settled on Stacks (Bitcoin L2):

| Feed | Transaction | Block Explorer |
|------|-------------|----------------|
| whale-alerts | `0x78445f38...` | [View TX](https://explorer.hiro.so/txid/0x78445f38499d186f20e766dcc223e9f66af3bb4891d8a9eedcc946464eb80891?chain=testnet) |
| btc-sentiment | `0x3785963d...` | [View TX](https://explorer.hiro.so/txid/0x3785963d5d39a638b0e433fad21caa1ee4e75c1fd9c1b9f378982b9b986a0fc4?chain=testnet) |
| defi-scores | `0xf9b10630...` | [View TX](https://explorer.hiro.so/txid/0xf9b1063038239c3ce6a2d05e5a3d510e66ef8e8c14fa62c019341552443299b5?chain=testnet) |

### 5. Clarity Smart Contract

Deployed on Stacks testnet: [`ST3G55...shadowfeed-reg`](https://explorer.hiro.so/txid/1a0ebac72aced46a07192016bda09925669ca1beb4897f72e41e216a719d282e?chain=testnet)

On-chain provider registry with staking, feed registration, query logging, and stake slashing for bad data providers. This creates **economic accountability** — providers have skin in the game.

## Live Demo

**https://shadowfeed-production.up.railway.app**

What you can do:
- Browse available feeds and pricing
- Test free API endpoints interactively
- See the 402 Payment Required response in action
- Connect your Leather/Xverse wallet and buy data
- View live activity feed with real on-chain transactions
- Check agent leaderboard

## Quick Start

```bash
# Clone and install
git clone https://github.com/cryptoeights/shadowfeed.git
cd shadowfeed && npm install

# Configure environment
cp .env.example .env
# Add your Stacks testnet private key to .env

# Start the server (facilitator is embedded)
npm run dev

# In another terminal — run the smart agent
npm run smart-agent
```

**Need testnet STX?** Get free tokens from the [Stacks Faucet](https://explorer.hiro.so/sandbox/faucet?chain=testnet).

## Architecture

```
shadowfeed/
├── src/
│   ├── server.ts              # Express + x402 middleware + embedded facilitator
│   ├── db.ts                  # SQLite — query tracking, response storage
│   ├── registry.ts            # Feed discovery (free endpoint)
│   ├── reputation.ts          # Provider reputation scoring
│   └── feeds/
│       ├── whale-alerts.ts    # CoinGecko + Blockchain.info → whale analysis
│       ├── btc-sentiment.ts   # Alternative.me + CoinGecko → sentiment scores
│       └── defi-scores.ts     # DeFiLlama → risk/opportunity scores
├── client/
│   ├── smart-agent.ts         # Autonomous agent with conditional buying logic
│   ├── agent-demo.ts          # Basic agent (buys all feeds)
│   └── simulate-agents.ts    # 10-agent simulation for demo
├── contracts/
│   ├── shadowfeed-registry.clar     # Full contract (staking + slashing)
│   ├── shadowfeed-registry-v2.clar  # Simplified (staking)
│   └── shadowfeed-registry-v3.clar  # Deployed version (registry only)
├── public/
│   └── index.html             # Dashboard with wallet connect
└── scripts/
    ├── deploy-contract.ts     # Contract deployment to Stacks
    └── fund-server.ts         # Wallet funding utility
```

## API Reference

### Free Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Service health check |
| `GET /registry/feeds` | All available feeds with prices and stats |
| `GET /stats` | Provider reputation and performance |
| `GET /activity` | Live transaction feed |
| `GET /leaderboard` | Agent rankings by query volume |
| `GET /activity/:id/data` | View actual response data for any query |

### Paid Endpoints (x402 Protected)

| Endpoint | Price | Description |
|----------|-------|-------------|
| `GET /feeds/whale-alerts` | 0.005 STX | Real-time whale movements with significance scoring |
| `GET /feeds/btc-sentiment` | 0.003 STX | BTC sentiment with Fear & Greed Index + social analysis |
| `GET /feeds/defi-scores` | 0.01 STX | DeFi protocol risk/opportunity scores for 10 protocols |

Calling any paid endpoint without payment returns `HTTP 402 Payment Required`. The x402-stacks SDK handles the payment flow automatically.

## The Bigger Picture

ShadowFeed demonstrates a new economic primitive: **machine-to-machine data commerce**.

Today, the data economy is designed for humans — subscriptions, dashboards, CSV exports. But as AI agents become the primary consumers of data, the infrastructure needs to change:

- **From subscriptions to micropayments** — agents should pay for what they use
- **From signup forms to HTTP headers** — payment should be a protocol, not a product
- **From trust to verification** — every transaction provable on Bitcoin

x402 + Stacks makes this possible. ShadowFeed is the proof.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js + TypeScript |
| Server | Express.js |
| Payments | x402-stacks SDK v2 |
| Blockchain | Stacks (Bitcoin L2) |
| Smart Contract | Clarity |
| Database | SQLite (better-sqlite3) |
| Data Sources | CoinGecko, DeFiLlama, Alternative.me, Blockchain.info |
| Frontend | Tailwind CSS |
| Deployment | Railway |

## License

MIT — use it, fork it, build on it.
