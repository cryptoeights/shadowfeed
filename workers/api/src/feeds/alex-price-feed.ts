const CACHE_KEY = 'feed:alex_price_feed:result';
const CACHE_TTL = 60; // 1 minute — prices change frequently

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

interface TokenPrice {
  readonly symbol: string;
  readonly contract_id: string;
  readonly price_usd: number;
  readonly pool_count: number;
  readonly has_liquidity: boolean;
}

interface AlexPriceFeedResult {
  readonly summary: {
    readonly tokens_tracked: number;
    readonly tokens_with_price: number;
    readonly pools_analyzed: number;
    readonly top_token_by_price: string | null;
  };
  readonly prices: readonly TokenPrice[];
  readonly stacks_ecosystem: {
    readonly alex_price_usd: number;
    readonly stx_price_usd: number;
    readonly wrapped_btc_price_usd: number;
    readonly wrapped_usd_price_usd: number;
  };
  readonly data_source: string;
  readonly generated_at: number;
}

function aggregateTokenPrices(swaps: readonly AlexSwap[]): Map<string, { prices: number[]; contract_id: string; pool_count: number }> {
  const tokenMap = new Map<string, { prices: number[]; contract_id: string; pool_count: number }>();

  for (const swap of swaps) {
    // Aggregate base token
    if (swap.baseSymbol) {
      const existing = tokenMap.get(swap.baseSymbol) ?? { prices: [], contract_id: swap.baseId, pool_count: 0 };
      if (swap.lastBasePriceInUSD > 0) {
        existing.prices.push(swap.lastBasePriceInUSD);
      }
      tokenMap.set(swap.baseSymbol, {
        prices: existing.prices,
        contract_id: existing.contract_id,
        pool_count: existing.pool_count + 1,
      });
    }
    // Aggregate quote token
    if (swap.quoteSymbol) {
      const existing = tokenMap.get(swap.quoteSymbol) ?? { prices: [], contract_id: swap.quoteId, pool_count: 0 };
      if (swap.lastQuotePriceInUSD > 0) {
        existing.prices.push(swap.lastQuotePriceInUSD);
      }
      tokenMap.set(swap.quoteSymbol, {
        prices: existing.prices,
        contract_id: existing.contract_id,
        pool_count: existing.pool_count + 1,
      });
    }
  }

  return tokenMap;
}

function medianPrice(prices: readonly number[]): number {
  if (prices.length === 0) return 0;
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export async function generateAlexPriceFeed(kv: KVNamespace): Promise<AlexPriceFeedResult> {
  const cached = await kv.get(CACHE_KEY, 'json') as AlexPriceFeedResult | null;
  if (cached) return cached;

  try {
    const res = await fetch('https://api.alexgo.io/v1/allswaps');
    if (!res.ok) throw new Error(`ALEX API error: ${res.status}`);

    const swaps = await res.json() as AlexSwap[];
    if (!Array.isArray(swaps)) throw new Error('Invalid response format');

    const tokenMap = aggregateTokenPrices(swaps);

    const prices: TokenPrice[] = Array.from(tokenMap.entries())
      .map(([symbol, info]) => ({
        symbol,
        contract_id: info.contract_id,
        price_usd: Math.round(medianPrice(info.prices) * 1e8) / 1e8,
        pool_count: info.pool_count,
        has_liquidity: info.prices.length > 0,
      }))
      .filter((t) => t.symbol && t.symbol.length > 0)
      .sort((a, b) => b.price_usd - a.price_usd);

    const getPrice = (sym: string): number => {
      const match = prices.find((p) => p.symbol.toLowerCase() === sym.toLowerCase());
      return match?.price_usd ?? 0;
    };

    const withPrice = prices.filter((p) => p.has_liquidity);
    const topToken = withPrice[0]?.symbol ?? null;

    const result: AlexPriceFeedResult = {
      summary: {
        tokens_tracked: prices.length,
        tokens_with_price: withPrice.length,
        pools_analyzed: swaps.length,
        top_token_by_price: topToken,
      },
      prices: Object.freeze(prices),
      stacks_ecosystem: {
        alex_price_usd: getPrice('alex'),
        stx_price_usd: getPrice('STX'),
        wrapped_btc_price_usd: getPrice('wrapped-bitcoin'),
        wrapped_usd_price_usd: getPrice('wrapped-usd'),
      },
      data_source: 'ALEX Lab (api.alexgo.io/v1/allswaps)',
      generated_at: Date.now(),
    };

    await kv.put(CACHE_KEY, JSON.stringify(result), { expirationTtl: CACHE_TTL });
    return result;
  } catch (err: any) {
    return {
      summary: {
        tokens_tracked: 0,
        tokens_with_price: 0,
        pools_analyzed: 0,
        top_token_by_price: null,
      },
      prices: [],
      stacks_ecosystem: {
        alex_price_usd: 0,
        stx_price_usd: 0,
        wrapped_btc_price_usd: 0,
        wrapped_usd_price_usd: 0,
      },
      data_source: `error: ${err?.message ?? 'unknown'}`,
      generated_at: Date.now(),
    };
  }
}
