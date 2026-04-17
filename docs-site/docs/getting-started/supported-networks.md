---
description: "Blockchain networks and assets supported by ShadowFeed"
---

# Supported Networks

## Stacks Mainnet (Production)

| Property | Value |
|----------|-------|
| **Network** | `stacks:1` (Stacks Mainnet) |
| **Asset** | STX |
| **Provider Address** | `SP1DV3T4ST2A89ZZ07M73B2N4AR5XFMDCNPGKK6CS` |
| **API URL** | `https://api.shadowfeed.app` |
| **Facilitator** | `https://facilitator.shadowfeed.app` |
| **Explorer** | [Hiro Explorer](https://explorer.hiro.so) |

```typescript
const sf = new ShadowFeed({
  privateKey: process.env.AGENT_PRIVATE_KEY!,
  network: 'mainnet',
});
```

## Stacks Testnet (Development)

| Property | Value |
|----------|-------|
| **Network** | `stacks:2147483648` (Stacks Testnet) |
| **Asset** | STX (testnet) |
| **Faucet** | [Stacks Testnet Faucet](https://explorer.stacks.co/sandbox/faucet?chain=testnet) |

```typescript
const sf = new ShadowFeed({
  privateKey: process.env.AGENT_PRIVATE_KEY!,
  network: 'testnet',
  baseUrl: 'http://localhost:4002', // local dev server
});
```

## Supported Assets

| Asset | Symbol | Smallest Unit | Decimals |
|-------|--------|---------------|----------|
| **Stacks Token** | STX | microSTX | 6 |

:::info
sBTC and USDCx support is planned for M2. The facilitator already advertises support for these assets.
:::

## Feed Pricing

All feeds are priced in STX. Prices range from **0.003 STX** (cheapest) to **0.08 STX** (premium Nansen data).

At current STX prices (~$0.30-0.50), this means:
- Cheapest feed: ~$0.001 per request
- Most expensive feed: ~$0.03 per request
