# @shadowfeed/agent

SDK for AI agents to discover and purchase real-time crypto data feeds from [ShadowFeed](https://shadowfeed.app) via x402 micropayments on Stacks (Bitcoin L2).

## Quickstart (5 minutes)

### 1. Install

```bash
npm install @shadowfeed/agent
```

### 2. Generate a wallet

```bash
npx tsx -e "const {generateKeypair}=require('x402-stacks'); console.log(generateKeypair('mainnet'))"
```

Fund the generated `SP...` address with STX from any exchange.

### 3. Buy your first feed

```typescript
import { ShadowFeed } from '@shadowfeed/agent';

const sf = new ShadowFeed({
  privateKey: process.env.AGENT_PRIVATE_KEY!,
  network: 'mainnet',
  agentName: 'My Agent',
});

// Discover available feeds
const feeds = await sf.discover();
console.log(`${feeds.length} feeds available`);

// Buy data — payment is automatic
const result = await sf.buy('whale-alerts');
console.log(result.data);
```

## API Reference

### `new ShadowFeed(config)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `privateKey` | `string` | *required* | Stacks private key (hex) |
| `network` | `'mainnet' \| 'testnet'` | *required* | Stacks network |
| `agentName` | `string` | `'ShadowFeed Agent'` | Name shown in dashboard |
| `baseUrl` | `string` | `'https://api.shadowfeed.app'` | API endpoint |
| `timeoutMs` | `number` | `30000` | Request timeout |

### `sf.discover(options?, refresh?)`

List available feeds. Cached by default.

```typescript
// All feeds
const all = await sf.discover();

// Filter by category
const onchain = await sf.discover({ category: 'on-chain' });

// Filter by price
const cheap = await sf.discover({ maxPrice: 0.01 });

// Force refresh cache
const fresh = await sf.discover(undefined, true);
```

### `sf.buy(feedId, queryParams?)`

Purchase a single feed. Returns data + metadata.

```typescript
const result = await sf.buy('whale-alerts');
// result.feed     → 'whale-alerts'
// result.data     → { alerts: [...], summary: {...} }
// result.price_stx → 0.005
// result.tx       → '0xabc123...'

// With query params (e.g. wallet-profiler)
const wallet = await sf.buy('wallet-profiler', {
  address: '0xb5998e11E666Fd1e7f3B8e8d9122A755eec1E9b7',
  chain: 'ethereum',
});
```

### `sf.chain(feedIds, delayMs?)`

Purchase multiple feeds in sequence.

```typescript
const research = await sf.chain([
  'btc-sentiment',
  'smart-money-flows',
  'defi-scores',
], 2000);

console.log(research.total_spent_stx); // 0.093
console.log(research.feeds.length);    // 3
```

### `sf.getFeed(feedId)`

Get info about a specific feed without purchasing.

```typescript
const info = await sf.getFeed('smart-money-flows');
// info.price_stx → 0.08
// info.category  → 'on-chain'
```

### `sf.health()` / `sf.stats()`

Check API health or get provider statistics (free endpoints).

## Available Feeds (16)

### Original Feeds
| Feed | Price | Category |
|------|-------|----------|
| `whale-alerts` | 0.005 STX | on-chain |
| `btc-sentiment` | 0.003 STX | social |
| `defi-scores` | 0.01 STX | analytics |

### Nansen Premium Feeds
| Feed | Price | Category |
|------|-------|----------|
| `smart-money-flows` | 0.08 STX | on-chain |
| `token-intel` | 0.05 STX | analytics |
| `wallet-profiler` | 0.05 STX | on-chain |
| `smart-money-holdings` | 0.05 STX | on-chain |
| `dex-trades` | 0.08 STX | on-chain |

### Free API Feeds
| Feed | Price | Category |
|------|-------|----------|
| `liquidation-alerts` | 0.008 STX | derivatives |
| `gas-prediction` | 0.003 STX | infrastructure |
| `token-launches` | 0.005 STX | discovery |
| `governance` | 0.005 STX | governance |
| `stablecoin-flows` | 0.005 STX | analytics |
| `security-alerts` | 0.005 STX | security |
| `dev-activity` | 0.003 STX | development |
| `bridge-flows` | 0.005 STX | cross-chain |

## Examples

See [`examples/`](./examples/) for complete working agents:

- **[basic-agent.ts](./examples/basic-agent.ts)** — Discover feeds and buy one
- **[smart-agent.ts](./examples/smart-agent.ts)** — Conditional buying based on market conditions
- **[research-agent.ts](./examples/research-agent.ts)** — Chain multiple feeds for deep analysis

## How It Works

ShadowFeed uses the [x402 protocol](https://www.x402.org/) for machine-to-machine payments:

1. Agent requests a feed → server returns `HTTP 402 Payment Required`
2. SDK automatically signs a STX payment transaction
3. Payment is verified and settled on Stacks (Bitcoin L2)
4. Agent receives the data

All payments are real on-chain STX transactions, verifiable on [Hiro Explorer](https://explorer.hiro.so).

## License

MIT
