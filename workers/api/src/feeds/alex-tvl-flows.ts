const CACHE_KEY = 'feed:alex_tvl_flows:result';
const CACHE_TTL = 300; // 5 minutes

interface PlatformTvl {
  readonly type: string;
  readonly lp_token_supply: number;
  readonly reserve_pool_value: number;
  readonly tvl: number;
  readonly block_height: number;
  readonly updated_at: string;
}

interface PoolApy {
  readonly target_token: string;
  readonly base_token: string;
  readonly pool_id: number;
  readonly tvl: string;
  readonly apy: string;
}

interface TvlTier {
  readonly tier: string;
  readonly pool_count: number;
  readonly total_tvl: number;
  readonly share_pct: number;
}

interface TopPoolTvl {
  readonly pool_id: number;
  readonly pair: string;
  readonly tvl: number;
  readonly apy_pct: number;
  readonly share_pct: number;
}

interface AlexTvlFlowsResult {
  readonly platform: {
    readonly total_tvl_usd: number;
    readonly lp_token_supply: number;
    readonly reserve_pool_value: number;
    readonly block_height: number;
    readonly updated_at: string;
  };
  readonly pool_distribution: {
    readonly total_pools: number;
    readonly pools_with_tvl: number;
    readonly concentration_top_5_pct: number;
    readonly concentration_top_10_pct: number;
    readonly assessment: string;
  };
  readonly tvl_tiers: readonly TvlTier[];
  readonly top_pools_by_tvl: readonly TopPoolTvl[];
  readonly data_source: string;
  readonly generated_at: number;
}

function classifyTier(tvl: number): string {
  if (tvl >= 100_000) return 'tier1_over_100k';
  if (tvl >= 10_000) return 'tier2_10k_100k';
  if (tvl >= 1_000) return 'tier3_1k_10k';
  if (tvl > 0) return 'tier4_under_1k';
  return 'tier5_no_tvl';
}

function assessConcentration(top5Pct: number): string {
  if (top5Pct > 90) return 'Highly concentrated — 5 pools dominate platform TVL';
  if (top5Pct > 75) return 'Moderately concentrated — top pools hold most liquidity';
  if (top5Pct > 50) return 'Balanced — notable TVL spread beyond top pools';
  return 'Well diversified — TVL spread across many pools';
}

export async function generateAlexTvlFlows(kv: KVNamespace): Promise<AlexTvlFlowsResult> {
  const cached = await kv.get(CACHE_KEY, 'json') as AlexTvlFlowsResult | null;
  if (cached) return cached;

  try {
    const [platformRes, poolsRes] = await Promise.all([
      fetch('https://api.alexgo.io/v1/stats/tvl'),
      fetch('https://api.alexgo.io/v1/public/amm-pool-stats'),
    ]);

    if (!platformRes.ok) throw new Error(`ALEX stats/tvl error: ${platformRes.status}`);
    if (!poolsRes.ok) throw new Error(`ALEX amm-pool-stats error: ${poolsRes.status}`);

    const platform = await platformRes.json() as PlatformTvl;
    const poolsPayload = await poolsRes.json() as { data?: any[] };
    const poolsRaw = Array.isArray(poolsPayload?.data) ? poolsPayload.data : [];
    if (poolsRaw.length === 0) throw new Error('No pool data in amm-pool-stats response');

    const pools: PoolApy[] = poolsRaw
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        target_token: String(item.target_token ?? ''),
        base_token: String(item.base_token ?? ''),
        pool_id: Number(item.pool_id ?? 0),
        tvl: String(item.tvl ?? '0'),
        apy: String(item.apy ?? '0'),
      }));

    const parsedPools = pools.map((p) => ({
      pool_id: p.pool_id,
      pair: `${p.base_token.split('.').pop() ?? p.base_token}/${p.target_token.split('.').pop() ?? p.target_token}`,
      tvl: parseFloat(p.tvl) || 0,
      apy_pct: (parseFloat(p.apy) || 0) * 100,
    }));

    const sortedByTvl = [...parsedPools].sort((a, b) => b.tvl - a.tvl);
    const totalPoolTvl = sortedByTvl.reduce((s, p) => s + p.tvl, 0);
    const denominator = Math.max(1, totalPoolTvl);

    const top5Tvl = sortedByTvl.slice(0, 5).reduce((s, p) => s + p.tvl, 0);
    const top10Tvl = sortedByTvl.slice(0, 10).reduce((s, p) => s + p.tvl, 0);
    const top5Pct = Math.round((top5Tvl / denominator) * 10000) / 100;
    const top10Pct = Math.round((top10Tvl / denominator) * 10000) / 100;

    // Classify tiers
    const tierCounts = new Map<string, { count: number; tvl: number }>();
    for (const p of parsedPools) {
      const tier = classifyTier(p.tvl);
      const existing = tierCounts.get(tier) ?? { count: 0, tvl: 0 };
      tierCounts.set(tier, { count: existing.count + 1, tvl: existing.tvl + p.tvl });
    }

    const tiersArr: TvlTier[] = Array.from(tierCounts.entries())
      .map(([tier, info]) => ({
        tier,
        pool_count: info.count,
        total_tvl: Math.round(info.tvl * 100) / 100,
        share_pct: Math.round((info.tvl / denominator) * 10000) / 100,
      }))
      .sort((a, b) => b.total_tvl - a.total_tvl);

    const topPools: TopPoolTvl[] = sortedByTvl
      .slice(0, 10)
      .filter((p) => p.tvl > 0)
      .map((p) => ({
        pool_id: p.pool_id,
        pair: p.pair,
        tvl: Math.round(p.tvl * 100) / 100,
        apy_pct: Math.round(p.apy_pct * 10000) / 10000,
        share_pct: Math.round((p.tvl / denominator) * 10000) / 100,
      }));

    const poolsWithTvl = parsedPools.filter((p) => p.tvl > 0).length;

    const result: AlexTvlFlowsResult = {
      platform: {
        total_tvl_usd: Math.round(platform.tvl * 100) / 100,
        lp_token_supply: Math.round(platform.lp_token_supply * 100) / 100,
        reserve_pool_value: Math.round(platform.reserve_pool_value * 100) / 100,
        block_height: platform.block_height,
        updated_at: platform.updated_at,
      },
      pool_distribution: {
        total_pools: parsedPools.length,
        pools_with_tvl: poolsWithTvl,
        concentration_top_5_pct: top5Pct,
        concentration_top_10_pct: top10Pct,
        assessment: assessConcentration(top5Pct),
      },
      tvl_tiers: Object.freeze(tiersArr),
      top_pools_by_tvl: Object.freeze(topPools),
      data_source: 'ALEX Lab (api.alexgo.io/v1/stats/tvl + /v1/allswaps)',
      generated_at: Date.now(),
    };

    await kv.put(CACHE_KEY, JSON.stringify(result), { expirationTtl: CACHE_TTL });
    return result;
  } catch (err: any) {
    return {
      platform: {
        total_tvl_usd: 0,
        lp_token_supply: 0,
        reserve_pool_value: 0,
        block_height: 0,
        updated_at: new Date().toISOString(),
      },
      pool_distribution: {
        total_pools: 0,
        pools_with_tvl: 0,
        concentration_top_5_pct: 0,
        concentration_top_10_pct: 0,
        assessment: `Error: ${err?.message ?? 'unknown'}`,
      },
      tvl_tiers: [],
      top_pools_by_tvl: [],
      data_source: `error: ${err?.message ?? 'unknown'}`,
      generated_at: Date.now(),
    };
  }
}
