import { generateKeypair, privateKeyToAccount } from 'x402-stacks';
import { encryptWithMasterKey, decryptWithMasterKey } from './crypto';

// Each agent gets its own Stacks wallet. Private key is encrypted with the
// platform master key so only the deployed Worker can decrypt + sign.

export interface AgentWalletRecord {
  readonly address: string;
  readonly encryptedKey: string;
  readonly iv: string;
}

// Generate a brand new Stacks wallet for an agent and return the address +
// encrypted private key (ready to be stored in D1).
export async function createAgentWallet(masterKeyB64: string): Promise<AgentWalletRecord> {
  const network: 'mainnet' | 'testnet' = 'mainnet';
  const keypair = generateKeypair(network);
  const encrypted = await encryptWithMasterKey(keypair.privateKey, masterKeyB64);
  return {
    address: keypair.address,
    encryptedKey: encrypted.ciphertext,
    iv: encrypted.iv,
  };
}

// Recover the agent's private key for signing (decrypt then convert to account).
// CALL THIS ONLY INSIDE the cron execution path — never expose the result.
export async function loadAgentAccount(
  encryptedKey: string,
  iv: string,
  masterKeyB64: string,
  network: 'mainnet' | 'testnet' = 'mainnet',
) {
  const privateKey = await decryptWithMasterKey({ ciphertext: encryptedKey, iv }, masterKeyB64);
  return privateKeyToAccount(privateKey, network);
}

// Fetch live STX balance from the Stacks API. Used to gate agent execution
// (skip the run if balance < expected feed cost).
//
// Returns balance_microstx as a string (not bigint) so the result is safe
// to JSON.stringify — bigints throw TypeError when serialized.
export async function getAgentBalance(
  address: string,
  network: 'mainnet' | 'testnet' = 'mainnet',
  hiroApiKey?: string,
): Promise<{ balance_microstx: string; balance_stx: number } | null> {
  const apiBase = network === 'mainnet' ? 'https://api.hiro.so' : 'https://api.testnet.hiro.so';
  try {
    const headers: Record<string, string> = {};
    if (hiroApiKey) headers['x-hiro-api-key'] = hiroApiKey;
    const res = await fetch(`${apiBase}/extended/v1/address/${address}/stx`, { headers });
    if (!res.ok) return null;
    const json = await res.json() as { balance?: string };
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
