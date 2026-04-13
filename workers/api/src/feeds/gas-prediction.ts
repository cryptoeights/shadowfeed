interface BlocknativeGasPrice {
  blockPrices?: ReadonlyArray<{
    baseFeePerGas?: number;
    estimatedPrices?: ReadonlyArray<{
      confidence: number;
      price: number;
      maxPriorityFeePerGas: number;
      maxFeePerGas: number;
    }>;
  }>;
}

interface BeaconchainGas {
  data?: {
    rapid?: number;
    fast?: number;
    standard?: number;
    slow?: number;
  };
}

interface BtcFeeRecommendation {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
}

interface MempoolStats {
  count: number;
  vsize: number;
  total_fee: number;
  fee_histogram: ReadonlyArray<ReadonlyArray<number>>;
}

interface EthGasBySpeed {
  readonly speed: string;
  readonly gas_price_gwei: number;
  readonly max_fee_gwei: number | null;
  readonly max_priority_fee_gwei: number | null;
  readonly estimated_seconds: number;
}

interface BtcFeeByPriority {
  readonly priority: string;
  readonly fee_rate_sat_vb: number;
  readonly estimated_minutes: number;
}

async function fetchEthGasBlocknative(): Promise<ReadonlyArray<EthGasBySpeed> | null> {
  try {
    const res = await fetch('https://api.blocknative.com/gasprices/blockprices');
    if (!res.ok) return null;
    const data = await res.json() as BlocknativeGasPrice;
    const prices = data?.blockPrices?.[0]?.estimatedPrices;
    if (!prices || prices.length === 0) return null;

    const baseFee = data?.blockPrices?.[0]?.baseFeePerGas ?? 0;

    const speedLabels: ReadonlyArray<{ confidence: number; label: string; seconds: number }> = [
      { confidence: 99, label: 'instant', seconds: 15 },
      { confidence: 95, label: 'fast', seconds: 30 },
      { confidence: 90, label: 'standard', seconds: 60 },
      { confidence: 70, label: 'slow', seconds: 180 },
    ];

    const results: EthGasBySpeed[] = [];
    for (const { confidence, label, seconds } of speedLabels) {
      const match = prices.find(p => p.confidence === confidence);
      if (match) {
        results.push({
          speed: label,
          gas_price_gwei: Math.round((baseFee + match.maxPriorityFeePerGas) * 100) / 100,
          max_fee_gwei: Math.round(match.maxFeePerGas * 100) / 100,
          max_priority_fee_gwei: Math.round(match.maxPriorityFeePerGas * 100) / 100,
          estimated_seconds: seconds,
        });
      }
    }
    return results;
  } catch {
    return null;
  }
}

async function fetchEthGasBeaconchain(): Promise<ReadonlyArray<EthGasBySpeed> | null> {
  try {
    const res = await fetch('https://beaconcha.in/api/v1/execution/gasnow');
    if (!res.ok) return null;
    const data = await res.json() as BeaconchainGas;
    const gasData = data?.data;
    if (!gasData) return null;

    const entries: Array<{ speed: string; gwei: number | undefined; seconds: number }> = [
      { speed: 'instant', gwei: gasData.rapid, seconds: 15 },
      { speed: 'fast', gwei: gasData.fast, seconds: 30 },
      { speed: 'standard', gwei: gasData.standard, seconds: 60 },
      { speed: 'slow', gwei: gasData.slow, seconds: 180 },
    ];

    const results: EthGasBySpeed[] = [];
    for (const e of entries) {
      if (e.gwei !== undefined) {
        results.push({
          speed: e.speed,
          gas_price_gwei: Math.round((e.gwei / 1e9) * 100) / 100,
          max_fee_gwei: null,
          max_priority_fee_gwei: null,
          estimated_seconds: e.seconds,
        });
      }
    }
    return results;
  } catch {
    return null;
  }
}

async function fetchBtcFees(): Promise<BtcFeeRecommendation | null> {
  try {
    const res = await fetch('https://mempool.space/api/v1/fees/recommended');
    if (!res.ok) return null;
    return await res.json() as BtcFeeRecommendation;
  } catch {
    return null;
  }
}

async function fetchMempoolStats(): Promise<MempoolStats | null> {
  try {
    const res = await fetch('https://mempool.space/api/v1/mempool');
    if (!res.ok) return null;
    return await res.json() as MempoolStats;
  } catch {
    return null;
  }
}

function categorizeCongestion(mempoolVsize: number): {
  readonly level: string;
  readonly description: string;
} {
  if (mempoolVsize > 200_000_000) {
    return { level: 'extreme', description: 'Mempool severely congested. Expect significant delays for low-fee transactions.' };
  }
  if (mempoolVsize > 100_000_000) {
    return { level: 'high', description: 'Mempool congested. Consider using higher fees for timely confirmation.' };
  }
  if (mempoolVsize > 30_000_000) {
    return { level: 'moderate', description: 'Normal mempool activity. Standard fees should confirm within expected timeframes.' };
  }
  return { level: 'low', description: 'Mempool is clear. Even low-fee transactions should confirm quickly.' };
}

function buildRecommendation(
  ethGas: ReadonlyArray<EthGasBySpeed> | null,
  btcFees: BtcFeeRecommendation | null,
  congestionLevel: string
): string {
  const parts: string[] = [];

  if (ethGas && ethGas.length > 0) {
    const standardGas = ethGas.find(g => g.speed === 'standard');
    if (standardGas) {
      const gasLevel = standardGas.gas_price_gwei;
      if (gasLevel < 10) {
        parts.push('ETH gas is very low - excellent time for on-chain transactions.');
      } else if (gasLevel < 30) {
        parts.push('ETH gas is moderate - good for non-urgent transactions.');
      } else if (gasLevel < 80) {
        parts.push('ETH gas is elevated - consider waiting for lower fees if not urgent.');
      } else {
        parts.push('ETH gas is very high - delay non-essential transactions if possible.');
      }
    }
  }

  if (btcFees) {
    if (btcFees.hourFee <= 5) {
      parts.push('BTC fees are minimal - great time for Bitcoin transactions.');
    } else if (btcFees.hourFee <= 20) {
      parts.push('BTC fees are moderate.');
    } else {
      parts.push('BTC fees are elevated - use economy fee for non-urgent transfers.');
    }
  }

  if (congestionLevel === 'extreme' || congestionLevel === 'high') {
    parts.push('Consider Layer 2 solutions for cost savings.');
  }

  return parts.length > 0
    ? parts.join(' ')
    : 'Unable to generate recommendation - insufficient data.';
}

export async function generateGasPrediction(kv: KVNamespace) {
  const cacheKey = 'gas_prediction';
  const cached = await kv.get(cacheKey, 'json');
  if (cached) return cached;

  try {
    const [btcFees, mempoolStats] = await Promise.all([
      fetchBtcFees(),
      fetchMempoolStats(),
    ]);

    // Try Blocknative first, fall back to Beaconchain
    let ethGas = await fetchEthGasBlocknative();
    let ethSource = 'Blocknative';
    if (!ethGas) {
      ethGas = await fetchEthGasBeaconchain();
      ethSource = 'Beaconchain';
    }

    const sources: string[] = [];
    if (ethGas) sources.push(`${ethSource} (ETH gas)`);
    if (btcFees) sources.push('mempool.space (BTC fees)');
    if (mempoolStats) sources.push('mempool.space (mempool stats)');

    const bitcoinFees: ReadonlyArray<BtcFeeByPriority> = btcFees
      ? [
          { priority: 'fastest', fee_rate_sat_vb: btcFees.fastestFee, estimated_minutes: 10 },
          { priority: 'half_hour', fee_rate_sat_vb: btcFees.halfHourFee, estimated_minutes: 30 },
          { priority: 'hour', fee_rate_sat_vb: btcFees.hourFee, estimated_minutes: 60 },
          { priority: 'economy', fee_rate_sat_vb: btcFees.economyFee, estimated_minutes: 180 },
          { priority: 'minimum', fee_rate_sat_vb: btcFees.minimumFee, estimated_minutes: 1440 },
        ]
      : [];

    const mempoolInfo = mempoolStats
      ? {
          transaction_count: mempoolStats.count,
          vsize_bytes: mempoolStats.vsize,
          total_fee_btc: Math.round((mempoolStats.total_fee / 1e8) * 100000) / 100000,
        }
      : null;

    const congestion = mempoolStats
      ? categorizeCongestion(mempoolStats.vsize)
      : { level: 'unknown', description: 'Mempool data unavailable.' };

    const recommendation = buildRecommendation(ethGas, btcFees, congestion.level);

    const result = {
      ethereum: ethGas ?? [],
      bitcoin: bitcoinFees,
      mempool_stats: mempoolInfo,
      congestion_level: congestion,
      recommendation,
      data_source: sources.length > 0 ? sources.join(' + ') : 'no data available',
      generated_at: Date.now(),
    };

    await kv.put(cacheKey, JSON.stringify(result), { expirationTtl: 60 });
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      ethereum: [],
      bitcoin: [],
      mempool_stats: null,
      congestion_level: { level: 'unknown', description: 'Error fetching data.' },
      recommendation: 'Unable to generate recommendation due to data fetch failure.',
      data_source: 'error',
      generated_at: Date.now(),
      error: message,
    };
  }
}
