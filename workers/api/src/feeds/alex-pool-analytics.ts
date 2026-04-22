const CACHE_KEY = 'feed:alex_pool_analytics:result';
const CACHE_TTL = 180; // 3 minutes

// /v2/coin-gecko/tickers returns rich AMM pool data
interface GeckoTicker {
  readonly base: string; // symbol
  readonly base_currency: string; // contract id
  readonly pool_id: number;
  readonly pool_contract: string;
  readonly target: string; // symbol
  readonly target_currency: string; // contract id
  readonly ticker_id: string;
  readonly last_price: number;
  readonly base_volume: number;
  readonly target_volume: number;
  readonly liquidity_in_usd: number;
}

// /v1/public/amm-pool-stats returns { data: [{ target_token, base_token, pool_id, tvl, apy }] }
interface PoolApyEntry {
  readonly target_token: string;
  readonly base_token: string;
  readonly pool_id: number;
  readonly tvl: string;
  readonly apy: string;
}

interface PoolApyResponse {
  readonly data: readonly PoolApyEntry[];
}

interface PoolInfo {
  readonly pool_id: number;
  readonly pair: string;
  readonly base: string;
  readonly target: string;
  readonly liquidity_usd: number;
  readonly base_volume: number;
  readonly target_volume: number;
  readonly apy_pct: number;
  readonly last_price: number;
}

interface AlexPoolAnalyticsResult {
  readonly summary: {
    readonly total_pools: number;
    readonly active_pools: number;
    readonly total_liquidity_usd: number;
    readonly avg_apy_pct: number;
    readonly top_pool: string | null;
  };
  readonly top_pools_by_liquidity: readonly PoolInfo[];
  readonly top_pools_by_apy: readonly PoolInfo[];
  readonly top_pools_by_volume: readonly PoolInfo[];
  readonly data_source: string;
  readonly generated_at: number;
}

async function fetchGeckoTickers(): Promise<readonly GeckoTicker[]> {
  const res = await fetch('https://api.alexgo.io/v2/coin-gecko/tickers');
  if (!res.ok) throw new Error(`ALEX gecko tickers error: ${res.status}`);
  const data = await res.json() as GeckoTicker[];
  if (!Array.isArray(data)) throw new Error('Invalid gecko tickers response');
  return Object.freeze(data);
}

async function fetchPoolApy(): Promise<readonly PoolApyEntry[]> {
  const res = await fetch('https://api.alexgo.io/v1/public/amm-pool-stats');
  if (!res.ok) throw new Error(`ALEX amm-pool-stats error: ${res.status}`);
  const payload = await res.json() as PoolApyResponse;
  if (!payload || !Array.isArray(payload.data)) {
    throw new Error('Invalid amm-pool-stats response shape');
  }
  return Object.freeze(payload.data);
}

export async function generateAlexPoolAnalytics(kv: KVNamespace): Promise<AlexPoolAnalyticsResult> {
  const cached = await kv.get(CACHE_KEY, 'json') as AlexPoolAnalyticsResult | null;
  if (cached) return cached;

  try {
    const [tickers, apyEntries] = await Promise.all([
      fetchGeckoTickers(),
      fetchPoolApy(),
    ]);

    const apyMap = new Map<number, { apy: number; tvl: number }>();
    for (const entry of apyEntries) {
      apyMap.set(entry.pool_id, {
        apy: parseFloat(entry.apy) || 0,
        tvl: parseFloat(entry.tvl) || 0,
      });
    }

    const enrichedPools: PoolInfo[] = tickers.map((t) => {
      const apyInfo = apyMap.get(t.pool_id);
      const apyPct = apyInfo ? apyInfo.apy * 100 : 0;
      const liquidityUsd = t.liquidity_in_usd > 0 ? t.liquidity_in_usd : (apyInfo?.tvl ?? 0);
      return {
        pool_id: t.pool_id,
        pair: `${t.base}/${t.target}`,
        base: t.base,
        target: t.target,
        liquidity_usd: Math.round(liquidityUsd),
        base_volume: Math.round(t.base_volume * 100) / 100,
        target_volume: Math.round(t.target_volume * 100) / 100,
        apy_pct: Math.round(apyPct * 10000) / 10000,
        last_price: t.last_price,
      };
    });

    const activePools = enrichedPools.filter((p) => p.liquidity_usd > 0 || p.base_volume > 0);
    const totalLiquidity = enrichedPools.reduce((s, p) => s + p.liquidity_usd, 0);
    const avgApy = activePools.length > 0
      ? activePools.reduce((s, p) => s + p.apy_pct, 0) / activePools.length
      : 0;

    const topByLiquidity = [...enrichedPools]
      .sort((a, b) => b.liquidity_usd - a.liquidity_usd)
      .slice(0, 10);
    const topByApy = [...enrichedPools]
      .filter((p) => p.apy_pct > 0)
      .sort((a, b) => b.apy_pct - a.apy_pct)
      .slice(0, 10);
    const topByVolume = [...enrichedPools]
      .sort((a, b) => (b.base_volume + b.target_volume) - (a.base_volume + a.target_volume))
      .slice(0, 10);

    const result: AlexPoolAnalyticsResult = {
      summary: {
        total_pools: enrichedPools.length,
        active_pools: activePools.length,
        total_liquidity_usd: Math.round(totalLiquidity),
        avg_apy_pct: Math.round(avgApy * 10000) / 10000,
        top_pool: topByLiquidity[0]?.pair ?? null,
      },
      top_pools_by_liquidity: Object.freeze(topByLiquidity),
      top_pools_by_apy: Object.freeze(topByApy),
      top_pools_by_volume: Object.freeze(topByVolume),
      data_source: 'ALEX Lab (api.alexgo.io/v2/coin-gecko/tickers + /v1/public/amm-pool-stats)',
      generated_at: Date.now(),
    };

    await kv.put(CACHE_KEY, JSON.stringify(result), { expirationTtl: CACHE_TTL });
    return result;
  } catch (err: any) {
    return {
      summary: {
        total_pools: 0,
        active_pools: 0,
        total_liquidity_usd: 0,
        avg_apy_pct: 0,
        top_pool: null,
      },
      top_pools_by_liquidity: [],
      top_pools_by_apy: [],
      top_pools_by_volume: [],
      data_source: `error: ${err?.message ?? 'unknown'}`,
      generated_at: Date.now(),
    };
  }
}
