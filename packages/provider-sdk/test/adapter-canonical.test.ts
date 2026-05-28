// Regression test: adapter canonical path must be independent of mount prefix.
//
// Bug history: the Hono adapter originally derived the canonical path from
// `new URL(c.req.url).pathname`, which includes the user's mount prefix
// (e.g. `/shadowfeed/feeds/hello`). The CLI signs against the path published
// in the manifest (`/feeds/hello`), so any non-root mount produced a
// bad_signature on every request — the exact pattern that bricked Xona.
//
// Both Express and Hono adapters now reconstruct the canonical path as
// `/feeds/{slug}` from the route param. These tests pin that contract.

import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import honoAdapter from '../src/hono.js';
import { ShadowFeedProvider } from '../src/provider.js';
import { signPartnerRequest } from '../src/hmac.js';

const SECRET = 'mount-prefix-regression-secret';

function buildSf(): ShadowFeedProvider {
  const sf = new ShadowFeedProvider({
    handle: 'mount-test',
    secret: SECRET,
  });
  sf.feed('hello', {
    description: 'hello',
    priceStx: 0.001,
    handler: () => ({ ok: true }),
  });
  return sf;
}

describe('hono adapter canonical path is mount-prefix independent', () => {
  it('accepts a signed request when mounted at /shadowfeed', async () => {
    const sf = buildSf();
    const app = new Hono();
    app.route('/shadowfeed', honoAdapter(sf));

    const headers = await signPartnerRequest({
      method: 'GET',
      path: '/feeds/hello', // what the manifest publishes, what the CLI signs
      secret: SECRET,
    });

    const res = await app.request('/shadowfeed/feeds/hello', {
      method: 'GET',
      headers: { ...headers, accept: 'application/json' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { ok: boolean } };
    expect(body.data.ok).toBe(true);
  });

  it('accepts a signed request when mounted at /', async () => {
    const sf = buildSf();
    const app = new Hono();
    app.route('/', honoAdapter(sf));

    const headers = await signPartnerRequest({
      method: 'GET',
      path: '/feeds/hello',
      secret: SECRET,
    });

    const res = await app.request('/feeds/hello', {
      method: 'GET',
      headers: { ...headers, accept: 'application/json' },
    });
    expect(res.status).toBe(200);
  });

  it('accepts a signed request when mounted at a deep nested prefix', async () => {
    const sf = buildSf();
    const app = new Hono();
    app.route('/api/v2/partners/sf', honoAdapter(sf));

    const headers = await signPartnerRequest({
      method: 'GET',
      path: '/feeds/hello',
      secret: SECRET,
    });

    const res = await app.request('/api/v2/partners/sf/feeds/hello', {
      method: 'GET',
      headers: { ...headers, accept: 'application/json' },
    });
    expect(res.status).toBe(200);
  });

  it('rejects a request signed with the mount-prefixed path (would be the bug)', async () => {
    const sf = buildSf();
    const app = new Hono();
    app.route('/shadowfeed', honoAdapter(sf));

    // Signing with the FULL path (including mount) should fail — proves the
    // contract: signer uses manifest-relative path, not the deployed URL.
    const headers = await signPartnerRequest({
      method: 'GET',
      path: '/shadowfeed/feeds/hello',
      secret: SECRET,
    });

    const res = await app.request('/shadowfeed/feeds/hello', {
      method: 'GET',
      headers: { ...headers, accept: 'application/json' },
    });
    expect(res.status).toBe(401);
  });
});
