# ShadowFeed Execution Strategy

## Priority Matrix

M1 has **9 days**. M2 has **30 days**. Strategy must be ruthlessly prioritized.

---

## M1 Strategy: Ship Fast, Prove It Works

### Principle: "Working on mainnet > perfect code"

**Priority 1 (Days 1-2): Cloudflare Setup + Mainnet Migration**
- Setup Cloudflare Workers + Pages + D1 + KV for shadowfeed.app
- Port Express.js to Hono framework (Workers-compatible)
- Migrate SQLite to D1, cache to KV
- Deploy contract v3 to mainnet
- Verify existing 3 feeds work with real STX on api.shadowfeed.app
- This is the **most critical** deliverable - everything else depends on it

**Priority 2 (Days 2-5): Build 12 New Feeds**
- Build 3-4 feeds per day (they follow the same pattern)
- Use FREE public APIs only (no paid API subscriptions yet)
- Each feed: fetch -> compute analytics -> return structured data
- Don't over-engineer: basic analytics with real data > sophisticated analytics with mocked data

**Priority 3 (Days 6-7): Agent SDK**
- Extract existing `wrapAxiosWithPayment` pattern into a clean package
- Minimum viable SDK: `discover()`, `buy(feed)`, `chain(feeds)`
- Publish to npm - even v0.1.0 counts
- 3 example agents (copy/modify from existing `client/` agents)

**Priority 4 (Days 8-9): Docs + QA + Submit**
- Write quickstart README
- Test all 15 feeds on mainnet
- Collect TX proof links
- Submit completion notice

### M1 Risk Mitigation
| Risk | Mitigation |
|------|-----------|
| Cloudflare Workers + x402-stacks incompatible | Use `nodejs_compat` flag; worst case, keep Railway as API and Cloudflare for frontend/CDN only |
| Hono port takes too long | Hono API is nearly identical to Express; most routes copy-paste with minor changes |
| Mainnet deployment fails | Keep testnet as fallback, debug with Hiro Explorer |
| API source is unreliable | Every feed has fallback data source |
| Not enough time for 12 feeds | Each feed is ~100-150 lines following same pattern |
| SDK npm publish issues | Create GitHub package as backup |

---

## M2 Strategy: Drive Real Usage

### Principle: "50 unique buyers > 50,000 lines of code"

M2 is about **traction**, not features. The code is mostly done after M1. M2 is outreach + community building.

### Week 1-2: Provider Recruitment (the hardest part)

**Who to target first:**
1. **Stacks ecosystem builders** - They're already in the ecosystem, lowest friction
   - ALEX team (DEX data), StackingDAO (staking data), Velar (DEX data)
   - Pitch: "Monetize your protocol data via x402 micropayments"
2. **Solo crypto developers** - They have data tools, need distribution
   - Find on Twitter/GitHub: people building crypto analysis tools
   - Pitch: "Turn your script into a revenue stream - 10 lines of code"
3. **Your Indonesian network** - Regional advantage
   - Indonesian crypto developer communities
   - Local hackathon contacts

**Provider onboarding must be EASY:**
- Provider signs up with Stacks wallet
- Provider deploys a simple HTTP endpoint returning JSON
- ShadowFeed wraps it with x402 payment
- Provider gets STX every time someone buys their data

### Week 2-4: Agent Acquisition (50+ unique purchases)

**Tier 1: Self-Generated (15-20 wallets)**
Not fake activity - legitimate agents with different strategies:
- Deploy 5 variations of smart-agent with unique wallets
- Run multi-agent simulation on mainnet (10 agents)
- Each buys different feeds at different intervals

**Tier 2: Developer Community (15-20 wallets)**
- Publish on Stacks Forum: "Build your first AI agent with ShadowFeed"
- Tweet thread: "How to make an AI agent that pays for data on Bitcoin L2"
- Post on r/stacks, r/cryptocurrency, dev.to
- LangChain/CrewAI community posts

**Tier 3: Direct Outreach (10-15 wallets)**
- DM builders on Stacks Discord who are building agents
- Reach out to x402 protocol users
- Contact AI agent hackathon participants
- Indonesian crypto developer network

**Small STX Incentive Program:**
- Allocate ~$100 worth of STX from grant for "first purchase" incentives
- "Make your first x402 purchase, get 1 STX back" (limited to 50 wallets)
- Creates organic transaction history on mainnet

---

## Content Strategy (runs parallel through M1 & M2)

### Must-Ship Content

| Content | Platform | When | Purpose |
|---------|----------|------|---------|
| "ShadowFeed is live on mainnet" | Twitter thread | After M1 | Announce mainnet launch |
| "Build an AI agent on Stacks in 5 min" | Stacks Forum + dev.to | Week 1 of M2 | Drive SDK installs |
| "How x402 micropayments work" | Blog/Medium | Week 2 of M2 | Educate developers |
| Provider onboarding guide | GitHub + docs | Week 1 of M2 | Recruit providers |
| Demo video (from VIDEO-SCRIPT.md) | Twitter + YouTube | After M1 | Visual proof |

---

## Evidence Collection Strategy

Start collecting evidence from Day 1, not at the end.

### For M1 Completion Notice:
- [ ] Mainnet contract deployment TX link
- [ ] 3+ mainnet payment TX links (original feeds)
- [x] 16 feeds live on api.shadowfeed.app (verified via /registry/feeds)
- [ ] Screenshot of all 16 feeds in dashboard
- [ ] npm package URL (@shadowfeed/agent)
- [ ] Agent SDK README with quickstart
- [ ] Example agents running successfully

### For M2 Completion Notice:
- [ ] Provider registration proofs (2+ external)
- [ ] Dashboard screenshot showing 50+ unique agents
- [ ] SQL query export: `SELECT COUNT(DISTINCT agent_address) FROM queries`
- [ ] GitHub releases/changelog of fixes
- [ ] Representative TX hashes on Hiro Explorer
- [ ] npm download stats

---

## Budget Allocation (Revised for Contract)

Total: $5,000 (not $4,500 as originally proposed)

| Category | Amount | Purpose |
|----------|--------|---------|
| Nansen Credits | $10-20 | $10 = 10K credits, lasts 4+ months with caching |
| Cloudflare (Workers Paid) | $60 | $5/mo Workers Paid plan (12 months) |
| Domain (shadowfeed.app) | $0 | Already purchased |
| API Subscriptions | $200 | GitHub Pro, misc API keys |
| Agent Incentives | $100 | STX for "first purchase" program |
| Content/Marketing | $200 | Tutorials, video production |
| Community | $200 | Hackathon entry, meetup costs |
| Reserve/Personal | $4,210-4,230 | Development time compensation |

> Nansen credits extremely cheap ($10/10K). With caching, cost is ~$2.25/mo. Revenue from Nansen feeds at 0.02 STX easily covers cost 30x over.

---

## Communication Plan

| When | What | To Whom |
|------|------|---------|
| Apr 22 | M1 Completion Notice | grants@stacksendowment.co |
| Weekly | Progress update | Stacks Forum post |
| May 22 | M2 Completion Notice | grants@stacksendowment.co |
| Ongoing | Development updates | Twitter (@cryptoeights) |

---

## Decision Framework

When in doubt during execution, ask:

1. **Does this help hit M1 by April 22?** If no, defer it.
2. **Does this generate a verifiable on-chain transaction?** If yes, prioritize it.
3. **Does this help reach 50 unique purchases?** If yes, do it.
4. **Is this feature necessary or nice-to-have?** If nice-to-have, skip it.
5. **Can I prove this to Stacks with a link?** If no, rethink the approach.
