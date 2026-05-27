// Tests for the HMAC verification layer.
//
// All vectors are hand-crafted against the canonical string spec:
//   METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY_SHA256
//
// The goal is to confirm byte-for-byte compatibility with
// workers/api/src/lib/hmac.ts.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signPartnerRequest, verifyPartnerRequest } from '../src/hmac.js';
import { MemoryNonceStore } from '../src/nonce-store.js';

const SECRET = 'test-secret-key-for-hmac-testing';
const NOW_SECONDS = 1_700_000_000;

describe('signPartnerRequest', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW_SECONDS * 1000);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });

  it('returns all four required headers', async () => {
    const headers = await signPartnerRequest({
      method: 'GET',
      path: '/feeds/hello',
      secret: SECRET,
    });

    expect(headers['X-Sf-Timestamp']).toBe(String(NOW_SECONDS));
    expect(headers['X-Sf-Nonce']).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(headers['X-Sf-Signature']).toMatch(/^[0-9a-f]{64}$/);
    expect(headers['X-Sf-Partner']).toBe('shadowfeed');
  });

  it('uses custom partnerName when provided', async () => {
    const headers = await signPartnerRequest({
      method: 'GET',
      path: '/feeds/hello',
      secret: SECRET,
      partnerName: 'hyre',
    });
    expect(headers['X-Sf-Partner']).toBe('hyre');
  });

  it('produces the same signature regardless of method case', async () => {
    const upper = await signPartnerRequest({ method: 'GET', path: '/f', secret: SECRET });
    // Reset the mock UUID so both calls use the same nonce
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    const lower = await signPartnerRequest({ method: 'get', path: '/f', secret: SECRET });
    expect(upper['X-Sf-Signature']).toBe(lower['X-Sf-Signature']);
  });
});

describe('verifyPartnerRequest — happy path', () => {
  it('verifies a freshly signed request', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW_SECONDS * 1000);

    const store = new MemoryNonceStore();
    const headers = await signPartnerRequest({
      method: 'GET',
      path: '/feeds/wallet-pnl',
      secret: SECRET,
    });

    const result = await verifyPartnerRequest({
      method: 'GET',
      path: '/feeds/wallet-pnl',
      headers: {
        timestamp: headers['X-Sf-Timestamp'],
        nonce: headers['X-Sf-Nonce'],
        signature: headers['X-Sf-Signature'],
        partner: headers['X-Sf-Partner'],
      },
      secret: SECRET,
      nonceStore: store,
    });

    expect(result).toEqual({ ok: true });
  });
});

describe('verifyPartnerRequest — rejection cases', () => {
  let store: MemoryNonceStore;

  beforeEach(() => {
    store = new MemoryNonceStore();
  });

  it('returns malformed when required headers are missing', async () => {
    const result = await verifyPartnerRequest({
      method: 'GET',
      path: '/feeds/test',
      headers: { timestamp: null, nonce: null, signature: null, partner: null },
      secret: SECRET,
      nonceStore: store,
    });
    expect(result).toEqual({ ok: false, reason: 'malformed' });
  });

  it('returns malformed when timestamp is not a number', async () => {
    const result = await verifyPartnerRequest({
      method: 'GET',
      path: '/feeds/test',
      headers: {
        timestamp: 'not-a-number',
        nonce: crypto.randomUUID(),
        signature: 'abcd',
        partner: 'shadowfeed',
      },
      secret: SECRET,
      nonceStore: store,
    });
    expect(result).toEqual({ ok: false, reason: 'malformed' });
  });

  it('returns expired when timestamp is older than window', async () => {
    // Sign the request at NOW so the timestamp is NOW_SECONDS.
    vi.spyOn(Date, 'now').mockReturnValue(NOW_SECONDS * 1000);
    const headers = await signPartnerRequest({
      method: 'GET',
      path: '/feeds/test',
      secret: SECRET,
    });

    // Advance time by 400s (> 300s window) before verifying.
    vi.spyOn(Date, 'now').mockReturnValue((NOW_SECONDS + 400) * 1000);

    const result = await verifyPartnerRequest({
      method: 'GET',
      path: '/feeds/test',
      headers: {
        timestamp: headers['X-Sf-Timestamp'],
        nonce: headers['X-Sf-Nonce'],
        signature: headers['X-Sf-Signature'],
        partner: headers['X-Sf-Partner'],
      },
      secret: SECRET,
      windowSeconds: 300,
      nonceStore: store,
    });

    expect(result).toEqual({ ok: false, reason: 'expired' });
  });

  it('returns replay on second request with same nonce', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW_SECONDS * 1000);
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('replay-nonce-0000-0000-000000000000');

    const headers = await signPartnerRequest({
      method: 'GET',
      path: '/feeds/test',
      secret: SECRET,
    });

    const opts = {
      method: 'GET',
      path: '/feeds/test',
      headers: {
        timestamp: headers['X-Sf-Timestamp'],
        nonce: headers['X-Sf-Nonce'],
        signature: headers['X-Sf-Signature'],
        partner: headers['X-Sf-Partner'],
      },
      secret: SECRET,
      nonceStore: store,
    };

    const first = await verifyPartnerRequest(opts);
    const second = await verifyPartnerRequest(opts);

    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: false, reason: 'replay' });
  });

  it('returns bad_signature when signature is tampered', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW_SECONDS * 1000);

    const headers = await signPartnerRequest({
      method: 'GET',
      path: '/feeds/test',
      secret: SECRET,
    });

    const result = await verifyPartnerRequest({
      method: 'GET',
      path: '/feeds/test',
      headers: {
        timestamp: headers['X-Sf-Timestamp'],
        nonce: headers['X-Sf-Nonce'],
        signature: headers['X-Sf-Signature'].replace(/.$/, 'f'), // flip last char
        partner: headers['X-Sf-Partner'],
      },
      secret: SECRET,
      nonceStore: store,
    });

    expect(result).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('returns bad_signature when wrong secret is used', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW_SECONDS * 1000);

    const headers = await signPartnerRequest({
      method: 'GET',
      path: '/feeds/test',
      secret: SECRET,
    });

    const result = await verifyPartnerRequest({
      method: 'GET',
      path: '/feeds/test',
      headers: {
        timestamp: headers['X-Sf-Timestamp'],
        nonce: headers['X-Sf-Nonce'],
        signature: headers['X-Sf-Signature'],
        partner: headers['X-Sf-Partner'],
      },
      secret: 'wrong-secret',
      nonceStore: store,
    });

    expect(result).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('returns bad_signature when path does not match', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW_SECONDS * 1000);

    const headers = await signPartnerRequest({
      method: 'GET',
      path: '/feeds/real-path',
      secret: SECRET,
    });

    const result = await verifyPartnerRequest({
      method: 'GET',
      path: '/feeds/different-path', // path mismatch
      headers: {
        timestamp: headers['X-Sf-Timestamp'],
        nonce: headers['X-Sf-Nonce'],
        signature: headers['X-Sf-Signature'],
        partner: headers['X-Sf-Partner'],
      },
      secret: SECRET,
      nonceStore: store,
    });

    expect(result).toEqual({ ok: false, reason: 'bad_signature' });
  });
});
