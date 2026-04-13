const BINANCE_FUTURES_API = 'https://fapi.binance.com/fapi/v1';

const TOP_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
  'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT',
];

interface ForceOrder {
  symbol: string;
  price: string;
  origQty: string;
  executedQty: string;
  averagePrice: string;
  side: 'BUY' | 'SELL';
  time: number;
}

interface TickerData {
  symbol: string;
  priceChangePercent: string;
  lastPrice: string;
  volume: string;
  quoteVolume: string;
}

interface OpenInterestData {
  symbol: string;
  openInterest: string;
}

interface LiquidationBySymbol {
  readonly symbol: string;
  readonly count: number;
  readonly total_value_usd: number;
  readonly long_count: number;
  readonly short_count: number;
}

interface LargestLiquidation {
  readonly symbol: string;
  readonly side: string;
  readonly quantity: number;
  readonly price: number;
  readonly value_usd: number;
  readonly timestamp: number;
}

async function fetchForceOrders(): Promise<ReadonlyArray<ForceOrder>> {
  try {
    const res = await fetch(`${BINANCE_FUTURES_API}/forceOrders?limit=50`);
    if (!res.ok) return [];
    return await res.json() as ForceOrder[];
  } catch {
    return [];
  }
}

async function fetchOpenInterest(): Promise<ReadonlyArray<{ symbol: string; openInterest: number }>> {
  try {
    const results = await Promise.all(
      TOP_SYMBOLS.map(async (symbol) => {
        try {
          const res = await fetch(`${BINANCE_FUTURES_API}/openInterest?symbol=${symbol}`);
          if (!res.ok) return null;
          const data = await res.json() as OpenInterestData;
          return { symbol: data.symbol, openInterest: parseFloat(data.openInterest) };
        } catch {
          return null;
        }
      })
    );
    return results.filter((r): r is { symbol: string; openInterest: number } => r !== null);
  } catch {
    return [];
  }
}

async function fetchFuturesTickers(): Promise<ReadonlyArray<TickerData>> {
  try {
    const res = await fetch(`${BINANCE_FUTURES_API}/ticker/24hr`);
    if (!res.ok) return [];
    const tickers = await res.json() as TickerData[];
    return tickers.filter(t => TOP_SYMBOLS.includes(t.symbol));
  } catch {
    return [];
  }
}

function aggregateLiquidationsBySymbol(
  orders: ReadonlyArray<ForceOrder>
): ReadonlyArray<LiquidationBySymbol> {
  const grouped = orders.reduce<Record<string, {
    count: number;
    total_value: number;
    long_count: number;
    short_count: number;
  }>>((acc, order) => {
    const value = parseFloat(order.executedQty) * parseFloat(order.averagePrice);
    const isLong = order.side === 'SELL'; // forced sell = long liquidated
    const prev = acc[order.symbol] ?? { count: 0, total_value: 0, long_count: 0, short_count: 0 };
    return {
      ...acc,
      [order.symbol]: {
        count: prev.count + 1,
        total_value: prev.total_value + value,
        long_count: prev.long_count + (isLong ? 1 : 0),
        short_count: prev.short_count + (isLong ? 0 : 1),
      },
    };
  }, {});

  return Object.entries(grouped)
    .map(([symbol, data]) => ({
      symbol,
      count: data.count,
      total_value_usd: Math.round(data.total_value * 100) / 100,
      long_count: data.long_count,
      short_count: data.short_count,
    }))
    .sort((a, b) => b.total_value_usd - a.total_value_usd);
}

function extractLargestLiquidations(
  orders: ReadonlyArray<ForceOrder>
): ReadonlyArray<LargestLiquidation> {
  return orders
    .map(order => ({
      symbol: order.symbol,
      side: order.side === 'SELL' ? 'LONG' : 'SHORT',
      quantity: parseFloat(order.executedQty),
      price: parseFloat(order.averagePrice),
      value_usd: Math.round(parseFloat(order.executedQty) * parseFloat(order.averagePrice) * 100) / 100,
      timestamp: order.time,
    }))
    .sort((a, b) => b.value_usd - a.value_usd)
    .slice(0, 10);
}

export async function generateLiquidationAlerts(kv: KVNamespace) {
  const cacheKey = 'liquidation_alerts';
  const cached = await kv.get(cacheKey, 'json');
  if (cached) return cached;

  try {
    const [forceOrders, openInterests, tickers] = await Promise.all([
      fetchForceOrders(),
      fetchOpenInterest(),
      fetchFuturesTickers(),
    ]);

    const sources: string[] = [];

    if (forceOrders.length > 0) sources.push('Binance Futures Force Orders');
    if (openInterests.length > 0) sources.push('Binance Open Interest');
    if (tickers.length > 0) sources.push('Binance Futures 24hr Tickers');

    const bySymbol = aggregateLiquidationsBySymbol(forceOrders);
    const largestLiquidations = extractLargestLiquidations(forceOrders);

    const totalValue = bySymbol.reduce((sum, s) => sum + s.total_value_usd, 0);
    const totalLongs = bySymbol.reduce((sum, s) => sum + s.long_count, 0);
    const totalShorts = bySymbol.reduce((sum, s) => sum + s.short_count, 0);
    const longShortRatio = totalShorts > 0
      ? Math.round((totalLongs / totalShorts) * 100) / 100
      : totalLongs > 0 ? Infinity : 0;

    const marketOverview = tickers.map(t => ({
      symbol: t.symbol,
      price: parseFloat(t.lastPrice),
      price_change_24h_pct: parseFloat(t.priceChangePercent),
      volume_24h_usd: Math.round(parseFloat(t.quoteVolume)),
      open_interest: openInterests.find(oi => oi.symbol === t.symbol)?.openInterest ?? null,
    }));

    const result = {
      summary: {
        total_liquidations: forceOrders.length,
        total_value_usd: Math.round(totalValue * 100) / 100,
        long_vs_short_ratio: longShortRatio,
        longs_liquidated: totalLongs,
        shorts_liquidated: totalShorts,
        dominant_side: totalLongs > totalShorts ? 'longs' : totalShorts > totalLongs ? 'shorts' : 'balanced',
      },
      largest_liquidations: largestLiquidations,
      by_symbol: bySymbol,
      market_overview: marketOverview,
      data_source: sources.length > 0 ? sources.join(' + ') : 'no data available',
      generated_at: Date.now(),
    };

    await kv.put(cacheKey, JSON.stringify(result), { expirationTtl: 120 });
    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      summary: { error: 'Failed to fetch liquidation data', detail: message },
      largest_liquidations: [],
      by_symbol: [],
      market_overview: [],
      data_source: 'error',
      generated_at: Date.now(),
    };
  }
}
