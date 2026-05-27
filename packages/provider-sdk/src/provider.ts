// ShadowFeedProvider — the central class providers interact with.
//
// Responsibilities:
//   1. Registry: accept feed registrations, enforce no-duplicate slugs.
//   2. Verification: expose verifyRequest() backed by the HMAC module.
//   3. Dispatch: run a registered handler given a slug + context.
//   4. Manifest: auto-build the .well-known JSON from registered feeds.

import { FeedNotFoundError, HandlerError, SignatureError } from './errors.js';
import { verifyPartnerRequest } from './hmac.js';
import { buildManifest } from './manifest.js';
import { MemoryNonceStore } from './nonce-store.js';
import type {
  FeedConfig,
  FeedHandlerContext,
  NonceStore,
  ProviderConfig,
  ProviderManifest,
  RegisteredFeed,
  VerifyResult,
} from './types.js';

// Internal shape that holds both config and the handler function.
interface FeedEntry<T = unknown> {
  readonly slug: string;
  readonly description: string;
  readonly category: string;
  readonly priceStx: number;
  readonly handler: FeedConfig<T>['handler'];
}

export interface VerifyInput {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body?: string;
}

export class ShadowFeedProvider {
  private readonly config: Readonly<ProviderConfig>;
  // Use Map to preserve registration order (for deterministic manifest output).
  private readonly feeds: Map<string, FeedEntry> = new Map();
  private readonly nonceStore: NonceStore;

  constructor(config: ProviderConfig) {
    if (!config.handle || typeof config.handle !== 'string') {
      throw new TypeError('ShadowFeedProvider: handle is required');
    }
    if (!config.secret || typeof config.secret !== 'string') {
      throw new TypeError('ShadowFeedProvider: secret is required');
    }
    this.config = { ...config };
    this.nonceStore = config.nonceStore ?? new MemoryNonceStore();
  }

  // Register a feed. Throws if the slug is already registered.
  feed<T = unknown>(slug: string, feedConfig: FeedConfig<T>): this {
    if (!slug || typeof slug !== 'string') {
      throw new TypeError('feed(): slug must be a non-empty string');
    }
    if (this.feeds.has(slug)) {
      throw new Error(`feed(): slug "${slug}" is already registered`);
    }
    if (typeof feedConfig.handler !== 'function') {
      throw new TypeError(`feed("${slug}"): handler must be a function`);
    }

    const entry: FeedEntry<T> = {
      slug,
      description: feedConfig.description,
      category: feedConfig.category ?? 'other',
      priceStx: feedConfig.priceStx ?? 0,
      handler: feedConfig.handler,
    };

    // Immutable registration: build a new Map rather than mutating in-place.
    this.feeds.set(slug, entry);
    return this;
  }

  // Returns a frozen snapshot of registered feeds (no handler exposed).
  listFeeds(): ReadonlyArray<RegisteredFeed> {
    return Object.freeze(
      [...this.feeds.values()].map((e) =>
        Object.freeze<RegisteredFeed>({
          slug: e.slug,
          description: e.description,
          category: e.category as RegisteredFeed['category'],
          priceStx: e.priceStx,
        }),
      ),
    );
  }

  // Build the .well-known manifest from all registered feeds.
  getManifest(opts?: { basePath?: string }): ProviderManifest {
    return buildManifest({
      handle: this.config.handle,
      description: this.config.description,
      website: this.config.website,
      twitterHandle: this.config.twitterHandle,
      feeds: this.listFeeds(),
      basePath: opts?.basePath,
    });
  }

  // Verify an inbound request from the platform. Returns VerifyResult so
  // adapters can decide how to respond (throw vs. 401 vs. 403).
  async verifyRequest(input: VerifyInput): Promise<VerifyResult> {
    const h = input.headers;
    const pick = (name: string): string | undefined => {
      const val = h[name.toLowerCase()] ?? h[name];
      return Array.isArray(val) ? val[0] : val;
    };

    return verifyPartnerRequest({
      method: input.method,
      path: input.path,
      body: input.body,
      headers: {
        timestamp: pick('x-sf-timestamp') ?? null,
        nonce: pick('x-sf-nonce') ?? null,
        signature: pick('x-sf-signature') ?? null,
        partner: pick('x-sf-partner') ?? null,
      },
      secret: this.config.secret,
      windowSeconds: this.config.timestampWindowSeconds,
      nonceStore: this.nonceStore,
    });
  }

  // Dispatch: verify the request, then run the handler.
  // Throws SignatureError, FeedNotFoundError, or HandlerError.
  async dispatch(slug: string, input: VerifyInput): Promise<unknown> {
    const result = await this.verifyRequest(input);
    if (!result.ok) {
      throw new SignatureError(result.reason);
    }

    const entry = this.feeds.get(slug);
    if (!entry) {
      throw new FeedNotFoundError(slug);
    }

    const ctx: FeedHandlerContext = {
      feedSlug: slug,
      partnerName: (input.headers['x-sf-partner'] as string | undefined) ?? 'shadowfeed',
      timestamp: parseInt(
        (input.headers['x-sf-timestamp'] as string | undefined) ?? '0',
        10,
      ),
    };

    try {
      return await entry.handler(ctx);
    } catch (err) {
      throw new HandlerError(slug, err);
    }
  }

  // Accessors for adapters.
  get handle(): string {
    return this.config.handle;
  }

  get partnerName(): string {
    return this.config.partnerName ?? 'shadowfeed';
  }
}
