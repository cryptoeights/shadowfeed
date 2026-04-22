# ShadowFeed Integration Plan — ALEX Lab (Priority) + AIBTC

**Purpose:** Drive M2 traction (50+ unique agent purchases + 2+ external providers) through strategic integrations with existing Stacks ecosystem leaders.

**Date:** April 22, 2026 (Updated priority order)
**Priority:** HIGH — directly contributes to M2 deliverables

**Execution Order:**
1. ✅ **FIRST:** Add ALEX-sourced data feeds to ShadowFeed (fastest win, no external dependencies)
2. 🔄 **MIDDLE:** Onboard ALEX as external provider (M2 critical deliverable)
3. 🔜 **LAST:** AIBTC integration (MCP server + x402-api registration)

---

## Executive Summary

Two strategic integrations identified that can accelerate M2 completion. **ALEX integration takes priority** because:

- ALEX public API is ready-to-use (no permission needed for first-party feeds)
- Directly expands ShadowFeed catalog (16 → 21+ feeds)
- Creates foundation for ALEX provider onboarding (M2 external provider #1)
- AIBTC integration benefits MORE when ShadowFeed catalog is richer

**AIBTC integration comes last** because:
- Requires PR approval cycle from their team
- Value multiplies when ShadowFeed has more feeds to offer their 916+ agents
- `@shadowfeed/mcp-server` is most attractive with expanded feed catalog

**Key Alignment:**
- ALEX has comprehensive REST API at `api.alexgo.io` — 20+ endpoints ready
- AIBTC already uses x402 protocol — same as ShadowFeed
- AIBTC MCP server already integrates ALEX DEX (proven pattern we can replicate)

---

## Part 1: ALEX Lab Integration (PRIORITY — START HERE)

### About ALEX Lab

**What it is:** Largest DEX on Stacks (Bitcoin L2), "Super App for Bitcoin" combining AMM, Orderbook, Launchpad, Yield Farming, and LISA liquid staking.

**Key Stats:**
- Largest DEX by TVL on Stacks
- Comprehensive REST API at `api.alexgo.io`
- CoinGecko-compatible endpoints
- Brotocol cross-chain bridge aggregator
- LISA liquid staking platform

**Documented REST API Endpoints:**

**Pool endpoints:**
- `GET /v1/allswaps`
- `GET /v1/pool_stats/{pool_token_id}`
- `GET /v1/pool_volume/{pool_token_id}`
- `GET /v1/volume_24h/{pool_token_id}`
- `GET /v1/volume_7d/{pool_token_id}`
- `GET /v1/pool_liquidity/{pool_token_id}`
- `GET /v1/liquidity/{pool_token_id}`
- `GET /v1/fee/{pool_token_id}`

**Stats endpoints:**
- `GET /v1/stats/tvl`
- `GET /v1/stats/tvl/{token}`
- `GET /v1/stats/total_supply/{token}`

**Price endpoints:**
- `GET /v1/price/{token}`
- `GET /v1/pool_token_price/{pool_token_id}`
- `GET /v1/pool_token_stats`
- `GET /v1/price_history/{token}`

**DEX endpoints:**
- `GET /v1/pairs`
- `GET /v1/tickers`
- `GET /v1/ticker/{ticker_id}`
- `GET /v1/orderbook/{ticker}`
- `GET /v1/historical_swaps/{pool_token_id}`

**CoinGecko-compatible:**
- `GET /v2/coin-gecko/pairs`
- `GET /v2/coin-gecko/tickers`
- `GET /v1/public/pairs`
- `GET /v1/public/amm-pool-stats`

### Why ALEX Matters for ShadowFeed

| Benefit | M2 Impact |
|---------|-----------|
| Rich data to build 5+ new ShadowFeed feeds | Extends feed catalog (currently 16 → 21+) |
| ALEX could be external provider #1 or #2 | Direct M2 contract requirement |
| ALEX user base → potential ShadowFeed agent customers | 50+ unique purchases target |
| Stacks ecosystem authority | Credibility boost |

### Integration Opportunities

#### Opportunity 1: Build ALEX-Powered ShadowFeed Feeds (FASTEST WIN — START HERE)

**Goal:** Ship 5 new feeds that fetch from ALEX API. No permission needed — public API.

**Proposed New Feeds:**

| Feed ID | Data Source | Price (STX) | Description |
|---------|-------------|-------------|-------------|
| `alex-pool-analytics` | `/v1/allswaps`, `/v1/pool_stats/*` | 0.005 | Real-time pool performance, volume, liquidity for all ALEX pools |
| `alex-price-feed` | `/v1/price/*`, `/v1/price_history/*` | 0.003 | Stacks ecosystem token prices with history |
| `alex-orderbook-depth` | `/v1/orderbook/*` | 0.008 | Order book depth for active trading agents |
| `alex-tvl-flows` | `/v1/stats/tvl`, `/v1/stats/total_supply/*` | 0.005 | TVL trends and supply changes across ALEX tokens |
| `alex-swap-activity` | `/v1/historical_swaps/*`, `/v1/volume_24h/*` | 0.005 | Recent swap activity, large trade detection |

**Optional 3 additional feeds (if time permits):**

| Feed ID | Data Source | Price (STX) | Description |
|---------|-------------|-------------|-------------|
| `alex-pairs-overview` | `/v1/pairs`, `/v1/tickers` | 0.003 | All trading pairs with current market stats |
| `alex-volume-trends` | `/v1/volume_7d/*`, `/v1/volume_24h/*` | 0.005 | 24h vs 7d volume change signals |
| `alex-liquidity-monitor` | `/v1/pool_liquidity/*`, `/v1/fee/*` | 0.005 | Liquidity depth + fee tier analysis |

**Technical implementation:**
- Create 5 new files in `workers/api/src/feeds/alex-*.ts`
- Each follows existing feed pattern (fetch → compute analytics → return JSON)
- Register in `workers/api/src/registry.ts`
- KV caching (1-5 min TTL depending on freshness needs)

**Deliverables:**
- 5 new feed files (+3 optional)
- Registry updates
- Unit tests
- Update docs at docs.shadowfeed.app
- Announce on Twitter/Stacks Forum

**Effort:** 3-5 days
**Expected Result:** ShadowFeed catalog grows from 16 → 21 feeds, all Stacks-native. Showcases ALEX data as first citizen.

#### Opportunity 2: Onboard ALEX as External Provider (M2 CRITICAL)

**Goal:** ALEX registers on ShadowFeed marketplace as first external provider.

**Pitch to ALEX:**
- "You already expose rich REST data for free — let AI agents pay you per-query via x402"
- Revenue share: 97-99% to ALEX, 1-3% platform fee
- Zero migration cost — proxy routes to existing `api.alexgo.io` endpoints
- Positions ALEX as AI-agent-ready DeFi protocol (narrative win)
- First mover advantage on ShadowFeed provider marketplace
- **Bonus:** We're already showcasing ALEX data via 5 first-party feeds → proven demand

**Proposed Provider Setup:**
```
Provider: ALEX Lab
Wallet: [ALEX Stacks address]
Stake: 50 STX (minimum)
Feeds (ALEX hosts these directly):
  - alex-launchpad-listings (new token discovery — NOT in public API)
  - alex-farm-apy (yield farming opportunities — premium data)
  - alex-lisa-staking (liquid staking analytics)
  - alex-brotocol-bridges (cross-chain flow data)
  - alex-dao-proposals (governance data)
```

**Note:** ALEX-provider feeds should be DIFFERENT from ShadowFeed first-party feeds (Opportunity 1). First-party feeds use public API; provider feeds use ALEX's internal/premium data.

**Technical requirements:**
- ShadowFeed builds provider marketplace UI (Week 2-3)
- ShadowFeed builds provider proxy system
- ALEX supplies: wallet address, feed endpoints, pricing preferences
- On-chain registration via Clarity contract

**Deliverables:**
- Email/DM to ALEX developer relations (contact@alexgo.io + Discord)
- Provider onboarding document tailored for ALEX
- Technical integration call
- Provider proxy testing with ALEX endpoints
- Launch announcement

**Effort:** 1-2 weeks (heavy outreach + technical coordination)
**Expected Result:** 1 of 2 external providers required for M2 contract.

#### Opportunity 3: ALEX Developer Community Outreach

**Goal:** Tap ALEX's developer community for awareness.

**Actions:**
- Post integration tutorial in ALEX Discord: "Build trading bots with ALEX + ShadowFeed + x402"
- Submit to ALEX's developer showcase (if exists)
- Cross-link docs: ShadowFeed docs → ALEX API, ALEX docs → ShadowFeed SDK
- Joint webinar / Twitter Space

**Deliverables:**
- 1 tutorial published on Dev.to + Stacks Forum
- ALEX community announcement
- Documentation cross-links

**Effort:** 2-3 days
**Expected Result:** Awareness among ALEX dev community (hundreds of potential agent builders).

---

## Part 2: AIBTC Integration (FINAL STEP)

### About AIBTC

**What it is:** "First network for personal agents on Bitcoin — where agents get paid to coordinate and do meaningful work together."

**Key Stats (Apr 2026):**
- 916+ AI agents registered
- 150+ tools in MCP server (aibtc-mcp-server)
- x402 protocol native (mainnet: `x402.aibtc.com`, testnet: `x402.aibtc.dev`)
- Payment tokens: STX, sBTC, USDCx
- Active Stacks Working Group (weekly Tuesday meetings)

**Existing x402 API Categories:**
- `/inference/*` — LLM chat completions
- `/stacks/*` — blockchain utilities
- `/hashing/*` — Clarity-compatible hashing
- `/storage/*` — KV, paste, DB, sync, queue, memory

**Relevant repos:**
- `aibtcdev/aibtc-mcp-server` — MCP server (150+ tools)
- `aibtcdev/x402-api` — x402 API endpoints
- `aibtcdev/stacks-mcp-server` — Read-only Stacks interaction
- `aibtcdev/agent-news` — Agent intelligence network

### Why AIBTC Last (Not First)

**Strategic reasoning:**
- AIBTC integration is a **distribution multiplier** — better to multiply a bigger catalog (21 feeds) than smaller one (16 feeds)
- Their PR review cycle takes time — don't block on external team
- Our `@shadowfeed/mcp-server` package is more compelling with expanded feeds
- ALEX data feeds give us more variety/value to showcase to their 916+ agents

### Why AIBTC Matters for ShadowFeed

| Benefit | Impact |
|---------|--------|
| Direct access to 916+ registered AI agents | Potential 50+ unique purchases in M2 (contract requirement) |
| Same x402 protocol, no payment re-engineering needed | Zero integration friction |
| MCP server already has x402 discovery tools | ShadowFeed feeds appear automatically to agents |
| Credibility by association with leading Stacks AI infra | Builder community awareness |
| Built-in distribution channel via their MCP | Agents discover feeds through `list_x402_endpoints` |

### Integration Opportunities

#### Opportunity 4: Register ShadowFeed x402 Endpoints on AIBTC

**Goal:** Make ShadowFeed feeds discoverable via AIBTC's `list_x402_endpoints` MCP tool.

**Technical approach:**
- Submit ShadowFeed's x402 endpoint catalog (21 feeds by this point) to AIBTC's x402-api registry
- Ensure compatibility with their x402 v2 protocol implementation
- Provide OpenAPI spec and Agent Card (`.well-known/agent.json`)

**Deliverables:**
- ShadowFeed Agent Card JSON at `shadowfeed.app/.well-known/agent.json`
- OpenAPI 3.0 spec for all 21 feeds
- PR to `aibtcdev/x402-api` adding ShadowFeed endpoints to known registry
- Testing with AIBTC MCP server locally

**Effort:** 2-3 days
**Expected Result:** ShadowFeed feeds appear as callable tools in any Claude instance running AIBTC MCP server.

#### Opportunity 5: Submit ShadowFeed MCP Extension

**Goal:** Create a lightweight MCP extension that adds ShadowFeed as discrete tools, submitted to AIBTC's ecosystem.

**Technical approach:**
- Build `@shadowfeed/mcp-server` npm package
- Expose 21 feeds as distinct MCP tools with schema
- Handle x402 payment flow automatically using `shadowfeed-agent` SDK
- Submit to mcpservers.org and awesome-mcp-servers

**Example tool:**
```json
{
  "name": "shadowfeed_alex_pool_analytics",
  "description": "Real-time ALEX pool performance, volume, and liquidity",
  "parameters": {},
  "price": "0.005 STX"
}
```

**Deliverables:**
- `@shadowfeed/mcp-server` on npm
- Installation docs in ShadowFeed documentation
- Cross-link from AIBTC MCP server README

**Effort:** 3-5 days
**Expected Result:** Any Claude/Cursor user can `npx @shadowfeed/mcp-server` and get instant access to 21 feeds.

#### Opportunity 6: Co-Marketing with AIBTC Team

**Goal:** Joint narrative as "x402-on-Stacks pioneers."

**Actions:**
- Join AIBTC Stacks Working Group Tuesday meetings (forum.stacks.org)
- Co-author blog post: "Building the Agent Economy on Bitcoin: AIBTC + ShadowFeed"
- Joint Twitter thread highlighting the agent-to-data flow
- Mutual amplification of each other's launches
- Include ShadowFeed in AIBTC demo videos/tutorials

**Deliverables:**
- 1 co-authored blog post
- 1 joint Twitter Space or video demo
- Cross-linking in both documentation sites

**Effort:** 3-5 days spread over 2 weeks
**Expected Result:** Awareness boost in Stacks Forum + CT ecosystem.

#### Opportunity 7: Agent News Data Feed (Bonus)

**Goal:** Leverage AIBTC Agent News (agents produce "briefs" and "signals" inscribed on Bitcoin).

**Technical approach:**
- Build ShadowFeed feed that aggregates AIBTC agent news signals
- Agents pay ShadowFeed, ShadowFeed fetches from AIBTC agent network
- Potentially: AIBTC becomes an external provider (counts toward M2!)

**Deliverables:**
- `aibtc-agent-signals` feed endpoint
- Conversation with AIBTC team about provider registration

**Effort:** 2-4 days (depends on AIBTC team cooperation)
**Expected Result:** Unique ShadowFeed feed + potential M2 external provider #2.

---

## Combined Integration Roadmap (Priority-Ordered)

### Week 1 (Apr 22 - Apr 29): ALEX Data Feeds — FOUNDATION
**Focus:** Build ALEX-sourced feeds, no external dependencies

**Day 1-2 (Apr 22-23):**
- [ ] Scaffold first ALEX feed: `alex-price-feed` (simplest endpoint)
- [ ] Test ALEX API endpoints, verify response formats
- [ ] Set up KV caching strategy per feed

**Day 3-5 (Apr 24-26):**
- [ ] Build `alex-pool-analytics`
- [ ] Build `alex-orderbook-depth`
- [ ] Build `alex-tvl-flows`
- [ ] Deploy to mainnet workers

**Day 6-7 (Apr 27-29):**
- [ ] Build `alex-swap-activity`
- [ ] Update `registry.ts` with all 5 new feeds
- [ ] Update documentation at docs.shadowfeed.app
- [ ] Announce "5 new ALEX feeds" on Twitter + Stacks Forum
- [ ] Optional: ship 3 bonus feeds (`alex-pairs-overview`, `alex-volume-trends`, `alex-liquidity-monitor`)

### Week 2 (Apr 29 - May 6): ALEX Provider Onboarding — M2 CRITICAL
**Focus:** Get ALEX registered as external provider

**Day 1-2:**
- [ ] Send outreach email to ALEX team (contact@alexgo.io + Discord)
- [ ] Schedule technical call
- [ ] Prepare provider onboarding documentation

**Day 3-5:**
- [ ] Build provider marketplace infrastructure (7 new endpoints)
- [ ] Database schema: `providers` + `provider_feeds` tables
- [ ] Provider proxy system implementation
- [ ] Smart contract v1 deployment decision (staking vs registry-only)

**Day 6-7:**
- [ ] Technical call with ALEX team
- [ ] ALEX wallet setup assistance
- [ ] Test provider registration flow

### Week 3 (May 6 - May 13): ALEX Provider Launch + Content
**Focus:** Close ALEX deal + start content

- [ ] ALEX stake transaction on mainnet
- [ ] Register ALEX as provider via Clarity contract
- [ ] Deploy ALEX-proxied feeds (separate from first-party)
- [ ] Launch announcement: "ALEX is first external provider on ShadowFeed"
- [ ] Tutorial #1: "Build AI trading bot with ShadowFeed + ALEX data" (Dev.to)
- [ ] Push metrics toward 50+ unique agent purchases

### Week 4 (May 13 - May 20): AIBTC Integration — DISTRIBUTION
**Focus:** Tap AIBTC's 916+ agent network

**Day 1-2:**
- [ ] Create Agent Card JSON at `shadowfeed.app/.well-known/agent.json`
- [ ] Generate OpenAPI 3.0 spec for all 21 feeds

**Day 3-5:**
- [ ] Build `@shadowfeed/mcp-server` npm package
- [ ] Test with Claude Code + Claude Desktop
- [ ] Publish v0.1.0 to npm

**Day 6-7:**
- [ ] Fork `aibtcdev/x402-api`, add ShadowFeed endpoint registry
- [ ] Submit PR with ShadowFeed integration
- [ ] Submit to mcpservers.org and awesome-mcp-servers
- [ ] Send outreach to AIBTC team
- [ ] Join Stacks Working Group Tuesday meeting

### Week 5 (May 20 - May 22): M2 Submission
**Focus:** Close out M2

- [ ] Verify: 2+ external providers registered on-chain (ALEX + AIBTC or Bitflow/Zest)
- [ ] Verify: 50+ unique wallet addresses purchased feeds
- [ ] Collect evidence screenshots + explorer links
- [ ] Tutorial #2: "Using ShadowFeed MCP in Claude Code"
- [ ] Tutorial #3: "Agent-to-Agent Economy: AIBTC + ShadowFeed"
- [ ] Submit M2 completion to grants@stacksendowment.co

---

## Resource Requirements

### Technical Work Estimates (Priority-Ordered)
| Task | Engineering Days | Week |
|------|-----------------|------|
| 5 ALEX first-party feeds | 5 days | 1 |
| Provider marketplace infrastructure | 5-7 days | 2 |
| ALEX provider onboarding (technical) | 2-3 days | 3 |
| Agent Card + OpenAPI spec | 1 day | 4 |
| ShadowFeed MCP server package | 4 days | 4 |
| x402-api integration PR | 2 days | 4 |
| Documentation updates (ongoing) | 2 days | All |
| **Total estimated** | **~21-25 days solo** | |

### Budget Allocation (from M2 $3K)
| Category | Amount | Purpose |
|----------|--------|---------|
| ALEX provider stake reimbursement | $100 | Optional — cover 50 STX stake if ALEX hesitant |
| Video production | $200 | Tutorial video for MCP demo |
| Launch marketing (Twitter ads) | $300 | Boost ALEX + AIBTC integration announcements |
| Co-marketing incentives | $200 | Bounties for community tutorials |
| **Total integration spend** | **$800** | |

---

## Risk Analysis

| Risk | Mitigation |
|------|-----------|
| ALEX team doesn't respond to outreach | First-party feeds ship anyway (public API); pivot to Bitflow/Zest as alt provider |
| AIBTC PR rejected or delayed | Ship `@shadowfeed/mcp-server` independently — doesn't require AIBTC approval |
| ALEX declines to be external provider | Pivot: onboard Bitflow, Zest, or smaller Stacks indie providers |
| API rate limits on ALEX endpoints | Use KV caching aggressively (5-15 min TTL); add Hiro API key fallback |
| Low AIBTC agent adoption of ShadowFeed | Promote through joint content; offer first-query free via faucet |

---

## Success Metrics

### Week 1 Checkpoint (Apr 29)
- [ ] 5+ ALEX-powered feeds live on mainnet
- [ ] Announcement posted on Twitter + Stacks Forum
- [ ] 5+ unique agent queries on new ALEX feeds

### Week 3 Checkpoint (May 13)
- [ ] ALEX registered as external provider (M2 #1)
- [ ] Tutorial #1 published
- [ ] 20+ unique agent purchases cumulative

### Week 4 Checkpoint (May 20)
- [ ] ShadowFeed MCP server on npm (v0.1.0+)
- [ ] AIBTC PR submitted (merged or in review)
- [ ] Second external provider committed (AIBTC, Bitflow, or Zest)
- [ ] 35+ unique agent purchases cumulative

### M2 Completion (May 22)
- [ ] 2+ external providers registered on-chain
- [ ] 50+ unique wallet addresses with feed purchases on-chain
- [ ] Feeds discoverable in AIBTC MCP server ecosystem

---

## Immediate Next Actions (Today — Apr 22)

1. **Scaffold `alex-price-feed`** (simplest endpoint, start code NOW)
2. **Draft ALEX outreach email** (for Week 2 send)
3. **Test ALEX API** — verify `api.alexgo.io/v1/price/{token}` response
4. **Create tracking sheet** — 5 feeds to ship this week
5. **Post Stacks Telegram announcement** (looking for providers — tease ALEX data coming)

---

## Outreach Templates

### Email to ALEX Lab Team (SEND WEEK 2, AFTER FEEDS LIVE)

```
Subject: Partnership proposal: ALEX as first external provider on ShadowFeed

Hi ALEX team,

I'm Pebri, founder of ShadowFeed — the first x402 data marketplace on Stacks
(grant-funded by Stacks Endowment). We're opening our provider marketplace
and ALEX is at the top of our list for Stacks DeFi data.

Quick context: We just shipped 5 ShadowFeed feeds sourced from api.alexgo.io 
(pool analytics, prices, orderbook, TVL flows, swap activity). AI agents are 
already querying ALEX data through our marketplace. Here's what's next:

**Direct provider onboarding** (proposal):
ALEX registers as external provider on our marketplace. Benefits:
- AI agents pay ALEX per-query via x402 micropayments (STX/sBTC)
- 97-99% revenue share to ALEX, 1-3% platform fee
- Zero tech migration — we proxy to your existing endpoints
- Positions ALEX as AI-agent-ready DeFi protocol
- First mover advantage on ShadowFeed provider marketplace

We're targeting production launch in 2-3 weeks. Could we schedule a short
call to discuss?

Resources:
- Demo: shadowfeed.app
- Docs: docs.shadowfeed.app
- SDK: npmjs.com/package/shadowfeed-agent
- Live ALEX feeds: shadowfeed.app/feeds (filter: alex-*)

Pebri
dev_pebri / @cryptoeights
```

### Email to AIBTC Team (SEND WEEK 4, LAST)

```
Subject: ShadowFeed x AIBTC — x402 Data Marketplace for Your Agent Network

Hi AIBTC team,

I'm Pebri, building ShadowFeed (shadowfeed.app) — a decentralized data
marketplace where AI agents pay for real-time crypto intelligence via x402
micropayments on Stacks. We now have 21 feeds live on mainnet (including
5 ALEX-powered feeds) and ALEX Lab has just joined as our first external
data provider.

Your work on aibtc-mcp-server is exactly the kind of infrastructure we're
designed to plug into. Specifically:

1. Your agents use `list_x402_endpoints` — we'd like ShadowFeed feeds to
   appear there. Happy to submit a PR to aibtcdev/x402-api registering
   our endpoint catalog.

2. We just published `@shadowfeed/mcp-server` — a lightweight MCP that exposes
   our 21 feeds as tools for Claude/Cursor. Would love feedback and potential
   cross-linking.

3. Joint narrative opportunity: "x402 on Stacks" pioneers. Could we
   co-author a blog post or join your Stacks Working Group Tuesday call?

Happy to hop on a 15-min call whenever works.

Pebri
dev_pebri / @cryptoeights
shadowfeed.app | github.com/cryptoeights/shadowfeed
```

---

## Appendix: Strategic Notes

### Why ALEX First (Revised Priority)

**Bottom-line:** ALEX-sourced feeds can be built independently with public API. AIBTC integration benefits from a larger feed catalog. Don't let external dependencies block internal progress.

| Factor | ALEX First | AIBTC First |
|--------|-----------|-------------|
| External dependency | None (public API) | PR approval cycle |
| Immediate catalog growth | +5 feeds | 0 new feeds |
| M2 provider deliverable alignment | High (ALEX as provider #1) | Indirect |
| Reversible? | Yes (feeds stand alone) | Less so (depends on their team) |

### Deferred for Later (M3+)
- **Arkadiko, Zest, Velar, Bitflow** — good candidates for providers #3+
- **LangChain/CrewAI** integration — separate effort, needs tutorials ready first
- **Multi-chain expansion** — out of grant scope

### Notes for Stacks Endowment Check-in
Highlight this priority order as strategic thinking — "we moved ALEX up because public API gives us zero-dependency path to grow catalog, while AIBTC integration benefits from having more feeds to expose." Shows we understand dependency management.

---

**END OF PLAN**
