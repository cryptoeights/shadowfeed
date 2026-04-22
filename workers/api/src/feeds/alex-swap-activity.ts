const CACHE_KEY = 'feed:alex_swap_activity:result';
const CACHE_TTL = 120; // 2 minutes — swap activity changes often

interface AlexSwap {
  readonly id: number;
  readonly base: string;
  readonly baseSymbol: string;
  readonly baseId: string;
  readonly quote: string;
  readonly quoteSymbol: string;
  readonly quoteId: string;
  readonly baseVolume: number;
  readonly quoteVolume: number;
  readonly lastBasePriceInUSD: number;
  readonly lastQuotePriceInUSD: number;
}

interface SwapPairActivity {
  readonly pool_id: number;
  readonly pair: string;
  readonly base_symbol: string;
  readonly quote_symbol: string;
  readonly base_volume: number;
  readonly quote_volume: number;
  readonly total_volume_usd: number;
  readonly base_price_usd: number;
  readonly quote_price_usd: number;
  readonly activity_score: number;
}

interface AlexSwapActivityResult {
  readonly summary: {
    readonly total_pools: number;
    readonly active_pools: number;
    readonly total_volume_usd: number;
    readonly most_active_pair: string | null;
    readonly pools_above_1k_volume: number;
  };
  readonly top_active_pools: readonly SwapPairActivity[];
  readonly volume_distribution: {
    readonly over_10k_usd: number;
    readonly between_1k_10k_usd: number;
    readonly under_1k_usd: number;
    readonly zero_volume: number;
  };
  readonly trending_pairs: readonly {
    readonly pair: string;
    readonly volume_usd: number;
    readonly signal: string;
  }[];
  readonly data_source: string;
  readonly generated_at: number;
}

function computeActivityScore(swap: AlexSwap, totalVolumeUsd: number): number {
  // Weighted score: volume (70%) + price liquidity presence (30%)
  const hasLiquidity = swap.lastBasePriceInUSD > 0 || swap.lastQuotePriceInUSD > 0;
  const liquidityScore = hasLiquidity ? 30 : 0;
  const volumeScore = totalVolumeUsd > 0 ? Math.min(70, Math.log10(totalVolumeUsd + 1) * 12) : 0;
  return Math.round((liquidityScore + volumeScore) * 100) / 100;
}

function classifyTrend(volumeUsd: number): string {
  if (volumeUsd >= 100_000) return 'high_activity';
  if (volumeUsd >= 10_000) return 'moderate_activity';
  if (volumeUsd >= 1_000) return 'light_activity';
  if (volumeUsd > 0) return 'minimal_activity';
  return 'inactive';
}

export async function generateAlexSwapActivity(kv: KVNamespace): Promise<AlexSwapActivityResult> {
  const cached = await kv.get(CACHE_KEY, 'json') as AlexSwapActivityResult | null;
  if (cached) return cached;

  try {
    const res = await fetch('https://api.alexgo.io/v1/allswaps');
    if (!res.ok) throw new Error(`ALEX allswaps error: ${res.status}`);

    const swaps = await res.json() as AlexSwap[];
    if (!Array.isArray(swaps)) throw new Error('Invalid response format');

    const enriched: SwapPairActivity[] = swaps.map((swap) => {
      // Estimate USD volume: use base volume * base price
      const baseVolumeUsd = swap.baseVolume * swap.lastBasePriceInUSD;
      const quoteVolumeUsd = swap.quoteVolume * swap.lastQuotePriceInUSD;
      const totalVolumeUsd = Math.max(baseVolumeUsd, quoteVolumeUsd); // Avoid double counting
      const activityScore = computeActivityScore(swap, totalVolumeUsd);

      return {
        pool_id: swap.id,
        pair: `${swap.baseSymbol}/${swap.quoteSymbol}`,
        base_symbol: swap.baseSymbol,
        quote_symbol: swap.quoteSymbol,
        base_volume: Math.round(swap.baseVolume * 100) / 100,
        quote_volume: Math.round(swap.quoteVolume * 100) / 100,
        total_volume_usd: Math.round(totalVolumeUsd * 100) / 100,
        base_price_usd: swap.lastBasePriceInUSD,
        quote_price_usd: swap.lastQuotePriceInUSD,
        activity_score: activityScore,
      };
    });

    const sortedByActivity = [...enriched].sort((a, b) => b.activity_score - a.activity_score);
    const sortedByVolume = [...enriched].sort((a, b) => b.total_volume_usd - a.total_volume_usd);

    const activePoolsCount = enriched.filter((p) => p.activity_score > 0).length;
    const totalVolumeUsd = enriched.reduce((s, p) => s + p.total_volume_usd, 0);

    const dist = {
      over_10k_usd: enriched.filter((p) => p.total_volume_usd >= 10_000).length,
      between_1k_10k_usd: enriched.filter((p) => p.total_volume_usd >= 1_000 && p.total_volume_usd < 10_000).length,
      under_1k_usd: enriched.filter((p) => p.total_volume_usd > 0 && p.total_volume_usd < 1_000).length,
      zero_volume: enriched.filter((p) => p.total_volume_usd === 0).length,
    };

    const trendingPairs = sortedByVolume.slice(0, 10).map((p) => ({
      pair: p.pair,
      volume_usd: p.total_volume_usd,
      signal: classifyTrend(p.total_volume_usd),
    }));

    const poolsAbove1k = dist.over_10k_usd + dist.between_1k_10k_usd;

    const result: AlexSwapActivityResult = {
      summary: {
        total_pools: enriched.length,
        active_pools: activePoolsCount,
        total_volume_usd: Math.round(totalVolumeUsd * 100) / 100,
        most_active_pair: sortedByActivity[0]?.pair ?? null,
        pools_above_1k_volume: poolsAbove1k,
      },
      top_active_pools: Object.freeze(sortedByActivity.slice(0, 10)),
      volume_distribution: dist,
      trending_pairs: Object.freeze(trendingPairs),
      data_source: 'ALEX Lab (api.alexgo.io/v1/allswaps)',
      generated_at: Date.now(),
    };

    await kv.put(CACHE_KEY, JSON.stringify(result), { expirationTtl: CACHE_TTL });
    return result;
  } catch (err: any) {
    return {
      summary: {
        total_pools: 0,
        active_pools: 0,
        total_volume_usd: 0,
        most_active_pair: null,
        pools_above_1k_volume: 0,
      },
      top_active_pools: [],
      volume_distribution: {
        over_10k_usd: 0,
        between_1k_10k_usd: 0,
        under_1k_usd: 0,
        zero_volume: 0,
      },
      trending_pairs: [],
      data_source: `error: ${err?.message ?? 'unknown'}`,
      generated_at: Date.now(),
    };
  }
}
