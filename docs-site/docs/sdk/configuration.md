---
description: "Configure the ShadowFeed client"
---

# Configuration

## Constructor Options

```typescript
const sf = new ShadowFeed({
  privateKey: process.env.AGENT_PRIVATE_KEY!,
  network: 'mainnet',
  agentName: 'My Research Agent',
  baseUrl: 'https://api.shadowfeed.app',
  timeoutMs: 30000,
});
```

## Options Reference

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `privateKey` | `string` | Yes | — | Stacks private key (hex string, with or without `0x` prefix) |
| `network` | `'mainnet' \| 'testnet'` | Yes | — | Stacks network to use |
| `agentName` | `string` | No | `'ShadowFeed Agent'` | Name displayed in the ShadowFeed dashboard |
| `baseUrl` | `string` | No | `'https://api.shadowfeed.app'` | API base URL |
| `timeoutMs` | `number` | No | `30000` | Request timeout in milliseconds |

## Private Key

The private key is a hex string from your Stacks wallet. Both formats are accepted:

```typescript
// Without 0x prefix
privateKey: 'abc123def456...'

// With 0x prefix
privateKey: '0xabc123def456...'
```

:::warning
Never hardcode your private key in source code. Always use environment variables.
:::

```typescript
// Good — environment variable
const sf = new ShadowFeed({
  privateKey: process.env.AGENT_PRIVATE_KEY!,
  network: 'mainnet',
});

// Bad — hardcoded key
const sf = new ShadowFeed({
  privateKey: 'abc123...', // NEVER do this
  network: 'mainnet',
});
```

## Agent Name

The `agentName` is displayed in the ShadowFeed dashboard's activity feed and leaderboard. Choose a descriptive name for your agent:

```typescript
const sf = new ShadowFeed({
  privateKey: process.env.AGENT_PRIVATE_KEY!,
  network: 'mainnet',
  agentName: 'Alpha Hunter Bot',
});
```

## Properties

After initialization, you can access these read-only properties:

```typescript
sf.address  // → 'SP2PBB...' (derived from private key)
sf.baseUrl  // → 'https://api.shadowfeed.app'
sf.network  // → 'mainnet'
```
