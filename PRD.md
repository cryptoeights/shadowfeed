# Product Requirements Document (PRD)
# ShadowFeed — Decentralized Data Marketplace for AI Agents

**Version:** 1.0
**Date:** March 2, 2026
**Author:** Pebriansyah
**Status:** Draft

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Product Vision & Goals](#3-product-vision--goals)
4. [Current State (MVP)](#4-current-state-mvp)
5. [Target State (Post-Grant)](#5-target-state-post-grant)
6. [Feature Specifications](#6-feature-specifications)
   - 6.1 [Mainnet Migration & Security](#61-mainnet-migration--security)
   - 6.2 [Data Feed Expansion](#62-data-feed-expansion)
   - 6.3 [Open Provider Marketplace](#63-open-provider-marketplace)
   - 6.4 [Agent SDK](#64-agent-sdk-shadowfeedagent)
   - 6.5 [Community & Ecosystem Integration](#65-community--ecosystem-integration)
7. [Technical Architecture](#7-technical-architecture)
8. [API Specifications](#8-api-specifications)
9. [Database Schema Changes](#9-database-schema-changes)
10. [Smart Contract Updates](#10-smart-contract-updates)
11. [Success Metrics & KPIs](#11-success-metrics--kpis)
12. [Timeline & Milestones](#12-timeline--milestones)
13. [Risks & Mitigations](#13-risks--mitigations)
14. [Out of Scope](#14-out-of-scope)

---

## 1. Executive Summary

ShadowFeed is the first decentralized data marketplace where AI agents autonomously purchase real-time crypto intelligence via x402 micropayments on Stacks (Bitcoin L2). This PRD defines the requirements to evolve ShadowFeed from a working testnet MVP (3 feeds, 20+ agents) to a production-ready mainnet marketplace (15+ feeds, open provider marketplace, published SDK).

**Grant Budget:** $4,500 USD (in STX)
**Duration:** 8 weeks
**Key Outcome:** Any AI developer can `npm install @shadowfeed/agent` and have their agent purchasing data autonomously within 5 minutes.

---

## 2. Problem Statement

### The Gap
AI agents are the fastest-growing consumer of real-time data (200M+ agents projected by 2030, $47B market), yet **no existing data provider supports autonomous agents**:

| Provider | Monthly Cost | Agent-Compatible? | Why Not |
|----------|-------------|-------------------|---------|
| CoinGecko Pro | $129/mo | No | Requires human signup, credit card, KYC |
| Nansen | $150/mo | No | Requires human signup, credit card, KYC |
| Arkham | $300/mo | No | Requires human signup, credit card, KYC |
| **ShadowFeed** | **$0.003-0.02/query** | **Yes** | **HTTP-native payment via x402** |

### The Stacks Opportunity
- x402 protocol exists on Stacks but has **no production marketplace** demonstrating its value
- Without real applications, x402 remains a protocol without adoption
- ShadowFeed gives x402 its killer use case and drives STX transaction volume

---

## 3. Product Vision & Goals

### Vision
ShadowFeed becomes the one-stop data layer that every AI agent on Stacks relies on for autonomous decision-making — settled in STX on Bitcoin L2.

### Goals (End of Grant)

| # | Goal | Metric |
|---|------|--------|
| G1 | Live on Stacks mainnet | Real STX payments working |
| G2 | 15+ data feeds | Expanded from 3 → 15+ |
| G3 | 50+ active agents | Unique wallet addresses transacting |
| G4 | 2,000+ monthly STX transactions | Consistent micropayment volume |
| G5 | Open marketplace | 2+ third-party providers registered |
| G6 | Published SDK | @shadowfeed/agent on npm |
| G7 | x402 protocol validated | Production-scale proof |

---

## 4. Current State (MVP)

### What's Built

**Server (`src/server.ts`)**
- Express.js with embedded x402 facilitator
- 3 paid data feeds with x402 payment middleware
- Free discovery endpoints (`/registry/feeds`, `/stats`, `/activity`, `/leaderboard`)
- Demo mode for testing without real payments
- Wallet purchase endpoint for browser transactions

**Data Feeds (`src/feeds/`)**
| Feed | Price | Real Data Sources | File |
|------|-------|-------------------|------|
| Whale Alerts | 0.005 STX | CoinGecko, Blockchain.info | `whale-alerts.ts` |
| BTC Sentiment | 0.003 STX | Alternative.me, CoinGecko | `btc-sentiment.ts` |
| DeFi Scores | 0.01 STX | DeFiLlama | `defi-scores.ts` |

**Smart Contract (`contracts/`)**
- v3 deployed on testnet (registry only, no staking)
- v1 has full staking/slashing logic (not deployed)

**Agent Clients (`client/`)**
- `smart-agent.ts` — Conditional purchasing logic
- `simulate-agents.ts` — 10-agent simulation
- `agent-demo.ts` — Basic demo agent

**Dashboard (`public/index.html`)**
- 3D particle background with animations
- Feed discovery, live activity feed, agent leaderboard
- Leather/Xverse wallet connect
- Light theme with orange/amber brand colors

**Database (`src/db.ts`)**
- SQLite with WAL mode
- Tables: `queries`, `feed_stats`
- Query tracking, analytics, leaderboard data

**Infrastructure**
- Deployed on Railway: https://shadowfeed-production.up.railway.app
- Stacks testnet integration
- 20+ verified on-chain transactions

---

## 5. Target State (Post-Grant)

```
┌─────────────────────────────────────────────────────────────┐
│                    ShadowFeed v2 (Mainnet)                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  15+ Data    │  │    Open      │  │   Agent SDK  │      │
│  │   Feeds      │  │  Marketplace │  │  (npm pkg)   │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                  │              │
│  ┌──────┴─────────────────┴──────────────────┴───────┐      │
│  │              x402 Payment Layer (Mainnet)          │      │
│  └──────────────────────┬────────────────────────────┘      │
│                         │                                   │
│  ┌──────────────────────┴────────────────────────────┐      │
│  │        Clarity Smart Contract v2 (Mainnet)         │      │
│  │   Provider Registry | Staking | Slashing | Fees    │      │
│  └──────────────────────┬────────────────────────────┘      │
│                         │                                   │
│  ┌──────────────────────┴────────────────────────────┐      │
│  │              Stacks Blockchain (Bitcoin L2)         │      │
│  └────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. Feature Specifications

---

### 6.1 Mainnet Migration & Security

**Priority:** P0 (Critical — prerequisite for all other features)
**Budget:** $900 (20%)
**Timeline:** Week 1–3

#### 6.1.1 Network Migration

**Requirements:**

| ID | Requirement | Details |
|----|-------------|---------|
| M-01 | Switch network config from testnet to mainnet | Update `NETWORK=mainnet` in env, update `@stacks/network` configuration |
| M-02 | Deploy Clarity smart contract v2 on mainnet | Use `shadowfeed-registry.clar` (v1) with staking/slashing as base |
| M-03 | Update x402 facilitator for mainnet | Change facilitator to verify mainnet transactions |
| M-04 | Update all Hiro Explorer links in dashboard | Mainnet chain parameter |
| M-05 | Fund server wallet with mainnet STX | For gas fees and initial operations |

**Implementation Details:**

```
Files to modify:
├── src/server.ts          → Network config, facilitator URL
├── src/facilitator.ts     → Mainnet verification
├── .env                   → NETWORK=mainnet, new keys
├── scripts/deploy-contract.ts → Mainnet deployment
└── public/index.html      → Explorer links
```

**Acceptance Criteria:**
- [ ] Server responds to requests on mainnet
- [ ] x402 payments verified and settled on mainnet
- [ ] Smart contract deployed and accessible on mainnet Hiro Explorer
- [ ] Dashboard links point to mainnet explorer

#### 6.1.2 Security Audit

**Requirements:**

| ID | Requirement | Details |
|----|-------------|---------|
| S-01 | Audit Clarity smart contract | Focus on staking, slashing, fee distribution logic |
| S-02 | Audit x402 payment verification | Ensure no double-spend, replay, or bypass attacks |
| S-03 | Audit server authentication flow | Prevent unauthorized data access |
| S-04 | Input validation on all endpoints | Sanitize query params, prevent injection |
| S-05 | Rate limiting | Prevent abuse of free endpoints |
| S-06 | Publish audit report | Document findings and remediations |

**Security Checklist:**
- [ ] No private keys in source code or logs
- [ ] Wallet private keys stored securely in environment variables
- [ ] x402 payment cannot be replayed
- [ ] x402 payment cannot be bypassed
- [ ] Smart contract staking cannot be drained
- [ ] Slashing can only be executed by authorized admin
- [ ] Rate limiting on `/registry/feeds`, `/activity`, `/leaderboard`
- [ ] CORS configured for production domain only

#### 6.1.3 Production Infrastructure

**Requirements:**

| ID | Requirement | Details |
|----|-------------|---------|
| I-01 | Dedicated Railway Pro instance | Higher uptime SLA, more resources |
| I-02 | Health monitoring & alerting | Uptime checks, error rate alerts |
| I-03 | Database backup strategy | Automated SQLite backup (daily) |
| I-04 | Logging infrastructure | Structured logs for debugging |
| I-05 | Load testing | Verify 100+ concurrent agent queries |
| I-06 | Failover strategy | Graceful degradation when APIs are down |

**Acceptance Criteria:**
- [ ] 99%+ uptime over 7-day test period
- [ ] Alerting configured for downtime and error spikes
- [ ] Database backups automated
- [ ] Load test report: handles 100 concurrent requests

---

### 6.2 Data Feed Expansion

**Priority:** P0 (Core value proposition)
**Budget:** $1,350 (30%)
**Timeline:** Week 3–5

#### Feed Architecture Pattern

Every feed follows the same pattern as existing feeds in `src/feeds/`:

```typescript
// src/feeds/{feed-name}.ts

interface FeedResponse {
  data: any;                    // Feed-specific data structure
  metadata: {
    feed_id: string;
    generated_at: number;       // Unix timestamp
    data_source: string;        // Attribution
    methodology: string;        // How data was computed
    cache_ttl: number;          // Seconds until stale
  };
}

export async function get{FeedName}Data(): Promise<FeedResponse> {
  // 1. Fetch from real API(s) with caching
  // 2. Compute analytics / enrichment
  // 3. Return structured response
}
```

**Server Registration Pattern** (in `src/server.ts`):

```typescript
// Each feed gets:
// 1. Paid endpoint: GET /feeds/{feed-id} (x402 protected)
// 2. Demo endpoint: GET /demo/feeds/{feed-id} (free, when DEMO_MODE=true)
// 3. Registry entry in /registry/feeds
```

#### 6.2.1 Feed Specifications

---

##### Feed 1: Social Sentiment Analysis

| Field | Value |
|-------|-------|
| **Feed ID** | `social-sentiment` |
| **Price** | 0.005 STX |
| **Category** | Sentiment |
| **File** | `src/feeds/social-sentiment.ts` |
| **Data Sources** | LunarCrush API, Twitter/X API (or alternative), Reddit API |
| **Cache TTL** | 300s (5 min) |

**Response Schema:**
```typescript
{
  tokens: [{
    symbol: string;              // "BTC", "STX", "ETH"
    social_volume_24h: number;   // Total mentions
    social_score: number;        // 0-100 computed score
    sentiment_breakdown: {
      positive: number;          // percentage
      negative: number;
      neutral: number;
    };
    trending_topics: string[];   // Top 5 topics
    influencer_mentions: number; // High-follower accounts
    viral_content_count: number; // Posts with 1000+ engagement
  }];
  overall_market_mood: string;   // "bullish" | "bearish" | "neutral" | "mixed"
  social_dominance: {            // Which token dominates social
    leader: string;
    share: number;               // percentage
  };
}
```

**Computed Analytics:**
- Social score = weighted combination of volume, sentiment ratio, influencer activity
- Market mood = aggregate across all tracked tokens
- Social dominance = relative share of social conversation

---

##### Feed 2: Smart Money Tracker

| Field | Value |
|-------|-------|
| **Feed ID** | `smart-money` |
| **Price** | 0.008 STX |
| **Category** | On-chain |
| **File** | `src/feeds/smart-money.ts` |
| **Data Sources** | Arkham API (or alternative), Etherscan API, Blockchain.info |
| **Cache TTL** | 120s (2 min) |

**Response Schema:**
```typescript
{
  tracked_wallets: [{
    label: string;               // "Binance Cold Wallet", "Jump Trading"
    address: string;
    category: string;            // "exchange" | "fund" | "whale" | "institution"
    recent_activity: [{
      type: string;              // "accumulation" | "distribution" | "transfer"
      token: string;
      amount_usd: number;
      timestamp: number;
      tx_hash: string;
    }];
    net_flow_24h_usd: number;   // positive = accumulating
    conviction_score: number;    // 0-100
  }];
  aggregate: {
    smart_money_sentiment: string;  // "accumulating" | "distributing" | "neutral"
    total_inflow_usd_24h: number;
    total_outflow_usd_24h: number;
    top_accumulated_tokens: string[];
    top_distributed_tokens: string[];
  };
}
```

**Computed Analytics:**
- Conviction score = consistency of accumulation/distribution over 7d/30d
- Smart money sentiment = net flow direction across tracked wallets
- Signal strength = volume × conviction × historical accuracy

---

##### Feed 3: Liquidation Alerts

| Field | Value |
|-------|-------|
| **Feed ID** | `liquidation-alerts` |
| **Price** | 0.005 STX |
| **Category** | Trading |
| **File** | `src/feeds/liquidation-alerts.ts` |
| **Data Sources** | CoinGlass API, Binance Futures API, Bybit API |
| **Cache TTL** | 60s (1 min) |

**Response Schema:**
```typescript
{
  recent_liquidations: [{
    exchange: string;            // "Binance", "Bybit", "OKX"
    symbol: string;              // "BTC/USDT"
    side: string;                // "long" | "short"
    amount_usd: number;
    price: number;
    timestamp: number;
  }];
  summary_24h: {
    total_liquidated_usd: number;
    long_liquidated_usd: number;
    short_liquidated_usd: number;
    long_short_ratio: number;    // >1 = more longs liquidated
    largest_single_liquidation: {
      amount_usd: number;
      symbol: string;
      exchange: string;
    };
  };
  risk_zones: [{
    symbol: string;
    price_level: number;
    estimated_liquidation_usd: number;
    direction: string;           // "above" | "below"
    risk_level: string;          // "low" | "medium" | "high" | "extreme"
  }];
  market_impact: string;         // "overleveraged_longs" | "overleveraged_shorts" | "balanced"
}
```

**Computed Analytics:**
- Risk zones = price levels with concentrated liquidation clusters
- Market impact = overall leverage sentiment
- Cascade risk = probability of liquidation cascade

---

##### Feed 4: Gas & Fee Prediction

| Field | Value |
|-------|-------|
| **Feed ID** | `gas-prediction` |
| **Price** | 0.003 STX |
| **Category** | Infrastructure |
| **File** | `src/feeds/gas-prediction.ts` |
| **Data Sources** | Etherscan Gas API, Blocknative API, Stacks API (Hiro) |
| **Cache TTL** | 30s |

**Response Schema:**
```typescript
{
  ethereum: {
    current_gwei: number;
    predictions: {
      next_block: { low: number; medium: number; high: number };
      in_5_min: { low: number; medium: number; high: number };
      in_30_min: { low: number; medium: number; high: number };
    };
    trend: string;               // "rising" | "falling" | "stable"
    congestion_level: string;    // "low" | "moderate" | "high" | "extreme"
  };
  stacks: {
    current_fee_rate: number;    // microSTX
    estimated_confirmation_time: number; // seconds
    mempool_size: number;
    trend: string;
  };
  bitcoin: {
    current_sat_per_vbyte: number;
    estimated_confirmation: {
      next_block: number;
      in_1_hour: number;
      in_6_hours: number;
    };
  };
  recommendation: string;       // "transact_now" | "wait" | "urgent_only"
}
```

---

##### Feed 5: Token Launch Intelligence

| Field | Value |
|-------|-------|
| **Feed ID** | `token-launches` |
| **Price** | 0.008 STX |
| **Category** | Alpha |
| **File** | `src/feeds/token-launches.ts` |
| **Data Sources** | CoinGecko (new listings), DEXScreener API, GeckoTerminal API |
| **Cache TTL** | 300s (5 min) |

**Response Schema:**
```typescript
{
  new_listings: [{
    name: string;
    symbol: string;
    chain: string;
    launch_date: number;
    initial_price: number;
    current_price: number;
    price_change_since_launch: number;  // percentage
    liquidity_usd: number;
    volume_24h_usd: number;
    holder_count: number;
    contract_verified: boolean;
    risk_flags: string[];        // "low_liquidity", "concentrated_holders", etc.
  }];
  upcoming: [{
    name: string;
    symbol: string;
    chain: string;
    expected_date: number;
    category: string;            // "DeFi", "GameFi", "AI", "Meme"
    fundraise_usd: number;
    backers: string[];
  }];
  market_summary: {
    total_launches_7d: number;
    avg_first_day_return: number;
    survival_rate_30d: number;   // % still trading above launch price
    hottest_chain: string;
  };
}
```

---

##### Feed 6: Exchange Order Flow

| Field | Value |
|-------|-------|
| **Feed ID** | `exchange-flow` |
| **Price** | 0.01 STX |
| **Category** | Trading |
| **File** | `src/feeds/exchange-flow.ts` |
| **Data Sources** | CryptoQuant API, Glassnode API (or alternatives), CoinGlass |
| **Cache TTL** | 120s (2 min) |

**Response Schema:**
```typescript
{
  exchange_netflow: [{
    exchange: string;
    token: string;
    inflow_24h_usd: number;
    outflow_24h_usd: number;
    netflow_24h_usd: number;     // negative = outflow (bullish)
    netflow_7d_usd: number;
    reserve_change_pct: number;
  }];
  aggregate: {
    total_exchange_reserve_btc: number;
    reserve_change_24h_pct: number;
    signal: string;              // "accumulation" | "distribution" | "neutral"
    confidence: number;          // 0-100
  };
  open_interest: {
    total_oi_usd: number;
    oi_change_24h_pct: number;
    funding_rate: number;
    long_short_ratio: number;
  };
}
```

---

##### Feed 7: Governance Signals

| Field | Value |
|-------|-------|
| **Feed ID** | `governance-signals` |
| **Price** | 0.005 STX |
| **Category** | Governance |
| **File** | `src/feeds/governance-signals.ts` |
| **Data Sources** | Snapshot API, Tally API, Stacks on-chain governance |
| **Cache TTL** | 600s (10 min) |

**Response Schema:**
```typescript
{
  active_proposals: [{
    protocol: string;
    title: string;
    summary: string;
    status: string;              // "active" | "pending" | "passed" | "defeated"
    votes_for: number;
    votes_against: number;
    quorum_reached: boolean;
    end_date: number;
    potential_impact: string;    // "high" | "medium" | "low"
    impact_description: string;
    url: string;
  }];
  stacks_governance: {
    active_sips: number;         // Stacks Improvement Proposals
    recent_votes: [{
      sip_number: number;
      title: string;
      status: string;
    }];
  };
  summary: {
    total_active_proposals: number;
    high_impact_count: number;
    protocols_with_votes: string[];
  };
}
```

---

##### Feed 8: Stablecoin Flows

| Field | Value |
|-------|-------|
| **Feed ID** | `stablecoin-flows` |
| **Price** | 0.005 STX |
| **Category** | On-chain |
| **File** | `src/feeds/stablecoin-flows.ts` |
| **Data Sources** | DeFiLlama Stablecoins API, CoinGecko |
| **Cache TTL** | 300s (5 min) |

**Response Schema:**
```typescript
{
  stablecoins: [{
    name: string;                // "USDT", "USDC", "DAI"
    market_cap: number;
    market_cap_change_24h: number;
    market_cap_change_7d: number;
    dominant_chain: string;
    peg_deviation: number;       // deviation from $1.00
    peg_status: string;          // "stable" | "minor_depeg" | "major_depeg"
  }];
  aggregate: {
    total_stablecoin_mcap: number;
    mcap_change_24h: number;
    mcap_change_7d: number;
    net_minting_24h: number;     // positive = new stablecoins minted
    signal: string;              // "capital_inflow" | "capital_outflow" | "neutral"
  };
  market_implication: string;    // Analysis of what stablecoin flows suggest
}
```

---

##### Feed 9: Security & Exploit Alerts

| Field | Value |
|-------|-------|
| **Feed ID** | `security-alerts` |
| **Price** | 0.005 STX |
| **Category** | Security |
| **File** | `src/feeds/security-alerts.ts` |
| **Data Sources** | DeFiLlama Hacks API, Rekt News API, SlowMist API |
| **Cache TTL** | 600s (10 min) |

**Response Schema:**
```typescript
{
  recent_exploits: [{
    protocol: string;
    chain: string;
    date: number;
    amount_lost_usd: number;
    attack_type: string;         // "flash_loan" | "reentrancy" | "oracle" | "rug_pull" | "bridge"
    description: string;
    funds_recovered_usd: number;
    status: string;              // "ongoing" | "resolved" | "investigating"
  }];
  risk_assessment: {
    high_risk_protocols: [{
      protocol: string;
      risk_factors: string[];    // "unaudited", "admin_keys", "low_tvl", etc.
      risk_score: number;        // 0-100
    }];
    ecosystem_risk_level: string;  // "low" | "elevated" | "high" | "critical"
  };
  stats_30d: {
    total_hacks: number;
    total_lost_usd: number;
    total_recovered_usd: number;
    most_common_attack: string;
  };
}
```

---

##### Feed 10: Developer Activity Metrics

| Field | Value |
|-------|-------|
| **Feed ID** | `dev-activity` |
| **Price** | 0.005 STX |
| **Category** | Fundamentals |
| **File** | `src/feeds/dev-activity.ts` |
| **Data Sources** | GitHub API (public repos), Electric Capital data, Stacks GitHub orgs |
| **Cache TTL** | 3600s (1 hour) |

**Response Schema:**
```typescript
{
  ecosystems: [{
    name: string;                // "Stacks", "Ethereum", "Solana"
    active_devs_30d: number;
    commits_30d: number;
    repos_with_activity: number;
    dev_growth_pct: number;      // month-over-month
    top_repos: [{
      name: string;
      stars: number;
      commits_30d: number;
      contributors: number;
    }];
  }];
  stacks_deep_dive: {
    total_clarity_contracts: number;
    new_contracts_30d: number;
    top_projects: string[];
    ecosystem_health: string;    // "growing" | "stable" | "declining"
  };
  signal: string;                // Summary for agent decision-making
}
```

---

##### Feed 11: Cross-chain Bridge Flows

| Field | Value |
|-------|-------|
| **Feed ID** | `bridge-flows` |
| **Price** | 0.008 STX |
| **Category** | On-chain |
| **File** | `src/feeds/bridge-flows.ts` |
| **Data Sources** | DeFiLlama Bridges API, L2Beat API |
| **Cache TTL** | 300s (5 min) |

**Response Schema:**
```typescript
{
  bridges: [{
    name: string;                // "Wormhole", "LayerZero", "sBTC"
    volume_24h_usd: number;
    volume_7d_usd: number;
    volume_change_pct: number;
    top_routes: [{
      from_chain: string;
      to_chain: string;
      volume_24h_usd: number;
    }];
    tvl_usd: number;
  }];
  chain_flows: [{
    chain: string;
    net_inflow_24h_usd: number;  // positive = capital flowing in
    net_inflow_7d_usd: number;
    signal: string;              // "attracting_capital" | "losing_capital" | "neutral"
  }];
  stacks_bridge: {
    sbtc_tvl: number;
    sbtc_volume_24h: number;
    btc_locked: number;
  };
}
```

---

##### Feed 12: NFT Market Intelligence

| Field | Value |
|-------|-------|
| **Feed ID** | `nft-intelligence` |
| **Price** | 0.005 STX |
| **Category** | NFT |
| **File** | `src/feeds/nft-intelligence.ts` |
| **Data Sources** | OpenSea API, Reservoir API, Gamma.io API (Stacks NFTs) |
| **Cache TTL** | 300s (5 min) |

**Response Schema:**
```typescript
{
  top_collections: [{
    name: string;
    chain: string;
    floor_price: number;
    floor_change_24h_pct: number;
    volume_24h: number;
    sales_count_24h: number;
    unique_holders: number;
    listed_ratio: number;        // % of supply listed (high = bearish)
  }];
  market_overview: {
    total_volume_24h_usd: number;
    total_volume_change_pct: number;
    trending_collections: string[];
    whale_purchases: [{
      collection: string;
      buyer: string;
      amount_usd: number;
    }];
  };
  stacks_nfts: {
    top_collections: string[];
    total_volume_24h_stx: number;
    marketplace: string;         // "Gamma.io"
  };
  market_sentiment: string;      // "hot" | "cooling" | "cold" | "recovering"
}
```

---

#### 6.2.2 Feed Registration in Server

Each new feed must be registered in `src/server.ts`:

```typescript
// 1. Import feed function
import { getSocialSentimentData } from './feeds/social-sentiment';

// 2. Add to FEEDS config
const FEEDS = {
  // ... existing feeds
  'social-sentiment': {
    name: 'Social Sentiment Analysis',
    description: 'Real-time social media sentiment for crypto tokens',
    category: 'Sentiment',
    price: 5000,  // 0.005 STX in microSTX
    getData: getSocialSentimentData,
  },
};

// 3. x402 middleware automatically applies based on price
// 4. Demo endpoint auto-generated when DEMO_MODE=true
```

#### 6.2.3 Feed Quality Requirements

Every feed MUST:
- [ ] Fetch real data from at least 1 production API (not mocked)
- [ ] Include computed analytics beyond raw API data
- [ ] Have a response time < 3 seconds (p95)
- [ ] Handle API failures gracefully with cached fallback
- [ ] Include `data_source` attribution in response
- [ ] Include `methodology` explaining computed scores
- [ ] Be registered in `/registry/feeds` with accurate metadata
- [ ] Have at least 1 cache layer to reduce API calls

---

### 6.3 Open Provider Marketplace

**Priority:** P1 (High — enables ecosystem growth)
**Budget:** $900 (20%)
**Timeline:** Week 5–7

#### 6.3.1 Provider Registration System

**New Endpoints:**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/providers/register` | STX signature | Register as data provider |
| GET | `/providers` | Public | List all registered providers |
| GET | `/providers/:address` | Public | Provider profile & stats |
| POST | `/providers/:address/feeds` | STX signature | Register a new feed |
| PUT | `/providers/:address/feeds/:feedId` | STX signature | Update feed config |
| DELETE | `/providers/:address/feeds/:feedId` | STX signature | Deactivate feed |
| GET | `/providers/:address/analytics` | Provider only | Revenue & query analytics |

**Provider Registration Flow:**

```
1. Provider calls POST /providers/register with:
   - address: STX address
   - name: Display name
   - description: Provider description
   - website: Optional URL
   - signature: Signed message proving address ownership

2. Server verifies signature and creates provider record

3. Provider stakes minimum STX via Clarity contract:
   - Calls (contract-call? .shadowfeed-registry register-provider)
   - Minimum stake: 50 STX (configurable)

4. Provider is now active and can register feeds

5. Provider registers feed via POST /providers/:address/feeds:
   - feed_id: Unique identifier
   - name: Display name
   - description: What the feed provides
   - category: Feed category
   - price_microstx: Price per query
   - endpoint_url: Provider's data endpoint URL
   - sample_response: Example response structure
```

**New Files:**

```
src/
├── providers/
│   ├── provider-manager.ts      # Provider CRUD operations
│   ├── provider-auth.ts         # STX signature verification
│   ├── provider-proxy.ts        # Proxy requests to provider endpoints
│   └── provider-analytics.ts    # Revenue & query tracking
```

#### 6.3.2 Provider Proxy System

When an agent queries a third-party provider's feed:

```
Agent → ShadowFeed Server → x402 Payment → Provider's Endpoint → Data → Agent
         (payment)          (verification)   (data fetch)       (response)
```

```typescript
// Provider proxy flow
async function proxyProviderFeed(req, res) {
  // 1. x402 payment verified by middleware (agent pays ShadowFeed)
  // 2. ShadowFeed takes facilitator fee (1-3%)
  // 3. ShadowFeed forwards remaining STX to provider
  // 4. ShadowFeed proxies data request to provider endpoint
  // 5. ShadowFeed validates response quality
  // 6. ShadowFeed returns data to agent
  // 7. ShadowFeed logs query for analytics
}
```

#### 6.3.3 Provider Analytics Dashboard

**New Dashboard Section** (in `public/index.html` or new page):

- Total revenue earned (STX)
- Query count by feed (hourly, daily, weekly)
- Unique agents per feed
- Average response time
- Error rate
- Revenue chart over time
- Top-performing feeds
- Agent retention (repeat queries)

**Database Schema Updates:**
```sql
CREATE TABLE providers (
  address TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  website TEXT,
  stake_amount INTEGER DEFAULT 0,
  total_revenue INTEGER DEFAULT 0,
  total_queries INTEGER DEFAULT 0,
  reputation_score INTEGER DEFAULT 50,
  is_active BOOLEAN DEFAULT 1,
  registered_at INTEGER NOT NULL
);

CREATE TABLE provider_feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_address TEXT NOT NULL,
  feed_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  price_microstx INTEGER NOT NULL,
  endpoint_url TEXT NOT NULL,
  total_queries INTEGER DEFAULT 0,
  total_errors INTEGER DEFAULT 0,
  avg_response_ms REAL DEFAULT 0,
  is_active BOOLEAN DEFAULT 1,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (provider_address) REFERENCES providers(address)
);
```

#### 6.3.4 Staking & Slashing Mechanism

**Clarity Contract Requirements** (upgrade from v3 to v2/v1):

| Function | Description |
|----------|-------------|
| `register-provider` | Register with minimum 50 STX stake |
| `increase-stake` | Add more STX to stake |
| `register-feed` | Register a feed under provider |
| `record-query` | Log query with fee distribution |
| `slash-provider` | Admin: reduce stake for bad data |
| `withdraw-stake` | Withdraw after cooldown period (7 days) |
| `get-provider-info` | Read provider profile |
| `get-feed-info` | Read feed details |

**Fee Distribution per Query:**
```
Agent pays: X microSTX
├── Provider receives: X * 0.97 (97%)
└── Protocol fee: X * 0.03 (3%) → protocol treasury
```

**Slashing Conditions:**
- Provider endpoint returns errors > 10% of queries in 24h
- Provider endpoint returns stale data (same response for 1h+)
- Provider endpoint goes offline for > 1 hour
- Community reports verified by admin

**Slashing Penalty:**
- First offense: Warning + 10% stake slash
- Second offense: 25% stake slash
- Third offense: 50% stake slash + feed deactivation
- Provider can appeal via governance (future)

---

### 6.4 Agent SDK (`@shadowfeed/agent`)

**Priority:** P1 (High — enables adoption)
**Budget:** $675 (15%)
**Timeline:** Week 5–7

#### 6.4.1 Package Structure

```
@shadowfeed/agent/
├── src/
│   ├── index.ts              # Main exports
│   ├── client.ts             # ShadowFeed API client
│   ├── agent.ts              # Agent wrapper with auto-payment
│   ├── feeds.ts              # Feed type definitions
│   ├── discovery.ts          # Feed discovery API
│   ├── types.ts              # TypeScript interfaces
│   └── utils.ts              # Helpers
├── examples/
│   ├── trading-bot.ts        # Example: Trading agent
│   ├── research-agent.ts     # Example: Research agent
│   ├── portfolio-monitor.ts  # Example: Portfolio monitoring agent
│   └── README.md             # Example usage guide
├── package.json
├── tsconfig.json
├── README.md                 # npm README with badges
└── LICENSE                   # MIT
```

#### 6.4.2 SDK API Design

```typescript
// Installation
// npm install @shadowfeed/agent

import { ShadowFeedAgent } from '@shadowfeed/agent';

// Initialize (one line!)
const agent = new ShadowFeedAgent({
  privateKey: process.env.STACKS_PRIVATE_KEY,
  network: 'mainnet',  // or 'testnet'
});

// Discover available feeds
const feeds = await agent.discover();
// Returns: [{ id, name, price, category, description }, ...]

// Buy a single feed
const sentiment = await agent.buy('btc-sentiment');
// Returns: { data: {...}, payment: { txHash, amount, status } }

// Buy multiple feeds
const [whales, defi] = await agent.buyMany(['whale-alerts', 'defi-scores']);

// Conditional buying (like smart-agent)
const data = await agent.buyIf('whale-alerts', {
  condition: () => sentiment.data.overall_score < -50,  // Only if bearish
});

// Subscribe to a feed (auto-purchase at interval)
const subscription = agent.subscribe('btc-sentiment', {
  interval: 60000,  // Every 60 seconds
  onData: (data) => console.log(data),
  onError: (err) => console.error(err),
  maxSpend: 0.5,    // Stop after spending 0.5 STX
});
subscription.stop();  // Unsubscribe

// Get agent stats
const stats = await agent.getStats();
// Returns: { totalSpent, totalQueries, feedsUsed, walletBalance }
```

#### 6.4.3 SDK Classes & Interfaces

```typescript
// Core interfaces
interface ShadowFeedConfig {
  privateKey: string;
  network: 'mainnet' | 'testnet';
  serverUrl?: string;         // Default: production URL
  timeout?: number;           // Default: 30000ms
  retries?: number;           // Default: 3
}

interface FeedInfo {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;              // STX
  priceMicroStx: number;
  provider: string;
  totalQueries: number;
  avgResponseMs: number;
  uptime: number;
}

interface PurchaseResult<T = any> {
  data: T;
  payment: {
    txHash: string;
    amount: number;           // STX
    status: 'confirmed' | 'pending';
    timestamp: number;
  };
  metadata: {
    responseMs: number;
    feedId: string;
    dataSource: string;
  };
}

interface SubscriptionOptions {
  interval: number;           // ms
  onData: (data: any) => void;
  onError?: (err: Error) => void;
  maxSpend?: number;          // STX limit
  maxQueries?: number;        // Query limit
}
```

#### 6.4.4 Feed Discovery API

**New Server Endpoint:**

```
GET /api/v1/feeds
GET /api/v1/feeds/:feedId
GET /api/v1/feeds/categories
GET /api/v1/feeds/search?q=sentiment&category=Trading
```

Returns structured feed catalog with:
- Feed metadata (name, description, category, price)
- Real-time stats (query count, uptime, avg response time)
- Provider info (name, reputation, stake amount)
- Sample response structure
- Pricing in STX and USD equivalent

#### 6.4.5 Documentation Requirements

| Document | Content |
|----------|---------|
| README.md | Quick start, installation, basic usage |
| API Reference | Full SDK API docs with examples |
| Getting Started Guide | 5-minute tutorial: install → configure → first query |
| Feed Catalog | All available feeds with schemas |
| Integration Guide (LangChain) | Use ShadowFeed as a LangChain tool |
| Integration Guide (CrewAI) | Use ShadowFeed as a CrewAI tool |
| Smart Agent Tutorial | Build a conditional purchasing agent |
| Stacks Wallet Setup | How to get STX for agents |

---

### 6.5 Community & Ecosystem Integration

**Priority:** P2 (Important — drives adoption)
**Budget:** $675 (15%)
**Timeline:** Week 7–8

#### 6.5.1 Integration Tutorials (5+ articles)

| # | Tutorial Title | Platform |
|---|----------------|----------|
| 1 | "Build Your First AI Agent on Bitcoin with ShadowFeed & x402" | Dev.to / Hashnode |
| 2 | "ShadowFeed + LangChain: Give Your AI Agent Real-Time Crypto Data" | LangChain community |
| 3 | "Autonomous Trading Bot on Stacks in 50 Lines of Code" | Stacks Forum |
| 4 | "Why AI Agents Need Bitcoin Settlement: The x402 Story" | Medium / Blog |
| 5 | "From CoinGecko Pro to ShadowFeed: 7,000x Cost Reduction for AI Data" | Twitter thread + blog |

#### 6.5.2 AI Framework Partnerships

| Framework | Integration Type | Target |
|-----------|-----------------|--------|
| LangChain | Custom Tool plugin | PR to langchain-community |
| CrewAI | Agent Tool integration | PR to crewai-tools |
| AutoGPT | Plugin | Plugin marketplace listing |

**LangChain Integration Example:**
```typescript
import { ShadowFeedTool } from '@shadowfeed/langchain';

const tool = new ShadowFeedTool({
  privateKey: process.env.STACKS_KEY,
  feeds: ['btc-sentiment', 'whale-alerts'],
});

// Use in LangChain agent
const agent = new Agent({
  tools: [tool, ...otherTools],
});
```

#### 6.5.3 Stacks Forum Engagement

- Weekly development updates posted to Stacks Forum
- Respond to community questions within 24h
- Share milestone achievements with on-chain proof
- Engage with other x402 builders

---

## 7. Technical Architecture

### System Architecture (Post-Grant)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         AI Agents / Users                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Trading  │  │ Research │  │ Portfolio│  │ Browser Wallet   │  │
│  │  Bot     │  │  Agent   │  │ Monitor  │  │ (Leather/Xverse) │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │
│       │              │              │                  │           │
│  ┌────┴──────────────┴──────────────┴──────────────────┴────────┐  │
│  │              @shadowfeed/agent SDK (npm)                      │  │
│  └──────────────────────────┬───────────────────────────────────┘  │
└─────────────────────────────┼─────────────────────────────────────┘
                              │ HTTP + x402 headers
┌─────────────────────────────┼─────────────────────────────────────┐
│                  ShadowFeed Server (Express.js)                    │
│                              │                                     │
│  ┌───────────────────────────┴──────────────────────────────────┐  │
│  │                   x402 Payment Middleware                     │  │
│  │            (verify payment → settle → grant access)           │  │
│  └───────────────────────────┬──────────────────────────────────┘  │
│                              │                                     │
│  ┌──────────────┬────────────┴────────────┬─────────────────────┐  │
│  │   Internal   │    Provider Proxy       │   Feed Discovery    │  │
│  │   Feeds      │    (3rd party feeds)    │   API              │  │
│  │   (15+)      │                         │                     │  │
│  └──────┬───────┘────────────┬────────────┘─────────────────────┘  │
│         │                    │                                     │
│  ┌──────┴────────────────────┴──────────────────────────────────┐  │
│  │                    SQLite Database                             │  │
│  │  queries | feed_stats | providers | provider_feeds             │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────┬─────────────────────────────────────┘
                              │
┌─────────────────────────────┼─────────────────────────────────────┐
│              Stacks Blockchain (Mainnet)                           │
│  ┌──────────────────────────┴──────────────────────────────────┐  │
│  │           Clarity Smart Contract v2                           │  │
│  │   Provider Registry | Staking | Slashing | Fee Distribution  │  │
│  └──────────────────────────┬──────────────────────────────────┘  │
│                              │                                     │
│  ┌──────────────────────────┴──────────────────────────────────┐  │
│  │                    Bitcoin (L1 Finality)                      │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. Agent calls GET /feeds/btc-sentiment
2. Server returns HTTP 402 with x402 payment requirements
3. Agent signs STX transaction and retries with payment header
4. x402 middleware verifies signature
5. x402 middleware settles transaction on Stacks mainnet
6. Server calls btc-sentiment feed function
7. Feed fetches from Alternative.me + CoinGecko (with caching)
8. Feed computes analytics (sentiment score, market trend)
9. Server records query in SQLite (agent, feed, tx_hash, response)
10. Server returns data to agent
```

---

## 8. API Specifications

### Base URL
- **Production:** `https://shadowfeed.app` (post-migration)
- **Testnet:** `https://shadowfeed-production.up.railway.app`

### API Versioning
New endpoints use `/api/v1/` prefix. Existing endpoints remain at root for backward compatibility.

### Endpoints Summary

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| **Discovery** | | | |
| GET | `/registry/feeds` | Public | List all feeds with prices |
| GET | `/api/v1/feeds` | Public | Feed catalog (structured) |
| GET | `/api/v1/feeds/:id` | Public | Single feed details |
| GET | `/api/v1/feeds/categories` | Public | Available categories |
| GET | `/health` | Public | Service health |
| **Paid Feeds** | | | |
| GET | `/feeds/:feedId` | x402 | Purchase feed data |
| **Analytics** | | | |
| GET | `/stats` | Public | Provider reputation |
| GET | `/activity` | Public | Recent transactions |
| GET | `/leaderboard` | Public | Agent rankings |
| GET | `/activity/:id/data` | Public | Query response data |
| **Providers** | | | |
| POST | `/api/v1/providers/register` | STX sig | Register provider |
| GET | `/api/v1/providers` | Public | List providers |
| GET | `/api/v1/providers/:addr` | Public | Provider profile |
| POST | `/api/v1/providers/:addr/feeds` | STX sig | Add feed |
| GET | `/api/v1/providers/:addr/analytics` | Provider | Analytics |
| **Wallet** | | | |
| POST | `/wallet/buy` | Wallet | Browser purchase |
| **Demo** | | | |
| GET | `/demo/feeds/:feedId` | Public | Free demo data |

### Error Responses

```typescript
// Standard error format
{
  error: string;        // Human-readable message
  code: string;         // Machine-readable code
  details?: any;        // Additional context
}

// Error codes
"INSUFFICIENT_PAYMENT"    // x402 payment too low
"INVALID_PAYMENT"         // x402 signature invalid
"FEED_NOT_FOUND"          // Feed ID doesn't exist
"FEED_UNAVAILABLE"        // Feed temporarily down
"PROVIDER_NOT_FOUND"      // Provider address not registered
"RATE_LIMITED"            // Too many requests
"INTERNAL_ERROR"          // Server error
```

---

## 9. Database Schema Changes

### New Tables

```sql
-- Provider registry
CREATE TABLE providers (
  address TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  website TEXT,
  stake_amount INTEGER DEFAULT 0,      -- microSTX staked
  total_revenue INTEGER DEFAULT 0,      -- microSTX earned
  total_queries INTEGER DEFAULT 0,
  total_errors INTEGER DEFAULT 0,
  reputation_score INTEGER DEFAULT 50,  -- 0-100
  slash_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT 1,
  registered_at INTEGER NOT NULL,
  last_active_at INTEGER
);

-- Provider feeds
CREATE TABLE provider_feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_address TEXT NOT NULL,
  feed_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  price_microstx INTEGER NOT NULL,
  endpoint_url TEXT NOT NULL,
  sample_response TEXT,                 -- JSON
  total_queries INTEGER DEFAULT 0,
  total_errors INTEGER DEFAULT 0,
  avg_response_ms REAL DEFAULT 0,
  is_active BOOLEAN DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER,
  FOREIGN KEY (provider_address) REFERENCES providers(address)
);
CREATE INDEX idx_provider_feeds_category ON provider_feeds(category);
CREATE INDEX idx_provider_feeds_provider ON provider_feeds(provider_address);

-- Provider revenue tracking
CREATE TABLE provider_revenue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_address TEXT NOT NULL,
  feed_id TEXT NOT NULL,
  query_id INTEGER NOT NULL,
  amount_microstx INTEGER NOT NULL,     -- Provider's share
  protocol_fee INTEGER NOT NULL,        -- Protocol's share
  tx_hash TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (provider_address) REFERENCES providers(address),
  FOREIGN KEY (query_id) REFERENCES queries(id)
);
CREATE INDEX idx_revenue_provider ON provider_revenue(provider_address);
CREATE INDEX idx_revenue_date ON provider_revenue(created_at);
```

### Modified Tables

```sql
-- Add provider_address to queries table
ALTER TABLE queries ADD COLUMN provider_address TEXT;
ALTER TABLE queries ADD COLUMN protocol_fee INTEGER DEFAULT 0;
```

---

## 10. Smart Contract Updates

### Upgrade Path: v3 → v2 (with modifications)

Deploy new contract `shadowfeed-registry-v2` on mainnet based on `shadowfeed-registry.clar` (v1) with adjustments:

```clarity
;; Key functions needed for marketplace

;; Provider registration with staking
(define-public (register-provider (stake uint))
  ;; Requires minimum 50 STX (50000000 microSTX)
  ;; Transfers STX to contract
  ;; Creates provider record
)

;; Feed registration
(define-public (register-feed
  (feed-id (string-ascii 64))
  (price uint)
  (description (string-utf8 256))
  (category (string-ascii 32)))
  ;; Only callable by registered provider
  ;; Creates feed record
)

;; Query recording with fee split
(define-public (record-query
  (provider principal)
  (feed-id (string-ascii 64))
  (amount uint))
  ;; Records query
  ;; Splits fee: 97% to provider, 3% to protocol
)

;; Slashing (admin only)
(define-public (slash-provider
  (provider principal)
  (amount uint)
  (reason (string-utf8 256)))
  ;; Only contract owner
  ;; Reduces provider stake
  ;; Records slash event
)

;; Stake withdrawal (with cooldown)
(define-public (withdraw-stake (amount uint))
  ;; 7-day cooldown after deregistration
  ;; Cannot withdraw if active feeds exist
)
```

### Contract Data Maps

```clarity
(define-map providers
  { address: principal }
  {
    name: (string-utf8 64),
    stake: uint,
    total-queries: uint,
    total-earned: uint,
    reputation: uint,
    slash-count: uint,
    registered-at: uint,
    is-active: bool
  }
)

(define-map feeds
  { provider: principal, feed-id: (string-ascii 64) }
  {
    price: uint,
    description: (string-utf8 256),
    category: (string-ascii 32),
    total-queries: uint,
    is-active: bool,
    created-at: uint
  }
)

(define-map slash-history
  { provider: principal, index: uint }
  {
    amount: uint,
    reason: (string-utf8 256),
    slashed-at: uint,
    slashed-by: principal
  }
)
```

---

## 11. Success Metrics & KPIs

### Primary KPIs

| Metric | Current (MVP) | Target (Week 8) | Measurement |
|--------|--------------|------------------|-------------|
| Network | Testnet | Mainnet | Server config |
| Live feeds | 3 | 15+ | `/registry/feeds` count |
| Unique agents | 20+ | 50+ | Database unique payer count |
| Monthly STX tx | ~20 | 2,000+ | On-chain tx count |
| External providers | 0 | 2+ | Provider registry |
| SDK installs | 0 | 50+ | npm download stats |
| Published tutorials | 0 | 5+ | Public URLs |

### Secondary KPIs

| Metric | Target | Measurement |
|--------|--------|-------------|
| Avg response time | < 2s (p95) | Server metrics |
| Uptime | 99%+ | Monitoring dashboard |
| Feed error rate | < 5% | Database error counts |
| Agent retention (7d) | 30%+ | Repeat query rate |
| SDK time-to-first-query | < 5 min | Documentation testing |
| Community engagement | Active | Forum post frequency |

---

## 12. Timeline & Milestones

```
Week 1   Week 2   Week 3   Week 4   Week 5   Week 6   Week 7   Week 8
├────────┼────────┼────────┼────────┼────────┼────────┼────────┼────────┤
│◄──── Mainnet Migration ────►│                                        │
│       & Security Audit       │                                        │
│                    │◄──── Data Feed Expansion (12 feeds) ────►│       │
│                              │                    │◄── Marketplace ──►│
│                              │                    │◄── Agent SDK ────►│
│                                                            │◄─ Grow ─►│
├────────┼────────┼────────┼────────┼────────┼────────┼────────┼────────┤
        MS1                           MS2       MS3     MS4     MS5
```

### Milestone Details

| MS | Name | Week | Budget | Key Deliverable |
|----|------|------|--------|-----------------|
| MS1 | Mainnet Launch | 3 | $900 (20%) | ShadowFeed live on mainnet with 3 feeds |
| MS2 | 15+ Feeds | 5 | $1,350 (30%) | 12 new feeds deployed and operational |
| MS3 | Marketplace | 6 | $900 (20%) | Provider registration + staking live |
| MS4 | SDK Published | 7 | $675 (15%) | @shadowfeed/agent on npm |
| MS5 | Community | 8 | $675 (15%) | 50+ agents, 5+ tutorials, 2+ partnerships |

---

## 13. Risks & Mitigations

| # | Risk | Impact | Probability | Mitigation |
|---|------|--------|-------------|------------|
| R1 | x402 SDK breaking changes | High | Low | Embedded facilitator abstracts SDK; monitor releases |
| R2 | API rate limits / pricing | Medium | Medium | Multi-source fallback per feed; caching; budget for premium APIs |
| R3 | Low mainnet adoption | Medium | Medium | Migrate testnet agents; publish SDK; partner with AI frameworks |
| R4 | Smart contract vulnerability | High | Low | Security audit (MS1); minimal contract first; open source review |
| R5 | Stacks network congestion | Low | Low | Signature verification before settlement; async settlement |
| R6 | Provider delivers bad data | Medium | Medium | Staking/slashing mechanism; reputation scoring; automated checks |
| R7 | External API downtime | Medium | Medium | Cache layer per feed; graceful degradation; status page |

---

## 14. Out of Scope

The following are explicitly **not** included in this grant cycle:

- Multi-chain support (Ethereum, Solana, etc.)
- Provider DAO governance
- Mobile app
- Custom domain / SSL setup
- Advanced ML models for data enrichment
- Fiat on-ramp for agents
- Batched settlement optimization
- Multi-language SDK (Python, Go, Rust)
- Historical data backfill / time-series storage
- GraphQL API
- Webhook / push notifications for agents

These may be addressed in future grants or as the marketplace generates revenue.

---

## Appendix A: File Changes Summary

### New Files to Create

```
src/feeds/
├── social-sentiment.ts
├── smart-money.ts
├── liquidation-alerts.ts
├── gas-prediction.ts
├── token-launches.ts
├── exchange-flow.ts
├── governance-signals.ts
├── stablecoin-flows.ts
├── security-alerts.ts
├── dev-activity.ts
├── bridge-flows.ts
└── nft-intelligence.ts

src/providers/
├── provider-manager.ts
├── provider-auth.ts
├── provider-proxy.ts
└── provider-analytics.ts

sdk/                           # @shadowfeed/agent package
├── src/
│   ├── index.ts
│   ├── client.ts
│   ├── agent.ts
│   ├── feeds.ts
│   ├── discovery.ts
│   ├── types.ts
│   └── utils.ts
├── examples/
│   ├── trading-bot.ts
│   ├── research-agent.ts
│   └── portfolio-monitor.ts
├── package.json
├── tsconfig.json
├── README.md
└── LICENSE
```

### Files to Modify

```
src/server.ts                  # Add 12 new feeds, provider endpoints, API v1
src/db.ts                      # Add providers, provider_feeds, revenue tables
src/registry.ts                # Update for dynamic feed registry
contracts/shadowfeed-registry.clar  # Deploy v2 on mainnet
public/index.html              # Marketplace section, mainnet links
.env                           # Mainnet config
package.json                   # New dependencies if needed
```

---

## Appendix B: Dependency Map

```
MS1 (Mainnet) ──┐
                 ├──► MS2 (Feeds) ──┐
                 │                   ├──► MS5 (Community)
                 ├──► MS3 (Market) ──┤
                 │                   │
                 └──► MS4 (SDK) ─────┘
```

- MS1 is prerequisite for MS2, MS3, MS4
- MS2, MS3, MS4 can run in parallel after MS1
- MS5 depends on all previous milestones

---

*End of PRD v1.0*
