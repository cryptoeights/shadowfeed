export interface SentimentData {
  overall_score: number;
  overall_label: 'extreme_fear' | 'fear' | 'neutral' | 'greed' | 'extreme_greed';
  sources: {
    twitter: { score: number; volume: number; trending_topics: string[] };
    reddit: { score: number; volume: number; top_subreddits: string[] };
    news: { score: number; article_count: number; headlines: string[] };
  };
  fear_greed_index: number;
  btc_price_usd: number;
  btc_24h_change: number;
  btc_dominance: number;
  market_trend: 'bullish' | 'bearish' | 'sideways';
  data_source: string;
  last_updated: number;
}

const TWITTER_TOPICS = [
  '#Bitcoin', '#BTC', '$BTC', '#BTCAllTimeHigh', '#BitcoinETF',
  '#CryptoMarket', '#Halving', '#HODL', '#BitcoinMining', '#LightningNetwork',
  '#StacksBTC', '#sBTC', '#DeFi', '#Web3', '#CryptoAdoption',
];

const SUBREDDITS = [
  'r/Bitcoin', 'r/CryptoCurrency', 'r/BitcoinMarkets',
  'r/CryptoMoonShots', 'r/ethtrader', 'r/defi',
];

const HEADLINES_BULLISH = [
  'Bitcoin breaks through resistance as institutional buying accelerates',
  'MicroStrategy adds another $500M in BTC to treasury',
  'Spot Bitcoin ETF sees record inflows for third consecutive week',
  'Major bank announces Bitcoin custody service for wealth clients',
  'Bitcoin hash rate hits new all-time high signaling miner confidence',
];

const HEADLINES_BEARISH = [
  'Bitcoin drops below key support amid broader market selloff',
  'SEC delays decision on additional crypto ETF applications',
  'Whale sells 5000 BTC on Binance triggering liquidation cascade',
  'Regulatory uncertainty clouds crypto market outlook',
  'Bitcoin funding rates turn negative as shorts pile in',
];

const HEADLINES_NEUTRAL = [
  'Bitcoin consolidates near current levels as traders await catalyst',
  'Crypto market volume remains steady despite low volatility',
  'Analysts divided on Bitcoin next move as range tightens',
  'DeFi TVL stabilizes as market enters consolidation phase',
];

function randomInRange(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 10) / 10;
}

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function scoreToLabel(score: number): SentimentData['overall_label'] {
  if (score <= -50) return 'extreme_fear';
  if (score <= -10) return 'fear';
  if (score <= 10) return 'neutral';
  if (score <= 50) return 'greed';
  return 'extreme_greed';
}

async function getCachedFearGreed(kv: KVNamespace): Promise<{ value: number; classification: string } | null> {
  const cached = await kv.get('fear_greed', 'json') as { value: number; classification: string } | null;
  if (cached) return cached;

  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1');
    if (res.ok) {
      const json = await res.json() as { data?: Array<{ value: string; value_classification: string }> };
      const data = json?.data?.[0];
      if (data) {
        const result = { value: parseInt(data.value, 10), classification: data.value_classification };
        await kv.put('fear_greed', JSON.stringify(result), { expirationTtl: 600 });
        return result;
      }
    }
  } catch {}
  return null;
}

async function getCachedBtcMarket(kv: KVNamespace): Promise<{ price: number; change24h: number; dominance: number } | null> {
  const cached = await kv.get('btc_market', 'json') as { price: number; change24h: number; dominance: number } | null;
  if (cached) return cached;

  try {
    const res = await fetch('https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false');
    if (res.ok) {
      const d = await res.json() as { market_data?: { current_price?: { usd?: number }; price_change_percentage_24h?: number; market_cap_percentage?: { btc?: number } } };
      if (d?.market_data) {
        const result = {
          price: d.market_data.current_price?.usd ?? 0,
          change24h: d.market_data.price_change_percentage_24h ?? 0,
          dominance: d.market_data.market_cap_percentage?.btc ?? 0,
        };
        await kv.put('btc_market', JSON.stringify(result), { expirationTtl: 60 });
        return result;
      }
    }
  } catch {}
  return null;
}

export async function generateSentimentScore(kv: KVNamespace): Promise<SentimentData> {
  const [fearGreed, btcMarket] = await Promise.all([
    getCachedFearGreed(kv),
    getCachedBtcMarket(kv),
  ]);

  const sources: string[] = [];

  let fearGreedIndex: number;
  if (fearGreed) {
    fearGreedIndex = fearGreed.value;
    sources.push('Alternative.me (Fear & Greed Index)');
  } else {
    fearGreedIndex = Math.round(randomInRange(15, 85));
  }

  const overallScore = Math.round((fearGreedIndex / 100) * 200 - 100);

  let btcPrice = 0;
  let btcChange = 0;
  let btcDominance = 0;
  if (btcMarket) {
    btcPrice = btcMarket.price;
    btcChange = Math.round(btcMarket.change24h * 100) / 100;
    btcDominance = Math.round(btcMarket.dominance * 10) / 10 || randomInRange(52, 62);
    sources.push('CoinGecko (BTC price, dominance)');
  } else {
    btcPrice = 95000 + Math.random() * 10000;
    btcChange = randomInRange(-5, 5);
    btcDominance = randomInRange(52, 62);
  }

  const trend: SentimentData['market_trend'] =
    overallScore > 20 ? 'bullish' : overallScore < -20 ? 'bearish' : 'sideways';

  const headlinePool =
    trend === 'bullish' ? HEADLINES_BULLISH :
    trend === 'bearish' ? HEADLINES_BEARISH :
    HEADLINES_NEUTRAL;

  if (sources.length === 0) sources.push('simulated');

  return {
    overall_score: overallScore,
    overall_label: scoreToLabel(overallScore),
    sources: {
      twitter: {
        score: Math.round(randomInRange(overallScore - 15, overallScore + 15)),
        volume: Math.round(randomInRange(50000, 200000)),
        trending_topics: pickRandom(TWITTER_TOPICS, 4),
      },
      reddit: {
        score: Math.round(randomInRange(overallScore - 20, overallScore + 10)),
        volume: Math.round(randomInRange(5000, 30000)),
        top_subreddits: pickRandom(SUBREDDITS, 3),
      },
      news: {
        score: Math.round(randomInRange(overallScore - 10, overallScore + 20)),
        article_count: Math.round(randomInRange(20, 120)),
        headlines: pickRandom(headlinePool, 3),
      },
    },
    fear_greed_index: Math.max(0, Math.min(100, fearGreedIndex)),
    btc_price_usd: Math.round(btcPrice),
    btc_24h_change: btcChange,
    btc_dominance: btcDominance,
    market_trend: trend,
    data_source: sources.join(' + ') + ' | social signals simulated',
    last_updated: Date.now(),
  };
}
