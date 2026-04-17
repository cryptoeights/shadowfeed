---
description: "Publicly accessible API endpoints"
---

# Free Endpoints

These endpoints require no payment or authentication.

## GET /health

Check API status.

```bash
curl https://api.shadowfeed.app/health
```

```json
{
  "status": "operational",
  "version": "2.0.0",
  "provider": "SP1DV3T4ST2A89ZZ07M73B2N4AR5XFMDCNPGKK6CS",
  "network": "stacks:1",
  "feeds_available": 16,
  "payment_protocol": "x402-stacks"
}
```

## GET /registry/feeds

List all available data feeds with pricing and stats.

```bash
curl https://api.shadowfeed.app/registry/feeds
```

```json
{
  "protocol": "shadowfeed",
  "version": "1.0.0",
  "description": "Decentralized data marketplace for AI agents via x402 micropayments",
  "provider": "SP1DV3T4ST2A89ZZ07M73B2N4AR5XFMDCNPGKK6CS",
  "payment_protocol": "x402-stacks",
  "settlement": "STX on Stacks (Bitcoin L2)",
  "feeds": [
    {
      "id": "whale-alerts",
      "endpoint": "/feeds/whale-alerts",
      "price_stx": 0.005,
      "price_display": "0.005 STX",
      "description": "Real-time whale movements...",
      "category": "on-chain",
      "update_frequency": "real-time",
      "stats": {
        "total_queries": 142,
        "avg_response_ms": 450,
        "uptime_percent": 99.8
      }
    }
  ]
}
```

## GET /stats

Provider statistics and reputation.

```bash
curl https://api.shadowfeed.app/stats
```

```json
{
  "total_queries_served": 342,
  "reputation_score": 95,
  "tier": "verified",
  "uptime_percent": 99.8,
  "feed_breakdown": [
    {
      "feed_id": "whale-alerts",
      "queries": 89,
      "avg_response_ms": 420,
      "error_rate": 0
    }
  ]
}
```

## GET /activity

Recent marketplace activity.

```bash
curl https://api.shadowfeed.app/activity?limit=10
```

```json
{
  "total_revenue_stx": 1.234,
  "unique_agents": 5,
  "activity": [
    {
      "id": 1,
      "feed": "whale-alerts",
      "agent_name": "Hyre Agent",
      "agent_short": "SP2PBB...J0F7SG",
      "price_stx": 0.005,
      "response_ms": 380,
      "is_onchain": true,
      "tx_hash": "0xabc123...",
      "time_ago": "2m"
    }
  ]
}
```

## GET /leaderboard

Top agents by query count and spending.

```bash
curl https://api.shadowfeed.app/leaderboard
```

```json
{
  "agents": [
    {
      "rank": 1,
      "agent_name": "Hyre Agent",
      "address_short": "SP2PBB...J0F7SG",
      "total_queries": 45,
      "total_spent_stx": 0.892
    }
  ]
}
```
