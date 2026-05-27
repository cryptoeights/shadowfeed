// Core types for @shadowfeed/provider-sdk.

export type FeedCategory =
  | 'discovery'
  | 'analytics'
  | 'on-chain'
  | 'defi'
  | 'sentiment'
  | 'security'
  | 'governance'
  | 'bridge'
  | 'other';

export interface FeedHandlerContext {
  feedSlug: string;
  /** Who is calling. Always 'shadowfeed' for M2. */
  partnerName: string;
  /** Unix epoch seconds from the X-Sf-Timestamp header. */
  timestamp: number;
}

export type FeedHandler<T = unknown> = (ctx: FeedHandlerContext) => Promise<T> | T;

export interface FeedConfig<T = unknown> {
  description: string;
  category?: FeedCategory;
  /** Suggested price in STX — informational, stored in platform records. */
  priceStx?: number;
  handler: FeedHandler<T>;
}

export interface RegisteredFeed {
  readonly slug: string;
  readonly description: string;
  readonly category: FeedCategory;
  readonly priceStx: number;
}

export interface ProviderConfig {
  handle: string;
  secret: string;
  /** Expected value of X-Sf-Partner header. Defaults to 'shadowfeed'. */
  partnerName?: string;
  /** Timestamp validity window in seconds. Defaults to 300 (±5 min). */
  timestampWindowSeconds?: number;
  description?: string;
  website?: string;
  twitterHandle?: string;
  /** Custom nonce storage. Defaults to in-memory LRU cache. */
  nonceStore?: NonceStore;
}

export interface NonceStore {
  /**
   * Atomically reserve a nonce. Return false if already used (replay).
   * @param nonce - UUID v4 string
   * @param expiresAt - Unix epoch seconds after which this nonce slot can be
   *   garbage-collected (window + 60s safety buffer).
   */
  reserve(nonce: string, expiresAt: number): Promise<boolean>;
}

// Headers returned by signPartnerRequest — merged into outbound fetch() calls.
export interface SignedHeaders {
  'X-Sf-Timestamp': string;
  'X-Sf-Nonce': string;
  'X-Sf-Signature': string;
  'X-Sf-Partner': string;
}

// VerifyResult mirrors the platform's VerifyResult shape byte-for-byte
// so adapters can pass it through unchanged.
export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'expired' | 'replay' | 'bad_signature' | 'malformed' };

// ---- Manifest ----------------------------------------------------------------

export interface ManifestProvider {
  handle: string;
  name: string;
  description?: string;
  website?: string;
  twitter_handle?: string;
}

export interface ManifestFeed {
  slug: string;
  name: string;
  description: string;
  category: string;
  path: string;
  method: 'GET';
  suggested_price_stx: number;
}

export interface ManifestSdk {
  name: string;
  version: string;
}

export interface ProviderManifest {
  version: '1';
  provider: ManifestProvider;
  feeds: ManifestFeed[];
  sdk: ManifestSdk;
}
