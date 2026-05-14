// Hosted-mirror poller. Runs from the scheduled() cron handler — fetches the
// latest payload for every hosted_mirror feed whose poll window has lapsed,
// writes to KV (hot path) and D1 feed_cache (durable).
//
// Supported sources:
//   - r2_url      → simple HTTPS GET against the configured URL
//   - github_raw  → simple HTTPS GET (GitHub raw content URLs)
//
// webhook_push and manual_upload don't need polling — they push data to us
// directly via dedicated POST endpoints (added later).
//
// Per-feed budget: 8s timeout, 1MB max payload. Larger payloads get rejected
// to keep KV / D1 row sizes bounded.

import type { Env } from '../types';
import {
  findFeedsDueForPoll,
  updatePollState,
  upsertFeedCache,
  type ProviderFeedRow,
} from './providers-repo';

const MAX_PAYLOAD_BYTES = 1024 * 1024;     // 1 MB
const FETCH_TIMEOUT_MS = 8000;

const TEXT_ENCODER = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', TEXT_ENCODER.encode(input));
  return bytesToHex(new Uint8Array(digest));
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { 'accept': 'application/json' },
    });
  } finally {
    clearTimeout(t);
  }
}

async function pollOne(env: Env, feed: ProviderFeedRow): Promise<string> {
  if (!feed.source_url) return 'error: no source_url';
  try {
    const res = await fetchWithTimeout(feed.source_url, FETCH_TIMEOUT_MS);
    if (!res.ok) return `error: upstream ${res.status}`;

    // Stream-read to enforce size cap
    const contentLength = res.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_BYTES) {
      return `error: payload too large (${contentLength} bytes)`;
    }
    const text = await res.text();
    if (text.length > MAX_PAYLOAD_BYTES) {
      return `error: payload too large (${text.length} bytes)`;
    }

    // Validate JSON. We require feeds to be JSON-shaped for downstream serving.
    try {
      JSON.parse(text);
    } catch {
      return 'error: payload is not valid JSON';
    }

    const hash = await sha256Hex(text);

    await Promise.all([
      env.CACHE.put(`feed-cache:${feed.id}`, text, { expirationTtl: Math.max(60, feed.poll_interval_seconds ?? 300) * 2 }),
      upsertFeedCache(env.DB, feed.id, text, hash),
    ]);

    return 'ok';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `error: ${msg.slice(0, 200)}`;
  }
}

// Entry point called from scheduled(). Fans out poll work in small batches so
// any single Worker invocation stays under its CPU budget.
export async function runHostedMirrorPoller(env: Env): Promise<{ polled: number; ok: number; failed: number }> {
  const now = Math.floor(Date.now() / 1000);
  const due = await findFeedsDueForPoll(env.DB, now);

  if (due.length === 0) {
    return { polled: 0, ok: 0, failed: 0 };
  }

  // Cap per-tick work — we run every minute, so 25 feeds/tick is plenty.
  const batch = due.slice(0, 25);
  const results = await Promise.all(
    batch.map(async (feed) => {
      const status = await pollOne(env, feed);
      await updatePollState(env.DB, feed.id, status);
      return status;
    }),
  );

  return {
    polled: batch.length,
    ok: results.filter((s) => s === 'ok').length,
    failed: results.filter((s) => s !== 'ok').length,
  };
}
