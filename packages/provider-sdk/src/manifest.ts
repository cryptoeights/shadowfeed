// Manifest builder for .well-known/shadowfeed-feeds.json
//
// The manifest is the contract the ShadowFeed platform uses to discover and
// register feeds. It must be publicly accessible at:
//   GET <provider-base>/.well-known/shadowfeed-feeds.json

import type { ManifestFeed, ManifestProvider, ProviderManifest, RegisteredFeed } from './types.js';

const SDK_NAME = '@shadowfeed/provider-sdk';
// Version is inlined at build time — kept in sync with package.json via the
// build process. Consumers should not rely on this value programmatically.
const SDK_VERSION = '0.1.0';

// Derive a human-readable feed name from a slug (kebab-case → Title Case Words).
export function slugToName(slug: string): string {
  return slug
    .split('-')
    .map((word) => (word.length > 0 ? word[0]!.toUpperCase() + word.slice(1) : ''))
    .join(' ');
}

// Derive a human-readable provider name from the handle.
function handleToName(handle: string): string {
  return handle
    .split(/[-_]/)
    .map((word) => (word.length > 0 ? word[0]!.toUpperCase() + word.slice(1) : ''))
    .join(' ');
}

export interface ManifestBuilderInput {
  handle: string;
  description?: string;
  website?: string;
  twitterHandle?: string;
  feeds: ReadonlyArray<RegisteredFeed>;
  /** Base path where the adapter is mounted, e.g. '/shadowfeed'. */
  basePath?: string;
}

export function buildManifest(input: ManifestBuilderInput): ProviderManifest {
  const base = (input.basePath ?? '').replace(/\/$/, '');

  const provider: ManifestProvider = {
    handle: input.handle,
    name: handleToName(input.handle),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.website !== undefined ? { website: input.website } : {}),
    ...(input.twitterHandle !== undefined ? { twitter_handle: input.twitterHandle } : {}),
  };

  const feeds: ManifestFeed[] = input.feeds.map((f) => ({
    slug: f.slug,
    name: slugToName(f.slug),
    description: f.description,
    category: f.category,
    path: `${base}/feeds/${f.slug}`,
    method: 'GET',
    suggested_price_stx: f.priceStx,
  }));

  return {
    version: '1',
    provider,
    feeds,
    sdk: {
      name: SDK_NAME,
      version: SDK_VERSION,
    },
  };
}
