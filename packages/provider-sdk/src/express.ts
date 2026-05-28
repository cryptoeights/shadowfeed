// Express adapter for @shadowfeed/provider-sdk.
//
// Usage:
//   import expressAdapter from '@shadowfeed/provider-sdk/express';
//   app.use('/shadowfeed', expressAdapter(sf));
//
// Mounts two routes on the provided Router:
//   GET /.well-known/shadowfeed-feeds.json  → public manifest (CORS open)
//   GET /feeds/:slug                        → HMAC-gated feed handler

import { Router } from 'express';
import type { Request, Response } from 'express';
import { FeedNotFoundError, HandlerError, SignatureError } from './errors.js';
import type { ShadowFeedProvider } from './provider.js';

export default function expressAdapter(sf: ShadowFeedProvider): Router {
  const router = Router();

  // Public manifest — CORS open so the ShadowFeed dashboard can fetch it
  // without a proxy.
  router.get('/.well-known/shadowfeed-feeds.json', (_req: Request, res: Response) => {
    const manifest = sf.getManifest({ basePath: '' });
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.json(manifest);
  });

  // HMAC-gated feed endpoint.
  router.get('/feeds/:slug', async (req: Request, res: Response) => {
    const { slug } = req.params;
    if (!slug) {
      res.status(400).json({ error: 'Missing feed slug', code: 'MISSING_SLUG' });
      return;
    }

    // Collect raw headers as a plain Record for the SDK.
    const headers: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers[key] = value;
      else if (Array.isArray(value)) headers[key] = value[0];
    }

    try {
      // Reconstruct the canonical path from the matched slug so the verifier
      // sees the same string the signer used. Express's req.path is normally
      // post-mount-prefix, but rebuilding explicitly makes the contract
      // independent of how the user wired the router (e.g. nested mounts).
      const data = await sf.dispatch(slug, {
        method: req.method,
        path: `/feeds/${slug}`,
        headers,
        body: undefined, // GET requests have no body
      });

      res.json({ data, meta: { timestamp: new Date().toISOString() } });
    } catch (err) {
      if (err instanceof SignatureError) {
        res.status(401).json({ error: err.message, code: err.reason });
        return;
      }
      if (err instanceof FeedNotFoundError) {
        res.status(404).json({ error: err.message, code: 'FEED_NOT_FOUND' });
        return;
      }
      if (err instanceof HandlerError) {
        res.status(500).json({ error: 'Handler failed', code: 'HANDLER_ERROR' });
        return;
      }
      res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  return router;
}
