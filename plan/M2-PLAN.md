# ShadowFeed — Milestone 2 Plan

**Status:** In Progress
**Deadline:** May 22, 2026
**Budget:** $3,000 USD (in STX)
**Days Remaining:** 30 days (as of Apr 22, 2026)

---

## Contract Requirements (Wajib untuk claim $3,000)

| # | Deliverable | Target | Current Status |
|---|------------|--------|---------------|
| 1 | External data providers | 2+ registered on marketplace | 0 |
| 2 | Unique feed purchases | 50+ unique wallet addresses | ~9 |

---

## Understanding: ShadowFeed = Data Marketplace (App Store Model)

**ShadowFeed is NOT:**
- Agent marketplace (tidak jual AI agents)
- Single data API (bukan data provider tunggal)

**ShadowFeed IS:**
- Platform/marketplace where data providers sell feeds to AI agents
- Pebri = platform operator (seperti Apple App Store)
- Revenue model: 1-3% platform fee on third-party provider feeds

### Marketplace Structure

```
SELLER SIDE (Providers)         BUYER SIDE (Agents)
- ShadowFeed first-party  ←──→  - Trading bots
- Arkadiko (target)             - Research agents
- ALEX Lab (target)             - Portfolio monitors
- Solo devs                     - Analytics tools
         ↓                             ↑
         └──── ShadowFeed Platform ────┘
               (handles x402, routing, verification)
```

### Nansen vs External Provider — Clarification

**Nansen = Data Source (bukan Provider):**
- ShadowFeed bayar Nansen subscription
- ShadowFeed fetch data, serve as first-party feed
- 100% revenue ke ShadowFeed wallet
- Nansen tidak tahu ShadowFeed ada

**External Provider (yang M2 minta):**
- Register via `/providers/register` dengan STX signature
- Stake minimum 50 STX on-chain
- Serve feeds dari endpoint mereka sendiri
- Revenue share: 97-99% provider, 1-3% platform fee
- Ada di `/providers` public list

---

## Scope Breakdown (dari PRD)

### 6.3 Open Provider Marketplace — $900 budget

**6.3.1 Provider Registration System** (7 endpoints baru):
- `POST /providers/register` — register dengan STX signature
- `GET /providers` — list semua providers
- `GET /providers/:address` — provider profile & stats
- `POST /providers/:address/feeds` — register feed baru
- `PUT /providers/:address/feeds/:feedId` — update feed config
- `DELETE /providers/:address/feeds/:feedId` — deactivate feed
- `GET /providers/:address/analytics` — revenue & query analytics (auth required)

**6.3.2 Provider Proxy System:**
```
Agent → ShadowFeed (payment verify) → Provider endpoint → Data → Agent
              ↓
        1-3% platform fee
        97-99% routed ke provider wallet
```

**6.3.3 Provider Analytics Dashboard:**
- Total revenue earned (STX)
- Query count per feed (hourly/daily/weekly)
- Unique agents per feed
- Average response time, error rate
- Revenue chart over time

**Database Schema Updates:**
- Table `providers` (address, name, description, stake, created_at)
- Table `provider_feeds` (feed_id, provider_address, endpoint_url, pricing, active)

**Smart Contract Upgrade:**
- Deploy v1 with staking/slashing logic to mainnet
- Currently only v3 (registry-only) is deployed

---

### 6.5 Community & Ecosystem Integration — $675 budget

**5 Tutorials to Publish:**

| # | Title | Platform |
|---|-------|----------|
| 1 | Build Your First AI Agent on Bitcoin with ShadowFeed & x402 | Dev.to / Hashnode |
| 2 | ShadowFeed + LangChain: Give Your AI Agent Real-Time Crypto Data | LangChain community |
| 3 | Autonomous Trading Bot on Stacks in 50 Lines of Code | Stacks Forum |
| 4 | Why AI Agents Need Bitcoin Settlement: The x402 Story | Medium / Blog |
| 5 | From CoinGecko Pro to ShadowFeed: 7,000x Cost Reduction | Twitter thread + blog |

**AI Framework Integrations:**

| Framework | Integration Type | Target |
|-----------|-----------------|--------|
| LangChain | Custom Tool plugin | PR to `langchain-community` |
| CrewAI | Agent Tool integration | PR to `crewai-tools` |
| AutoGPT | Plugin | Plugin marketplace listing |

**Stacks Forum Engagement:**
- Weekly dev updates posted to Stacks Forum
- Respond to community questions within 24h
- Share milestone achievements with on-chain proof
- Engage with other x402 builders

---

## Target External Providers (Tier Analysis)

### Tier 1: Stacks Ecosystem Projects (paling realistis)
- **Arkadiko** — vault health, liquidation alerts
- **ALEX Lab** — AMM pool analytics, swap data
- **Velar** — perp data, funding rates
- **Zest Protocol** — lending rates, collateral data
- **Bitflow** — DEX aggregator data
- **Stacks Node Operators** — block/validator data

### Tier 2: Indie Developers / Data Analysts
- Stacks hackathon alumni
- Solo devs yang punya custom dashboards
- DFINITY grant network contacts

### Tier 3: External Data Projects (non-Stacks)
- Crypto analytics teams yang ingin masuk ke AI agent market
- Data project yang butuh monetization channel

---

## Execution Timeline (30 days)

### Week 1 (Apr 22 - Apr 29): Infrastructure Foundation
- [ ] Deploy smart contract v1 (staking/slashing) ke mainnet
- [ ] Build provider registration endpoints (7 routes)
- [ ] Build provider proxy system
- [ ] Database migration: `providers` + `provider_feeds` tables
- [ ] Basic provider onboarding docs di docs.shadowfeed.app

### Week 2 (Apr 29 - May 6): Provider Outreach
- [ ] Research top 5 Stacks ecosystem candidates
- [ ] Draft outreach email template
- [ ] Cold email 5-10 potential providers
- [ ] Post on Stacks Forum: "Calling data providers"
- [ ] Twitter/X announcement: "ShadowFeed Provider Program open"

### Week 3 (May 6 - May 13): Content & Tutorials
- [ ] Tutorial #1: Build AI agent in 5 min
- [ ] Tutorial #2: LangChain integration
- [ ] Tutorial #3: Trading bot on Stacks
- [ ] Video: YouTube demo of provider onboarding
- [ ] Social media push (see Social Media Strategy below)

### Week 4 (May 13 - May 20): Traction Push
- [ ] Hackathon bounty: $200-500 prize for best ShadowFeed project
- [ ] Faucet campaign: 0.5 STX free untuk 50 first agents
- [ ] AI framework integration: LangChain PR
- [ ] Tutorial #4 + #5
- [ ] Direct outreach: 30 AI agent builders di CT

### Week 5 (May 20 - May 22): Finalize & Submit
- [ ] Verify 2+ providers fully registered
- [ ] Verify 50+ unique purchases on-chain
- [ ] Screenshot evidence collection
- [ ] Write M2 completion report
- [ ] Submit to grants@stacksendowment.co

---

## Budget Allocation Suggestion ($3,000)

| Category | Amount | Purpose |
|----------|--------|---------|
| Development | $1,200 | Provider infrastructure, contract upgrade, UI |
| Content & Tutorials | $400 | Writing, video production |
| Incentives | $800 | Hackathon bounty, faucet campaign, provider bonuses |
| Marketing/Ads | $300 | Twitter ads, sponsored posts |
| Buffer | $300 | Unexpected costs, API costs, etc. |

---

## Success Criteria

### Minimum (Contract Requirement)
- [x] 2+ external providers registered on mainnet
- [x] 50+ unique wallet addresses purchasing feeds
- [x] On-chain proof of both metrics

### Stretch (PRD Goals)
- [ ] 5+ tutorials published
- [ ] LangChain integration merged
- [ ] Provider analytics dashboard live
- [ ] Weekly Stacks Forum updates

---

## Questions Before Execution

1. **Clarify with Stacks Endowment:** Definisi "external provider" — wallet independen + on-chain registration confirm?
2. **Smart contract:** Deploy v1 full staking/slashing atau soft launch tanpa staking dulu?
3. **Budget split:** Approval untuk spend ~$800 incentives?
4. **Provider outreach:** Cold outreach atau leverage existing network (DFINITY/hackathon contacts)?

---

## Current Priority: SOCIAL MEDIA TRACTION FIRST

Per user decision April 22, 2026 — fokus drive awareness dan traction via social media sebelum build provider infrastructure. Rationale: generate demand → attract providers organically → lower onboarding friction.

See: `SOCIAL-MEDIA-STRATEGY.md` (next)
