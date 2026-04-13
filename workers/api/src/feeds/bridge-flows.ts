const CACHE_KEY = 'feed:bridge_flows:result';
const CACHE_TTL = 300;

interface ChainTvlData {
  chain: string;
  tvl_usd: number;
  token_symbol: string;
}

interface BridgeFlowsResult {
  summary: {
    total_cross_chain_tvl: number;
    chains_tracked: number;
    top_chain: string;
    top_chain_dominance_pct: number;
  };
  chain_tvl_rankings: readonly {
    rank: number;
    chain: string;
    tvl_usd: number;
    share_pct: number;
    token_symbol: string;
  }[];
  tvl_tiers: {
    tier1_over_1b: number;
    tier2_100m_1b: number;
    tier3_10m_100m: number;
    tier4_under_10m: number;
  };
  ecosystem_diversity: {
    total_chains: number;
    top_5_concentration_pct: number;
    top_10_concentration_pct: number;
    assessment: string;
  };
  data_source: string;
  generated_at: number;
}

interface LlamaChain {
  gecko_id: string | null;
  tvl: number;
  tokenSymbol: string;
  cmcId: string | null;
  name: string;
  chainId: number | null;
}

export async function generateBridgeFlows(kv: KVNamespace): Promise<BridgeFlowsResult> {
  const cached = await kv.get(CACHE_KEY, 'json') as BridgeFlowsResult | null;
  if (cached) return cached;

  try {
    const res = await fetch('https://api.llama.fi/v2/chains');
    if (!res.ok) throw new Error(`DeFiLlama API error: ${res.status}`);

    const chains = await res.json() as LlamaChain[];
    if (!Array.isArray(chains)) throw new Error('Invalid chain data');

    const validChains = chains
      .filter(c => (c.tvl ?? 0) > 0)
      .map(c => ({
        chain: c.name,
        tvl_usd: c.tvl ?? 0,
        token_symbol: c.tokenSymbol ?? c.name,
      }))
      .sort((a, b) => b.tvl_usd - a.tvl_usd);

    const totalTvl = validChains.reduce((sum, c) => sum + c.tvl_usd, 0);

    const rankings = validChains.slice(0, 25).map((c, idx) => ({
      rank: idx + 1,
      chain: c.chain,
      tvl_usd: Math.round(c.tvl_usd),
      share_pct: Math.round((c.tvl_usd / Math.max(1, totalTvl)) * 10000) / 100,
      token_symbol: c.token_symbol,
    }));

    const top5Tvl = validChains.slice(0, 5).reduce((s, c) => s + c.tvl_usd, 0);
    const top10Tvl = validChains.slice(0, 10).reduce((s, c) => s + c.tvl_usd, 0);
    const top5Pct = Math.round((top5Tvl / Math.max(1, totalTvl)) * 10000) / 100;
    const top10Pct = Math.round((top10Tvl / Math.max(1, totalTvl)) * 10000) / 100;

    const tier1 = validChains.filter(c => c.tvl_usd >= 1_000_000_000).length;
    const tier2 = validChains.filter(c => c.tvl_usd >= 100_000_000 && c.tvl_usd < 1_000_000_000).length;
    const tier3 = validChains.filter(c => c.tvl_usd >= 10_000_000 && c.tvl_usd < 100_000_000).length;
    const tier4 = validChains.filter(c => c.tvl_usd < 10_000_000).length;

    const diversityAssessment = top5Pct > 90 ? 'Highly concentrated — top 5 chains dominate the ecosystem' :
                                 top5Pct > 75 ? 'Moderately concentrated — significant TVL in top chains' :
                                 'Well diversified — capital is spread across many chains';

    const result: BridgeFlowsResult = {
      summary: {
        total_cross_chain_tvl: Math.round(totalTvl),
        chains_tracked: validChains.length,
        top_chain: validChains[0]?.chain ?? 'N/A',
        top_chain_dominance_pct: rankings[0]?.share_pct ?? 0,
      },
      chain_tvl_rankings: Object.freeze(rankings),
      tvl_tiers: {
        tier1_over_1b: tier1,
        tier2_100m_1b: tier2,
        tier3_10m_100m: tier3,
        tier4_under_10m: tier4,
      },
      ecosystem_diversity: {
        total_chains: validChains.length,
        top_5_concentration_pct: top5Pct,
        top_10_concentration_pct: top10Pct,
        assessment: diversityAssessment,
      },
      data_source: 'DeFiLlama (cross-chain TVL data)',
      generated_at: Date.now(),
    };

    await kv.put(CACHE_KEY, JSON.stringify(result), { expirationTtl: CACHE_TTL });
    return result;
  } catch (err: any) {
    return {
      summary: {
        total_cross_chain_tvl: 0,
        chains_tracked: 0,
        top_chain: 'N/A',
        top_chain_dominance_pct: 0,
      },
      chain_tvl_rankings: [],
      tvl_tiers: { tier1_over_1b: 0, tier2_100m_1b: 0, tier3_10m_100m: 0, tier4_under_10m: 0 },
      ecosystem_diversity: {
        total_chains: 0,
        top_5_concentration_pct: 0,
        top_10_concentration_pct: 0,
        assessment: `Error: ${err.message}`,
      },
      data_source: 'error',
      generated_at: Date.now(),
    };
  }
}
