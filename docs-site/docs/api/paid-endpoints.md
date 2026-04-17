---
description: "x402-protected data feed endpoints"
---

# Paid Endpoints

All data feed endpoints require x402 micropayment in STX.

:::info
Use the SDK (`shadowfeed-agent`) to handle payments automatically. These docs show the raw HTTP flow for reference.
:::

## GET /feeds/whale-alerts

Real-time whale movements — transfers >100 BTC across exchanges and wallets.

**Price:** 0.005 STX | **Category:** on-chain | **Source:** CoinGecko + Blockchain.info

```bash
curl https://api.shadowfeed.app/feeds/whale-alerts
# → 402 Payment Required (without payment)
```

Response (after payment):
```json
{
  "alerts": [
    {
      "type": "exchange_to_exchange",
      "amount_btc": 500,
      "amount_usd": 52000000,
      "from": { "label": "Binance" },
      "to": { "label": "Coinbase" },
      "significance": "critical"
    }
  ],
  "summary": {
    "alert_count": 8,
    "total_volume_btc": 2400,
    "most_active": "Binance"
  },
  "btc_price_usd": 104928,
  "data_source": "CoinGecko + Blockchain.info"
}
```

## GET /feeds/btc-sentiment

BTC social sentiment aggregated from Twitter, Reddit, and news.

**Price:** 0.003 STX | **Category:** social | **Source:** Alternative.me + CoinGecko

```json
{
  "fear_greed_index": 12,
  "overall_label": "extreme_fear",
  "overall_score": -76,
  "btc_price_usd": 104928,
  "btc_24h_change": -1.0,
  "btc_dominance": 52.6,
  "market_trend": "bearish",
  "sources": {
    "twitter": { "score": -82, "volume": 180678 },
    "reddit": { "score": -85, "volume": 5526 },
    "news": { "score": -63, "article_count": 118, "headlines": ["..."] }
  }
}
```

## GET /feeds/defi-scores

DeFi protocol risk/opportunity scores with composite ratings.

**Price:** 0.01 STX | **Category:** analytics | **Source:** DeFiLlama

```json
{
  "protocols": [
    {
      "protocol": "Aave",
      "chain": "ethereum",
      "tvl_usd": 12500000000,
      "tvl_change_24h": 2.3,
      "composite_score": 87,
      "recommendation": "strong_buy",
      "metrics": { "audit_count": 12 }
    }
  ]
}
```

## GET /feeds/smart-money-flows

Smart money net flows from top wallets via Nansen.

**Price:** 0.08 STX | **Category:** on-chain | **Source:** Nansen

```json
{
  "signal": "BULLISH_INFLOW",
  "net_inflow_usd": 45000000,
  "net_outflow_usd": 12000000,
  "top_inflows": [
    { "token": "ETH", "amount_usd": 15000000 }
  ],
  "top_outflows": [
    { "token": "USDT", "amount_usd": 8000000 }
  ]
}
```

## GET /feeds/token-intel

Token intelligence — buy/sell metrics, liquidity, and signals.

**Price:** 0.05 STX | **Category:** analytics | **Source:** Nansen TGM

**Query params:** `?address=0x...&chain=ethereum`

## GET /feeds/wallet-profiler

Wallet portfolio profiler — holdings, allocation, and concentration.

**Price:** 0.05 STX | **Category:** on-chain | **Source:** Nansen

**Query params:** `?address=0x...&chain=ethereum`

## GET /feeds/smart-money-holdings

Smart money current holdings with accumulation/distribution signals.

**Price:** 0.05 STX | **Category:** on-chain | **Source:** Nansen

## GET /feeds/dex-trades

DEX and perp trades — smart money trading activity across chains.

**Price:** 0.08 STX | **Category:** on-chain | **Source:** Nansen

## GET /feeds/liquidation-alerts

Futures liquidation alerts — long/short liquidations across top pairs.

**Price:** 0.008 STX | **Category:** derivatives | **Source:** Binance Futures

## GET /feeds/gas-prediction

Gas and fee predictions — ETH gas prices and BTC mempool fee estimates.

**Price:** 0.003 STX | **Category:** infrastructure | **Source:** Blocknative + mempool.space

## GET /feeds/token-launches

New token launches — trending tokens and boosted listings.

**Price:** 0.005 STX | **Category:** discovery | **Source:** DEXScreener

## GET /feeds/governance

DAO governance — active proposals and voting from Snapshot.

**Price:** 0.005 STX | **Category:** governance | **Source:** Snapshot.org

## GET /feeds/stablecoin-flows

Stablecoin flows — market cap changes, peg deviations, and chain distribution.

**Price:** 0.005 STX | **Category:** analytics | **Source:** DeFiLlama

## GET /feeds/security-alerts

Security alerts — recent DeFi hacks, exploits, and rug pulls with risk assessment.

**Price:** 0.005 STX | **Category:** security | **Source:** DeFiLlama

## GET /feeds/dev-activity

Developer activity — commit tracking across Stacks, Ethereum, and Solana repos.

**Price:** 0.003 STX | **Category:** development | **Source:** GitHub API

## GET /feeds/bridge-flows

Bridge flows — cross-chain bridge volume, top bridges, and chain flow analysis.

**Price:** 0.005 STX | **Category:** cross-chain | **Source:** DeFiLlama
