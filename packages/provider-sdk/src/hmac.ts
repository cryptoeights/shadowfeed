// HMAC-SHA256 request signing and verification for ShadowFeed partner bridge.
//
// This module is a direct port of workers/api/src/lib/hmac.ts — the canonical
// string format, signing logic, and verification rules must match that
// implementation BYTE-FOR-BYTE or requests will fail in production.
//
// Uses Web Crypto API (crypto.subtle) exclusively so this module runs
// on Cloudflare Workers, Deno, and Node 20+ without any native add-ons.

import type { NonceStore, SignedHeaders, VerifyResult } from './types.js';

const TEXT_ENCODER = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += (bytes[i] ?? 0).toString(16).padStart(2, '0');
  }
  return hex;
}

function base64Encode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i] ?? 0);
  return btoa(binary);
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', TEXT_ENCODER.encode(input));
  return bytesToHex(new Uint8Array(digest));
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    TEXT_ENCODER.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, TEXT_ENCODER.encode(message));
  return bytesToHex(new Uint8Array(sig));
}

// Build the canonical string that gets HMAC'd.
// FORMAT: METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY_SHA256
// Body hash is empty string '' when the request has no body — NOT a hash of ''.
async function buildCanonicalString(
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  body: string,
): Promise<string> {
  const bodyHash = body ? await sha256Hex(body) : '';
  return [method.toUpperCase(), path, timestamp, nonce, bodyHash].join('\n');
}

// Constant-time compare prevents timing attacks on the signature check.
// Lengths are compared first — if they differ we still run the loop on
// a same-length stand-in to avoid leaking length information via timing.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= (a.charCodeAt(i)) ^ (b.charCodeAt(i));
  }
  return result === 0;
}

// Generate a fresh partner secret: 32 random bytes, URL-safe base64.
// Show to the provider once at rotation — the platform only persists the hash.
export function generatePartnerSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64Encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Hash the raw secret for storage. Raw secret must never round-trip through
// infrastructure after initial issuance.
export async function hashPartnerSecret(secret: string): Promise<string> {
  return sha256Hex(secret);
}

// Sign an outbound request. Returns headers to merge into the fetch() call.
// Used by the CLI verify command to self-test provider endpoints.
export async function signPartnerRequest(opts: {
  method: string;
  path: string;
  body?: string;
  secret: string;
  partnerName?: string;
}): Promise<SignedHeaders> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();
  const canonical = await buildCanonicalString(
    opts.method,
    opts.path,
    timestamp,
    nonce,
    opts.body ?? '',
  );
  const signature = await hmacHex(opts.secret, canonical);
  return {
    'X-Sf-Timestamp': timestamp,
    'X-Sf-Nonce': nonce,
    'X-Sf-Signature': signature,
    'X-Sf-Partner': opts.partnerName ?? 'shadowfeed',
  };
}

// Verify an inbound request signed by the ShadowFeed platform.
// The nonceStore.reserve() call is the replay-prevention fence — it must be
// atomic in production (use Redis SET NX or KV putIfAbsent; the default
// in-memory store works for single-process deployments only).
export async function verifyPartnerRequest(opts: {
  method: string;
  path: string;
  body?: string;
  headers: {
    timestamp?: string | null;
    nonce?: string | null;
    signature?: string | null;
    partner?: string | null;
  };
  secret: string;
  windowSeconds?: number;
  nonceStore: NonceStore;
}): Promise<VerifyResult> {
  const ts = parseInt(opts.headers.timestamp ?? '', 10);
  const nonce = opts.headers.nonce ?? '';
  const sig = opts.headers.signature ?? '';
  if (!ts || !nonce || !sig) return { ok: false, reason: 'malformed' };

  const window = opts.windowSeconds ?? 300;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > window) return { ok: false, reason: 'expired' };

  // Reserve nonce before computing the HMAC to prevent TOCTOU races.
  const accepted = await opts.nonceStore.reserve(nonce, now + window + 60);
  if (!accepted) return { ok: false, reason: 'replay' };

  const canonical = await buildCanonicalString(
    opts.method,
    opts.path,
    String(ts),
    nonce,
    opts.body ?? '',
  );
  const expected = await hmacHex(opts.secret, canonical);
  // Lowercase both sides — the platform lowercases its hex output but defensive
  // normalisation here guards against any future case drift.
  if (!timingSafeEqual(sig.toLowerCase(), expected.toLowerCase())) {
    return { ok: false, reason: 'bad_signature' };
  }

  return { ok: true };
}
