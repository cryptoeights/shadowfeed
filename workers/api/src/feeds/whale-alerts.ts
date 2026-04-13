import type { Env } from '../types';

const WHALE_ADDRESSES = [
  'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
  'bc1q0sg9rdst255gtldsmcf8rk0764avqy2h2ksqs5',
  '3JZq4atUahhuA9rLhXLMhhTo133J9rF97j',
  'bc1qazcm763858nkj2dz7g3vafrt9fhta0rg9xmrm3',
  '1LQoWist8KkaUXSPKZHNvEyFrWnXcTjRUS',
  'bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h',
];

const EXCHANGE_LABELS: Record<string, string> = {
  'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh': 'Binance Hot Wallet',
  'bc1q0sg9rdst255gtldsmcf8rk0764avqy2h2ksqs5': 'Coinbase Prime',
  '3JZq4atUahhuA9rLhXLMhhTo133J9rF97j': 'Bitfinex Cold',
  'bc1qazcm763858nkj2dz7g3vafrt9fhta0rg9xmrm3': 'Kraken Hot Wallet',
  '1LQoWist8KkaUXSPKZHNvEyFrWnXcTjRUS': 'Unknown Whale #1',
  'bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h': 'Unknown Whale #2',
};

export interface WhaleAlert {
  id: string;
  type: 'transfer' | 'exchange_inflow' | 'exchange_outflow';
  amount_btc: number;
  amount_usd: number;
  from: { address: string; label: string };
  to: { address: string; label: string };
  timestamp: number;
  block_height: number;
  significance: 'high' | 'critical' | 'extreme';
}

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBtcAmount(): number {
  return Math.round((100 + Math.random() * 4900) * 100) / 100;
}

async function getCachedBtcPrice(kv: KVNamespace): Promise<number> {
  const cached = await kv.get('btc_price', 'json') as { price: number } | null;
  if (cached) return cached.price;

  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
    if (res.ok) {
      const data = await res.json() as { bitcoin?: { usd?: number } };
      const price = data?.bitcoin?.usd;
      if (price) {
        await kv.put('btc_price', JSON.stringify({ price }), { expirationTtl: 60 });
        return price;
      }
    }
  } catch {}
  return 0;
}

async function getCachedBlockHeight(kv: KVNamespace): Promise<number> {
  const cached = await kv.get('block_height', 'json') as { height: number } | null;
  if (cached) return cached.height;

  try {
    const res = await fetch('https://blockchain.info/q/getblockcount');
    if (res.ok) {
      const height = parseInt(await res.text(), 10);
      if (height > 0) {
        await kv.put('block_height', JSON.stringify({ height }), { expirationTtl: 120 });
        return height;
      }
    }
  } catch {}
  return 0;
}

export async function generateWhaleAlerts(kv: KVNamespace) {
  const [realPrice, realHeight] = await Promise.all([
    getCachedBtcPrice(kv),
    getCachedBlockHeight(kv),
  ]);

  const btcPrice = realPrice || (95000 + Math.random() * 10000);
  const blockHeight = realHeight || (880000 + Math.floor(Math.random() * 1000));
  const usedRealPrice = realPrice > 0;
  const usedRealBlock = realHeight > 0;

  const alertCount = 3 + Math.floor(Math.random() * 5);
  const now = Date.now();
  const alerts: WhaleAlert[] = [];
  let totalVolume = 0;
  const activityCount: Record<string, number> = {};

  for (let i = 0; i < alertCount; i++) {
    const fromAddr = randomFrom(WHALE_ADDRESSES);
    let toAddr = randomFrom(WHALE_ADDRESSES);
    while (toAddr === fromAddr) toAddr = randomFrom(WHALE_ADDRESSES);

    const amount = randomBtcAmount();
    totalVolume += amount;

    const fromLabel = EXCHANGE_LABELS[fromAddr] || 'Unknown';
    activityCount[fromLabel] = (activityCount[fromLabel] || 0) + 1;

    const types: WhaleAlert['type'][] = ['transfer', 'exchange_inflow', 'exchange_outflow'];

    alerts.push({
      id: `wa-${now}-${i}`,
      type: randomFrom(types),
      amount_btc: amount,
      amount_usd: Math.round(amount * btcPrice),
      from: { address: fromAddr, label: EXCHANGE_LABELS[fromAddr] || 'Unknown' },
      to: { address: toAddr, label: EXCHANGE_LABELS[toAddr] || 'Unknown' },
      timestamp: now - Math.floor(Math.random() * 3600000),
      block_height: blockHeight - Math.floor(Math.random() * 6),
      significance: amount > 3000 ? 'extreme' : amount > 1000 ? 'critical' : 'high',
    });
  }

  const mostActive = Object.entries(activityCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
  const sources: string[] = [];
  if (usedRealPrice) sources.push('CoinGecko (BTC price)');
  if (usedRealBlock) sources.push('Blockchain.info (block height)');
  if (sources.length === 0) sources.push('simulated');

  return {
    alerts: alerts.sort((a, b) => b.timestamp - a.timestamp),
    summary: {
      total_volume_btc: Math.round(totalVolume * 100) / 100,
      alert_count: alertCount,
      most_active: mostActive,
    },
    data_source: sources.join(' + ') + ' | whale movements simulated',
    btc_price_usd: Math.round(btcPrice),
  };
}
