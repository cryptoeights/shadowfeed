import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import {
  makeContractDeploy,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
} from '@stacks/transactions';
import { STACKS_TESTNET, STACKS_MAINNET } from '@stacks/network';

const PRIVATE_KEY = process.env.SERVER_PRIVATE_KEY;
const NETWORK = process.env.NETWORK || 'testnet';
const CONTRACT_NAME = 'shadowfeed-registry-v3';
const CONTRACT_PATH = path.join(__dirname, '..', 'contracts', 'shadowfeed-registry-v3.clar');
const API_BASE = NETWORK === 'mainnet' ? 'https://api.hiro.so' : 'https://api.testnet.hiro.so';

async function main() {
  if (!PRIVATE_KEY) {
    console.error('ERROR: SERVER_PRIVATE_KEY required in .env');
    process.exit(1);
  }

  console.log(`\n  Deploying ${CONTRACT_NAME} to Stacks ${NETWORK}...\n`);

  // Read contract source
  const contractSource = fs.readFileSync(CONTRACT_PATH, 'utf-8');
  console.log(`  Contract: ${CONTRACT_PATH}`);
  console.log(`  Size: ${contractSource.length} bytes`);
  console.log(`  Network: ${NETWORK}`);

  // Get current nonce
  const senderAddress = process.env.SERVER_ADDRESS!;
  const nonceRes = await axios.get(`${API_BASE}/extended/v1/address/${senderAddress}/nonces`);
  const nonce = nonceRes.data?.possible_next_nonce || 0;
  console.log(`  Sender: ${senderAddress}`);
  console.log(`  Nonce: ${nonce}`);

  // Build deploy transaction
  const txOptions = {
    contractName: CONTRACT_NAME,
    codeBody: contractSource,
    senderKey: PRIVATE_KEY,
    network: NETWORK === 'mainnet' ? STACKS_MAINNET : STACKS_TESTNET,
    anchorMode: AnchorMode.Any,
    postConditionMode: PostConditionMode.Allow,
    fee: 500000n, // 0.5 STX
    nonce: BigInt(nonce),
  };

  console.log('\n  Building transaction...');
  const tx = await makeContractDeploy(txOptions);

  console.log('  Broadcasting...');
  // v7 serialize() returns hex string, need to convert to bytes
  const serialized = tx.serialize();
  const txBytes = typeof serialized === 'string'
    ? Buffer.from(serialized, 'hex')
    : Buffer.from(serialized);

  console.log(`  TX size: ${txBytes.length} bytes, version: 0x${txBytes[0].toString(16)}`);

  let result: any;
  try {
    const response = await fetch(`${API_BASE}/v2/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: txBytes,
    });
    const text = await response.text();
    console.log(`  Status: ${response.status}`);
    if (!response.ok) {
      console.error(`  Broadcast failed: ${text}`);
      process.exit(1);
    }
    result = text.replace(/"/g, '');
    console.log(`  TX ID: ${result}`);
  } catch (broadcastErr: any) {
    console.error('  Broadcast error:', broadcastErr.message);
    process.exit(1);
  }

  const txId = typeof result === 'string' ? result.replace(/"/g, '') : (result as any).txid;
  const error = typeof result === 'object' && !('txid' in result) ? (result as any).error : null;

  if (error) {
    console.error(`\n  ✗ Broadcast failed: ${(result as any).reason || error}`);
    process.exit(1);
  }

  console.log(`\n  ✓ Contract deployment broadcast!`);
  console.log(`  TX: ${txId}`);
  console.log(`  Explorer: https://explorer.hiro.so/txid/${txId}?chain=${NETWORK}`);
  console.log(`  Contract ID: ${senderAddress}.${CONTRACT_NAME}`);
  console.log(`\n  Waiting for confirmation (may take ~10 minutes on testnet)...`);

  // Poll for confirmation
  const maxWait = 600000; // 10 minutes
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const statusRes = await axios.get(`${API_BASE}/extended/v1/tx/${txId}`, { timeout: 5000 });
      const status = statusRes.data?.tx_status;
      if (status === 'success') {
        console.log(`\n  ✓ Contract deployed successfully!`);
        console.log(`  Block: ${statusRes.data.block_height}`);
        console.log(`  Contract: ${senderAddress}.${CONTRACT_NAME}`);
        console.log(`  Explorer: https://explorer.hiro.so/txid/${txId}?chain=${NETWORK}`);
        return;
      }
      if (status?.startsWith('abort')) {
        console.error(`\n  ✗ Deployment aborted: ${status}`);
        console.error(`  Reason: ${statusRes.data.tx_result?.repr || 'unknown'}`);
        return;
      }
      process.stdout.write('.');
    } catch {}
    await new Promise(r => setTimeout(r, 10000));
  }

  console.log(`\n  ⏳ Still pending after ${maxWait / 1000}s. Check explorer: https://explorer.hiro.so/txid/${txId}?chain=${NETWORK}`);
}

main().catch(err => {
  console.error('Deploy failed:', err.message);
  process.exit(1);
});
