// `shadowfeed verify` subcommand.
//
// Self-handshake test: signs requests using the same HMAC logic as the platform
// and fires them at the provider's own deployed endpoint to confirm everything
// is wired up correctly BEFORE submitting to the marketplace.

import { signPartnerRequest } from '../hmac.js';
import type { ProviderManifest } from '../types.js';

interface VerifyOptions {
  endpoint: string;
  secret: string;
  partnerName?: string;
}

// Simple ANSI colour helpers — no external deps.
const green = (s: string): string => `\x1b[32m${s}\x1b[0m`;
const red = (s: string): string => `\x1b[31m${s}\x1b[0m`;
const bold = (s: string): string => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string): string => `\x1b[2m${s}\x1b[0m`;

function pass(msg: string): void {
  process.stdout.write(`${green('✓')} ${msg}\n`);
}

function fail(msg: string, detail?: string): void {
  process.stderr.write(`${red('✗')} ${msg}\n`);
  if (detail) process.stderr.write(`  ${dim(detail)}\n`);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function runVerify(opts: VerifyOptions): Promise<void> {
  const base = opts.endpoint.replace(/\/$/, '');
  const partnerName = opts.partnerName ?? 'shadowfeed';

  process.stdout.write(bold('\nShadowFeed Provider Verification\n'));
  process.stdout.write(dim(`endpoint: ${base}\n\n`));

  // ── Step 1: manifest reachable ──────────────────────────────────────────
  const manifestUrl = `${base}/.well-known/shadowfeed-feeds.json`;
  let manifest: ProviderManifest;

  try {
    const res = await fetchWithTimeout(manifestUrl, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      fail(
        `Manifest reachable: ${manifestUrl}`,
        `HTTP ${res.status} ${res.statusText}`,
      );
      process.exit(1);
    }
    manifest = (await res.json()) as ProviderManifest;
    pass(`Manifest reachable: ${manifestUrl}`);
  } catch (err) {
    fail(
      `Manifest reachable: ${manifestUrl}`,
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }

  // ── Step 2: manifest schema valid ───────────────────────────────────────
  const feedCount = Array.isArray(manifest.feeds) ? manifest.feeds.length : 0;
  if (!manifest.version || !manifest.provider?.handle || feedCount === 0) {
    fail(
      'Manifest schema valid',
      'Missing required fields (version, provider.handle, feeds[])',
    );
    process.exit(1);
  }
  pass(`Manifest schema valid: ${feedCount} feed${feedCount !== 1 ? 's' : ''} registered`);

  // ── Step 3: HMAC handshake against the first feed ───────────────────────
  const firstFeed = manifest.feeds[0];
  if (!firstFeed) {
    fail('HMAC handshake', 'No feeds found in manifest');
    process.exit(1);
  }

  const feedPath = firstFeed.path.startsWith('/')
    ? firstFeed.path
    : `/${firstFeed.path}`;
  const feedUrl = `${base}${feedPath.replace(/^\/shadowfeed/, '')}`;

  // Build the signed path relative to the server root — must match what the
  // adapter passes to verifyRequest (i.e., the path after the mount point).
  const signPath = feedPath;

  let signedHeaders: Awaited<ReturnType<typeof signPartnerRequest>>;
  try {
    signedHeaders = await signPartnerRequest({
      method: 'GET',
      path: signPath,
      secret: opts.secret,
      partnerName,
    });
  } catch (err) {
    fail(
      'HMAC handshake: signing failed',
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }

  const start = Date.now();
  let feedRes: Response;
  try {
    feedRes = await fetchWithTimeout(feedUrl, {
      method: 'GET',
      headers: {
        ...signedHeaders,
        Accept: 'application/json',
      },
    });
  } catch (err) {
    fail(
      `HMAC handshake: request to ${feedUrl} failed`,
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }

  const elapsed = Date.now() - start;

  if (!feedRes.ok) {
    const body = await feedRes.text().catch(() => '');
    fail(
      `HMAC handshake: signed GET to ${feedPath} returned HTTP ${feedRes.status}`,
      body.slice(0, 200),
    );
    process.exit(1);
  }

  pass(
    `HMAC handshake: signed GET to ${feedPath} succeeded (HTTP ${feedRes.status}, ${elapsed}ms)`,
  );

  // ── Step 4: handler returned valid JSON ─────────────────────────────────
  try {
    const json = (await feedRes.json()) as unknown;
    if (typeof json !== 'object' || json === null) {
      fail('Handler returned valid JSON', 'Response is not an object');
      process.exit(1);
    }
    pass('Handler returned valid JSON');
  } catch {
    fail('Handler returned valid JSON', 'Response body is not valid JSON');
    process.exit(1);
  }

  // ── Done ────────────────────────────────────────────────────────────────
  process.stdout.write(
    `\n${green('Ready to onboard at:')} https://shadowfeed.app/onboard\n\n`,
  );
}
