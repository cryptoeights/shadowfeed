export interface StablecoinInfo {
  name: string;
  symbol: string;
  market_cap: number;
  market_cap_change_24h: number;
  market_cap_change_7d: number;
  peg_price: number;
  peg_deviation: number;
  peg_status: 'stable' | 'minor_deviation' | 'major_deviation';
  chains: readonly string[];
}

export interface ChainStablecoinTvl {
  chain: string;
  total_mcap: number;
  dominant_stablecoin: string;
  stablecoin_count: number;
}

export interface StablecoinFlowsResult {
  summary: {
    total_mcap: number;
    dominant_stablecoin: string;
    '24h_change_pct': number;
    stablecoin_count: number;
  };
  top_stablecoins: readonly StablecoinInfo[];
  chain_distribution: readonly ChainStablecoinTvl[];
  peg_deviations: readonly StablecoinInfo[];
  data_source: string;
  generated_at: number;
}

interface LlamaStablecoin {
  id: string;
  name: string;
  symbol: string;
  pegMechanism: string;
  price: number | null;
  circulating: { peggedUSD?: number } | null;
  circulatingPrevDay: { peggedUSD?: number } | null;
  circulatingPrevWeek: { peggedUSD?: number } | null;
  chains: string[];
}

interface LlamaStablecoinChain {
  gecko_id: string | null;
  totalCirculatingUSD: { peggedUSD?: number } | null;
  name: string;
}

const CACHE_KEY_STABLECOINS = 'feed:stablecoin_flows:coins';
const CACHE_KEY_CHAINS = 'feed:stablecoin_flows:chains';
const CACHE_KEY_RESULT = 'feed:stablecoin_flows:result';
const CACHE_TTL = 300;

function computePegStatus(price: number): StablecoinInfo['peg_status'] {
  const deviation = Math.abs(price - 1);
  if (deviation <= 0.005) return 'stable';
  if (deviation <= 0.02) return 'minor_deviation';
  return 'major_deviation';
}

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function computeChangePct(current: number, previous: number): number {
  if (previous === 0) return 0;
  return roundTo(((current - previous) / previous) * 100, 2);
}

async function fetchStablecoins(kv: KVNamespace): Promise<readonly LlamaStablecoin[] | null> {
  const cached = await kv.get(CACHE_KEY_STABLECOINS, 'json') as LlamaStablecoin[] | null;
  if (cached) return cached;

  try {
    const res = await fetch('https://stablecoins.llama.fi/stablecoins?includePrices=true');
    if (!res.ok) return null;

    const json = await res.json() as { peggedAssets?: LlamaStablecoin[] };
    const assets = json?.peggedAssets;
    if (!assets || !Array.isArray(assets)) return null;

    await kv.put(CACHE_KEY_STABLECOINS, JSON.stringify(assets), { expirationTtl: CACHE_TTL });
    return assets;
  } catch {
    return null;
  }
}

async function fetchChainBreakdown(kv: KVNamespace): Promise<readonly LlamaStablecoinChain[] | null> {
  const cached = await kv.get(CACHE_KEY_CHAINS, 'json') as LlamaStablecoinChain[] | null;
  if (cached) return cached;

  try {
    const res = await fetch('https://stablecoins.llama.fi/stablecoinchains');
    if (!res.ok) return null;

    const chains = await res.json() as LlamaStablecoinChain[];
    if (!Array.isArray(chains)) return null;

    await kv.put(CACHE_KEY_CHAINS, JSON.stringify(chains), { expirationTtl: CACHE_TTL });
    return chains;
  } catch {
    return null;
  }
}

function processStablecoins(assets: readonly LlamaStablecoin[]): readonly StablecoinInfo[] {
  return assets
    .filter((a) => (a.circulating?.peggedUSD ?? 0) > 0)
    .map((a) => {
      const mcap = a.circulating?.peggedUSD ?? 0;
      const prevDay = a.circulatingPrevDay?.peggedUSD ?? mcap;
      const prevWeek = a.circulatingPrevWeek?.peggedUSD ?? mcap;
      const price = a.price ?? 1;

      return {
        name: a.name,
        symbol: a.symbol,
        market_cap: Math.round(mcap),
        market_cap_change_24h: computeChangePct(mcap, prevDay),
        market_cap_change_7d: computeChangePct(mcap, prevWeek),
        peg_price: roundTo(price, 4),
        peg_deviation: roundTo(Math.abs(price - 1), 4),
        peg_status: computePegStatus(price),
        chains: Object.freeze(a.chains?.slice(0, 10) ?? []),
      };
    })
    .sort((a, b) => b.market_cap - a.market_cap);
}

function processChains(chains: readonly LlamaStablecoinChain[]): readonly ChainStablecoinTvl[] {
  return chains
    .filter((c) => (c.totalCirculatingUSD?.peggedUSD ?? 0) > 0)
    .map((c) => ({
      chain: c.name,
      total_mcap: Math.round(c.totalCirculatingUSD?.peggedUSD ?? 0),
      dominant_stablecoin: 'USDT',
      stablecoin_count: 0,
    }))
    .sort((a, b) => b.total_mcap - a.total_mcap)
    .slice(0, 15);
}

export async function generateStablecoinFlows(kv: KVNamespace): Promise<StablecoinFlowsResult> {
  const cachedResult = await kv.get(CACHE_KEY_RESULT, 'json') as StablecoinFlowsResult | null;
  if (cachedResult) return cachedResult;

  const [rawStablecoins, rawChains] = await Promise.all([
    fetchStablecoins(kv),
    fetchChainBreakdown(kv),
  ]);

  if (!rawStablecoins) {
    return {
      summary: {
        total_mcap: 0,
        dominant_stablecoin: 'N/A',
        '24h_change_pct': 0,
        stablecoin_count: 0,
      },
      top_stablecoins: [],
      chain_distribution: [],
      peg_deviations: [],
      data_source: 'error: unable to fetch stablecoin data from DeFiLlama',
      generated_at: Date.now(),
    };
  }

  const allProcessed = processStablecoins(rawStablecoins);
  const topStablecoins = Object.freeze(allProcessed.slice(0, 10));

  const totalMcap = allProcessed.reduce((sum, s) => sum + s.market_cap, 0);
  const dominant = allProcessed[0];

  const totalPrevDay = allProcessed.reduce((sum, s) => {
    const prevMcap = s.market_cap / (1 + s.market_cap_change_24h / 100);
    return sum + prevMcap;
  }, 0);
  const overallChange24h = computeChangePct(totalMcap, totalPrevDay);

  const pegDeviations = Object.freeze(
    allProcessed.filter((s) => s.peg_status !== 'stable').slice(0, 20)
  );

  const chainDistribution = rawChains
    ? Object.freeze(processChains(rawChains))
    : Object.freeze([]);

  const sources: string[] = ['DeFiLlama (stablecoins)'];
  if (rawChains) sources.push('DeFiLlama (chain breakdown)');

  const result: StablecoinFlowsResult = {
    summary: {
      total_mcap: Math.round(totalMcap),
      dominant_stablecoin: dominant?.symbol ?? 'N/A',
      '24h_change_pct': overallChange24h,
      stablecoin_count: allProcessed.length,
    },
    top_stablecoins: topStablecoins,
    chain_distribution: chainDistribution,
    peg_deviations: pegDeviations,
    data_source: sources.join(' + '),
    generated_at: Date.now(),
  };

  await kv.put(CACHE_KEY_RESULT, JSON.stringify(result), { expirationTtl: CACHE_TTL });
  return result;
}
