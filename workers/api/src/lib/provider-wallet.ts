import { generateKeypair, privateKeyToAccount } from 'x402-stacks';
import { encryptWithMasterKey, decryptWithMasterKey } from './crypto';

// Each external provider gets its own custodial Stacks wallet. Revenue from
// agent payments accumulates here (97% of every paid query) until the provider
// initiates a withdrawal to their personal/business wallet.
//
// Trust model is identical to the agent wallet system:
//   - Private key is AES-GCM encrypted with AGENT_MASTER_KEY at rest.
//   - Only the deployed Worker can decrypt + sign (master key never leaves CF).
//   - Provider can withdraw the full balance at any time.
//   - All withdrawals are logged + idempotent.

export interface ProviderWalletRecord {
  readonly address: string;
  readonly encryptedKey: string;
  readonly iv: string;
}

// Generate a brand new Stacks wallet for a provider. The private key is
// encrypted before it ever leaves this function; only the encrypted blob is
// returned (safe to persist in D1).
export async function createProviderWallet(
  masterKeyB64: string,
  network: 'mainnet' | 'testnet' = 'mainnet',
): Promise<ProviderWalletRecord> {
  const keypair = generateKeypair(network);
  const encrypted = await encryptWithMasterKey(keypair.privateKey, masterKeyB64);
  return {
    address: keypair.address,
    encryptedKey: encrypted.ciphertext,
    iv: encrypted.iv,
  };
}

// Recover the provider's private key for signing a withdrawal tx.
// CALL THIS ONLY INSIDE the withdrawal code path — never expose the result.
export async function loadProviderAccount(
  encryptedKey: string,
  iv: string,
  masterKeyB64: string,
  network: 'mainnet' | 'testnet' = 'mainnet',
) {
  const privateKey = await decryptWithMasterKey(
    { ciphertext: encryptedKey, iv },
    masterKeyB64,
  );
  return privateKeyToAccount(privateKey, network);
}

// Fetch live STX balance for a provider wallet from the Stacks API.
// Used to validate withdrawal requests against actual on-chain balance.
//
// Returns balance_microstx as a string (not bigint) so the result is safe
// to JSON.stringify — bigints throw TypeError when serialized.
export async function getProviderBalance(
  address: string,
  network: 'mainnet' | 'testnet' = 'mainnet',
  hiroApiKey?: string,
): Promise<{ balance_microstx: string; balance_stx: number } | null> {
  const apiBase = network === 'mainnet'
    ? 'https://api.hiro.so'
    : 'https://api.testnet.hiro.so';
  try {
    const headers: Record<string, string> = {};
    if (hiroApiKey) headers['x-hiro-api-key'] = hiroApiKey;
    const res = await fetch(`${apiBase}/extended/v1/address/${address}/stx`, { headers });
    if (!res.ok) return null;
    const json = (await res.json()) as { balance?: string };
    const microstxStr = json.balance || '0';
    const microstxNum = Number(microstxStr);
    return {
      balance_microstx: microstxStr,
      balance_stx: Number.isFinite(microstxNum) ? microstxNum / 1_000_000 : 0,
    };
  } catch {
    return null;
  }
}
