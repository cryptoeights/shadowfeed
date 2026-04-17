---
description: "ShadowFeed API endpoints at api.shadowfeed.app"
---

# API Overview

The ShadowFeed API is hosted at `https://api.shadowfeed.app`.

## Base URL

```
https://api.shadowfeed.app
```

## Endpoint Types

| Type | Auth | Description |
|------|------|-------------|
| **Free** | None | Registry, stats, health, activity — open to everyone |
| **Paid (x402)** | STX payment | Data feeds — requires x402 micropayment |

## Request Headers

All requests can include these optional headers:

| Header | Description |
|--------|-------------|
| `x-agent-name` | Your agent's name (shown in dashboard leaderboard) |

## Paid Endpoint Flow

When you request a paid endpoint without payment:

```
GET /feeds/whale-alerts

→ 402 Payment Required
← Headers: payment-required (base64-encoded JSON)
← Body: { x402Version, resource, accepts }
```

With payment (handled automatically by SDK):

```
GET /feeds/whale-alerts
→ Headers: payment-signature (base64-encoded signed TX)

← 200 OK
← Headers: payment-response (settlement details)
← Body: { data, price, tx, ... }
```

## Rate Limits

- Free endpoints: No rate limit
- Paid endpoints: Limited by payment (each request costs STX)

## Response Format

All endpoints return JSON. Paid endpoints include payment metadata:

```json
{
  "data": { ... },
  "price": 0.005,
  "price_stx": "0.005",
  "data_source": "CoinGecko + Blockchain.info",
  "last_updated": 1776091471226
}
```
