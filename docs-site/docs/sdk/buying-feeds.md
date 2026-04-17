---
description: "Purchase data feeds with automatic x402 payments"
---

# Buying Feeds

## Basic Purchase

Use `sf.buy()` to purchase a single feed. Payment is handled automatically:

```typescript
const result = await sf.buy('whale-alerts');
```

## Response Structure

`buy()` returns a `PurchaseResult` object:

```typescript
interface PurchaseResult<T> {
  feed: string;           // Feed ID
  data: T;                // Feed data
  price_stx: number;      // Price paid in STX
  tx?: string;            // Transaction hash
  timestamp: string;      // ISO timestamp
}
```

Example:

```typescript
const result = await sf.buy('btc-sentiment');

console.log(result.feed);       // 'btc-sentiment'
console.log(result.price_stx);  // 0.003
console.log(result.tx);         // '0xabc123...'
console.log(result.data);
// {
//   fear_greed_index: 12,
//   btc_price_usd: 104928,
//   market_trend: 'bearish',
//   ...
// }
```

## Typed Responses

Use generics for type-safe data access:

```typescript
const result = await sf.buy<{
  fear_greed_index: number;
  btc_price_usd: number;
  market_trend: string;
}>('btc-sentiment');

// TypeScript knows these types
const fgi: number = result.data.fear_greed_index;
const price: number = result.data.btc_price_usd;
```

## Query Parameters

Some feeds accept query parameters. Pass them as the second argument:

```typescript
// Wallet profiler — specify which address to analyze
const wallet = await sf.buy('wallet-profiler', {
  address: '0xb5998e11E666Fd1e7f3B8e8d9122A755eec1E9b7',
  chain: 'ethereum',
});

// Token intel — specify which token
const token = await sf.buy('token-intel', {
  address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  chain: 'ethereum',
});
```

## Error Handling

```typescript
try {
  const result = await sf.buy('whale-alerts');
  console.log(result.data);
} catch (error) {
  if (error.response?.status === 402) {
    console.log('Payment failed — check wallet balance');
  } else {
    console.log('Request failed:', error.message);
  }
}
```

## All Available Feeds

| Feed ID | Price | Category |
|---------|-------|----------|
| `whale-alerts` | 0.005 STX | on-chain |
| `btc-sentiment` | 0.003 STX | social |
| `defi-scores` | 0.01 STX | analytics |
| `smart-money-flows` | 0.08 STX | on-chain |
| `token-intel` | 0.05 STX | analytics |
| `wallet-profiler` | 0.05 STX | on-chain |
| `smart-money-holdings` | 0.05 STX | on-chain |
| `dex-trades` | 0.08 STX | on-chain |
| `liquidation-alerts` | 0.008 STX | derivatives |
| `gas-prediction` | 0.003 STX | infrastructure |
| `token-launches` | 0.005 STX | discovery |
| `governance` | 0.005 STX | governance |
| `stablecoin-flows` | 0.005 STX | analytics |
| `security-alerts` | 0.005 STX | security |
| `dev-activity` | 0.003 STX | development |
| `bridge-flows` | 0.005 STX | cross-chain |
