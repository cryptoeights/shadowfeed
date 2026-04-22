const CACHE_KEY = 'feed:alex_pairs_overview:result';
const CACHE_TTL = 180; // 3 minutes

interface AlexTicker {
  readonly tickerId: string;
  readonly base: string;
  readonly base_currency: string;
  readonly baseId: string;
  readonly target: string;
  readonly target_currency: string;
  readonly targetId: string;
  readonly baseVolume: number;
  readonly targetVolume: number;
  readonly lastBasePriceInUSD: number;
  readonly lastTargetPriceInUSD: number;
}

interface PairEntry {
  readonly ticker_id: string;
  readonly pair: string;
  readonly base_symbol: string;
  readonly target_symbol: string;
  readonly base_volume: number;
  readonly target_volume: number;
  readonly base_price_usd: number;
  readonly target_price_usd: number;
  readonly has_volume: boolean;
  readonly has_price: boolean;
}

interface AlexPairsOverviewResult {
  readonly summary: {
    readonly total_pairs: number;
    readonly pairs_with_volume: number;
    readonly pairs_with_price: number;
    readonly unique_base_tokens: number;
    readonly unique_target_tokens: number;
  };
  readonly all_pairs: readonly PairEntry[];
  readonly most_traded_pairs: readonly PairEntry[];
  readonly token_frequency: readonly {
    readonly symbol: string;
    readonly pair_count: number;
    readonly role: 'base' | 'target' | 'both';
  }[];
  readonly data_source: string;
  readonly generated_at: number;
}

function cleanSymbol(raw: string): string {
  return String(raw ?? '').trim();
}

export async function generateAlexPairsOverview(kv: KVNamespace): Promise<AlexPairsOverviewResult> {
  const cached = await kv.get(CACHE_KEY, 'json') as AlexPairsOverviewResult | null;
  if (cached) return cached;

  try {
    const res = await fetch('https://api.alexgo.io/v1/tickers');
    if (!res.ok) throw new Error(`ALEX tickers error: ${res.status}`);

    const tickers = await res.json() as AlexTicker[];
    if (!Array.isArray(tickers)) throw new Error('Invalid tickers response');

    const pairs: PairEntry[] = tickers.map((t) => {
      const base = cleanSymbol(t.base_currency);
      const target = cleanSymbol(t.target_currency);
      return {
        ticker_id: t.tickerId,
        pair: `${base}/${target}`,
        base_symbol: base,
        target_symbol: target,
        base_volume: Math.round((t.baseVolume ?? 0) * 100) / 100,
        target_volume: Math.round((t.targetVolume ?? 0) * 100) / 100,
        base_price_usd: t.lastBasePriceInUSD ?? 0,
        target_price_usd: t.lastTargetPriceInUSD ?? 0,
        has_volume: (t.baseVolume ?? 0) > 0 || (t.targetVolume ?? 0) > 0,
        has_price: (t.lastBasePriceInUSD ?? 0) > 0 || (t.lastTargetPriceInUSD ?? 0) > 0,
      };
    });

    const baseTokens = new Map<string, number>();
    const targetTokens = new Map<string, number>();

    for (const p of pairs) {
      if (p.base_symbol) {
        baseTokens.set(p.base_symbol, (baseTokens.get(p.base_symbol) ?? 0) + 1);
      }
      if (p.target_symbol) {
        targetTokens.set(p.target_symbol, (targetTokens.get(p.target_symbol) ?? 0) + 1);
      }
    }

    const tokenFreqMap = new Map<string, { pair_count: number; role: 'base' | 'target' | 'both' }>();
    for (const [sym, count] of baseTokens.entries()) {
      tokenFreqMap.set(sym, { pair_count: count, role: 'base' });
    }
    for (const [sym, count] of targetTokens.entries()) {
      const existing = tokenFreqMap.get(sym);
      if (existing) {
        tokenFreqMap.set(sym, {
          pair_count: existing.pair_count + count,
          role: 'both',
        });
      } else {
        tokenFreqMap.set(sym, { pair_count: count, role: 'target' });
      }
    }

    const tokenFrequency = Array.from(tokenFreqMap.entries())
      .map(([symbol, info]) => ({
        symbol,
        pair_count: info.pair_count,
        role: info.role,
      }))
      .sort((a, b) => b.pair_count - a.pair_count)
      .slice(0, 20);

    const mostTraded = [...pairs]
      .filter((p) => p.has_volume)
      .sort((a, b) => (b.base_volume + b.target_volume) - (a.base_volume + a.target_volume))
      .slice(0, 10);

    const pairsWithVolume = pairs.filter((p) => p.has_volume).length;
    const pairsWithPrice = pairs.filter((p) => p.has_price).length;

    const result: AlexPairsOverviewResult = {
      summary: {
        total_pairs: pairs.length,
        pairs_with_volume: pairsWithVolume,
        pairs_with_price: pairsWithPrice,
        unique_base_tokens: baseTokens.size,
        unique_target_tokens: targetTokens.size,
      },
      all_pairs: Object.freeze(pairs),
      most_traded_pairs: Object.freeze(mostTraded),
      token_frequency: Object.freeze(tokenFrequency),
      data_source: 'ALEX Lab (api.alexgo.io/v1/tickers)',
      generated_at: Date.now(),
    };

    await kv.put(CACHE_KEY, JSON.stringify(result), { expirationTtl: CACHE_TTL });
    return result;
  } catch (err: any) {
    return {
      summary: {
        total_pairs: 0,
        pairs_with_volume: 0,
        pairs_with_price: 0,
        unique_base_tokens: 0,
        unique_target_tokens: 0,
      },
      all_pairs: [],
      most_traded_pairs: [],
      token_frequency: [],
      data_source: `error: ${err?.message ?? 'unknown'}`,
      generated_at: Date.now(),
    };
  }
}
