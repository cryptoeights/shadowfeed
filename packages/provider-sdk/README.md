# @shadowfeed/provider-sdk

Provider SDK for the [ShadowFeed](https://shadowfeed.app) marketplace — one-command onboarding for x402-payable data feeds on Stacks.

## Why this exists

Listing a feed on ShadowFeed previously required hand-rolled HMAC verification middleware, manual `.well-known` manifest hosting, and out-of-band secret coordination. This SDK handles all of that so you can onboard in minutes.

## Install

```bash
npm install @shadowfeed/provider-sdk
```

## Quickstart (Express)

```typescript
import express from 'express';
import { ShadowFeedProvider } from '@shadowfeed/provider-sdk';
import expressAdapter from '@shadowfeed/provider-sdk/express';

const sf = new ShadowFeedProvider({
  handle: 'your-handle',
  secret: process.env.SHADOWFEED_PARTNER_SECRET!,
});

sf.feed('hello-world', {
  description: 'Returns a greeting',
  priceStx: 0.001,
  handler: async () => ({ message: 'hello' }),
});

const app = express();
app.use('/shadowfeed', expressAdapter(sf));
app.listen(3000);
```

## Quickstart (Hono / Cloudflare Workers)

```typescript
import { Hono } from 'hono';
import { ShadowFeedProvider } from '@shadowfeed/provider-sdk';
import honoAdapter from '@shadowfeed/provider-sdk/hono';

const sf = new ShadowFeedProvider({
  handle: 'your-handle',
  secret: process.env.SHADOWFEED_PARTNER_SECRET!,
});

sf.feed('hello-world', { /* ... */ });

const app = new Hono();
app.route('/shadowfeed', honoAdapter(sf));
export default app;
```

## Verify your integration

```bash
npx shadowfeed verify --endpoint https://your-api.example.com/shadowfeed
```

## Status

Pre-release. API may change before 1.0. See [CHANGELOG.md](./CHANGELOG.md).

## License

MIT
