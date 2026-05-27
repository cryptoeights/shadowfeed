// Typed error classes for @shadowfeed/provider-sdk.
// Keep the set small — users should be able to catch on type, not string.

export class SignatureError extends Error {
  readonly reason: 'expired' | 'replay' | 'bad_signature' | 'malformed';

  constructor(reason: 'expired' | 'replay' | 'bad_signature' | 'malformed') {
    super(`HMAC verification failed: ${reason}`);
    this.name = 'SignatureError';
    this.reason = reason;
  }
}

export class FeedNotFoundError extends Error {
  readonly slug: string;

  constructor(slug: string) {
    super(`Feed not registered: "${slug}"`);
    this.name = 'FeedNotFoundError';
    this.slug = slug;
  }
}

export class HandlerError extends Error {
  readonly slug: string;
  override readonly cause: unknown;

  constructor(slug: string, cause: unknown) {
    const message =
      cause instanceof Error
        ? cause.message
        : String(cause);
    super(`Handler for feed "${slug}" threw: ${message}`);
    this.name = 'HandlerError';
    this.slug = slug;
    this.cause = cause;
  }
}
