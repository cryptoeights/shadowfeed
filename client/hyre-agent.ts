import 'dotenv/config';
import axios from 'axios';
import { wrapAxiosWithPayment, privateKeyToAccount } from 'x402-stacks';

const AGENT_NAME = 'Hyre Agent';
const PRIVATE_KEY = 'eac9f155b7f0e803deddf828f26b98b6659526d2be02d23d4a1dc3a85ea4ae8d01';
const API_BASE = 'https://api.shadowfeed.app';

const FEEDS_TO_BUY = [
  'smart-money-flows',
];

async function main() {
  console.log(`\n  🤖 ${AGENT_NAME} starting...`);
  console.log(`  Network: mainnet`);
  console.log(`  API: ${API_BASE}\n`);

  const account = privateKeyToAccount(PRIVATE_KEY, 'mainnet');
  console.log(`  Wallet: ${account.address}`);

  // Check balance
  const balRes = await axios.get(`https://api.hiro.so/extended/v1/address/${account.address}/balances`);
  const balance = parseInt(balRes.data.stx.balance) / 1e6;
  console.log(`  Balance: ${balance} STX\n`);

  const client = wrapAxiosWithPayment(
    axios.create({ headers: { 'x-agent-name': AGENT_NAME } }),
    account,
  );

  for (let i = 0; i < FEEDS_TO_BUY.length; i++) {
    const feedId = FEEDS_TO_BUY[i];
    if (i > 0) {
      console.log(`  ⏳ Waiting 5s...\n`);
      await new Promise(r => setTimeout(r, 5000));
    }
    console.log(`  ── Buying: ${feedId} ──`);
    try {
      const res = await client.get(`${API_BASE}/feeds/${feedId}`);
      const data = res.data;
      console.log(`  ✓ Feed: ${data.feed}`);
      console.log(`  ✓ Price: ${data.price}`);
      console.log(`  ✓ TX: ${data.tx}`);
      console.log(`  ✓ Explorer: https://explorer.hiro.so/txid/${data.tx}?chain=mainnet`);
      console.log(`  ✓ Data keys: ${Object.keys(data.data || {}).join(', ')}`);
      console.log('');
    } catch (err: any) {
      const status = err.response?.status;
      const msg = err.response?.data?.error || err.message;
      console.log(`  ✗ Failed (${status}): ${msg}\n`);
    }
  }

  // Check remaining balance
  const balRes2 = await axios.get(`https://api.hiro.so/extended/v1/address/${account.address}/balances`);
  const remaining = parseInt(balRes2.data.stx.balance) / 1e6;
  console.log(`  ── Summary ──`);
  console.log(`  Spent: ${(balance - remaining).toFixed(6)} STX`);
  console.log(`  Remaining: ${remaining} STX`);
  console.log(`\n  🤖 ${AGENT_NAME} complete.\n`);
}

main().catch(err => {
  console.error('Agent error:', err.message);
  process.exit(1);
});
