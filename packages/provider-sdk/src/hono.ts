// Hono adapter for @shadowfeed/provider-sdk.
//
// Usage (Cloudflare Workers):
//   import honoAdapter from '@shadowfeed/provider-sdk/hono';
//   const app = new Hono();
//   app.route('/shadowfeed', honoAdapter(sf));
//   export default app;

import { Hono } from 'hono';
import { FeedNotFoundError, HandlerError, SignatureError } from './errors.js';
import type { ShadowFeedProvider } from './provider.js';

export default function honoAdapter(sf: ShadowFeedProvider): Hono {
  const app = new Hono();

  // Public manifest — CORS open.
  app.get('/.well-known/shadowfeed-feeds.json', (c) => {
    const manifest = sf.getManifest({ basePath: '' });
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Content-Type', 'application/json');
    return c.json(manifest);
  });

  // HMAC-gated feed endpoint.
  app.get('/feeds/:slug', async (c) => {
    const slug = c.req.param('slug');
    if (!slug) {
      return c.json({ error: 'Missing feed slug', code: 'MISSING_SLUG' }, 400);
    }

    // Build a flat headers Record from Hono's Headers object.
    const headers: Record<string, string | undefined> = {};
    c.req.raw.headers.forEach((value, key) => {
      headers[key] = value;
    });

    try {
      // Reconstruct the canonical path independently of the mount prefix —
      // the manifest publishes paths as /feeds/{slug} (no mount segment), and
      // the CLI signs against that. Using `c.req.url`'s full pathname here
      // would include the mount segment (e.g. /shadowfeed/feeds/{slug}) and
      // produce a different canonical string than the signer used.
      const data = await sf.dispatch(slug, {
        method: c.req.method,
        path: `/feeds/${slug}`,
        headers,
        body: undefined, // GET requests have no body
      });

      return c.json({ data, meta: { timestamp: new Date().toISOString() } });
    } catch (err) {
      if (err instanceof SignatureError) {
        return c.json({ error: err.message, code: err.reason }, 401);
      }
      if (err instanceof FeedNotFoundError) {
        return c.json({ error: err.message, code: 'FEED_NOT_FOUND' }, 404);
      }
      if (err instanceof HandlerError) {
        return c.json({ error: 'Handler failed', code: 'HANDLER_ERROR' }, 500);
      }
      return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
    }
  });

  return app;
}
