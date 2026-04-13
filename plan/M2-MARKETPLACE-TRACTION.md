# M2: Real Marketplace Traction

**Deadline:** May 22, 2026
**Installment:** $3,000 USD (in STX)
**Status:** NOT STARTED (begins after M1)

---

## Deliverable Checklist

- [ ] At least 2 external providers onboarded
- [ ] At least 50 unique agent or wallet purchases on mainnet
- [ ] Proof links and any shipped fixes from the pilot period

---

## 1. External Provider Onboarding (2+ providers)

### What Counts as "External Provider"
- A third-party (not you) who registers and publishes at least 1 paid data feed
- They set their own pricing, receive STX payments directly
- Must be on mainnet with real transactions

### Provider Onboarding System
- [ ] Build provider registration endpoint (`POST /api/providers/register`)
- [ ] Provider dashboard: view revenue, queries, agent activity
- [ ] Provider feed creation: define endpoint, pricing, metadata
- [ ] Provider documentation: "How to become a ShadowFeed provider"
- [ ] Staking mechanism via Clarity contract (optional for M2, but nice to have)

### Provider Recruitment Strategy

| Target | Type | Why | Outreach |
|--------|------|-----|----------|
| Stacks DeFi protocols | ALEX, Velar, StackingDAO | They have proprietary data, direct ecosystem alignment | Discord/Twitter DM |
| Crypto data startups | Small API providers | They want distribution + new revenue stream | Twitter, dev communities |
| AI agent builders | Developers with data tools | They can monetize their data pipelines | LangChain/CrewAI forums |
| Indonesian crypto community | Local builders | Your regional advantage | Bahasa Indonesia channels |
| Hackathon participants | Recent Stacks hackathon devs | Already in ecosystem | Discord, event followups |

### Outreach Timeline
| Week | Action |
|------|--------|
| Week 1 (Apr 23-29) | Build provider system, create onboarding docs, identify 10 targets |
| Week 2 (Apr 30-May 6) | Direct outreach to top 5 targets, help first provider onboard |
| Week 3 (May 7-13) | Onboard second provider, troubleshoot issues |
| Week 4 (May 14-20) | Ensure both providers have live feeds with transactions |

---

## 2. 50+ Unique Agent/Wallet Purchases

### Strategy: Multi-Channel Agent Acquisition

**Channel 1: Your Own Agents (10-15 unique wallets)**
- Deploy `smart-agent.ts` variants with different wallet keys
- Each agent has unique purchasing behavior
- Run on different schedules (hourly, daily, event-driven)
- Use `simulate-agents.ts` with 10+ unique wallet keys on mainnet

**Channel 2: Developer Community (15-20 unique wallets)**
- Publish tutorials: "Build an AI agent on Stacks in 5 minutes"
- Post on Stacks Forum, Discord, Twitter
- Provide testnet faucet guidance + small STX for first purchases
- Target: LangChain community, CrewAI community, AutoGPT community

**Channel 3: External Provider Agents (5-10 unique wallets)**
- Each onboarded provider will test with their own agents
- Cross-buying: providers purchase each other's feeds

**Channel 4: Wallet Users via Dashboard (10-15 unique wallets)**
- Promote Leather/Xverse wallet integration
- Create "try it" flow on dashboard for human users
- Indonesian crypto community outreach (your regional advantage)

**Channel 5: Hackathon/Bounty Program (5-10 unique wallets)**
- Small bounties for developers who make their first x402 purchase
- "First 50 agents get free STX" campaign (from grant funds)

### Purchase Tracking
- Dashboard leaderboard already shows unique agent addresses
- Export unique wallet count from SQLite `queries` table
- On-chain verification via Hiro Explorer

### Weekly Purchase Targets
| Week | Cumulative Unique Purchases | Source |
|------|---------------------------|--------|
| Week 1 | 10 | Your agents + simulation |
| Week 2 | 20 | + developer outreach |
| Week 3 | 35 | + external providers + community |
| Week 4 | 50+ | + wallet users + bounties |

---

## 3. Proof Links & Shipped Fixes

### Evidence Collection
- [ ] Spreadsheet of all mainnet TX hashes with Hiro Explorer links
- [ ] Screenshot of dashboard showing 50+ unique agents
- [ ] Provider registration TX proofs
- [ ] GitHub release/changelog of fixes shipped during pilot
- [ ] npm download stats for @shadowfeed/agent

### Common Fixes During Pilot
- Payment timeout handling improvements
- Feed error resilience (API fallbacks)
- Rate limiting adjustments
- Dashboard performance under load
- Agent SDK bug fixes from user feedback

---

## Completion Notice Template

**To:** grants@stacksendowment.co
**Subject:** ShadowFeed M2 Completion Notice

**Deliverables:**
1. External Providers: [provider names + registration TX links]
2. Unique Purchases: [dashboard screenshot + query count from DB]
3. On-chain Proofs: [list of representative TX hashes on Hiro Explorer]
4. Shipped Fixes: [GitHub changelog/release link]
5. Live Dashboard: https://shadowfeed.app
