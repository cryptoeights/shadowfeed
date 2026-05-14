// HMAC request signing for partner_bridge mode. We use this when proxying
// agent requests to a provider's private partner endpoint — the partner
// authenticates the call by re-computing the HMAC with their copy of the
// shared secret.
//
// Design choices:
//   - HMAC-SHA256 (industry standard, widely supported in any language).
//   - Canonical string = METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY_SHA256.
//   - Timestamp window = ±5 min (clock skew tolerant, replay-resistant).
//   - Nonce uniqueness enforced by D1 hmac_nonces table (~5min TTL).
//   - Secret is stored as a sha256 hash in DB so leaked DB doesn't compromise
//     existing partner integrations — we hand the raw secret to the provider
//     once at rotation time and never recover it.

const TEXT_ENCODER = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function base64Encode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
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

// Generate a fresh partner secret (32 random bytes, url-safe base64).
// Show this to the provider once when they rotate; we only persist the hash.
export function generatePartnerSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64Encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Hash the secret for storage in DB. The raw secret never round-trips through
// our infrastructure after rotation — we keep only this hash.
export async function hashPartnerSecret(secret: string): Promise<string> {
  return sha256Hex(secret);
}

export interface SignedHeaders {
  'X-Sf-Timestamp': string;
  'X-Sf-Nonce': string;
  'X-Sf-Signature': string;
  'X-Sf-Partner': string;
}

// Build the canonical string that gets HMAC'd. Both sides must derive the
// SAME canonical form for the signature to verify.
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

// Sign an outbound request to a partner endpoint. Returned headers should be
// merged into the fetch() request.
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

// Constant-time string compare to prevent timing attacks on signature check.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'expired' | 'replay' | 'bad_signature' | 'malformed' };

// Verify an inbound request signed by a partner. Used if we ever expose
// signed callbacks (e.g. provider pushing data into hosted_mirror mode).
//
// Caller passes a `markNonceUsed` callback that should insert into hmac_nonces
// (or KV) — we keep this lib pure and let the caller manage storage.
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
  markNonceUsed: (nonce: string, expiresAt: number) => Promise<boolean>;
}): Promise<VerifyResult> {
  const ts = parseInt(opts.headers.timestamp ?? '', 10);
  const nonce = opts.headers.nonce ?? '';
  const sig = opts.headers.signature ?? '';
  if (!ts || !nonce || !sig) return { ok: false, reason: 'malformed' };

  const window = opts.windowSeconds ?? 300; // ±5 min
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > window) return { ok: false, reason: 'expired' };

  // Reserve the nonce — returns false if already used.
  const accepted = await opts.markNonceUsed(nonce, now + window);
  if (!accepted) return { ok: false, reason: 'replay' };

  const canonical = await buildCanonicalString(
    opts.method,
    opts.path,
    String(ts),
    nonce,
    opts.body ?? '',
  );
  const expected = await hmacHex(opts.secret, canonical);
  if (!timingSafeEqual(sig.toLowerCase(), expected.toLowerCase())) {
    return { ok: false, reason: 'bad_signature' };
  }

  return { ok: true };
}

// Mark a nonce as used in D1. Returns false if it already exists (replay).
// Designed to be passed as `markNonceUsed` to verifyPartnerRequest.
export async function reserveNonceD1(
  db: D1Database,
  nonce: string,
  partnerId: string,
  expiresAt: number,
): Promise<boolean> {
  try {
    await db
      .prepare(
        'INSERT INTO hmac_nonces (nonce, partner_id, expires_at) VALUES (?, ?, ?)',
      )
      .bind(nonce, partnerId, expiresAt)
      .run();
    return true;
  } catch {
    // Most likely UNIQUE constraint violation = replay.
    return false;
  }
}

// Sweep expired nonces. Call from scheduled() cron.
export async function sweepExpiredNonces(db: D1Database): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare('DELETE FROM hmac_nonces WHERE expires_at < ?')
    .bind(now)
    .run();
  return result.meta?.changes ?? 0;
}
