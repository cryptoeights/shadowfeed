// Cloudflare Workers deployment example for @shadowfeed/provider-sdk.
//
// Pure Workers entry — no Node-only imports, runs on Web Crypto + Hono.
// This is the file we deploy as the integration verification target.
//
// Deploy with:
//   wrangler deploy --config wrangler.example.toml
//
// Then verify end-to-end with:
//   node ../dist/cli/index.js verify \
//     --endpoint https://<your-worker>.workers.dev/shadowfeed \
//     --secret $SHADOWFEED_PARTNER_SECRET

import { Hono } from 'hono';
import honoAdapter from '../dist/hono.js';
import { ShadowFeedProvider } from '../dist/provider.js';

interface Env {
  readonly SHADOWFEED_PARTNER_SECRET: string;
}

// Cache the app across requests within a single isolate. Provider holds no
// per-request state, so reusing is safe; rebuilding on every request would
// be wasteful.
let cached: Hono<{ Bindings: Env }> | null = null;

function buildApp(env: Env): Hono<{ Bindings: Env }> {
  if (cached) return cached;

  if (!env.SHADOWFEED_PARTNER_SECRET) {
    throw new Error('SHADOWFEED_PARTNER_SECRET secret is not bound to the Worker');
  }

  const sf = new ShadowFeedProvider({
    handle: 'sf-sdk-verify',
    secret: env.SHADOWFEED_PARTNER_SECRET,
    description: 'Reference provider used to verify @shadowfeed/provider-sdk end-to-end.',
    website: 'https://shadowfeed.app',
  });

  sf.feed('hello-world', {
    description: 'Simple greeting feed used to confirm the SDK round-trip works.',
    category: 'discovery',
    priceStx: 0.001,
    handler: () => ({
      message: 'hello from @shadowfeed/provider-sdk',
      sdk_version: '0.1.0',
      timestamp: new Date().toISOString(),
    }),
  });

  sf.feed('echo-payload', {
    description: 'Returns a static payload that exercises nested JSON shape.',
    category: 'analytics',
    priceStx: 0.001,
    handler: () => ({
      updated_at: new Date().toISOString(),
      items: [
        { id: 1, label: 'alpha', value: 100 },
        { id: 2, label: 'beta', value: 200 },
      ],
    }),
  });

  const app = new Hono<{ Bindings: Env }>();
  app.route('/shadowfeed', honoAdapter(sf));
  app.get('/', (c) =>
    c.text(
      'ShadowFeed SDK verification provider.\n' +
        'Manifest: /shadowfeed/.well-known/shadowfeed-feeds.json\n' +
        'Feeds: /shadowfeed/feeds/{slug} (HMAC-protected)\n',
    ),
  );

  cached = app;
  return app;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const app = buildApp(env);
    return app.fetch(request, env, ctx);
  },
};
