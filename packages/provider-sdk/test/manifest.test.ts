// Tests for the manifest builder.

import { describe, expect, it } from 'vitest';
import { buildManifest, slugToName } from '../src/manifest.js';
import type { RegisteredFeed } from '../src/types.js';

const FEEDS: ReadonlyArray<RegisteredFeed> = [
  {
    slug: 'wallet-pnl',
    description: 'Wallet profit and loss over time',
    category: 'analytics',
    priceStx: 0.005,
  },
  {
    slug: 'token-launches',
    description: 'Recent token launch events',
    category: 'discovery',
    priceStx: 0.002,
  },
];

describe('buildManifest', () => {
  it('produces the expected top-level shape', () => {
    const manifest = buildManifest({
      handle: 'hyre-agent',
      feeds: FEEDS,
    });

    expect(manifest.version).toBe('1');
    expect(manifest.provider.handle).toBe('hyre-agent');
    expect(manifest.feeds).toHaveLength(2);
    expect(manifest.sdk.name).toBe('@shadowfeed/provider-sdk');
    expect(manifest.sdk.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('derives provider name from handle', () => {
    const manifest = buildManifest({ handle: 'hyre-agent', feeds: FEEDS });
    expect(manifest.provider.name).toBe('Hyre Agent');
  });

  it('includes optional provider fields when provided', () => {
    const manifest = buildManifest({
      handle: 'hyre-agent',
      description: 'AI DeFi data',
      website: 'https://hyreagent.fun',
      twitterHandle: '@Hyre_agent',
      feeds: FEEDS,
    });

    expect(manifest.provider.description).toBe('AI DeFi data');
    expect(manifest.provider.website).toBe('https://hyreagent.fun');
    expect(manifest.provider.twitter_handle).toBe('@Hyre_agent');
  });

  it('omits optional provider fields when not provided', () => {
    const manifest = buildManifest({ handle: 'test', feeds: [] });
    expect('description' in manifest.provider).toBe(false);
    expect('website' in manifest.provider).toBe(false);
    expect('twitter_handle' in manifest.provider).toBe(false);
  });

  it('maps feeds with correct paths using basePath', () => {
    const manifest = buildManifest({
      handle: 'hyre-agent',
      feeds: FEEDS,
      basePath: '/shadowfeed',
    });

    const first = manifest.feeds[0]!;
    expect(first.path).toBe('/shadowfeed/feeds/wallet-pnl');
    expect(first.method).toBe('GET');
    expect(first.slug).toBe('wallet-pnl');
    expect(first.name).toBe('Wallet Pnl');
    expect(first.suggested_price_stx).toBe(0.005);
  });

  it('builds feed paths without basePath prefix', () => {
    const manifest = buildManifest({ handle: 'test', feeds: FEEDS });
    expect(manifest.feeds[0]!.path).toBe('/feeds/wallet-pnl');
  });

  it('preserves feed registration order', () => {
    const manifest = buildManifest({ handle: 'test', feeds: FEEDS });
    expect(manifest.feeds.map((f) => f.slug)).toEqual(['wallet-pnl', 'token-launches']);
  });
});

describe('slugToName', () => {
  it('converts kebab-case to Title Case', () => {
    expect(slugToName('wallet-pnl')).toBe('Wallet Pnl');
    expect(slugToName('token-launches')).toBe('Token Launches');
    expect(slugToName('hello')).toBe('Hello');
  });
});
