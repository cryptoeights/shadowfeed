import axios from 'axios';

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

// Cache real Fear & Greed Index (updates once a day, cache 10 min)
let cachedFearGreed: { value: number; classification: string; fetchedAt: number } | null = null;

async function getRealFearGreedIndex(): Promise<{ value: number; classification: string } | null> {
  if (cachedFearGreed && Date.now() - cachedFearGreed.fetchedAt < 600000) {
    return { value: cachedFearGreed.value, classification: cachedFearGreed.classification };
  }
  try {
    const res = await axios.get('https://api.alternative.me/fng/?limit=1', { timeout: 5000 });
    const data = res.data?.data?.[0];
    if (data) {
      const result = { value: parseInt(data.value, 10), classification: data.value_classification };
      cachedFearGreed = { ...result, fetchedAt: Date.now() };
      return result;
    }
  } catch {}
  return null;
}

// Cache real BTC market data
let cachedBtcMarket: { price: number; change24h: number; dominance: number; fetchedAt: number } | null = null;

async function getRealBtcMarketData(): Promise<{ price: number; change24h: number; dominance: number } | null> {
  if (cachedBtcMarket && Date.now() - cachedBtcMarket.fetchedAt < 60000) {
    return { price: cachedBtcMarket.price, change24h: cachedBtcMarket.change24h, dominance: cachedBtcMarket.dominance };
  }
  try {
    const res = await axios.get('https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false', { timeout: 5000 });
    const d = res.data;
    if (d?.market_data) {
      const result = {
        price: d.market_data.current_price?.usd || 0,
        change24h: d.market_data.price_change_percentage_24h || 0,
        dominance: d.market_data.market_cap_percentage?.btc || 0,
      };
      cachedBtcMarket = { ...result, fetchedAt: Date.now() };
      return result;
    }
  } catch {}
  return null;
}

export async function generateSentimentScore(): Promise<SentimentData> {
  const [fearGreed, btcMarket] = await Promise.all([getRealFearGreedIndex(), getRealBtcMarketData()]);

  const sources: string[] = [];

  // Use real Fear & Greed Index if available
  let fearGreedIndex: number;
  if (fearGreed) {
    fearGreedIndex = fearGreed.value;
    sources.push('Alternative.me (Fear & Greed Index)');
  } else {
    fearGreedIndex = Math.round(randomInRange(15, 85));
  }

  // Derive overall score from fear/greed (-100 to +100)
  const overallScore = Math.round((fearGreedIndex / 100) * 200 - 100);

  // BTC market data
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
