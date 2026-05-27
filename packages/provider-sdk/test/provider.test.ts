// Tests for ShadowFeedProvider — registration, dispatch, manifest.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedNotFoundError, HandlerError, SignatureError } from '../src/errors.js';
import { signPartnerRequest } from '../src/hmac.js';
import { ShadowFeedProvider } from '../src/provider.js';

const SECRET = 'provider-test-secret-abc123';
const NOW_SECONDS = 1_700_000_000;

function makeProvider(): ShadowFeedProvider {
  return new ShadowFeedProvider({ handle: 'test-provider', secret: SECRET });
}

describe('ShadowFeedProvider construction', () => {
  it('throws when handle is missing', () => {
    expect(
      () => new ShadowFeedProvider({ handle: '', secret: SECRET }),
    ).toThrow(TypeError);
  });

  it('throws when secret is missing', () => {
    expect(
      () => new ShadowFeedProvider({ handle: 'test', secret: '' }),
    ).toThrow(TypeError);
  });
});

describe('feed registration', () => {
  it('registers a feed and returns the provider for chaining', () => {
    const sf = makeProvider();
    const returned = sf.feed('hello', {
      description: 'Hello feed',
      handler: async () => ({ msg: 'hello' }),
    });
    expect(returned).toBe(sf);
  });

  it('throws on duplicate slug registration', () => {
    const sf = makeProvider();
    sf.feed('hello', { description: 'First', handler: async () => ({}) });
    expect(() =>
      sf.feed('hello', { description: 'Second', handler: async () => ({}) }),
    ).toThrow('already registered');
  });

  it('throws when slug is empty', () => {
    const sf = makeProvider();
    expect(() =>
      sf.feed('', { description: 'x', handler: async () => ({}) }),
    ).toThrow(TypeError);
  });

  it('throws when handler is not a function', () => {
    const sf = makeProvider();
    expect(() =>
      // @ts-expect-error intentional bad input for test
      sf.feed('bad', { description: 'x', handler: 'not-a-function' }),
    ).toThrow(TypeError);
  });
});

describe('listFeeds', () => {
  it('returns a frozen array of registered feeds (no handler exposed)', () => {
    const sf = makeProvider();
    sf.feed('alpha', { description: 'Alpha', priceStx: 0.001, handler: async () => ({}) });
    sf.feed('beta', {
      description: 'Beta',
      category: 'analytics',
      priceStx: 0.002,
      handler: async () => ({}),
    });

    const feeds = sf.listFeeds();
    expect(feeds).toHaveLength(2);
    expect(Object.isFrozen(feeds)).toBe(true);
    expect(Object.isFrozen(feeds[0])).toBe(true);

    expect(feeds[0]).toMatchObject({ slug: 'alpha', priceStx: 0.001 });
    expect('handler' in (feeds[0] as object)).toBe(false);
  });

  it('defaults category to "other" when not provided', () => {
    const sf = makeProvider();
    sf.feed('no-cat', { description: 'x', handler: async () => ({}) });
    expect(sf.listFeeds()[0]?.category).toBe('other');
  });
});

describe('getManifest', () => {
  it('builds manifest from registered feeds', () => {
    const sf = new ShadowFeedProvider({
      handle: 'hyre-agent',
      secret: SECRET,
      description: 'HYRE feeds',
      website: 'https://hyreagent.fun',
    });
    sf.feed('wallet-pnl', {
      description: 'Wallet PnL data',
      category: 'analytics',
      priceStx: 0.005,
      handler: async () => ({}),
    });

    const manifest = sf.getManifest({ basePath: '/shadowfeed' });
    expect(manifest.version).toBe('1');
    expect(manifest.provider.handle).toBe('hyre-agent');
    expect(manifest.feeds[0]?.path).toBe('/shadowfeed/feeds/wallet-pnl');
  });
});

describe('verifyRequest', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW_SECONDS * 1000);
  });

  it('returns ok:true for a valid signed request', async () => {
    const sf = makeProvider();
    const signed = await signPartnerRequest({
      method: 'GET',
      path: '/feeds/test',
      secret: SECRET,
    });

    const result = await sf.verifyRequest({
      method: 'GET',
      path: '/feeds/test',
      headers: {
        'x-sf-timestamp': signed['X-Sf-Timestamp'],
        'x-sf-nonce': signed['X-Sf-Nonce'],
        'x-sf-signature': signed['X-Sf-Signature'],
        'x-sf-partner': signed['X-Sf-Partner'],
      },
    });
    expect(result).toEqual({ ok: true });
  });

  it('returns ok:false for a bad signature', async () => {
    const sf = makeProvider();
    const signed = await signPartnerRequest({
      method: 'GET',
      path: '/feeds/test',
      secret: SECRET,
    });

    const result = await sf.verifyRequest({
      method: 'GET',
      path: '/feeds/test',
      headers: {
        'x-sf-timestamp': signed['X-Sf-Timestamp'],
        'x-sf-nonce': signed['X-Sf-Nonce'],
        'x-sf-signature': 'deadbeef'.repeat(8),
        'x-sf-partner': signed['X-Sf-Partner'],
      },
    });
    expect(result).toEqual({ ok: false, reason: 'bad_signature' });
  });
});

describe('dispatch', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW_SECONDS * 1000);
  });

  it('calls the handler and returns its result', async () => {
    const sf = makeProvider();
    sf.feed('prices', {
      description: 'Price data',
      handler: async (ctx) => ({ price: 42_000, slug: ctx.feedSlug }),
    });

    const signed = await signPartnerRequest({
      method: 'GET',
      path: '/feeds/prices',
      secret: SECRET,
    });

    const result = await sf.dispatch('prices', {
      method: 'GET',
      path: '/feeds/prices',
      headers: {
        'x-sf-timestamp': signed['X-Sf-Timestamp'],
        'x-sf-nonce': signed['X-Sf-Nonce'],
        'x-sf-signature': signed['X-Sf-Signature'],
        'x-sf-partner': signed['X-Sf-Partner'],
      },
    });
    expect(result).toEqual({ price: 42_000, slug: 'prices' });
  });

  it('throws SignatureError on bad signature', async () => {
    const sf = makeProvider();
    sf.feed('prices', { description: 'x', handler: async () => ({}) });

    await expect(
      sf.dispatch('prices', {
        method: 'GET',
        path: '/feeds/prices',
        headers: {
          'x-sf-timestamp': String(NOW_SECONDS),
          'x-sf-nonce': crypto.randomUUID(),
          'x-sf-signature': 'bad',
          'x-sf-partner': 'shadowfeed',
        },
      }),
    ).rejects.toThrow(SignatureError);
  });

  it('throws FeedNotFoundError for unregistered slug', async () => {
    const sf = makeProvider();

    const signed = await signPartnerRequest({
      method: 'GET',
      path: '/feeds/ghost',
      secret: SECRET,
    });

    await expect(
      sf.dispatch('ghost', {
        method: 'GET',
        path: '/feeds/ghost',
        headers: {
          'x-sf-timestamp': signed['X-Sf-Timestamp'],
          'x-sf-nonce': signed['X-Sf-Nonce'],
          'x-sf-signature': signed['X-Sf-Signature'],
          'x-sf-partner': signed['X-Sf-Partner'],
        },
      }),
    ).rejects.toThrow(FeedNotFoundError);
  });

  it('throws HandlerError when handler throws', async () => {
    const sf = makeProvider();
    sf.feed('broken', {
      description: 'x',
      handler: () => {
        throw new Error('upstream down');
      },
    });

    const signed = await signPartnerRequest({
      method: 'GET',
      path: '/feeds/broken',
      secret: SECRET,
    });

    await expect(
      sf.dispatch('broken', {
        method: 'GET',
        path: '/feeds/broken',
        headers: {
          'x-sf-timestamp': signed['X-Sf-Timestamp'],
          'x-sf-nonce': signed['X-Sf-Nonce'],
          'x-sf-signature': signed['X-Sf-Signature'],
          'x-sf-partner': signed['X-Sf-Partner'],
        },
      }),
    ).rejects.toThrow(HandlerError);
  });
});
