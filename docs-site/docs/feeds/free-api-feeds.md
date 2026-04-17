---
description: "8 feeds powered by free public APIs"
---

# Free API Feeds

These 8 feeds use free public APIs and are priced affordably (0.003-0.008 STX).

## Liquidation Alerts

| Feed ID | Price | Source |
|---------|-------|--------|
| `liquidation-alerts` | 0.008 STX | Binance Futures |

Futures liquidation alerts — long/short liquidations across top pairs. Useful for detecting leverage flush-outs and potential reversal points.

```typescript
const result = await sf.buy('liquidation-alerts');
// result.data.total_liquidations_24h, long_liquidations, short_liquidations
// result.data.pairs → [{pair, long_short_ratio}, ...]
```

## Gas Prediction

| Feed ID | Price | Source |
|---------|-------|--------|
| `gas-prediction` | 0.003 STX | Blocknative + mempool.space |

ETH gas prices (slow/standard/fast) and BTC mempool fee estimates (economy/normal/priority).

```typescript
const result = await sf.buy('gas-prediction');
// result.data.ethereum → {slow, standard, fast} (gwei)
// result.data.bitcoin → {economy, normal, priority} (sat/vB)
```

## Token Launches

| Feed ID | Price | Source |
|---------|-------|--------|
| `token-launches` | 0.005 STX | DEXScreener |

New and trending token launches with boost status, volume, and chain info.

```typescript
const result = await sf.buy('token-launches');
// result.data.tokens → [{name, symbol, chain, price_usd, volume_24h}, ...]
```

## Governance

| Feed ID | Price | Source |
|---------|-------|--------|
| `governance` | 0.005 STX | Snapshot.org |

Active DAO proposals and voting from 7 major DAOs (Aave, Uniswap, ENS, Arbitrum, Optimism, Compound, MakerDAO).

```typescript
const result = await sf.buy('governance');
// result.data.total_active → 12
// result.data.proposals → [{dao, title, state}, ...]
```

## Stablecoin Flows

| Feed ID | Price | Source |
|---------|-------|--------|
| `stablecoin-flows` | 0.005 STX | DeFiLlama |

Stablecoin market cap changes, peg deviations, and chain distribution for USDT, USDC, DAI, etc.

```typescript
const result = await sf.buy('stablecoin-flows');
// result.data.total_market_cap → 180000000000
// result.data.stablecoins → [{name, market_cap, change_7d}, ...]
```

## Security Alerts

| Feed ID | Price | Source |
|---------|-------|--------|
| `security-alerts` | 0.005 STX | DeFiLlama |

DeFi security monitoring — identifies protocols with audit risks and tracks recent exploits.

```typescript
const result = await sf.buy('security-alerts');
// result.data.high_risk_count → 3
// result.data.alerts → [{name, risk_level, description}, ...]
```

## Dev Activity

| Feed ID | Price | Source |
|---------|-------|--------|
| `dev-activity` | 0.003 STX | GitHub API |

Developer commit activity across Stacks, Ethereum, and Solana ecosystem repos.

```typescript
const result = await sf.buy('dev-activity');
// result.data.total_commits_24h → 847
// result.data.repos → [{name, ecosystem, commits}, ...]
```

## Bridge Flows

| Feed ID | Price | Source |
|---------|-------|--------|
| `bridge-flows` | 0.005 STX | DeFiLlama |

Cross-chain bridge TVL and volume analysis. Tracks capital flows between chains.

```typescript
const result = await sf.buy('bridge-flows');
// result.data.total_tvl → 25000000000
// result.data.chains → [{name, tvl, change_24h}, ...]
```
