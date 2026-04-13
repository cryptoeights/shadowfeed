# M1: Mainnet Migration & Product Expansion

**Deadline:** April 22, 2026
**Installment:** $1,500 USD (in STX)
**Status:** IN PROGRESS

---

## Deliverable Checklist

- [x] Marketplace migrated to mainnet — **api.shadowfeed.app on mainnet (stacks:1)**
- [x] Current 3 feeds live on mainnet — **whale-alerts, btc-sentiment, defi-scores all purchased on mainnet**
- [x] Real STX payments settling on-chain — **10+ mainnet TXs confirmed via Hyre Agent**
- [x] Expansion to at least 15 live feeds — **16 feeds live on api.shadowfeed.app**
- [x] Dashboard deployed to Cloudflare Pages — **shadowfeed.app live, all 16 feeds displayed, mainnet badge**
- [ ] Agent SDK, discovery tooling, docs, and example agents published

---

## 1. Mainnet Migration

### Tasks

**Cloudflare Infrastructure Setup:**
- [x] Create Cloudflare Workers project with `wrangler init`
- [x] Create D1 database (`wrangler d1 create shadowfeed`) — ID: 70e9d037-f842-4436-b3df-10e5af19cf12
- [x] Create KV namespace (`wrangler kv:namespace create CACHE`) — ID: 80f580155fba425e97fe1d0dce528513
- [x] Configure shadowfeed.app DNS in Cloudflare dashboard
- [x] Setup subdomain: `api.shadowfeed.app` -> Worker, `shadowfeed.app` -> Pages
- [x] Port Express.js server to Hono framework (Workers-compatible)
- [x] Migrate better-sqlite3 queries to D1 (async, same SQL)
- [x] Replace in-memory cache with Cloudflare KV
- [x] Add `nodejs_compat` flag for x402-stacks compatibility
- [x] Deploy dashboard frontend to Cloudflare Pages — **shadowfeed.app live, 16 feeds + mainnet badge + visual renderers**

**Mainnet Migration:**
- [x] Set mainnet secrets via `wrangler secret put SERVER_PRIVATE_KEY` — **Done: SERVER_ADDRESS, SERVER_PRIVATE_KEY, NANSEN_API_KEY, HIRO_API_KEY**
- [x] Set `NETWORK=mainnet` in wrangler.toml vars — **Done**
- [x] Deploy Clarity contract v3 to Stacks mainnet — **TX: 198e59303b69582bc4fcef5d284ea0c92264a856855755ee692605dc6dcd9042**
- [x] Update facilitator to use mainnet network config — **Done: x402 v2 protocol, broadcast via Hiro API with key**
- [x] Test full payment flow: request -> 402 -> sign -> settle -> data — **Done: Hyre Agent bought all 3 original + 3 Nansen feeds**
- [x] Verify transactions on Hiro Explorer (mainnet) — **10+ TXs confirmed**

### Evidence Required
- Mainnet contract deployment TX hash
- At least 3 mainnet payment TX hashes (one per original feed)
- Screenshot of Hiro Explorer showing mainnet transactions
- Live site at https://shadowfeed.app
- API responding at https://api.shadowfeed.app

---

## 2. Data Feed Expansion (3 -> 15+ feeds)

### Existing Feeds (keep as-is, migrate to mainnet)
1. `whale-alerts.ts` - CoinGecko + Blockchain.info
2. `btc-sentiment.ts` - Alternative.me + CoinGecko
3. `defi-scores.ts` - DeFiLlama

### New Feeds to Build

#### Nansen-Powered Feeds (Premium Data) — ALL BUILT & TESTED
Nansen API provides institutional-grade on-chain analytics. Auth: API key header (`apiKey: KEY`).
Rate limits: 20 req/s, 300 req/min. Credit system: **$10 = 10,000 credits** (pay-as-you-go).
**Actual cost: 50 credits per API call ($0.05).**

| # | Feed | File | Nansen Endpoint | Credits/call | API Calls | Price (STX) | Status |
|---|------|------|----------------|-------------|-----------|-------------|--------|
| 4 | Smart Money Flows | `nansen-smart-money.ts` | POST /smart-money/netflow + /dex-trades | 50 each | 2 (100 cr) | 0.08 | ✅ LIVE |
| 5 | Token Intelligence | `nansen-token-intel.ts` | POST /tgm/token-information | 50 | 1 (50 cr) | 0.05 | ✅ LIVE |
| 6 | Wallet Profiler | `nansen-wallet-profiler.ts` | POST /profiler/address/current-balance | 50 | 1 (50 cr) | 0.05 | ✅ LIVE |
| 7 | Smart Money Holdings | `nansen-holdings.ts` | POST /smart-money/holdings | 50 | 1 (50 cr) | 0.05 | ✅ LIVE |
| 8 | DEX Trading Intel | `nansen-dex-trades.ts` | POST /smart-money/dex-trades + /perp-trades | 50 each | 2 (100 cr) | 0.08 | ✅ LIVE |

#### Free API Feeds — ALL BUILT & TESTED
| # | Feed | File | Data Sources | Price (STX) | Status |
|---|------|------|-------------|-------------|--------|
| 9 | Liquidation Alerts | `liquidation-alerts.ts` | Binance Futures (open interest + 24hr tickers) | 0.008 | ✅ LIVE |
| 10 | Gas/Fee Prediction | `gas-prediction.ts` | Blocknative (ETH gas) + mempool.space (BTC fees) | 0.003 | ✅ LIVE |
| 11 | Token Launch Intel | `token-launches.ts` | DEXScreener (boosts + profiles) | 0.005 | ✅ LIVE |
| 12 | Governance Signals | `governance.ts` | Snapshot.org GraphQL (7 major DAOs) | 0.005 | ✅ LIVE |
| 13 | Stablecoin Flows | `stablecoin-flows.ts` | DeFiLlama stablecoins + chain breakdown | 0.005 | ✅ LIVE |
| 14 | Security Alerts | `security-alerts.ts` | DeFiLlama protocols (audit risk analysis) | 0.005 | ✅ LIVE |
| 15 | Developer Activity | `dev-activity.ts` | GitHub API (Stacks, ETH, Solana repos) | 0.003 | ✅ LIVE |
| 16 | Bridge/Chain Flows | `bridge-flows.ts` | DeFiLlama v2/chains (cross-chain TVL) | 0.005 | ✅ LIVE |

### Nansen API Integration Details (IMPLEMENTED)

**Authentication:**
```typescript
// All Nansen endpoints use POST with apiKey header
const headers = { 'apiKey': c.env.NANSEN_API_KEY, 'Content-Type': 'application/json' };
```

**Endpoints Implemented (all POST, all verified working):**

1. **Smart Money Flows** (`nansen-smart-money.ts`) — 100 credits/req
   - `POST /api/v1/smart-money/netflow` — Capital flows from smart money wallets
   - `POST /api/v1/smart-money/dex-trades` — Real-time DEX trades by smart money
   - Returns: net inflow/outflow, top inflows/outflows, recent trades, sentiment signal

2. **Token Intelligence** (`nansen-token-intel.ts`) — 50 credits/req
   - `POST /api/v1/tgm/token-information` — Token God Mode data (timeframe: `1d`)
   - Accepts `?address=` and `?chain=` query params
   - Returns: market cap, buy/sell ratio, volume, liquidity, STRONG_BUY/SELL signal

3. **Wallet Profiler** (`nansen-wallet-profiler.ts`) — 50 credits/req
   - `POST /api/v1/profiler/address/current-balance` — Real-time portfolio
   - Accepts `?address=` and `?chain=` query params (default: Binance, ethereum)
   - Returns: top holdings, chain breakdown, concentration metrics

4. **Smart Money Holdings** (`nansen-holdings.ts`) — 50 credits/req
   - `POST /api/v1/smart-money/holdings` — Current holdings of smart money
   - Returns: top 25 holdings with ACCUMULATING/DISTRIBUTING/HOLDING signals, chain allocation

5. **DEX Trading Intel** (`nansen-dex-trades.ts`) — 100 credits/req
   - `POST /api/v1/smart-money/dex-trades` — DEX trades by smart money
   - `POST /api/v1/smart-money/perp-trades` — Perpetual positions
   - Returns: most bought/sold tokens, recent trades, volume aggregation

### Nansen Credit Budget ($10 = 10,000 credits, 50 credits/call)

| Feed | API Calls | Credits/req | Estimated reqs/day (cached) | Daily credits | Monthly credits |
|------|-----------|-------------|---------------------------|---------------|-----------------|
| Smart Money Flows | 2 | 100 | 12 (5-min cache) | 1,200 | 36,000 |
| Token Intel | 1 | 50 | 12 | 600 | 18,000 |
| Wallet Profiler | 1 | 50 | 12 | 600 | 18,000 |
| Holdings | 1 | 50 | 12 | 600 | 18,000 |
| DEX Trades | 2 | 100 | 12 | 1,200 | 36,000 |
| **Total** | | | **60** | **4,200** | **126,000** |

> **Without caching:** 126,000 credits/mo = $126/mo (too expensive)
> **With KV caching (5-min TTL):** each feed refreshes max 288x/day, but only when requested.
> **Realistic usage (early stage):** ~10-20 unique cache misses/day = 1,000-4,000 credits/day = **$3-12/mo**
> **Budget:** $10 top-up = 10,000 credits = good for early traction phase.
>
> **Revenue math:** If 50 agents buy Nansen feeds 5x/day at 0.06 STX avg = 15 STX/day. At STX ~$0.30 = **$4.50/day = $135/mo revenue**.

### Feed Architecture Pattern
Each feed must follow this structure:
```typescript
// src/feeds/<feed-name>.ts
export async function get<FeedName>Data(): Promise<FeedResponse> {
  // 1. Fetch from external API(s)
  // 2. Compute analytics/scores
  // 3. Return structured response with:
  //    - timestamp
  //    - raw data summary
  //    - computed signals/scores
  //    - confidence level
  //    - recommended action (for agents)
}
```

### Server Integration — DONE
- [x] All 16 feeds registered as x402-protected routes in `workers/api/src/index.ts`
- [x] Feed discovery registry updated with all 16 feeds in `workers/api/src/registry.ts`
- [x] NANSEN_API_KEY set as Cloudflare secret
- [x] DEMO_MODE enabled for testing
- [x] All 16 feeds verified HTTP 200 on `api.shadowfeed.app/demo/feeds/*`
- [x] Update dashboard feed list to show all 16 feeds — **feedMeta, feedIcons, feedPricesMap, API playground, 13 visual renderers**
- [x] x402 v2 protocol compliance (payment-required/payment-signature headers, base64 encoding)
- [x] Agent naming system (x-agent-name header → KV storage → dashboard display)
- [x] Proper mainnet address extraction (SP prefix via c32address)
- [x] **Standalone Facilitator deployed** — `facilitator.shadowfeed.app` (Cloudflare Worker)
  - GET /supported — mainnet + testnet, STX/sBTC/USDCx
  - POST /verify — validate signed TX, extract payer
  - POST /settle — broadcast + confirm on-chain
  - Hiro API key for reliable broadcasting
  - More reliable than official `facilitator.stacksx402.com` (theirs 500s on /settle)

---

## 3. Agent SDK (@shadowfeed/agent)

### Package Structure
```
packages/agent-sdk/
  src/
    index.ts          - Main entry point
    client.ts         - ShadowFeedClient class
    discovery.ts      - Feed discovery API
    types.ts          - TypeScript types
  examples/
    basic-agent.ts    - Simple feed purchase
    smart-agent.ts    - Conditional buying logic
    research-agent.ts - Multi-feed chaining
  README.md
  package.json
  tsconfig.json
```

### Core API
```typescript
import { ShadowFeed } from '@shadowfeed/agent';

const sf = new ShadowFeed({
  privateKey: process.env.AGENT_PRIVATE_KEY,
  network: 'mainnet',
  baseUrl: 'https://api.shadowfeed.app'
});

// Discover available feeds
const feeds = await sf.discover();

// Purchase a feed
const data = await sf.buy('whale-alerts');

// Chain feeds
const research = await sf.chain(['btc-sentiment', 'whale-alerts', 'defi-scores']);
```

### Publishing Checklist
- [x] Package built and tested locally — **builds clean, 0 errors, JS + d.ts + sourcemaps**
- [x] README with quickstart guide — **full README with API reference, 16 feeds table, how-it-works**
- [x] Published to npm as `@shadowfeed/agent` — **v1.0.0 live, `npm install @shadowfeed/agent`**
- [x] At least 3 example agents working — **basic-agent, smart-agent, research-agent**
- [x] TypeScript types exported — **FeedId, FeedInfo, PurchaseResult, ChainResult, etc.**

---

## 4. Discovery Tooling & Docs

### Feed Discovery API
- `GET /api/feeds` - List all available feeds with pricing
- `GET /api/feeds/:id/schema` - Get feed response schema
- `GET /api/feeds/:id/sample` - Get sample response (free)

### Documentation
- [ ] README updated with all 15+ feeds
- [ ] API documentation for each endpoint
- [ ] Agent quickstart guide (setup to first purchase in 5 min)
- [ ] Architecture overview for developers

---

## Completion Notice Template

**To:** grants@stacksendowment.co
**Subject:** ShadowFeed M1 Completion Notice

**Deliverables:**
1. Mainnet deployment: [contract TX link]
2. 3 original feeds on mainnet: [TX proof links]
3. Real STX payments: [TX proof links]
4. 15 live feeds: [list of endpoint URLs]
5. Agent SDK: [npm package link]
6. Discovery API: [API endpoint URL]
7. Documentation: [docs link]
8. Example agents: [GitHub links]
