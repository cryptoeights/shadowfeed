import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { deserializeTransaction, broadcastTransaction } from '@stacks/transactions';
import { STACKS_TESTNET, STACKS_MAINNET } from '@stacks/network';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors());

const FACILITATOR_PORT = parseInt(process.env.FACILITATOR_PORT || '8085', 10);

const STACKS_API_TESTNET = 'https://api.testnet.hiro.so';
const STACKS_API_MAINNET = 'https://api.hiro.so';

// ============================================
// GET /supported — List supported payment kinds
// ============================================
app.get('/supported', (_req, res) => {
  res.json({
    kinds: [
      { x402Version: 2, scheme: 'exact', network: 'stacks:2147483648' },
      { x402Version: 2, scheme: 'exact', network: 'stacks:1' },
    ],
    extensions: [],
    signers: {},
  });
});

// ============================================
// POST /verify — Verify a signed transaction
// ============================================
app.post('/verify', async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body;

    if (!paymentPayload || !paymentRequirements) {
      return res.status(400).json({ isValid: false, errorReason: 'Missing paymentPayload or paymentRequirements' });
    }

    const txHex = paymentPayload?.payload?.transaction || paymentPayload?.transaction;
    if (!txHex) {
      return res.status(400).json({ isValid: false, errorReason: 'No transaction found in payload' });
    }

    const tx = deserializeTransaction(txHex);
    const txPayload = tx.payload as any;

    // Verify amount
    const requiredAmount = BigInt(paymentRequirements.amount || '0');
    const txAmount = BigInt(txPayload.amount || 0);

    if (txAmount < requiredAmount) {
      return res.json({
        isValid: false,
        errorReason: `Insufficient: tx=${txAmount} required=${requiredAmount}`,
      });
    }

    const payer = extractPayer(tx);
    console.log(`[VERIFY] Valid: ${txAmount} microSTX from ${payer}`);

    res.json({ isValid: true, payer });
  } catch (err: any) {
    console.error('[VERIFY] Error:', err.message);
    res.status(400).json({ isValid: false, errorReason: err.message });
  }
});

// ============================================
// POST /settle — Broadcast and confirm
// ============================================
app.post('/settle', async (req, res) => {
  try {
    const { paymentPayload, paymentRequirements } = req.body;

    if (!paymentPayload || !paymentRequirements) {
      return res.status(400).json({ success: false, errorReason: 'Missing payload or requirements' });
    }

    const txHex = paymentPayload?.payload?.transaction || paymentPayload?.transaction;
    if (!txHex) {
      return res.status(400).json({ success: false, errorReason: 'No transaction in payload' });
    }

    const networkId = paymentRequirements.network || 'stacks:2147483648';
    const isMainnet = networkId === 'stacks:1';
    const network = isMainnet ? STACKS_MAINNET : STACKS_TESTNET;
    const apiUrl = isMainnet ? STACKS_API_MAINNET : STACKS_API_TESTNET;

    const tx = deserializeTransaction(txHex);
    const payer = extractPayer(tx);

    console.log(`[SETTLE] Broadcasting from ${payer} on ${isMainnet ? 'mainnet' : 'testnet'}...`);

    // Broadcast — v7 takes options object
    const result = await broadcastTransaction({
      transaction: tx,
      client: { baseUrl: isMainnet ? 'https://api.hiro.so' : 'https://api.testnet.hiro.so' },
    } as any);

    // v7 returns { txid } or { error, reason }
    const txId = typeof result === 'string' ? result : (result as any).txid;
    const error = typeof result === 'object' ? (result as any).error : null;

    if (error) {
      const reason = (result as any).reason || error;
      console.error(`[SETTLE] Broadcast failed: ${reason}`);
      return res.status(400).json({ success: false, errorReason: reason });
    }

    console.log(`[SETTLE] Broadcast OK: ${txId}`);

    // Poll for confirmation (max 3 min)
    const confirmed = await waitForTx(apiUrl, txId, 180000);
    console.log(`[SETTLE] ${confirmed ? 'Confirmed' : 'Pending (mempool)'}: ${txId}`);

    res.json({
      success: true,
      payer,
      transaction: txId,
      network: networkId,
    });
  } catch (err: any) {
    console.error('[SETTLE] Error:', err.message);
    res.status(500).json({ success: false, errorReason: err.message });
  }
});

// ============================================
// Helpers
// ============================================

function extractPayer(tx: any): string {
  try {
    const signer = tx.auth?.spendingCondition?.signer;
    if (signer) {
      // Return truncated signer hex as identifier
      return `ST${signer.slice(0, 38)}`;
    }
    // Try address field
    if (tx.auth?.spendingCondition?.address) {
      return tx.auth.spendingCondition.address;
    }
  } catch {}
  return 'unknown';
}

async function waitForTx(apiUrl: string, txId: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await axios.get(`${apiUrl}/extended/v1/tx/${txId}`, { timeout: 5000 });
      const status = res.data?.tx_status;
      if (status === 'success') return true;
      if (status?.startsWith('abort')) return false;
    } catch {}
    await new Promise(r => setTimeout(r, 5000));
  }
  return false;
}

// ============================================
// Health
// ============================================
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'shadowfeed-facilitator', port: FACILITATOR_PORT });
});

// ============================================
// Start
// ============================================
app.listen(FACILITATOR_PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════════════╗
  ║      ShadowFeed x402 Facilitator Server       ║
  ╠═══════════════════════════════════════════════╣
  ║  Port:       ${String(FACILITATOR_PORT).padEnd(33)}║
  ║  Endpoints:  GET  /supported                  ║
  ║              POST /verify                     ║
  ║              POST /settle                     ║
  ║  Networks:   Stacks Testnet + Mainnet         ║
  ╚═══════════════════════════════════════════════╝
  `);
});
