# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ShadowFeed is a decentralized data marketplace where AI agents pay for real-time crypto intelligence via x402 micropayments on Stacks (Bitcoin L2).

**Production stack (current):** Cloudflare Workers (Hono) + D1 + KV, deployed at `api.shadowfeed.app` and `shadowfeed.app`. Live on Stacks mainnet with 21 feeds and an agent platform (custodial wallets per agent).

**Legacy stack (still in repo):** Node.js/Express/SQLite under `src/` — kept for local dev and reference. Production code lives in `workers/api/`.

---

## Current Work: M2 (Milestone 2 — Stacks Endowment Grant)

**Deadline:** May 22, 2026
**Budget:** $3,000 USD (in STX)
**Status:** In progress

### Hard requirements (must hit to claim grant)
1. **2+ external providers registered** on marketplace — Status: 0 built (provider system not yet implemented)
2. **50+ unique buyer wallets** purchasing feeds — Status: ~3-4 real Stacks wallets on leaderboard

### Active plan documents (read these before working on M2)
- [plan/M2-PLAN.md](plan/M2-PLAN.md) — Original M2 plan with timeline, scope, target providers
- [plan/PROVIDER-PORTAL.md](plan/PROVIDER-PORTAL.md) — **Primary execution doc**: provider portal + custodial wallet + dashboard spec with 9-day implementation breakdown
- [plan/LAUNCH-AGENT-PLATFORM.md](plan/LAUNCH-AGENT-PLATFORM.md) — Agent platform launch copy (already launched May 5, 2026)

### Key design decisions for M2 provider system
- **Custodial wallet per provider** — Auto-generated on signup (mirror `workers/api/src/lib/agent-wallet.ts` pattern). Provider doesn't need to bring a Stacks wallet upfront. Withdraw to personal wallet from dashboard.
- **Two integration modes** (no third for M2):
  - **"Connect Your API"** (Partner Bridge) — Provider exposes private endpoint with HMAC auth (HMAC-SHA256 with timestamp + nonce, replay-protected via KV)
  - **"Drop Your Data"** (Hosted Mirror) — Provider gives data source (R2/S3 URL, GitHub raw, webhook push, manual upload), we cache in KV and serve
- **Revenue split:** 97% to provider's custodial wallet, 3% platform fee
- **Settlement model:** Per-query increments DB counter (no per-call STX transfer). Withdrawals batch the accumulated balance into a single STX transfer signed by the platform.
- **Auth options:** Email magic link (primary, lowest friction for non-crypto providers), SIWS (optional, required for withdrawal verification)

### Primary target provider (high-confidence onboard)
**Hyre Agent** (docs.hyreagent.fun) — already x402-native, complementary data (Solana/Base/SKALE while we have Bitcoin/Stacks), zero overlap. Onboard via Partner Bridge with HMAC.

### M1 status note
M1 deliverables technically complete (mainnet migration, 21 feeds, SDK v1.0.1 on npm, Mintlify docs). Recent commits are `m1-closeout` fixes — verify M1 submission status to `grants@stacksendowment.co` before/during M2 work.

---

## Commands

### Production stack (Cloudflare Workers — `workers/api/`)
- `cd workers/api && wrangler dev` — Local Workers dev
- `cd workers/api && wrangler deploy` — Deploy to Cloudflare
- `cd workers/api && wrangler d1 migrations apply shadowfeed` — Apply D1 migrations
- `cd workers/api && wrangler secret put MASTER_KEY` — Set encryption master key

### Legacy stack (local Express — `src/`)

## Commands

- `npm run dev` — Start dev server with tsx (hot reload, port from .env or 3000)
- `npm run build` — Compile TypeScript (`tsc`)
- `npm start` — Run compiled server (`node dist/src/server.js`)
- `npm run smart-agent` — Run the autonomous agent with conditional buying logic
- `npm run client` — Run the basic agent demo (buys all feeds)
- `npm run simulate` — Run 10-agent simulation
- `npm run demo` — Start server in demo mode (enables `/demo/feeds/*` endpoints that bypass x402 payment)
- `npm run deploy` — Deploy Clarity smart contract to Stacks testnet
- `npm run keygen` — Generate a new Stacks keypair

## Architecture

### Production: Cloudflare Workers (`workers/api/`)
Hono app at `workers/api/src/index.ts` (~825 lines) serving three roles:
1. **Data marketplace** — 21 feed endpoints protected by `paymentMiddleware` from `x402-stacks`
2. **Embedded facilitator** — `/supported`, `/verify`, `/settle` endpoints that broadcast STX transactions via Hiro API and poll for confirmation
3. **Dashboard API + Agent platform** — `/stats`, `/leaderboard`, `/activity`, agent CRUD/cron via `lib/agent-routes.ts`

Storage: **D1** (SQLite-compatible) for transactional data, **KV** for cache and nonces. The agent platform stores per-agent custodial wallets with private keys encrypted via `MASTER_KEY` (AES-GCM, see `lib/crypto.ts` + `lib/agent-wallet.ts`).

### Data Feeds — Production set (21 live)
Located in `workers/api/src/feeds/`:
- **Free APIs:** whale-alerts, btc-sentiment, defi-scores, liquidation-alerts, gas-prediction, token-launches, governance, stablecoin-flows, security-alerts, dev-activity, bridge-flows
- **Nansen-powered:** smart-money-flows, token-intel, wallet-profiler, smart-money-holdings, dex-trades
- **ALEX Lab:** alex-price-feed, alex-pool-analytics, alex-tvl-flows, alex-swap-activity, alex-pairs-overview

Prices defined in `STXtoMicroSTX()` calls in `index.ts`. Most feeds enhanced with Gemini 2.5 Flash AI insights via `lib/enhance-feed.ts` + `lib/gemini.ts`.

### Agent Platform (`workers/api/src/lib/agent-*.ts`)
- `agent-wallet.ts` — Per-agent custodial Stacks wallet (generation, encryption, balance check) — **mirror this pattern for provider wallets in M2**
- `agent-routes.ts` — CRUD + cron management endpoints
- `agents-repo.ts` — D1 repository (CRUD pattern)
- `agent-engine.ts` — Cron executor: query feeds → evaluate thresholds → fire webhook
- `agent-templates.ts` — 5 ready-made templates (Whale Tracker, DCA Bot, Gas Optimizer, Liquidation Hunter, Stacks DeFi Monitor)
- `auth.ts` — SIWS (Sign-In With Stacks) session handling

### Legacy: Local Express (`src/`)
Original implementation. Still works for local dev with SQLite. Not deployed to production. Three original feeds (whale-alerts, btc-sentiment, defi-scores) under `src/feeds/`.

### Client Agents (client/)
- `smart-agent.ts` — Conditionally purchases feeds based on market conditions (the main demo agent)
- `agent-demo.ts` — Simple agent that buys all feeds
- `simulate-agents.ts` — Multi-agent simulation for populating activity data
- `auto-agent.ts`, `multi-agent.ts` — Additional agent variants

Agents use `wrapAxiosWithPayment` and `privateKeyToAccount` from `x402-stacks` to auto-handle HTTP 402 payment flows.

### Smart Contracts (contracts/)
Clarity contracts for on-chain provider registry. Three versions with increasing simplification; `v3` is the deployed version (registry only, no staking/slashing).

## Environment Variables

### Production (Cloudflare Workers secrets — `wrangler secret put NAME`)
- `SERVER_PRIVATE_KEY` — Platform wallet private key (signs facilitator txs)
- `NANSEN_API_KEY` — Nansen API access for institutional feeds
- `HIRO_API_KEY` — Hiro API rate-limit increase
- `GEMINI_API_KEY` — Google Gemini for AI-enhanced feed insights
- `MASTER_KEY` — AES-GCM key for encrypting per-agent (and soon per-provider) private keys

### Worker vars (`wrangler.toml`)
- `SERVER_ADDRESS` — Platform Stacks mainnet address (`SP1DV3T4ST2A89ZZ07M73B2N4AR5XFMDCNPGKK6CS`)
- `NETWORK` — `mainnet` (production)

### Legacy local dev (`.env`)
- `SERVER_ADDRESS`, `SERVER_PRIVATE_KEY`, `AGENT_PRIVATE_KEY`, `NETWORK`, `FACILITATOR_URL`, `PORT`, `DEMO_MODE`

## Key Dependencies

- `x402-stacks` (v2) — x402 payment protocol SDK; provides `paymentMiddleware`, `getPayment`, `wrapAxiosWithPayment`, `privateKeyToAccount`, `STXtoMicroSTX`, `generateKeypair`
- `@stacks/transactions` (v7) — Transaction deserialization and broadcasting
- `@stacks/network` (v7) — Stacks network constants
- `hono` — Cloudflare Workers framework
- `better-sqlite3` — Legacy local SQLite driver (`src/` only)

## TypeScript Config

- Target: ES2022
- Strict mode enabled
- Production (Workers): module ESM, bundler resolution
- Legacy: CommonJS, src + client folders → dist

## Working on M2 — Conventions

When implementing the provider portal (per [plan/PROVIDER-PORTAL.md](plan/PROVIDER-PORTAL.md)):

1. **Mirror existing patterns** — provider wallet, repo, and routes should follow `agent-*.ts` shape. Don't invent new patterns when the agent platform already solved the same problem.
2. **D1 migrations** — Add new migrations under `workers/api/migrations/` with sequential timestamps. Run via `wrangler d1 migrations apply shadowfeed`.
3. **Validation** — Use Zod schemas at API boundaries. All provider input must be validated before touching DB.
4. **Secrets** — Provider HMAC secrets are stored as **hash only** in DB (the raw secret is shown to provider once and never recoverable). Use `wrangler secret put` for platform-level secrets.
5. **Logs & PII** — No `console.log` in production paths. Audit log table captures actions; never log raw HMAC secrets, private keys, or email tokens.
6. **Custodial key rule** — Private keys decrypt only inside the withdrawal/settlement code path. Never return decrypted keys from any endpoint, even to the authenticated provider.
7. **Frontend** — Extend `public/index.html` (existing pattern) rather than spinning up a new frontend project. Match the visual language of the agent platform UI.
