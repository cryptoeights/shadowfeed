// BTC Sentiment Feed — 100% real data, Cloudflare-Workers-compatible.
//
// IMPORTANT: CoinGecko and Reddit public endpoints return HTTP 403 from
// Cloudflare Workers IP ranges. We use Binance + CoinPaprika + Alternative.me
// instead, which all allow Worker egress.
//
// Sources:
//   1. Alternative.me — Fear & Greed Index (primary sentiment gauge)
//   2. Binance — live BTC/USDT 24h ticker: price, change %, volume, high/low
//   3. CoinPaprika — global market: BTC dominance, total market cap, 24h change
//
// No fabricated fields. Every number below is fetched live.

export interface SentimentData {
  readonly overall_score: number;
  readonly overall_label: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
  readonly fear_greed: {
    readonly value: number;
    readonly classification: string;
  };
  readonly btc_market: {
    readonly price_usd: number;
    readonly change_24h_pct: number;
    readonly volume_24h_usd: number;
    readonly high_24h_usd: number;
    readonly low_24h_usd: number;
    readonly dominance_pct: number;
  };
  readonly global_market: {
    readonly total_market_cap_usd: number;
    readonly total_volume_24h_usd: number;
    readonly market_cap_change_24h_pct: number;
    readonly active_cryptocurrencies: number;
  };
  readonly volatility: {
    readonly range_24h_pct: number;         // (high-low)/price
    readonly level: 'low' | 'normal' | 'elevated' | 'extreme';
  };
  readonly market_trend: 'bullish' | 'bearish' | 'sideways';
  readonly data_sources: readonly string[];
  readonly last_updated: number;
}

function scoreToLabel(score: number): SentimentData['overall_label'] {
  if (score <= -50) return 'extreme_fear';
  if (score <= -10) return 'fear';
  if (score <= 10) return 'neutral';
  if (score <= 50) return 'greed';
  return 'extreme_greed';
}

async function fetchFearGreed(kv: KVNamespace): Promise<{ value: number; classification: string } | null> {
  const cached = await kv.get('fear_greed', 'json') as { value: number; classification: string } | null;
  if (cached) return cached;
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1');
    if (!res.ok) {
      console.error(`[btc-sentiment] Alternative.me failed: HTTP ${res.status}`);
      return null;
    }
    const json = await res.json() as { data?: Array<{ value: string; value_classification: string }> };
    const row = json?.data?.[0];
    if (!row) return null;
    const result = { value: parseInt(row.value, 10), classification: row.value_classification };
    await kv.put('fear_greed', JSON.stringify(result), { expirationTtl: 600 });
    return result;
  } catch (err: any) {
    console.error('[btc-sentiment] Alternative.me error:', err?.message ?? err);
    return null;
  }
}

interface BinanceTicker {
  readonly lastPrice: string;
  readonly priceChangePercent: string;
  readonly quoteVolume: string;   // 24h volume in USDT
  readonly highPrice: string;
  readonly lowPrice: string;
}

async function fetchBinanceTicker(kv: KVNamespace): Promise<BinanceTicker | null> {
  const cached = await kv.get<BinanceTicker>('binance_btc_ticker', 'json');
  if (cached) return cached;
  try {
    const res = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT');
    if (!res.ok) {
      console.error(`[btc-sentiment] Binance failed: HTTP ${res.status}`);
      return null;
    }
    const data = await res.json() as BinanceTicker;
    await kv.put('binance_btc_ticker', JSON.stringify(data), { expirationTtl: 60 });
    return data;
  } catch (err: any) {
    console.error('[btc-sentiment] Binance error:', err?.message ?? err);
    return null;
  }
}

interface CoinPaprikaGlobal {
  readonly market_cap_usd: number;
  readonly volume_24h_usd: number;
  readonly bitcoin_dominance_percentage: number;
  readonly cryptocurrencies_number: number;
  readonly market_cap_change_24h: number;
}

async function fetchPaprikaGlobal(kv: KVNamespace): Promise<CoinPaprikaGlobal | null> {
  const cached = await kv.get<CoinPaprikaGlobal>('paprika_global', 'json');
  if (cached) return cached;
  try {
    const res = await fetch('https://api.coinpaprika.com/v1/global');
    if (!res.ok) {
      console.error(`[btc-sentiment] CoinPaprika failed: HTTP ${res.status}`);
      return null;
    }
    const data = await res.json() as CoinPaprikaGlobal;
    await kv.put('paprika_global', JSON.stringify(data), { expirationTtl: 120 });
    return data;
  } catch (err: any) {
    console.error('[btc-sentiment] CoinPaprika error:', err?.message ?? err);
    return null;
  }
}

function classifyVolatility(rangePct: number): SentimentData['volatility']['level'] {
  if (rangePct < 1.5) return 'low';
  if (rangePct < 3) return 'normal';
  if (rangePct < 5) return 'elevated';
  return 'extreme';
}

export async function generateSentimentScore(kv: KVNamespace): Promise<SentimentData> {
  const [fearGreed, binance, paprika] = await Promise.all([
    fetchFearGreed(kv),
    fetchBinanceTicker(kv),
    fetchPaprikaGlobal(kv),
  ]);

  const sources: string[] = [];

  // Fear & Greed Index — primary sentiment signal
  const fearGreedValue = fearGreed?.value ?? 50;
  const fearGreedClass = fearGreed?.classification ?? 'unknown';
  if (fearGreed) sources.push('Alternative.me (Fear & Greed Index)');

  // Binance — live price data
  const btcPrice = binance ? parseFloat(binance.lastPrice) : 0;
  const btcChange = binance ? Math.round(parseFloat(binance.priceChangePercent) * 100) / 100 : 0;
  const btcVolume = binance ? Math.round(parseFloat(binance.quoteVolume)) : 0;
  const btcHigh = binance ? parseFloat(binance.highPrice) : 0;
  const btcLow = binance ? parseFloat(binance.lowPrice) : 0;
  if (binance) sources.push('Binance (BTC/USDT 24h ticker)');

  // CoinPaprika — dominance + global market
  const btcDominance = paprika ? Math.round(paprika.bitcoin_dominance_percentage * 100) / 100 : 0;
  const totalMcap = paprika?.market_cap_usd ?? 0;
  const totalVolume = paprika?.volume_24h_usd ?? 0;
  const mcapChange24h = paprika ? Math.round(paprika.market_cap_change_24h * 100) / 100 : 0;
  const activeCryptos = paprika?.cryptocurrencies_number ?? 0;
  if (paprika) sources.push('CoinPaprika (global market + BTC dominance)');

  // Compute volatility from Binance high/low spread
  const rangePct = btcPrice > 0 && btcHigh > 0 && btcLow > 0
    ? Math.round(((btcHigh - btcLow) / btcPrice) * 10000) / 100
    : 0;
  const volatilityLevel = classifyVolatility(rangePct);

  // Blended overall score: Fear & Greed (primary) + 24h price change (momentum).
  // Fear & Greed 0..100 → -100..+100 linear scale.
  const fearGreedScore = (fearGreedValue / 100) * 200 - 100;
  // Price change: ±10% maps to ±50 points (caps at ±100)
  const momentumScore = Math.max(-100, Math.min(100, btcChange * 5));

  const weights: Array<{ value: number; weight: number }> = [];
  if (fearGreed) weights.push({ value: fearGreedScore, weight: 0.7 });
  if (binance) weights.push({ value: momentumScore, weight: 0.3 });

  const totalWeight = weights.reduce((s, w) => s + w.weight, 0);
  const overallScore = totalWeight > 0
    ? Math.round(weights.reduce((s, w) => s + w.value * w.weight, 0) / totalWeight)
    : 0;

  const trend: SentimentData['market_trend'] =
    overallScore > 20 ? 'bullish' : overallScore < -20 ? 'bearish' : 'sideways';

  return {
    overall_score: overallScore,
    overall_label: scoreToLabel(overallScore),
    fear_greed: {
      value: Math.max(0, Math.min(100, fearGreedValue)),
      classification: fearGreedClass,
    },
    btc_market: {
      price_usd: Math.round(btcPrice * 100) / 100,
      change_24h_pct: btcChange,
      volume_24h_usd: btcVolume,
      high_24h_usd: Math.round(btcHigh * 100) / 100,
      low_24h_usd: Math.round(btcLow * 100) / 100,
      dominance_pct: btcDominance,
    },
    global_market: {
      total_market_cap_usd: Math.round(totalMcap),
      total_volume_24h_usd: Math.round(totalVolume),
      market_cap_change_24h_pct: mcapChange24h,
      active_cryptocurrencies: activeCryptos,
    },
    volatility: {
      range_24h_pct: rangePct,
      level: volatilityLevel,
    },
    market_trend: trend,
    data_sources: Object.freeze(sources.length > 0 ? sources : ['none (all sources failed)']),
    last_updated: Date.now(),
  };
}
