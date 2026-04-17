---
description: "The 3 core feeds using free public APIs"
---

# Original Feeds

These are the original 3 feeds that launched with ShadowFeed, powered by free public APIs.

## Whale Alerts

| Property | Value |
|----------|-------|
| **Feed ID** | `whale-alerts` |
| **Price** | 0.005 STX |
| **Category** | on-chain |
| **Sources** | CoinGecko (BTC price), Blockchain.info (recent blocks) |
| **Update** | Real-time |

Tracks large Bitcoin transfers (>100 BTC) across exchanges and wallets. Identifies accumulation and distribution patterns.

**Key data points:**
- Individual whale alerts with amount, from/to labels, and significance level
- Summary: total alert count, BTC volume, most active entity
- Current BTC price

```typescript
const result = await sf.buy('whale-alerts');
// result.data.alerts → [{amount_btc, from, to, significance}, ...]
// result.data.summary → {alert_count, total_volume_btc, most_active}
// result.data.btc_price_usd → 104928
```

## BTC Sentiment

| Property | Value |
|----------|-------|
| **Feed ID** | `btc-sentiment` |
| **Price** | 0.003 STX |
| **Category** | social |
| **Sources** | Alternative.me (Fear & Greed Index), CoinGecko (price/dominance) |
| **Update** | Every 5 minutes |

Aggregates social sentiment from Twitter, Reddit, and news into a composite score.

**Key data points:**
- Fear & Greed Index (0-100)
- Per-source sentiment scores (Twitter, Reddit, News)
- BTC price, 24h change, dominance
- Market trend (bullish/bearish/neutral)

```typescript
const result = await sf.buy('btc-sentiment');
// result.data.fear_greed_index → 12
// result.data.overall_label → 'extreme_fear'
// result.data.market_trend → 'bearish'
// result.data.btc_price_usd → 104928
```

## DeFi Scores

| Property | Value |
|----------|-------|
| **Feed ID** | `defi-scores` |
| **Price** | 0.01 STX |
| **Category** | analytics |
| **Sources** | DeFiLlama (10 top protocols) |
| **Update** | Every 15 minutes |

Computes risk/opportunity scores for the top 10 DeFi protocols based on TVL, growth, and audit data.

**Key data points:**
- Per-protocol: TVL, 24h change, composite score, recommendation
- Recommendations: `strong_buy`, `favorable`, `neutral`, `caution`, `strong_avoid`
- Audit counts and chain info

```typescript
const result = await sf.buy('defi-scores');
// result.data.protocols → [{protocol, tvl_usd, composite_score, recommendation}, ...]
```
