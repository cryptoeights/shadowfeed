// Stacks transaction utilities for the facilitator
import {
  deserializeTransaction,
  addressFromVersionHash,
  addressToString,
  AddressVersion,
} from '@stacks/transactions';

import type { Env } from './types';
import { NETWORKS, HIRO_API } from './types';

/**
 * Convert hex string to Uint8Array (Workers-safe, no Buffer dependency)
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Resolve CAIP-2 network to "mainnet" | "testnet"
 */
export function networkFromCAIP2(caip2: string): 'mainnet' | 'testnet' {
  return caip2 === NETWORKS.MAINNET ? 'mainnet' : 'testnet';
}

/**
 * Get Hiro API base URL for a CAIP-2 network
 */
export function getApiUrl(caip2: string): string {
  return caip2 === NETWORKS.MAINNET ? HIRO_API.mainnet : HIRO_API.testnet;
}

/**
 * Build headers for Hiro API (with optional API key)
 */
export function hiroHeaders(env: Env): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.HIRO_API_KEY) {
    headers['x-hiro-api-key'] = env.HIRO_API_KEY;
  }
  return headers;
}

/**
 * Extract payer address from a deserialized Stacks transaction
 */
export function extractPayer(tx: ReturnType<typeof deserializeTransaction>, isMainnet: boolean): string {
  try {
    const signer = (tx.auth as any)?.spendingCondition?.signer;
    if (signer) {
      const version = isMainnet
        ? AddressVersion.MainnetSingleSig
        : AddressVersion.TestnetSingleSig;
      return addressToString(addressFromVersionHash(version, signer));
    }
    const addr = (tx.auth as any)?.spendingCondition?.address;
    if (addr) return addr;
  } catch { /* fall through */ }
  return 'unknown';
}

/**
 * Validate a signed Stacks transaction against payment requirements.
 * Returns payer address if valid, throws on invalid.
 */
export function validateTransaction(
  txHex: string,
  requiredAmount: bigint,
  network: string,
): { payer: string; tx: ReturnType<typeof deserializeTransaction> } {
  // deserializeTransaction needs Uint8Array from hex
  const txBytes = hexToBytes(txHex);
  const tx = deserializeTransaction(txBytes);
  const txPayload = tx.payload as any;

  // Validate amount (STX token transfer)
  const txAmount = BigInt(txPayload.amount || 0);
  if (txAmount < requiredAmount) {
    throw new Error(`insufficient_amount: tx=${txAmount} required=${requiredAmount}`);
  }

  const isMainnet = network === NETWORKS.MAINNET;
  const payer = extractPayer(tx, isMainnet);

  return { payer, tx };
}

/**
 * Broadcast a signed transaction to Stacks blockchain via Hiro API.
 * Retries up to 3 times on rate limit (429).
 */
export async function broadcastTx(
  txHex: string,
  network: string,
  env: Env,
): Promise<{ txId: string | null; error: string | null }> {
  const apiUrl = getApiUrl(network);
  const rawBytes = hexToBytes(txHex);

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${apiUrl}/v2/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        ...hiroHeaders(env),
      },
      body: rawBytes,
    });

    const text = await res.text();

    if (res.ok) {
      const txId = text.replace(/"/g, '');
      return { txId, error: null };
    }

    if (res.status === 429 && attempt < 2) {
      await new Promise(r => setTimeout(r, (attempt + 1) * 5000));
      continue;
    }

    return { txId: null, error: `broadcast_failed (${res.status}): ${text}` };
  }

  return { txId: null, error: 'broadcast_max_retries' };
}

/**
 * Poll for transaction confirmation (max timeout).
 */
export async function waitForConfirmation(
  txId: string,
  network: string,
  env: Env,
  timeoutMs: number = 25000,
): Promise<'success' | 'pending' | 'failed'> {
  const apiUrl = getApiUrl(network);
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${apiUrl}/extended/v1/tx/${txId}`, {
        headers: hiroHeaders(env),
      });
      if (res.ok) {
        const data = await res.json() as { tx_status?: string };
        if (data.tx_status === 'success') return 'success';
        if (data.tx_status?.startsWith('abort')) return 'failed';
      }
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 4000));
  }

  return 'pending';
}
