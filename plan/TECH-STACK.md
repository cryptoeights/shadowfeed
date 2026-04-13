# ShadowFeed Tech Stack

## Current Stack (Already in Place)

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Runtime | Node.js + TypeScript | Server & agents |
| Framework | Express.js | HTTP server |
| Database | SQLite (better-sqlite3, WAL) | Query logs, feed stats |
| Payment | x402-stacks v2 | HTTP 402 micropayments |
| Blockchain | @stacks/transactions v7 | TX deserialization, broadcast |
| Network | @stacks/network v7 | Stacks mainnet/testnet config |
| Smart Contract | Clarity | Provider registry (v3 deployed) |
| Dev Server | tsx | Hot reload TypeScript |
| Build | tsc (TypeScript compiler) | Production compilation |
| Hosting | Cloudflare Workers | Serverless API (replaces Railway) |
| Frontend | Cloudflare Pages | Dashboard at shadowfeed.app |
| DNS/CDN | Cloudflare | DNS, CDN, DDoS protection for shadowfeed.app |
| KV Store | Cloudflare KV | Feed response caching (replaces in-memory Map) |
| Database | Cloudflare D1 | SQLite-compatible (replaces local SQLite file) |
| Domain | shadowfeed.app | Production domain |

---

## New Tech Needed for M1

### Data Source APIs (for 13 new feeds)

#### Nansen API (Premium — 5 feeds) ✅ IMPLEMENTED
| Feed | Nansen Endpoint (POST) | Auth | Credits/call | Notes |
|------|----------------------|------|-------------|-------|
| Smart Money Flows | /api/v1/smart-money/netflow + /dex-trades | `apiKey` header | 50 × 2 = 100 | Capital flows from smart money |
| Token Intelligence | /api/v1/tgm/token-information | `apiKey` header | 50 | Token God Mode analytics |
| Wallet Profiler | /api/v1/profiler/address/current-balance | `apiKey` header | 50 | Portfolio analysis |
| Smart Money Holdings | /api/v1/smart-money/holdings | `apiKey` header | 50 | What top traders hold |
| DEX Trading Intel | /api/v1/smart-money/dex-trades + /perp-trades | `apiKey` header | 50 × 2 = 100 | Real-time smart money trades |

> **Nansen Pricing:** $10 = 10,000 credits. **Actual: 50 credits per API call.** With KV caching (5-min TTL), ~$3-12/mo for moderate usage.

#### Free APIs (8 feeds) ✅ IMPLEMENTED
| Feed | API Source (actual) | Auth | Free? | Status |
|------|-------------------|------|-------|--------|
| Liquidation Alerts | Binance Futures (open interest + 24hr tickers) | None | Yes | ✅ LIVE |
| Gas Prediction | Blocknative (ETH gas) + mempool.space (BTC fees) | None | Yes | ✅ LIVE |
| Token Launches | DEXScreener (boosts + profiles) | None | Yes | ✅ LIVE |
| Governance | Snapshot.org GraphQL (7 major DAOs) | None | Yes | ✅ LIVE |
| Stablecoin Flows | DeFiLlama /stablecoins + /stablecoinchains | None | Yes | ✅ LIVE |
| Security Alerts | DeFiLlama /protocols (audit risk analysis) | None | Yes | ✅ LIVE |
| Dev Activity | GitHub REST API (5 repos: Stacks, ETH, Solana) | None | Yes (60 req/hr) | ✅ LIVE |
| Bridge/Chain Flows | DeFiLlama /v2/chains (cross-chain TVL) | None | Yes | ✅ LIVE |

> **Note:** DeFiLlama `/hacks` and `/bridges` endpoints are now paywalled (402). Replaced with free alternatives.

### Key Libraries to Add

```json
{
  "dependencies": {
    "axios": "already installed - HTTP client for API calls",
    "@octokit/rest": "GitHub API client (dev-activity feed)",
    "graphql-request": "Snapshot GraphQL queries (governance feed)"
  },
  "devDependencies": {
    "vitest": "Fast unit testing for feeds",
    "@types/better-sqlite3": "already installed"
  }
}
```

> Most data sources use REST APIs callable with `axios` (already installed). 
> No heavy new dependencies needed.

---

## Agent SDK Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Package | npm (@shadowfeed/agent) | Standard JS/TS distribution |
| Build | tsup or tsc | Bundle for CJS + ESM |
| HTTP Client | axios | Already used in project |
| Payment | x402-stacks | Wraps payment flow |
| Types | TypeScript | Full type safety |

### SDK Package Structure
```
@shadowfeed/agent
  dist/
    index.js       (CJS)
    index.mjs      (ESM)
    index.d.ts     (Types)
  package.json
```

---

## New Tech Needed for M2

### Provider System

| Component | Technology | Why |
|-----------|-----------|-----|
| Provider Auth | API keys + Stacks wallet signature | Verify provider identity |
| Provider Dashboard | Static HTML + fetch API | Keep it simple, extend existing dashboard |
| Staking Contract | Clarity (update v3) | On-chain accountability |

### Monitoring & Analytics

| Tool | Purpose | Cost |
|------|---------|------|
| Railway Metrics | Server uptime, response times | Included in Railway plan |
| SQLite queries table | Transaction tracking | Free (already built) |
| Hiro API | On-chain verification | Free tier |

---

## Infrastructure Requirements

### Cloudflare Stack (replaces Railway)

| Service | Plan | Cost | Purpose |
|---------|------|------|---------|
| Cloudflare Workers | Free (100K req/day) or Paid ($5/mo, 10M req/mo) | $0-5/mo | API server + facilitator |
| Cloudflare Pages | Free | $0 | Dashboard frontend (shadowfeed.app) |
| Cloudflare D1 | Free (5M reads/day, 100K writes/day) | $0 | SQLite-compatible database |
| Cloudflare KV | Free (100K reads/day, 1K writes/day) | $0 | Feed response caching |
| Cloudflare DNS | Free | $0 | DNS for shadowfeed.app |
| Domain | shadowfeed.app | Already purchased | Production URL |

**Why Cloudflare over Railway:**
- Zero cold start (Workers are always warm)
- Global edge deployment (faster for agents worldwide)
- Built-in DDoS protection
- D1 = SQLite-compatible (minimal migration from better-sqlite3)
- Free tier handles our scale easily
- Professional domain (shadowfeed.app vs railway.app subdomain)

### Migration from Railway to Cloudflare

```
Railway (current)                Cloudflare (target)
─────────────────                ───────────────────
Express.js server          →     Cloudflare Worker (Hono framework)
better-sqlite3             →     Cloudflare D1 (SQLite-compatible)
In-memory cache Map        →     Cloudflare KV
Static HTML in public/     →     Cloudflare Pages
railway.app subdomain      →     shadowfeed.app
```

**Key adaptation:** Express.js doesn't run on Workers. Use **Hono** (Express-like framework built for Workers/edge). Minimal code changes needed.

### Cloudflare Project Structure
```
shadowfeed.app/
  workers/
    api/                    - Main API worker (feeds, facilitator, marketplace)
      src/
        index.ts            - Hono app entry
        feeds/              - All 15 feed handlers
        facilitator.ts      - x402 payment verification
        middleware.ts       - Payment middleware adapted for Hono
      wrangler.toml         - Worker config + D1/KV bindings
  pages/
    public/                 - Dashboard frontend (Cloudflare Pages)
  d1/
    schema.sql              - D1 database schema (queries, feed_stats)
```

### Wrangler Config (wrangler.toml)
```toml
name = "shadowfeed-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[vars]
NETWORK = "mainnet"

[[d1_databases]]
binding = "DB"
database_name = "shadowfeed"
database_id = "<generated>"

[[kv_namespaces]]
binding = "CACHE"
id = "<generated>"

[env.production]
routes = [
  { pattern = "api.shadowfeed.app", custom_domain = true }
]
```

### Domain Setup (shadowfeed.app)
```
shadowfeed.app          → Cloudflare Pages (dashboard)
api.shadowfeed.app      → Cloudflare Worker (API + feeds + facilitator)
docs.shadowfeed.app     → Cloudflare Pages (documentation) [optional]
```

### API Rate Limits to Watch

| API | Rate Limit | Strategy |
|-----|-----------|----------|
| CoinGecko (free) | 10-30 req/min | Cache responses 60s |
| DeFiLlama | No strict limit | Cache responses 60s |
| Blockchain.info | 10 req/min | Cache responses 120s |
| GitHub API | 5000 req/hr (with token) | Cache responses 300s |
| Binance public | 1200 req/min | More than enough |
| DEXScreener | ~300 req/min | Cache responses 60s |
| Snapshot GraphQL | 100 req/min | Cache responses 300s |

### Caching Strategy (Cloudflare KV)
```typescript
// Cloudflare KV cache with TTL (replaces in-memory Map)
async function getCached(
  kv: KVNamespace,
  key: string, 
  ttlSeconds: number, 
  fetcher: () => Promise<any>
) {
  const cached = await kv.get(key, 'json');
  if (cached) return cached;
  const data = await fetcher();
  await kv.put(key, JSON.stringify(data), { expirationTtl: ttlSeconds });
  return data;
}
```

---

## Mainnet vs Testnet Configuration

```env
# Testnet (current)
NETWORK=testnet
STACKS_API=https://api.testnet.hiro.so

# Mainnet (M1 target)
NETWORK=mainnet
STACKS_API=https://api.hiro.so
```

### Mainnet Checklist
- [ ] Generate new mainnet keypair (or use existing mainnet wallet)
- [ ] Fund mainnet wallet with STX for contract deployment
- [ ] Deploy Clarity contract v3 to mainnet
- [ ] Verify contract on Hiro Explorer
- [x] Setup Cloudflare Workers with env vars (wrangler secret) — testnet secrets set
- [x] Configure shadowfeed.app DNS in Cloudflare
- [x] Deploy API worker to api.shadowfeed.app — 16 feeds live
- [ ] Deploy dashboard to shadowfeed.app (Cloudflare Pages)
- [ ] Switch NETWORK=mainnet and set mainnet secrets
- [ ] Test payment flow with real STX (small amounts)

---

## What You DON'T Need

| Tempting but Unnecessary | Why |
|--------------------------|-----|
| PostgreSQL/MongoDB | D1 (SQLite-compatible) handles the load fine |
| Redis | Cloudflare KV handles caching |
| Docker/K8s | Cloudflare Workers = serverless, no containers |
| Railway | Cloudflare does everything for free/cheaper |
| React/Next.js | Static HTML dashboard on Pages works fine |
| GraphQL server | REST endpoints are simpler for this use case |
| WebSockets | Polling/on-demand is fine for data feeds |
| External auth service | Stacks wallet signatures are sufficient |

---

## Cloudflare-Specific Libraries

```json
{
  "dependencies": {
    "hono": "Lightweight web framework for Workers (Express replacement)",
    "@cloudflare/workers-types": "TypeScript types for Workers runtime",
    "x402-stacks": "x402 payment protocol (verify compatibility with Workers)"
  },
  "devDependencies": {
    "wrangler": "Cloudflare Workers CLI (dev, deploy, D1, KV)",
    "vitest": "Testing"
  }
}
```

### x402-stacks Compatibility Note
`x402-stacks` uses `@stacks/transactions` which relies on Node.js crypto. 
Cloudflare Workers support `node:crypto` via `nodejs_compat` flag.
Add to `wrangler.toml`:
```toml
compatibility_flags = ["nodejs_compat"]
```
