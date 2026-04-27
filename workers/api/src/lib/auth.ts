import { verifyMessageSignatureRsv } from '@stacks/encryption';
import { newUuid, randomNonce } from './crypto';

// Sign-In With Stacks flow (modeled after SIWE):
// 1. Client requests a nonce for their wallet address.
// 2. Client signs `SHADOWFEED_AUTH_MESSAGE(nonce)` with their wallet.
// 3. Client posts back the signature; server verifies + issues a session token.

const NONCE_TTL_SECONDS = 5 * 60;       // 5 minutes
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export function buildAuthMessage(nonce: string, address: string): string {
  return [
    'ShadowFeed wants you to sign in with your Stacks account:',
    address,
    '',
    'I accept the ShadowFeed Terms of Service and authorize this device to manage agents.',
    '',
    `Nonce: ${nonce}`,
    `Domain: shadowfeed.app`,
  ].join('\n');
}

// Issue a fresh nonce + persist it. Client gets back the message it should sign.
export async function issueNonce(db: D1Database, walletAddress: string) {
  const nonce = randomNonce(24);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + NONCE_TTL_SECONDS;

  await db
    .prepare(
      'INSERT INTO auth_nonces (nonce, wallet_address, created_at, expires_at) VALUES (?, ?, ?, ?)',
    )
    .bind(nonce, walletAddress, now, expiresAt)
    .run();

  return {
    nonce,
    message: buildAuthMessage(nonce, walletAddress),
    expires_at: expiresAt,
  };
}

export async function consumeNonce(db: D1Database, nonce: string, walletAddress: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT used, expires_at FROM auth_nonces WHERE nonce = ? AND wallet_address = ?')
    .bind(nonce, walletAddress)
    .first<{ used: number; expires_at: number }>();
  if (!row) return false;
  if (row.used) return false;
  if (row.expires_at < Math.floor(Date.now() / 1000)) return false;

  await db.prepare('UPDATE auth_nonces SET used = 1 WHERE nonce = ?').bind(nonce).run();
  return true;
}

// Verify a Stacks signed-message signature. Returns true if valid.
export function verifyStacksSignature(opts: {
  message: string;
  signature: string;
  publicKey: string;
}): boolean {
  try {
    return verifyMessageSignatureRsv({
      message: opts.message,
      signature: opts.signature,
      publicKey: opts.publicKey,
    });
  } catch {
    return false;
  }
}

// Get-or-create the user record for this wallet address.
export async function upsertUser(db: D1Database, walletAddress: string): Promise<{ id: string; wallet_address: string }> {
  const existing = await db
    .prepare('SELECT id, wallet_address FROM users WHERE wallet_address = ?')
    .bind(walletAddress)
    .first<{ id: string; wallet_address: string }>();
  if (existing) {
    await db
      .prepare('UPDATE users SET last_login_at = ? WHERE id = ?')
      .bind(Math.floor(Date.now() / 1000), existing.id)
      .run();
    return existing;
  }
  const id = newUuid();
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare('INSERT INTO users (id, wallet_address, created_at, last_login_at) VALUES (?, ?, ?, ?)')
    .bind(id, walletAddress, now, now)
    .run();
  return { id, wallet_address: walletAddress };
}

// Issue a session token for the user.
export async function createSession(db: D1Database, userId: string): Promise<{ token: string; expires_at: number }> {
  const token = randomNonce(32);
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + SESSION_TTL_SECONDS;
  await db
    .prepare('INSERT INTO sessions (token, user_id, created_at, expires_at, last_used_at) VALUES (?, ?, ?, ?, ?)')
    .bind(token, userId, now, expiresAt, now)
    .run();
  return { token, expires_at: expiresAt };
}

// Resolve a bearer token to its user, refreshing last_used_at as a side effect.
export async function authenticate(db: D1Database, token: string | undefined): Promise<{ user_id: string; wallet_address: string } | null> {
  if (!token) return null;
  const row = await db
    .prepare(`
      SELECT s.user_id, u.wallet_address, s.expires_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ?
    `)
    .bind(token)
    .first<{ user_id: string; wallet_address: string; expires_at: number }>();
  if (!row) return null;
  if (row.expires_at < Math.floor(Date.now() / 1000)) return null;
  // Don't await — fire-and-forget refresh (last_used_at is just informational)
  db.prepare('UPDATE sessions SET last_used_at = ? WHERE token = ?')
    .bind(Math.floor(Date.now() / 1000), token)
    .run()
    .catch(() => {});
  return { user_id: row.user_id, wallet_address: row.wallet_address };
}

export async function revokeSession(db: D1Database, token: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
}
