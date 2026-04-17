---
description: "How ShadowFeed implements the x402 payment protocol on Stacks"
---

# x402 Protocol

ShadowFeed implements **x402 v2** — the HTTP-native payment protocol for machine-to-machine commerce.

## What is x402?

x402 is based on the HTTP `402 Payment Required` status code. It enables:

- **No API keys** — Payment itself is the authentication
- **Pay-per-use** — No subscriptions, pay only for what you consume
- **Machine-native** — Designed for autonomous AI agents
- **On-chain** — All payments are verifiable blockchain transactions

## Protocol Flow

### 1. Initial Request (No Payment)

```http
GET /feeds/whale-alerts HTTP/1.1
Host: api.shadowfeed.app
```

### 2. Server Returns 402

```http
HTTP/1.1 402 Payment Required
payment-required: eyJ4NDAyVmVyc2lvbiI6Miwi...  (base64)
Content-Type: application/json

{
  "x402Version": 2,
  "resource": {
    "url": "https://api.shadowfeed.app/feeds/whale-alerts",
    "description": "Whale movements data",
    "mimeType": "application/json"
  },
  "accepts": [{
    "scheme": "exact",
    "network": "stacks:1",
    "amount": "5000",
    "asset": "STX",
    "payTo": "SP1DV3T4ST2A89ZZ07M73B2N4AR5XFMDCNPGKK6CS",
    "maxTimeoutSeconds": 300
  }]
}
```

Key fields:
- `amount`: Price in microSTX (5000 = 0.005 STX)
- `payTo`: Provider's Stacks address
- `network`: `stacks:1` (mainnet) or `stacks:2147483648` (testnet)

### 3. Agent Signs and Retries

The SDK:
1. Parses the `payment-required` header (base64 → JSON)
2. Creates a STX transfer transaction for the exact amount
3. Signs it with the agent's private key
4. Encodes the signed TX as base64
5. Retries the request:

```http
GET /feeds/whale-alerts HTTP/1.1
Host: api.shadowfeed.app
payment-signature: eyJwYXlsb2FkIjp7InRyYW5z...  (base64)
```

### 4. Server Verifies and Settles

The API worker:
1. Decodes the `payment-signature` header
2. Sends to facilitator: `POST /verify` (validates amount, recipient, signature)
3. Sends to facilitator: `POST /settle` (broadcasts TX to Stacks via Hiro API)
4. Waits for TX confirmation
5. Returns the data with `payment-response` header

### 5. Response with Data

```http
HTTP/1.1 200 OK
payment-response: eyJzdWNjZXNzIjp0cnVl...  (base64)
Content-Type: application/json

{
  "alerts": [...],
  "summary": {...},
  "btc_price_usd": 104928
}
```

## Headers Reference

| Header | Direction | Encoding | Purpose |
|--------|-----------|----------|---------|
| `payment-required` | Response (402) | Base64 JSON | Payment requirements |
| `payment-signature` | Request | Base64 JSON | Signed payment |
| `payment-response` | Response (200) | Base64 JSON | Settlement confirmation |

## x402-stacks SDK

ShadowFeed uses [`x402-stacks`](https://www.npmjs.com/package/x402-stacks) v2 which provides:

- `paymentMiddleware` — Server-side middleware for Express/Hono
- `wrapAxiosWithPayment` — Client-side axios interceptor
- `privateKeyToAccount` — Wallet derivation from private key
- `STXtoMicroSTX` — Price conversion utility
