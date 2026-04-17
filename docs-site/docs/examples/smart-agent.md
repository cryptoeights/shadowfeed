---
description: "Conditional buying based on market conditions"
---

# Smart Agent

A smarter agent that buys the cheapest feed first, then conditionally purchases additional feeds based on market conditions.

## Strategy

1. Buy `btc-sentiment` (0.003 STX — cheapest feed)
2. If Fear & Greed < 30 (extreme fear) → buy `whale-alerts` to check for smart money accumulation
3. If Fear & Greed > 70 (extreme greed) → buy `liquidation-alerts` to check risk
4. Always buy `gas-prediction` for trade timing

## Full Code

```typescript
import { ShadowFeed } from 'shadowfeed-agent';

async function main() {
  const sf = new ShadowFeed({
    privateKey: process.env.AGENT_PRIVATE_KEY!,
    network: 'mainnet',
    agentName: 'Smart Agent',
  });

  console.log(`Smart Agent | Wallet: ${sf.address}\n`);

  // Step 1: Check sentiment (cheapest feed — 0.003 STX)
  console.log('Step 1: Checking BTC sentiment...');
  const sentiment = await sf.buy<{
    fear_greed_index: number;
    overall_label: string;
    market_trend: string;
  }>('btc-sentiment');

  const fgi = sentiment.data.fear_greed_index ?? 50;
  const label = sentiment.data.overall_label ?? 'neutral';
  const trend = sentiment.data.market_trend ?? 'neutral';
  console.log(`  Fear & Greed: ${fgi} (${label})`);
  console.log(`  Market Trend: ${trend}\n`);

  // Step 2: Conditional buying
  if (fgi < 30) {
    console.log('Extreme fear detected — checking whale accumulation...');
    const whales = await sf.buy('whale-alerts');
    console.log(`  Whale data keys: ${Object.keys(whales.data).join(', ')}`);
    console.log(`  Signal: Smart money may be accumulating\n`);
  } else if (fgi > 70) {
    console.log('Extreme greed detected — checking liquidation risk...');
    const liqs = await sf.buy('liquidation-alerts');
    console.log(`  Liquidation data keys: ${Object.keys(liqs.data).join(', ')}`);
    console.log(`  Signal: Watch for potential correction\n`);
  } else {
    console.log(`Market is ${label} — no extra signals needed.\n`);
  }

  // Step 3: Always check gas for optimal trade timing
  console.log('Step 3: Checking gas/fees for timing...');
  const gas = await sf.buy('gas-prediction');
  console.log(`  Gas data keys: ${Object.keys(gas.data).join(', ')}`);

  console.log('\nSmart Agent complete.');
}

main().catch((err) => {
  console.error('Agent error:', err.message);
  process.exit(1);
});
```

## Run It

```bash
AGENT_PRIVATE_KEY=<your-hex-key> npx tsx smart-agent.ts
```

## Cost Analysis

| Condition | Feeds Bought | Total Cost |
|-----------|-------------|------------|
| Extreme fear (FGI < 30) | sentiment + whales + gas | 0.011 STX |
| Extreme greed (FGI > 70) | sentiment + liquidations + gas | 0.014 STX |
| Neutral market | sentiment + gas | 0.006 STX |

The agent optimizes spending by only buying expensive feeds when conditions warrant it.
