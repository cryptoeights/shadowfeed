// Provider withdrawal flow. The provider sees their pending revenue counter
// in the dashboard and clicks "withdraw" — we then send a real STX transfer
// from the platform wallet to their chosen destination, while atomically
// debiting their counter.
//
// M2 model (counter-based, single signer):
//   - Inbound STX from agent payments lands on env.SERVER_ADDRESS (platform).
//   - Per-query accounting credits 97% to provider's pending_revenue_microstx.
//   - On withdraw: debit counter, sign+broadcast STX transfer from
//     env.SERVER_PRIVATE_KEY → destination, record tx hash.
//   - The custodial wallet (provider.custodial_address) is currently just an
//     identity stub; M3 adds a sweep so it carries real balance and signs
//     its own withdrawals.
//
// Safety:
//   - Idempotency key prevents double-spends from retried HTTP requests.
//   - Atomic SQL debit (only decrements if balance >= amount).
//   - On broadcast failure we restore the debited amount and mark withdrawal failed.

import { Hono } from 'hono';
import { broadcastTransaction, makeSTXTokenTransfer } from '@stacks/transactions';
import type { Env } from '../types';
import { authenticate } from './auth';
import {
  debitPendingRevenue,
  getProviderById,
  getWithdrawalById,
  getWithdrawalByIdempotencyKey,
  insertWithdrawal,
  logAudit,
  markWithdrawalBroadcast,
  markWithdrawalConfirmed,
  markWithdrawalFailed,
  restorePendingRevenue,
  bumpTotalWithdrawn,
} from './providers-repo';

export const providerWithdrawRoutes = new Hono<{ Bindings: Env }>();

// Hard limits to bound risk in the custodial design.
const MIN_WITHDRAWAL_MICROSTX = 1_000_000;            // 1 STX
const MAX_WITHDRAWAL_MICROSTX = 1000 * 1_000_000;     // 1000 STX per request

function bearerToken(authHeader: string | undefined): string | undefined {
  if (!authHeader) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  return m ? m[1] : undefined;
}

function isValidStacksAddress(addr: string): boolean {
  return /^S[PT][0-9A-Z]{38,40}$/.test(addr);
}

// POST /providers/id/:id/withdraw
//
// Body:
//   {
//     amount_microstx: number,
//     destination_address: string,
//     idempotency_key: string  (UUID, generated client-side)
//   }
providerWithdrawRoutes.post('/providers/id/:id/withdraw', async (c) => {
  const token = bearerToken(c.req.header('Authorization'));
  const me = await authenticate(c.env.DB, token);
  if (!me) return c.json({ error: 'unauthenticated' }, 401);

  const providerId = c.req.param('id');
  const provider = await getProviderById(c.env.DB, providerId);
  if (!provider) return c.json({ error: 'provider not found' }, 404);
  if (provider.user_id !== me.user_id) return c.json({ error: 'forbidden' }, 403);

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const amount = Number(body.amount_microstx ?? 0);
  const destination = String(body.destination_address ?? '').trim();
  const idempotencyKey = String(body.idempotency_key ?? '').trim();

  // ---- Validation gates --------------------------------------------------
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
    return c.json({ error: 'amount_microstx must be an integer' }, 400);
  }
  if (amount < MIN_WITHDRAWAL_MICROSTX) {
    return c.json({ error: `minimum withdrawal is ${MIN_WITHDRAWAL_MICROSTX / 1_000_000} STX` }, 400);
  }
  if (amount > MAX_WITHDRAWAL_MICROSTX) {
    return c.json({ error: `maximum withdrawal is ${MAX_WITHDRAWAL_MICROSTX / 1_000_000} STX per request` }, 400);
  }
  if (!isValidStacksAddress(destination)) {
    return c.json({ error: 'invalid destination_address' }, 400);
  }
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(idempotencyKey)) {
    return c.json({ error: 'idempotency_key must be 8-128 url-safe chars' }, 400);
  }

  // Security check: provider must have linked a withdrawal wallet, AND
  // destination must match it. This prevents account takeover from draining
  // funds to an attacker address.
  if (!provider.linked_withdrawal_address) {
    return c.json({
      error: 'no linked withdrawal wallet — link one via /link-wallet first',
    }, 400);
  }
  if (provider.linked_withdrawal_address !== destination) {
    return c.json({
      error: 'destination must match your linked withdrawal wallet',
      linked: provider.linked_withdrawal_address,
    }, 400);
  }

  if (amount > provider.pending_revenue_microstx) {
    return c.json({
      error: 'insufficient pending balance',
      pending_microstx: provider.pending_revenue_microstx,
      requested_microstx: amount,
    }, 400);
  }

  // ---- Idempotency check -------------------------------------------------
  const existing = await getWithdrawalByIdempotencyKey(c.env.DB, idempotencyKey);
  if (existing) {
    return c.json({
      withdrawal: shapeWithdrawal(existing),
      replay: true,
    });
  }

  // ---- Atomic debit ------------------------------------------------------
  const debited = await debitPendingRevenue(c.env.DB, provider.id, amount);
  if (!debited) {
    // Race condition — balance changed since check above. Surface as 409.
    return c.json({ error: 'pending balance changed concurrently, retry' }, 409);
  }

  // ---- Record withdrawal as pending --------------------------------------
  const withdrawal = await insertWithdrawal(c.env.DB, {
    provider_id: provider.id,
    amount_microstx: amount,
    destination_address: destination,
    idempotency_key: idempotencyKey,
  });

  await logAudit(c.env.DB, provider.id, 'withdraw_init', {
    withdrawal_id: withdrawal.id,
    amount_microstx: amount,
    destination,
  });

  // ---- Sign + broadcast --------------------------------------------------
  if (!c.env.SERVER_PRIVATE_KEY) {
    await restorePendingRevenue(c.env.DB, provider.id, amount);
    await markWithdrawalFailed(c.env.DB, withdrawal.id, 'SERVER_PRIVATE_KEY not configured');
    return c.json({ error: 'platform wallet not configured' }, 500);
  }

  const network = (c.env.NETWORK === 'mainnet' ? 'mainnet' : 'testnet') as 'mainnet' | 'testnet';

  let txHash: string | null = null;
  let feeMicrostx = 0;
  try {
    const tx = await makeSTXTokenTransfer({
      recipient: destination,
      amount: BigInt(amount),
      senderKey: c.env.SERVER_PRIVATE_KEY,
      network,
      memo: `sf-w-${withdrawal.id.slice(0, 8)}`,
    });
    feeMicrostx = Number((tx as any)?.auth?.spendingCondition?.fee ?? 0);

    const result = await broadcastTransaction({ transaction: tx, network });
    if ((result as any)?.error || (result as any)?.reason) {
      throw new Error((result as any)?.reason ?? (result as any)?.error ?? 'broadcast failed');
    }
    txHash = (result as any).txid as string;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await restorePendingRevenue(c.env.DB, provider.id, amount);
    await markWithdrawalFailed(c.env.DB, withdrawal.id, msg.slice(0, 500));
    await logAudit(c.env.DB, provider.id, 'withdraw_failed', {
      withdrawal_id: withdrawal.id,
      error: msg,
    });
    return c.json({
      error: 'broadcast failed — funds restored to pending balance',
      detail: msg,
    }, 502);
  }

  if (!txHash) {
    await restorePendingRevenue(c.env.DB, provider.id, amount);
    await markWithdrawalFailed(c.env.DB, withdrawal.id, 'no txid returned');
    return c.json({ error: 'broadcast returned no txid — funds restored' }, 502);
  }

  await markWithdrawalBroadcast(c.env.DB, withdrawal.id, txHash, feeMicrostx);
  await bumpTotalWithdrawn(c.env.DB, provider.id, amount);
  await logAudit(c.env.DB, provider.id, 'withdraw_broadcast', {
    withdrawal_id: withdrawal.id,
    tx_hash: txHash,
  });

  const refreshed = await getWithdrawalById(c.env.DB, withdrawal.id);
  return c.json({
    withdrawal: refreshed ? shapeWithdrawal(refreshed) : { id: withdrawal.id, status: 'broadcast' },
    explorer_url: `https://explorer.hiro.so/txid/${txHash}?chain=${network === 'mainnet' ? 'mainnet' : 'testnet'}`,
  });
});

function shapeWithdrawal(w: {
  id: string;
  amount_microstx: number;
  destination_address: string;
  fee_microstx: number | null;
  tx_hash: string | null;
  status: string;
  error_message: string | null;
  created_at: number;
  broadcast_at: number | null;
  confirmed_at: number | null;
}) {
  return {
    id: w.id,
    amount_microstx: w.amount_microstx,
    amount_stx: w.amount_microstx / 1_000_000,
    destination_address: w.destination_address,
    fee_microstx: w.fee_microstx,
    tx_hash: w.tx_hash,
    status: w.status,
    error_message: w.error_message,
    created_at: w.created_at,
    broadcast_at: w.broadcast_at,
    confirmed_at: w.confirmed_at,
  };
}

// Confirmation poller. Called from scheduled() — checks every withdrawal in
// 'broadcast' state, hits Hiro API, marks 'confirmed' if landed.
export async function pollPendingWithdrawals(env: Env): Promise<{ checked: number; confirmed: number }> {
  const rows = await env.DB
    .prepare(`SELECT id, tx_hash FROM provider_withdrawals WHERE status = 'broadcast' AND tx_hash IS NOT NULL LIMIT 50`)
    .all<{ id: string; tx_hash: string }>();
  let confirmed = 0;
  for (const row of rows.results ?? []) {
    const apiUrl = env.NETWORK === 'mainnet' ? 'https://api.hiro.so' : 'https://api.testnet.hiro.so';
    try {
      const headers: Record<string, string> = {};
      if (env.HIRO_API_KEY) headers['x-hiro-api-key'] = env.HIRO_API_KEY;
      const res = await fetch(`${apiUrl}/extended/v1/tx/${row.tx_hash}`, { headers });
      if (!res.ok) continue;
      const data = (await res.json()) as { tx_status?: string };
      if (data.tx_status === 'success') {
        await markWithdrawalConfirmed(env.DB, row.id);
        confirmed++;
      } else if (data.tx_status === 'abort_by_response' || data.tx_status === 'abort_by_post_condition') {
        await markWithdrawalFailed(env.DB, row.id, `on-chain failure: ${data.tx_status}`);
      }
    } catch {
      // Network glitch — try again next tick.
    }
  }
  return { checked: rows.results?.length ?? 0, confirmed };
}
