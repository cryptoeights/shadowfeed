# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ShadowFeed is a decentralized data marketplace where AI agents pay for real-time crypto intelligence via x402 micropayments on Stacks (Bitcoin L2).

**Production stack (current):** Cloudflare Workers (Hono) + D1 + KV, deployed at `api.shadowfeed.app` and `shadowfeed.app`. Live on Stacks mainnet with 21 feeds and an agent platform (custodial wallets per agent).

**Legacy stack (still in repo):** Node.js/Express/SQLite under `src/` — kept for local dev and reference. Production code lives in `workers/api/`.

---

## Current Work: M2 (Milestone 2 — Stacks Endowment Grant)

**Original deadline:** May 22, 2026 (submitted, rejected in initial review)
**Status as of 2026-05-28:** Honest pivot complete. Target resubmit **2026-07-09** (~6 weeks out).
**Budget:** $3,000 USD (in STX)

### Reviewer feedback — Adam Haun, Stacks Labs (received 2026-05-27)

Both deliverables flagged as not substantiated. Tone constructive ("engineering is genuinely solid"), gap is traction + verification, not code quality.

**Deliverable 1 (2+ external providers):**
- Xona: 100% query error rate, never actually served data
- Hyre: manifest "blocked our check" — Adam couldn't independently verify Hyre as unaffiliated outside team
- Required: real, independent providers actually serving through the marketplace

**Deliverable 2 (50+ unique mainnet buyer wallets):**
- `/activity` showed `is_onchain: false` on most rows — not mainnet
- `provider_query_log.csv` referenced as "attached in next step" never came through
- Wallets created in ~18-minute window, near-identical behavior → operator-controlled sybil pattern (Adam called it correctly)

### Honest pivot — completed work (2026-05-28, all live in production)

**Provider 1 — Hyre — fully verifiable now:**
- Public verification endpoint: `GET https://api.shadowfeed.app/providers/hyre/manifest` (no auth, CORS open)
- Returns: live HTTP probe of partner endpoint (`mpp.hyreagent.fun`), live fetch of Hyre's own `.well-known/shadowfeed-feeds.json`, all feed stats, full independence attestation chain
- Generalized for any provider: `/providers/:handle/manifest`
- Hyre published their side at `https://hyreagent.fun/.well-known/shadowfeed-feeds.json` (multi-marketplace cross-listing: x402scan, payai, agentic-market) with `@Hyre_agent` twitter and `ceo@hyreagent.fun` contact
- **CRITICAL DISCLOSURE**: Pebri is also a developer on Hyre. Projects operate separately (different infra — Vercel + Cloudflare on a different account from ShadowFeed; different audience — Solana/Base/SKALE agentic DeFi vs Bitcoin/Stacks marketplace; different commercial relationships day-to-day) but the dev overlap is real. **Must be disclosed in any external M2 communication.** Draft email to Adam includes this in §1.

**Provider 2 — Xona — honestly paused:**
- HMAC secret never synchronized between platform and Xona's server — 857 queries, 100% error rate (840 × HTTP 404, 17 × 502, zero successes ever)
- Applied D1 update: `providers.status = 'paused'` + `provider_feeds.active = 0`
- Xona itself is a real externally-recognized team (independent x402/Solana coverage) — only our integration failed
- Will re-engage via SDK migration in M3

**Activity log honesty infrastructure:**
- Migration `004_activity_source_tagging.sql` — added `source_type` column to `queries` and `provider_query_log` (values: `real_onchain` | `simulation` | `demo` | `unknown`). Backfilled all 17K+ historical rows.
- Migration `005_retag_non_mainnet_anomalies.sql` — re-tagged 10 historical anomalies (6 BTC `bc1q…` payers + 4 Stacks testnet `ST…` payers) out of `real_onchain` into `unknown`
- `/activity` defaults to `source_type = 'real_onchain'` filter; `?include=all` for legacy view; headers (`unique_agents_real_onchain`, `total_revenue_stx_real_onchain`) reflect real_onchain only
- CSV export: `GET /admin/provider_query_log.csv` — regenerates from live D1 every request, exports ONLY real_onchain rows with explorer URLs + summary footer
- Helper `deriveSourceType(txHash)` in `workers/api/src/db.ts` keeps insert paths consistent with backfill rules

**Honest mainnet numbers (2026-05-28):**
- 57 distinct on-chain mainnet wallets, 1,751 settlements, 9.915 STX revenue, span 2026-04-13 → 2026-05-18
- Of the 57: **50 wallets in 23-min burst on 2026-05-18 15:23-15:46** (stress-test, Pebri-funded, identical query patterns ~37-41 each) + **4 wallets in 82-sec burst on 2026-05-14 18:36-18:38** (also stress-test) + **3 wallets across 04-13/04-22/05-14 with spread + return behavior** (plausibly independent)
- **Honest count of independent external buyer wallets: 3** (well below the 50 deliverable threshold)

### Provider SDK — `@shadowfeed/provider-sdk@0.1.0`

Located at `packages/provider-sdk/`. Built to prevent Xona-style HMAC mismatches and accelerate next provider onboarding.

- 1,832 LOC source + 38 unit/integration tests passing
- Express + Hono adapters; `npx shadowfeed verify` CLI for one-command integration validation
- HMAC verifier is a byte-for-byte port of `workers/api/src/lib/hmac.ts` (canonical = `METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY_SHA256`, headers `X-Sf-Timestamp/Nonce/Signature/Partner`)
- Auto-publishes `.well-known/shadowfeed-feeds.json` from registered feeds
- **Critical bug found and fixed during integration test**: mount-prefix canonical path mismatch (adapter previously used full URL pathname; now reconstructs `/feeds/{slug}` from route param). Regression tests pin this — see `packages/provider-sdk/test/adapter-canonical.test.ts`. Without the fix this would have replicated the Xona failure for every non-root mount.
- Live reference deployment: `https://sf-sdk-verify.cryptoeights.workers.dev`
- **Not yet npm-published** — needs `npm login` + `npm publish --access public` from user

### Provider discovery bug fix

`workers/api/src/lib/provider-discovery.ts` `KNOWN_CATALOGS['hyreagent.fun']` previously had `/v1/...` prefix paths that don't exist on Hyre's real API (all return 404). Production D1 was unaffected because Hyre was onboarded with hand-entered correct paths, but the discovery wizard would have produced 14 broken feeds for any future re-onboarding. Replaced with 10 verified static paths matching Hyre's live OpenAPI. Dropped 4 path-param endpoints (require `{mint}` or `{address}` — need a future query-style feed model) and 2 invented endpoints not in Hyre's spec at all.

### M2 resubmit plan (target: 2026-07-09)

**Phase 1 — weeks 1-2** (soft drip campaign):
- 10-15 builders per week from Pebri's Indonesian Stacks/x402/agentic-builder community (~200+ active)
- Each builder self-funds wallet from own exchange/balance (NO operator funding — anti-sybil critical)
- Individual outreach, not mass campaign

**Phase 2 — weeks 3-4** (wider community release):
- Open invite to broader community
- USDC bounty for top users by **engagement quality** (variety of feeds, multi-day return behavior), paid AFTER campaign — never upfront STX
- Staggered onboarding to avoid burst pattern

**Phase 3 — weeks 5-6** (resubmit prep):
- Public launch, blog post, x402 ecosystem coverage outreach
- Final CSV export, manifest URLs ready
- Resubmit email with full disclosure (draft ready in conversation history, includes Hyre dev disclosure)

**Provider pipeline:**
- 1 confirmed external provider currently integrating via SDK (~7 days to live)
- 2 additional providers expressed interest after SDK launch
- Target at resubmit: 3 working external providers (or 2 if Adam rules Hyre out due to dev overlap)

### Strategy constraints — DO NOT VIOLATE

These are hard rules. Any approach that risks violating these = **stop and restart conversation with user**.

1. **Never generate sim/sybil wallets and label them as real.** Stress tests are fine but MUST be tagged `source_type = 'simulation'` and excluded from headline numbers. The `source_type` column makes this mechanically harder but the intent is what matters most.
2. **Never claim Hyre as "unaffiliated outside team"** without disclosing Pebri's dev involvement. Disclosure must be in paragraph 1 of any M2 reviewer communication.
3. **Never fund campaign wallets from the operator wallet.** Each new buyer wallet must have an independent funding trail (their own exchange/existing balance). Rewards paid POST-campaign in USDC/NFT/access — never upfront STX.
4. **Never deploy code that inserts to `queries` or `provider_query_log` without setting `source_type` explicitly.** Use `deriveSourceType()` helper or pass directly. Code review must catch missing source_type.
5. **Never skip HMAC handshake test for new providers** — use `npx shadowfeed verify` or `POST /providers/id/:id/hmac/test` before activating. Xona's failure pattern is mechanically impossible only if both sides actually run the SDK.
6. **Always show reviewers verifiable URLs**, never raw numbers without an independent audit path. Every M2 metric we claim must be backed by a public curlable endpoint.
7. **Never use "clean exchange wallet" / OKX subaccount-style wallet generation.** Pebri proposed this early in the 2026-05-28 session under deadline pressure — explicitly NACK'd as grant fraud (KYC links subaccounts to master, on-chain clustering detects coordinated funding, irrecoverable reputational damage if discovered). If proposed again under future pressure, refuse and push back.

### Key endpoints (live, production)

- `GET /providers/hyre/manifest` — Hyre verification chain (live HTTP probe, well-known cross-ref, feed stats)
- `GET /providers/:handle/manifest` — generalized version for any provider
- `GET /providers/hyre` — provider record (status: active)
- `GET /providers/xona` — provider record (status: paused, feeds: [])
- `GET /activity` — default real_onchain mainnet only
- `GET /activity?include=all` — legacy full view with source_type tags
- `GET /admin/provider_query_log.csv` — verifiable on-chain settlements only (regenerated from D1 every request)
- SDK reference deployment: `https://sf-sdk-verify.cryptoeights.workers.dev`

### Active plan documents (read these before working on M2)
- [plan/M2-PLAN.md](plan/M2-PLAN.md) — Original M2 plan with timeline, scope, target providers
- [plan/PROVIDER-PORTAL.md](plan/PROVIDER-PORTAL.md) — Provider portal + custodial wallet + dashboard spec
- [plan/LAUNCH-AGENT-PLATFORM.md](plan/LAUNCH-AGENT-PLATFORM.md) — Agent platform launch copy (already launched May 5, 2026)

### Key design decisions for M2 provider system (unchanged from original)
- **Custodial wallet per provider** — Auto-generated on signup (mirror `workers/api/src/lib/agent-wallet.ts` pattern). Provider doesn't need to bring a Stacks wallet upfront. Withdraw to personal wallet from dashboard.
- **Two integration modes** (no third for M2):
  - **"Connect Your API"** (Partner Bridge) — Provider exposes private endpoint with HMAC auth (HMAC-SHA256 with timestamp + nonce, replay-protected via KV)
  - **"Drop Your Data"** (Hosted Mirror) — Provider gives data source (R2/S3 URL, GitHub raw, webhook push, manual upload), we cache in KV and serve
- **Revenue split:** 97% to provider's custodial wallet, 3% platform fee
- **Settlement model:** Per-query increments DB counter (no per-call STX transfer). Withdrawals batch the accumulated balance into a single STX transfer signed by the platform.
- **Auth options:** Email magic link (primary, lowest friction for non-crypto providers), SIWS (optional, required for withdrawal verification)

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
- `agent-wallet.ts` — Per-agent custodial Stacks wallet (generation, encryption, balance check) — **mirror this pattern for provider wallets**
- `agent-routes.ts` — CRUD + cron management endpoints
- `agents-repo.ts` — D1 repository (CRUD pattern)
- `agent-engine.ts` — Cron executor: query feeds → evaluate thresholds → fire webhook
- `agent-templates.ts` — 5 ready-made templates (Whale Tracker, DCA Bot, Gas Optimizer, Liquidation Hunter, Stacks DeFi Monitor)
- `auth.ts` — SIWS (Sign-In With Stacks) session handling

### Provider Portal (`workers/api/src/lib/provider-*.ts`) — shipped during M2

Mirrors the agent platform architecture. Lets external data vendors register feeds, receive payments via HMAC-gated proxy, and withdraw via custodial wallet.

- `provider-wallet.ts` — per-provider custodial Stacks wallet (same encryption pattern as agents)
- `provider-routes.ts` — onboarding, profile, feed catalog, HMAC handshake test, **public manifest endpoint** (`/providers/:handle/manifest` — no auth, used by grant reviewers + marketplace partners)
- `providers-repo.ts` — D1 repository
- `provider-feed-proxy.ts` — paid feed handler: x402 verify → broadcast → HMAC-sign upstream call → credit revenue
- `provider-discovery.ts` — feed catalog auto-discovery with three fallback methods (`.well-known/shadowfeed-feeds.json` → curated `KNOWN_CATALOGS` → x402 probing)
- `provider-poller.ts` — scheduled poller for `hosted_mirror` feeds (R2/GitHub/webhook sources)
- `provider-withdraw.ts` — STX withdrawal signing + Hiro broadcast
- `hmac.ts` — request signing + verification (HMAC-SHA256, ±5min window, nonce uniqueness). **The byte-for-byte source of truth that `@shadowfeed/provider-sdk` mirrors — never let these diverge.**

### Provider SDK (`packages/provider-sdk/`) — shipped 2026-05-28

`@shadowfeed/provider-sdk@0.1.0` — TypeScript SDK external providers install to onboard in one command.

- `src/provider.ts` — `ShadowFeedProvider` class with `.feed()` registration + `.dispatch()`
- `src/hmac.ts` — verifier (mirrors `workers/api/src/lib/hmac.ts` exactly)
- `src/manifest.ts` — auto-generates `.well-known/shadowfeed-feeds.json`
- `src/express.ts` + `src/hono.ts` — framework adapters
- `src/cli/verify.ts` — `npx shadowfeed verify` for one-command integration check
- `examples/workers-example.ts` + `wrangler.example.toml` — deployable reference (live at `https://sf-sdk-verify.cryptoeights.workers.dev`)
- 38 vitest tests across `test/hmac.test.ts`, `test/manifest.test.ts`, `test/provider.test.ts`, `test/adapter-canonical.test.ts`
- Build: `cd packages/provider-sdk && npm install && npm run build && npm test`
- Publish (when ready): `npm login && npm publish --access public`

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
2. **D1 migrations** — Add new migrations under `workers/api/d1/migrations/` with sequential timestamps (e.g. `006_<feature>.sql`). Run via `cd workers/api && npx wrangler d1 migrations apply shadowfeed --remote` for production.
3. **Validation** — Use Zod schemas at API boundaries. All provider input must be validated before touching DB.
4. **Secrets** — Provider HMAC secrets are stored as **hash only** in DB (the raw secret is shown to provider once and never recoverable). Use `wrangler secret put` for platform-level secrets.
5. **Logs & PII** — No `console.log` in production paths. Audit log table captures actions; never log raw HMAC secrets, private keys, or email tokens.
6. **Custodial key rule** — Private keys decrypt only inside the withdrawal/settlement code path. Never return decrypted keys from any endpoint, even to the authenticated provider.
7. **Frontend** — Extend `public/index.html` (existing pattern) rather than spinning up a new frontend project. Match the visual language of the agent platform UI.

### Honesty-infrastructure conventions (added 2026-05-28 post-review)

These exist because the M2 initial review caught us conflating stress-test data with real traction. Every change that touches activity recording or reporting must respect them.

8. **`source_type` on every insert** — Any new code path that inserts into `queries` or `provider_query_log` MUST set `source_type` explicitly. Use `deriveSourceType(txHash)` from `workers/api/src/db.ts` if you're echoing the backfill rules, otherwise pass the literal value (`'real_onchain'` for production payment paths, `'simulation'` for any test/stress harness, `'demo'` for demo-mode bypass). Schema constraint will reject `unknown` literals.
9. **Default to real-only in public surface** — Any new dashboard/analytics endpoint defaults to filtering `source_type = 'real_onchain'`. Opt-in `?include=all` (or specific `?source=...`) for transparency. Header counters always reflect real_onchain only — never aggregate across source types.
10. **Reviewer-verifiable artifacts** — Any metric we publish externally (grant report, blog, tweet) must be backed by a publicly-curlable endpoint that regenerates from D1. Don't paste static numbers without a live audit URL. Pattern: see `/admin/provider_query_log.csv`.
11. **Provider SDK for new integrations** — All new external providers onboard via `@shadowfeed/provider-sdk` (`packages/provider-sdk/`), not hand-rolled HMAC middleware. The SDK's HMAC verifier is the byte-for-byte port of `workers/api/src/lib/hmac.ts`; using anything else risks a Xona-style mismatch. Run `npx shadowfeed verify` before flipping a provider to `active`.
12. **Disclosure rule for affiliated providers** — Any provider where Pebri has a dev/founder/operator role MUST be disclosed in reviewer-facing communication. Affiliated providers may count toward marketplace traction internally, but they don't count toward "external independent providers" deliverables without explicit acknowledgment from the reviewer.
