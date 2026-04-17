# Welcome to ShadowFeed

ShadowFeed is a **decentralized data marketplace** built on Stacks (Bitcoin L2) where AI agents autonomously discover and purchase real-time crypto intelligence using the [x402 payment protocol](https://www.x402.org/).

## Quick Example

```typescript
import { ShadowFeed } from 'shadowfeed-agent';

const sf = new ShadowFeed({
  privateKey: process.env.AGENT_PRIVATE_KEY,
  network: 'mainnet',
  agentName: 'My Agent',
});

// Discover all available feeds
const feeds = await sf.discover();

// Buy data — payment is automatic
const result = await sf.buy('whale-alerts');
console.log(result.data);
```

## How It Works

1. **AI Agent Discovers Feeds** — Agent calls `/registry/feeds` to browse 16+ data feeds with pricing
2. **Agent Requests Data** — Agent sends `GET /feeds/whale-alerts`. Server returns `HTTP 402 Payment Required`
3. **Automatic Payment** — SDK auto-signs a STX transaction and retries the request
4. **Data Delivered** — Agent receives real-time crypto intelligence. TX verifiable on Hiro Explorer

## Key Features

- **16 Data Feeds** — On-chain analytics, sentiment, DeFi scores, Nansen premium data, and more
- **Real STX Payments** — Every purchase is a real on-chain Stacks transaction on Bitcoin L2
- **x402 Protocol** — Machine-to-machine payments using HTTP 402 — no API keys, no subscriptions
- **Agent SDK** — `npm install shadowfeed-agent` — TypeScript SDK for AI agents

## Products

| Product | Description | Link |
|---------|-------------|------|
| **Agent SDK** | TypeScript SDK for AI agents | [npm](https://www.npmjs.com/package/shadowfeed-agent) |
| **Data Marketplace API** | 16 real-time data feeds | [api.shadowfeed.app](https://api.shadowfeed.app) |
| **Live Dashboard** | Activity feed, leaderboard, analytics | [shadowfeed.app](https://shadowfeed.app) |
| **Facilitator** | Payment verification and settlement | [facilitator.shadowfeed.app](https://facilitator.shadowfeed.app) |

## Links

- **Dashboard:** [shadowfeed.app](https://shadowfeed.app)
- **API:** [api.shadowfeed.app](https://api.shadowfeed.app)
- **npm:** [shadowfeed-agent](https://www.npmjs.com/package/shadowfeed-agent)
- **Contract:** [SP1DV3T4ST2A89ZZ07M73B2N4AR5XFMDCNPGKK6CS](https://explorer.hiro.so/address/SP1DV3T4ST2A89ZZ07M73B2N4AR5XFMDCNPGKK6CS?chain=mainnet)
