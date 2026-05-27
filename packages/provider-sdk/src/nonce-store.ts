// In-memory LRU nonce store for development and single-process deployments.
//
// NOT suitable for multi-process or multi-instance deployments — two instances
// each holding half the nonce history cannot detect cross-instance replays.
// For production under load, pass a Redis- or KV-backed NonceStore to the
// ShadowFeedProvider constructor.

import type { NonceStore } from './types.js';

interface NonceEntry {
  expiresAt: number;
}

// Simple LRU implemented as an insertion-order Map.
// When capacity is hit we evict the oldest entries first.
export class MemoryNonceStore implements NonceStore {
  private readonly store: Map<string, NonceEntry>;
  private readonly maxSize: number;

  constructor(maxSize = 10_000) {
    this.store = new Map();
    this.maxSize = maxSize;
  }

  async reserve(nonce: string, expiresAt: number): Promise<boolean> {
    this.evictExpired();

    if (this.store.has(nonce)) return false;

    // Evict oldest entry when at capacity to bound memory usage.
    if (this.store.size >= this.maxSize) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }

    this.store.set(nonce, { expiresAt });
    return true;
  }

  // Sweep entries whose TTL has elapsed. Called before each reserve() so the
  // store self-cleans without a background timer (no Node-specific APIs needed).
  private evictExpired(): void {
    const now = Math.floor(Date.now() / 1000);
    for (const [key, entry] of this.store) {
      if (entry.expiresAt < now) {
        this.store.delete(key);
      } else {
        // Map iterates in insertion order — once we hit a non-expired entry
        // break early; older entries are at the front.
        break;
      }
    }
  }

  // Exposed for testing only.
  get size(): number {
    return this.store.size;
  }
}
