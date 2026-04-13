# ShadowFeed Grant Execution Plan

## Contract Summary

| Field | Value |
|-------|-------|
| Grant Provider | Stacks Endowment |
| Recipient | Pebri Ansyah |
| Total Grant | $5,000 USD (paid in STX) |
| Contract Date | April 7, 2026 |
| Upfront Award | $500 (due April 15, 2026) |
| Wallet | SP1RJRFTBGX1G5360F0EJWN86G299HP7Z6MAMP7D9 |
| Contact | grants@stacksendowment.co |

---

## Milestones Overview

### M1: Mainnet Migration & Product Expansion
- **Installment:** $1,500
- **Deadline:** April 22, 2026 (9 days from today)
- **Deliverables:**
  1. Marketplace migrated to mainnet
  2. Current 3 feeds live on mainnet (whale-alerts, btc-sentiment, defi-scores)
  3. Real STX payments settling on-chain
  4. Expansion to at least 15 live feeds (+12 new feeds)
  5. Agent SDK, discovery tooling, docs, and example agents published

### M2: Real Marketplace Traction
- **Installment:** $3,000
- **Deadline:** May 22, 2026
- **Deliverables:**
  1. At least 2 external providers onboarded
  2. At least 50 unique agent or wallet purchases on mainnet
  3. Proof links and any shipped fixes from the pilot period

---

## Submission Process (per contract Clause 3.4)

For each milestone:
1. Submit **Completion Notice** with all deliverables + supporting evidence
2. Stacks has 15 business days to confirm or reject
3. If rejected, 10 business days to fix and resubmit
4. Payment within 15 days of milestone completion confirmation
5. STX amount = USD value / CoinGecko spot rate at payment date

---

## Critical Path

```
TODAY (Apr 13) -----> M1 (Apr 22) --------------------------> M2 (May 22)
     |                    |                                       |
     |  9 DAYS            |  30 DAYS                              |
     |                    |                                       |
     v                    v                                       v
  - Cloudflare setup   SUBMIT:                                 SUBMIT:
  - shadowfeed.app     - Mainnet TX proofs                     - 50+ unique purchases
  - Port to Hono/D1    - 15 feeds on api.shadowfeed.app        - 2+ external providers  
  - 12 new feeds       - SDK on npm                            - Fix log & proof links
  - Deploy contract    - Dashboard on shadowfeed.app
```

---

## Daily Sprint Plan (M1: Apr 13-22)

| Day | Date | Focus | Output | Status |
|-----|------|-------|--------|--------|
| 1 | Apr 13 | Setup Cloudflare project (Workers + Pages + D1 + KV), shadowfeed.app DNS | Cloudflare infra ready, api.shadowfeed.app live | ✅ DONE |
| 1 | Apr 13 | Port Express to Hono (Workers), migrate SQLite to D1, deploy 3 feeds | 3 feeds live on Cloudflare Workers | ✅ DONE |
| 1 | Apr 13 | Build all 13 new feeds (5 Nansen + 8 free API), integrate into index.ts | 16 feeds live on api.shadowfeed.app | ✅ DONE |
| 2 | Apr 14 | Deploy dashboard to Cloudflare Pages (shadowfeed.app) | Dashboard live | ⬜ TODO |
| 1 | Apr 13 | Mainnet migration: deploy contract, set secrets, switch NETWORK | Mainnet payments working | ✅ DONE |
| 1 | Apr 13 | Test real STX mainnet payments E2E (Hyre Agent: 10+ TXs) | Mainnet TX proofs | ✅ DONE |
| 5 | Apr 17 | Build Agent SDK (@shadowfeed/agent), publish to npm | SDK on npm | ⬜ TODO |
| 6 | Apr 18 | Feed discovery API, example agents, update dashboard for 16 feeds | Discovery + examples | ⬜ TODO |
| 7 | Apr 19 | Write docs, quickstart guide, API docs | Documentation | ⬜ TODO |
| 8 | Apr 20 | QA all feeds on mainnet, collect TX proofs | Evidence ready | ⬜ TODO |
| 9 | Apr 21 | Final testing, buffer day | Everything verified | ⬜ TODO |
| 10 | Apr 22 | Submit M1 completion notice to Stacks | M1 SUBMITTED | ⬜ TODO |

## Weekly Sprint Plan (M2: Apr 23 - May 22)

| Week | Dates | Focus | Output |
|------|-------|-------|--------|
| 1 | Apr 23-29 | Provider onboarding system, outreach to providers | Provider registration flow |
| 2 | Apr 30-May 6 | Onboard 2+ external providers, help them deploy feeds | 2+ providers live |
| 3 | May 7-13 | Drive agent adoption: tutorials, framework integrations | Growing purchases |
| 4 | May 14-20 | Hit 50+ unique purchases, bug fixes, collect proof | 50+ unique addresses |
| 5 | May 21-22 | Compile evidence, submit M2 completion notice | M2 SUBMITTED |
