// Crypto helpers for the agent platform.
// Uses Web Crypto (available in Cloudflare Workers) for AES-GCM encryption.
//
// Trust model: agent wallet private keys are encrypted with AGENT_MASTER_KEY
// (a 256-bit secret stored as a Cloudflare Workers secret). The platform can
// decrypt + sign on behalf of agents — this is custodial. Mitigations:
//   - Agent wallets only hold STX the user explicitly funded.
//   - User can withdraw at any time via /agents/:id/withdraw.
//   - Per-run spending caps enforced in execution engine.
//   - Only the platform's deployed Worker can decrypt (master key never leaves).

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

function base64Encode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64Decode(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importMasterKey(masterKeyB64: string): Promise<CryptoKey> {
  const raw = base64Decode(masterKeyB64);
  if (raw.length !== 32) {
    throw new Error(`AGENT_MASTER_KEY must be 32 bytes (got ${raw.length})`);
  }
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface EncryptedSecret {
  readonly ciphertext: string;  // base64
  readonly iv: string;          // base64
}

// Encrypts arbitrary plaintext with the master key. Each call uses a fresh
// 12-byte IV (required for AES-GCM) so identical plaintexts yield different
// ciphertexts.
export async function encryptWithMasterKey(
  plaintext: string,
  masterKeyB64: string,
): Promise<EncryptedSecret> {
  const key = await importMasterKey(masterKeyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    TEXT_ENCODER.encode(plaintext),
  );
  return {
    ciphertext: base64Encode(new Uint8Array(ciphertext)),
    iv: base64Encode(iv),
  };
}

export async function decryptWithMasterKey(
  encrypted: EncryptedSecret,
  masterKeyB64: string,
): Promise<string> {
  const key = await importMasterKey(masterKeyB64);
  const iv = base64Decode(encrypted.iv);
  const ciphertext = base64Decode(encrypted.ciphertext);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );
  return TEXT_DECODER.decode(plaintext);
}

// Generate a cryptographically random nonce string (URL-safe).
// Used for SIWS auth challenges and public agent slugs.
export function randomNonce(byteLength: number = 16): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return base64Encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Stable UUID v4 for agent / user IDs.
export function newUuid(): string {
  return crypto.randomUUID();
}
