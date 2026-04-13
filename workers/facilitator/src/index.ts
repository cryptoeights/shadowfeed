// ShadowFeed x402 Facilitator — Standalone payment verification & settlement
// Compatible with x402-stacks v2 protocol (TypeScript + Go SDKs)

import { Hono } from 'hono';
import { cors } from 'hono/cors';

import type {
  Env,
  FacilitatorRequest,
  SupportedResponse,
  VerifyResponse,
  SettleResponse,
} from './types';
import { NETWORKS, SUPPORTED_ASSETS } from './types';
import { validateTransaction, broadcastTx, waitForConfirmation, networkFromCAIP2 } from './stacks';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

// ============================================
// GET /supported — List supported payment schemes
// ============================================

app.get('/supported', (c) => {
  const response: SupportedResponse = {
    kinds: [
      { x402Version: 2, scheme: 'exact', network: NETWORKS.MAINNET },
      { x402Version: 2, scheme: 'exact', network: NETWORKS.TESTNET },
    ],
    extensions: [],
    signers: {},
  };
  return c.json(response);
});

// ============================================
// POST /verify — Validate payment without broadcasting
// ============================================

app.post('/verify', async (c) => {
  try {
    const body = await c.req.json<FacilitatorRequest>();
    const { paymentPayload, paymentRequirements } = body;

    if (!paymentPayload || !paymentRequirements) {
      return c.json<VerifyResponse>({
        isValid: false,
        invalidReason: 'missing_payload_or_requirements',
      });
    }

    const txHex = paymentPayload.payload?.transaction;
    if (!txHex || typeof txHex !== 'string' || txHex.length < 10) {
      return c.json<VerifyResponse>({
        isValid: false,
        invalidReason: 'invalid_payload',
      });
    }

    // Validate network
    const network = paymentRequirements.network;
    if (network !== NETWORKS.MAINNET && network !== NETWORKS.TESTNET) {
      return c.json<VerifyResponse>({
        isValid: false,
        invalidReason: `unsupported_network: ${network}`,
      });
    }

    // Validate asset
    const asset = paymentRequirements.asset?.toUpperCase();
    if (!SUPPORTED_ASSETS.includes(asset as any)) {
      return c.json<VerifyResponse>({
        isValid: false,
        invalidReason: `unsupported_asset: ${asset}`,
      });
    }

    const requiredAmount = BigInt(paymentRequirements.amount || '0');
    const { payer } = validateTransaction(txHex, requiredAmount, network);

    console.log(`[VERIFY] Valid: ${requiredAmount} micro${asset} from ${payer}`);

    return c.json<VerifyResponse>({
      isValid: true,
      payer,
    });
  } catch (err: any) {
    console.error('[VERIFY] Error:', err.message);
    return c.json<VerifyResponse>({
      isValid: false,
      invalidReason: err.message,
    });
  }
});

// ============================================
// POST /settle — Verify + broadcast + confirm
// ============================================

app.post('/settle', async (c) => {
  try {
    const body = await c.req.json<FacilitatorRequest>();
    const { paymentPayload, paymentRequirements } = body;

    if (!paymentPayload || !paymentRequirements) {
      return c.json<SettleResponse>({
        success: false,
        errorReason: 'missing_payload_or_requirements',
      });
    }

    const txHex = paymentPayload.payload?.transaction;
    if (!txHex || typeof txHex !== 'string' || txHex.length < 10) {
      return c.json<SettleResponse>({
        success: false,
        errorReason: 'invalid_payload',
      });
    }

    const network = paymentRequirements.network;
    if (network !== NETWORKS.MAINNET && network !== NETWORKS.TESTNET) {
      return c.json<SettleResponse>({
        success: false,
        errorReason: `unsupported_network: ${network}`,
      });
    }

    // 1. Validate transaction
    const requiredAmount = BigInt(paymentRequirements.amount || '0');
    const { payer } = validateTransaction(txHex, requiredAmount, network);

    const netLabel = networkFromCAIP2(network);
    console.log(`[SETTLE] Broadcasting from ${payer} on ${netLabel}...`);

    // 2. Broadcast to Stacks
    const { txId, error } = await broadcastTx(txHex, network, c.env);
    if (error || !txId) {
      console.error(`[SETTLE] Broadcast failed: ${error}`);
      return c.json<SettleResponse>({
        success: false,
        errorReason: error || 'broadcast_failed',
        payer,
        network,
      });
    }

    console.log(`[SETTLE] Broadcast OK: ${txId}`);

    // 3. Poll for confirmation (max 25s for Workers limit)
    const status = await waitForConfirmation(txId, network, c.env, 25000);
    console.log(`[SETTLE] TX ${txId}: ${status}`);

    return c.json<SettleResponse>({
      success: true,
      payer,
      transaction: txId,
      network,
    });
  } catch (err: any) {
    console.error('[SETTLE] Error:', err.message);
    return c.json<SettleResponse>({
      success: false,
      errorReason: err.message || 'unexpected_settle_error',
    });
  }
});

// ============================================
// GET / — Service info
// ============================================

app.get('/', (c) => {
  return c.json({
    service: 'ShadowFeed x402 Facilitator',
    protocol: 'x402-stacks v2',
    version: '1.0.0',
    endpoints: {
      supported: 'GET /supported',
      verify: 'POST /verify',
      settle: 'POST /settle',
    },
    networks: ['stacks:1 (mainnet)', 'stacks:2147483648 (testnet)'],
    assets: ['STX', 'SBTC', 'USDCX'],
    docs: 'https://shadowfeed.app',
  });
});

export default app;
