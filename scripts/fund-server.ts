import 'dotenv/config';
import {
  makeSTXTokenTransfer,
  broadcastTransaction,
  AnchorMode,
} from '@stacks/transactions';

const AGENT_KEY = process.env.AGENT_PRIVATE_KEY!;
const SERVER_ADDRESS = process.env.SERVER_ADDRESS!;
const API_BASE = 'https://api.testnet.hiro.so';

async function main() {
  console.log(`Transferring 100 STX from agent to server (${SERVER_ADDRESS})...`);

  const tx = await makeSTXTokenTransfer({
    recipient: SERVER_ADDRESS,
    amount: 100_000_000n, // 100 STX
    senderKey: AGENT_KEY,
    network: 'testnet',
    anchorMode: AnchorMode.Any,
    fee: 2000n,
  });

  const result = await broadcastTransaction({
    transaction: tx,
    client: { baseUrl: API_BASE },
  } as any);

  const txId = typeof result === 'string' ? result : (result as any).txid;
  const error = typeof result === 'object' ? (result as any).error : null;

  if (error) {
    console.error(`Failed: ${(result as any).reason || error}`);
    process.exit(1);
  }

  console.log(`TX broadcast: ${txId}`);
  console.log(`Explorer: https://explorer.hiro.so/txid/${txId}?chain=testnet`);
  console.log('Waiting for confirmation...');

  // Poll
  const start = Date.now();
  while (Date.now() - start < 300000) {
    try {
      const { default: axios } = await import('axios');
      const res = await axios.get(`${API_BASE}/extended/v1/tx/${txId}`, { timeout: 5000 });
      if (res.data?.tx_status === 'success') {
        console.log(`Confirmed at block ${res.data.block_height}!`);
        return;
      }
      if (res.data?.tx_status?.startsWith('abort')) {
        console.error(`Aborted: ${res.data.tx_status}`);
        return;
      }
    } catch {}
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 5000));
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
