// @shadowfeed/provider-sdk — main entry point.
//
// Quickstart:
//
//   import { ShadowFeedProvider } from '@shadowfeed/provider-sdk';
//   import expressAdapter from '@shadowfeed/provider-sdk/express';
//
//   const sf = new ShadowFeedProvider({
//     handle: 'your-handle',
//     secret: process.env.SHADOWFEED_PARTNER_SECRET!,
//   });
//
//   sf.feed('your-feed-slug', {
//     description: 'What this feed returns',
//     priceStx: 0.005,
//     handler: async (ctx) => ({ data: 'value' }),
//   });
//
//   app.use('/shadowfeed', expressAdapter(sf));
//
// See: https://shadowfeed.app/docs/provider-sdk

export { ShadowFeedProvider } from './provider.js';
export { MemoryNonceStore } from './nonce-store.js';
export { buildManifest, slugToName } from './manifest.js';
export { signPartnerRequest, generatePartnerSecret, hashPartnerSecret, verifyPartnerRequest } from './hmac.js';
export { SignatureError, FeedNotFoundError, HandlerError } from './errors.js';

export type {
  FeedCategory,
  FeedConfig,
  FeedHandler,
  FeedHandlerContext,
  NonceStore,
  ProviderConfig,
  ProviderManifest,
  RegisteredFeed,
  SignedHeaders,
  VerifyResult,
} from './types.js';
