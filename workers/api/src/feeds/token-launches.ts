interface DexScreenerBoost {
  url?: string;
  chainId?: string;
  tokenAddress?: string;
  icon?: string;
  header?: string;
  description?: string;
  amount?: number;
  totalAmount?: number;
}

interface DexScreenerProfile {
  url?: string;
  chainId?: string;
  tokenAddress?: string;
  icon?: string;
  header?: string;
  description?: string;
  links?: ReadonlyArray<{ type?: string; label?: string; url?: string }>;
}

interface BoostedToken {
  readonly chain: string;
  readonly token_address: string;
  readonly name: string;
  readonly description: string;
  readonly boost_amount: number;
  readonly total_boost: number;
  readonly url: string;
}

interface TokenProfile {
  readonly chain: string;
  readonly token_address: string;
  readonly name: string;
  readonly description: string;
  readonly links: ReadonlyArray<{ type: string; label: string; url: string }>;
  readonly url: string;
}

interface ChainCount {
  readonly chain: string;
  readonly count: number;
}

async function fetchBoostedTokens(): Promise<ReadonlyArray<DexScreenerBoost>> {
  try {
    const res = await fetch('https://api.dexscreener.com/token-boosts/latest/v1');
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function fetchTokenProfiles(): Promise<ReadonlyArray<DexScreenerProfile>> {
  try {
    const res = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function processBoostedTokens(
  raw: ReadonlyArray<DexScreenerBoost>
): ReadonlyArray<BoostedToken> {
  return raw
    .filter(t => t.chainId && t.tokenAddress)
    .slice(0, 15)
    .map(t => ({
      chain: t.chainId ?? 'unknown',
      token_address: t.tokenAddress ?? '',
      name: t.header ?? 'Unknown Token',
      description: t.description ?? '',
      boost_amount: t.amount ?? 0,
      total_boost: t.totalAmount ?? 0,
      url: t.url ?? `https://dexscreener.com/${t.chainId}/${t.tokenAddress}`,
    }));
}

function processTokenProfiles(
  raw: ReadonlyArray<DexScreenerProfile>
): ReadonlyArray<TokenProfile> {
  return raw
    .filter(t => t.chainId && t.tokenAddress)
    .slice(0, 15)
    .map(t => ({
      chain: t.chainId ?? 'unknown',
      token_address: t.tokenAddress ?? '',
      name: t.header ?? 'Unknown Token',
      description: t.description ?? '',
      links: (t.links ?? [])
        .filter(l => l.url)
        .map(l => ({
          type: l.type ?? 'unknown',
          label: l.label ?? l.type ?? 'link',
          url: l.url ?? '',
        })),
      url: t.url ?? `https://dexscreener.com/${t.chainId}/${t.tokenAddress}`,
    }));
}

function countByChain(
  boosts: ReadonlyArray<DexScreenerBoost>,
  profiles: ReadonlyArray<DexScreenerProfile>
): ReadonlyArray<ChainCount> {
  const allChains = [
    ...boosts.map(t => t.chainId ?? 'unknown'),
    ...profiles.map(t => t.chainId ?? 'unknown'),
  ];

  const counts = allChains.reduce<Record<string, number>>((acc, chain) => ({
    ...acc,
    [chain]: (acc[chain] ?? 0) + 1,
  }), {});

  return Object.entries(counts)
    .map(([chain, count]) => ({ chain, count }))
    .sort((a, b) => b.count - a.count);
}

function identifyUniqueChains(chainCounts: ReadonlyArray<ChainCount>): ReadonlyArray<string> {
  return chainCounts.map(c => c.chain);
}

export async function generateTokenLaunches(kv: KVNamespace) {
  const cacheKey = 'token_launches';
  const cached = await kv.get(cacheKey, 'json');
  if (cached) return cached;

  try {
    const [rawBoosts, rawProfiles] = await Promise.all([
      fetchBoostedTokens(),
      fetchTokenProfiles(),
    ]);

    const sources: string[] = [];
    if (rawBoosts.length > 0) sources.push('DEXScreener Token Boosts');
    if (rawProfiles.length > 0) sources.push('DEXScreener Token Profiles');

    const boostedTokens = processBoostedTokens(rawBoosts);
    const newProfiles = processTokenProfiles(rawProfiles);
    const trendingChains = countByChain(rawBoosts, rawProfiles);
    const uniqueChains = identifyUniqueChains(trendingChains);

    const result = {
      summary: {
        total_new_tokens: rawBoosts.length + rawProfiles.length,
        boosted_count: rawBoosts.length,
        profiles_count: rawProfiles.length,
        chains: uniqueChains,
        chain_count: uniqueChains.length,
      },
      boosted_tokens: boostedTokens,
      new_profiles: newProfiles,
      trending_chains: trendingChains,
      data_source: sources.length > 0 ? sources.join(' + ') : 'no data available',
      generated_at: Date.now(),
    };

    await kv.put(cacheKey, JSON.stringify(result), { expirationTtl: 180 });
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      summary: { error: 'Failed to fetch token launch data', detail: message },
      boosted_tokens: [],
      new_profiles: [],
      trending_chains: [],
      data_source: 'error',
      generated_at: Date.now(),
    };
  }
}
