---
description: "Discover and filter available data feeds"
---

# Feed Discovery

## List All Feeds

```typescript
const feeds = await sf.discover();

feeds.forEach(f => {
  console.log(`${f.id} — ${f.price_display} — ${f.category}`);
});
```

## Filter by Category

```typescript
const onchain = await sf.discover({ category: 'on-chain' });
// → smart-money-flows, wallet-profiler, smart-money-holdings, dex-trades, whale-alerts

const analytics = await sf.discover({ category: 'analytics' });
// → defi-scores, token-intel, stablecoin-flows
```

Available categories: `on-chain`, `social`, `analytics`, `derivatives`, `infrastructure`, `discovery`, `governance`, `security`, `development`, `cross-chain`.

## Filter by Price

```typescript
// Cheap feeds only (≤ 0.005 STX)
const cheap = await sf.discover({ maxPrice: 0.005 });

// Premium feeds (≥ 0.05 STX)
const premium = await sf.discover({ minPrice: 0.05 });

// Price range
const mid = await sf.discover({ minPrice: 0.005, maxPrice: 0.02 });
```

## Combine Filters

```typescript
const cheapOnchain = await sf.discover({
  category: 'on-chain',
  maxPrice: 0.01,
});
```

## Get Single Feed Info

```typescript
const info = await sf.getFeed('smart-money-flows');

if (info) {
  console.log(info.id);                // 'smart-money-flows'
  console.log(info.price_stx);         // 0.08
  console.log(info.price_display);     // '0.08 STX'
  console.log(info.category);          // 'on-chain'
  console.log(info.description);       // 'Smart money net flows...'
  console.log(info.update_frequency);  // 'every 5 minutes'
  console.log(info.stats.total_queries);  // 142
}
```

## FeedInfo Type

```typescript
interface FeedInfo {
  id: string;
  endpoint: string;
  price_stx: number;
  price_display: string;
  description: string;
  category: FeedCategory;
  update_frequency: string;
  response_format: string;
  stats: {
    total_queries: number;
    avg_response_ms: number;
    uptime_percent: number;
  };
}
```

## Caching

Discovery results are cached in memory. To force a refresh:

```typescript
// Uses cache (fast)
const feeds = await sf.discover();

// Force refresh from API
const fresh = await sf.discover(undefined, true);
```
