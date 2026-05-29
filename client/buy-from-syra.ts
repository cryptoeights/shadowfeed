/**
 * buy-from-syra.ts — one-shot paid integration test for the ShadowFeed → Syra
 * provider bridge. Buys /feeds/p/syra/signal once with a funded test wallet and
 * prints the on-chain tx + upstream status, proving the full chain:
 *   buyer pays STX → settlement broadcast on-chain → HMAC proxy to api.syraa.fun → data.
 *
 * Usage:
 *   npx tsx client/buy-from-syra.ts                 # first funded test wallet
 *   npx tsx client/buy-from-syra.ts --wallet 2      # test-wallets.json entry #2
 *   npx tsx client/buy-from-syra.ts --feed signal   # override feed slug
 *
 * Wallets come from ../test-wallets.json (gitignored). This is an OPERATOR-run
 * verification query: it is real_onchain but NOT independent-buyer traction —
 * never count it toward the M2 "external buyer wallets" deliverable.
 */

import 'dotenv/config';
import axios from 'axios';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { wrapAxiosWithPayment, privateKeyToAccount, decodePaymentResponse } from 'x402-stacks';

interface TestWallet {
  readonly name: string;
  readonly address: string;
  readonly privateKey: string;
}

const SHADOWFEED_URL = process.env.SHADOWFEED_URL || 'https://api.shadowfeed.app';
const NETWORK = 'mainnet';

const args = process.argv.slice(2);
const getArg = (flag: string): string | undefined => {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : undefined;
};
const FEED = getArg('--feed') || 'signal';
const WALLET_IDX = parseInt(getArg('--wallet') || '1', 10);

async function fetchBalance(address: string): Promise<number> {
  try {
    const r = await axios.get(`https://api.hiro.so/extended/v1/address/${address}/stx`, {
      timeout: 15000,
    });
    return Number((r.data as { balance?: string }).balance ?? '0') / 1_000_000;
  } catch {
    return 0;
  }
}

async function main() {
  const wallets = JSON.parse(
    readFileSync(resolve(__dirname, '..', 'test-wallets.json'), 'utf-8'),
  ) as TestWallet[];
  const wallet = wallets[WALLET_IDX - 1];
  if (!wallet) throw new Error(`no wallet #${WALLET_IDX} in test-wallets.json (have ${wallets.length})`);

  console.log('ShadowFeed → Syra paid integration test');
  console.log(`  API:     ${SHADOWFEED_URL}`);
  console.log(`  Feed:    syra/${FEED}`);
  console.log(`  Wallet:  ${wallet.name} (${wallet.address})`);
  const bal = await fetchBalance(wallet.address);
  console.log(`  Balance: ${bal.toFixed(6)} STX`);
  if (bal < 0.02) throw new Error('wallet underfunded — send at least 0.05 STX before testing');

  const account = privateKeyToAccount(wallet.privateKey, NETWORK);
  // Don't set validateStatus — x402-stacks needs axios to throw on 402 so its
  // interceptor can catch, sign the payment, and retry.
  const client = wrapAxiosWithPayment(
    axios.create({ baseURL: SHADOWFEED_URL, timeout: 180000 }),
    account,
  );

  console.log('\nBuying… (pays STX → broadcasts on-chain → HMAC proxy to api.syraa.fun)');
  const start = Date.now();
  let data: any;
  let httpStatus = 200;
  let paymentHeader: string | undefined;
  try {
    const res = await client.get(`/feeds/p/syra/${FEED}`);
    data = res.data;
    paymentHeader = res.headers['payment-response'];
  } catch (err: any) {
    // 502 = the buyer paid but the upstream (Syra) call failed. The body still
    // carries upstream_status so we can diagnose an HMAC/bypass mismatch.
    if (err?.response) {
      httpStatus = err.response.status;
      data = err.response.data;
      paymentHeader = err.response.headers?.['payment-response'];
    } else {
      throw err;
    }
  }
  const ms = Date.now() - start;
  const payment = paymentHeader ? decodePaymentResponse(paymentHeader) : null;

  console.log('\n─ Result ─────────────────────────────────────────');
  console.log('  marketplace http: ', httpStatus);
  console.log('  success:          ', data?.success);
  console.log('  upstream_status:  ', data?.upstream_status);
  console.log('  tx:               ', payment?.transaction ?? data?.tx ?? '(none)');
  console.log('  latency:          ', ms, 'ms');
  console.log('  revenue_split:    ', JSON.stringify(data?.revenue_split));
  console.log('  data preview:     ', JSON.stringify(data?.data ?? data).slice(0, 400));

  const tx = payment?.transaction ?? data?.tx;
  console.log('\n→ Verify (reviewer-curlable):');
  console.log('  curl -s https://api.shadowfeed.app/providers/syra/manifest');
  console.log('  curl -s https://api.shadowfeed.app/admin/provider_query_log.csv | grep -i syra');
  if (tx) console.log('  https://explorer.hiro.so/txid/' + tx + '?chain=mainnet');

  if (httpStatus !== 200 || data?.success === false) {
    console.log('\n⚠ Upstream did NOT return data. The buyer paid but Syra rejected/failed the');
    console.log('  HMAC-signed proxy call. Re-check the HMAC handshake before going live.');
    process.exit(2);
  }
  console.log('\n✓ Full chain verified end-to-end.');
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
