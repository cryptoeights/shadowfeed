# ShadowFeed — Decentralized Data Marketplace for AI Agents

> AI agents pay per-query for real-time crypto intelligence via x402 micropayments on Stacks (Bitcoin L2).

**Built for the [x402 Stacks Hackathon](https://dorahacks.io/) on DoraHacks.**

## The Problem

AI agents need real-time data to make decisions. Current solutions don't work for them:

| Provider | Model | Cost | Agent-Compatible? |
|----------|-------|------|-------------------|
| CoinGecko Pro | Monthly subscription | $129/mo | No (requires signup, credit card) |
| Nansen | Monthly subscription | $150/mo | No (requires KYC) |
| Arkham Intel | Monthly subscription | $300/mo | No (requires human auth) |
| **ShadowFeed** | **Pay-per-query** | **~$0.003/query** | **Yes (autonomous payments)** |

AI agents can't sign up for accounts. They can't enter credit cards. They need a way to pay for data **autonomously** — and that's exactly what x402 enables.

## The Solution

ShadowFeed uses the **x402 protocol** to let AI agents buy data with STX micropayments:

```
Agent requests data → Server returns HTTP 402 → Agent auto-signs STX payment → Data delivered
```

No signup. No subscription. No human intervention. Just data for money.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        ShadowFeed                               │
│                                                                 │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐   │
│  │  AI Agent     │────▶│  ShadowFeed  │────▶│  Data Feeds   │   │
│  │  (client)     │◀────│  Server      │◀────│  (generators) │   │
│  │              │     │  + x402      │     │              │   │
│  │  auto-signs  │     │  middleware  │     │  whale-alerts │   │
│  │  STX payment │     │              │     │  btc-sentiment│   │
│  └──────┬───────┘     └──────┬───────┘     │  defi-scores  │   │
│         │                    │              └──────────────┘   │
│         │              ┌─────▼──────┐                          │
│         │              │ Facilitator │                          │
│         │              │ (verify +   │                          │
│         │              │  settle)    │                          │
│         │              └─────┬──────┘                          │
│         │                    │                                  │
│    ┌────▼────────────────────▼────┐                            │
│    │    Stacks Blockchain         │                            │
│    │    (Bitcoin L2)              │                            │
│    │    Real STX transactions     │                            │
│    └──────────────────────────────┘                            │
│                                                                 │
│    ┌──────────────────────────────┐                            │
│    │  Clarity Smart Contract      │                            │
│    │  shadowfeed-registry.clar    │                            │
│    │  Provider staking + registry │                            │
│    └──────────────────────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

## Live Data Sources

ShadowFeed connects to real APIs and enriches with analytics:

| Feed | Price | Real Data Sources | What's Computed |
|------|-------|-------------------|-----------------|
| Whale Alerts | 0.005 STX | CoinGecko (BTC price), Blockchain.info (block height) | Whale movements, exchange flow analysis |
| BTC Sentiment | 0.003 STX | Alternative.me (Fear & Greed), CoinGecko (BTC market data) | Sentiment scoring, trend analysis |
| DeFi Scores | 0.01 STX | DeFiLlama (real TVL for 10 protocols) | Risk/opportunity scores, recommendations |

## Quick Start

### Prerequisites
- Node.js 18+
- Stacks testnet wallet with STX ([Faucet](https://explorer.stacks.co/sandbox/faucet?chain=testnet))

### 1. Install & Configure

```bash
git clone https://github.com/YOUR_USERNAME/shadowfeed.git
cd shadowfeed
npm install

# Copy env and add your keys
cp .env.example .env
```

### 2. Start the Services

```bash
# Terminal 1: Start the facilitator (payment verification + settlement)
npm run facilitator

# Terminal 2: Start the data marketplace server
npm run dev

# Terminal 3: Run the smart AI agent
npm run smart-agent
```

### 3. Open the Dashboard

Visit **http://localhost:4002** to see:
- Live activity feed with real on-chain transactions
- Agent leaderboard
- Interactive API tester (try endpoints directly)
- Provider stats and reputation

## Smart Agent Demo

The smart agent (`client/smart-agent.ts`) demonstrates **autonomous economic decision-making**:

```
STEP 1: Buy btc-sentiment → Assess market conditions
STEP 2: IF bearish/extreme → Buy whale-alerts (conditional!)
STEP 3: IF extreme whales → Buy defi-scores (conditional!)
STEP 4: Generate investment thesis from all data
```

The agent doesn't always buy all 3 feeds — it **decides based on conditions**. This demonstrates the core value proposition: AI agents should pay only for data they actually need.

```bash
npm run smart-agent
```

Example output:
```
  [THINK] Market is in extreme fear (FGI: 9).
  [THINK] Large whale movements could signal further sell pressure.
  [DECIDE] BUYING whale-alerts: bearish conditions require whale monitoring
  [ACT] Sending x402 payment for whale-alerts...
  ✓ Payment confirmed: 78445f38499d18...

  COST ANALYSIS
  Data feeds purchased: 3/3
  Data feeds skipped:   0/3
  Total spent:          0.018 STX
  vs CoinGecko Pro:     $129/month (7,167x more expensive)
```

## API Reference

### Free Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Service health check |
| GET | `/registry/feeds` | List all available feeds with prices |
| GET | `/stats` | Provider reputation and stats |
| GET | `/activity` | Live transaction activity feed |
| GET | `/leaderboard` | Agent rankings by query volume |
| GET | `/activity/:id/data` | View actual data returned for a query |

### Paid Endpoints (x402 Protected)

| Method | Endpoint | Price | Description |
|--------|----------|-------|-------------|
| GET | `/feeds/whale-alerts` | 0.005 STX | Real-time whale movements |
| GET | `/feeds/btc-sentiment` | 0.003 STX | BTC sentiment with Fear & Greed Index |
| GET | `/feeds/defi-scores` | 0.01 STX | DeFi protocol risk/opportunity scores |

Calling a paid endpoint without payment returns **HTTP 402 Payment Required** with payment instructions. The x402-stacks SDK handles payment automatically.

### How x402 Payment Works

```
1. Agent: GET /feeds/whale-alerts
2. Server: 402 Payment Required (header: payment-required)
3. Agent SDK: Signs STX transfer transaction
4. Agent: GET /feeds/whale-alerts + payment header
5. Facilitator: Verifies signature, broadcasts tx to Stacks
6. Server: 200 OK + whale alert data
```

## Smart Contract

`contracts/shadowfeed-registry-v3.clar` — Deployed on Stacks testnet at [`ST3G55FDZPK1SV0R85AFB5SG66Z9JE9E4YY2B447G.shadowfeed-reg`](https://explorer.hiro.so/txid/1a0ebac72aced46a07192016bda09925669ca1beb4897f72e41e216a719d282e?chain=testnet)

On-chain provider registry with:

- **Provider Registration**: Stake minimum 50 STX as quality guarantee
- **Feed Registration**: Register data feeds with prices and descriptions
- **Query Logging**: Track queries on-chain for transparency
- **Stake Slashing**: Bad data providers can be penalized (stake reduced)
- **Protocol Fee**: 5% fee on all transactions for protocol sustainability

## Simulation Mode

Run 10 simulated AI agents with different trading strategies:

```bash
# Start server in demo mode
npm run demo

# In another terminal, run simulation
npm run simulate
```

This generates realistic activity on the dashboard without requiring testnet STX.

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Server**: Express.js
- **Payments**: x402-stacks SDK v2
- **Blockchain**: Stacks (Bitcoin L2)
- **Smart Contract**: Clarity
- **Database**: SQLite (better-sqlite3)
- **Data Sources**: CoinGecko, DeFiLlama, Alternative.me, Blockchain.info
- **Frontend**: Tailwind CSS, vanilla JS

## Project Structure

```
shadowfeed/
├── src/
│   ├── server.ts              # Express server + x402 middleware
│   ├── facilitator.ts         # Payment verification + settlement
│   ├── db.ts                  # SQLite database layer
│   ├── registry.ts            # Feed discovery endpoint
│   ├── reputation.ts          # Provider reputation scoring
│   └── feeds/
│       ├── whale-alerts.ts    # Whale movements (CoinGecko + Blockchain.info)
│       ├── btc-sentiment.ts   # Sentiment (Alternative.me + CoinGecko)
│       └── defi-scores.ts     # DeFi scores (DeFiLlama)
├── client/
│   ├── agent-demo.ts          # Basic agent demo (buys all 3 feeds)
│   ├── smart-agent.ts         # Smart agent with decision logic
│   └── simulate-agents.ts     # 10-agent simulation
├── contracts/
│   └── shadowfeed-registry.clar  # Clarity smart contract
├── public/
│   └── index.html             # Dashboard UI
└── package.json
```

## Verified Testnet Transactions

Real x402 payments on Stacks testnet:

| Feed | TX Hash | Explorer |
|------|---------|----------|
| whale-alerts | `0x78445f384...` | [View on Explorer](https://explorer.hiro.so/txid/0x78445f38499d186f20e766dcc223e9f66af3bb4891d8a9eedcc946464eb80891?chain=testnet) |
| btc-sentiment | `0x3785963d5...` | [View on Explorer](https://explorer.hiro.so/txid/0x3785963d5d39a638b0e433fad21caa1ee4e75c1fd9c1b9f378982b9b986a0fc4?chain=testnet) |
| defi-scores | `0xf9b106303...` | [View on Explorer](https://explorer.hiro.so/txid/0xf9b1063038239c3ce6a2d05e5a3d510e66ef8e8c14fa62c019341552443299b5?chain=testnet) |

## Why x402 + Stacks?

- **x402**: HTTP-native payment protocol — no custom auth, no API keys, just standard HTTP
- **Stacks**: Bitcoin L2 with smart contracts — security of Bitcoin, programmability of Stacks
- **STX**: Native asset for micropayments — sub-cent transaction costs
- **Clarity**: Decidable smart contract language — no reentrancy bugs, predictable execution

## License

MIT
