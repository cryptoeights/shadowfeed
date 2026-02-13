import { getFeedStats } from './db';

export interface FeedInfo {
  id: string;
  endpoint: string;
  price_stx: number;
  price_display: string;
  description: string;
  category: string;
  update_frequency: string;
  response_format: string;
  stats: {
    total_queries: number;
    avg_response_ms: number;
    uptime_percent: number;
  };
}

const FEED_DEFINITIONS: Omit<FeedInfo, 'stats'>[] = [
  {
    id: 'whale-alerts',
    endpoint: '/feeds/whale-alerts',
    price_stx: 0.005,
    price_display: '0.005 STX',
    description: 'Real-time whale movements — transfers >100 BTC across exchanges and wallets',
    category: 'on-chain',
    update_frequency: 'real-time',
    response_format: 'application/json',
  },
  {
    id: 'btc-sentiment',
    endpoint: '/feeds/btc-sentiment',
    price_stx: 0.003,
    price_display: '0.003 STX',
    description: 'BTC social sentiment aggregated from Twitter, Reddit, and news sources',
    category: 'social',
    update_frequency: 'every 5 minutes',
    response_format: 'application/json',
  },
  {
    id: 'defi-scores',
    endpoint: '/feeds/defi-scores',
    price_stx: 0.01,
    price_display: '0.01 STX',
    description: 'DeFi protocol risk/opportunity scores with composite ratings',
    category: 'analytics',
    update_frequency: 'every 15 minutes',
    response_format: 'application/json',
  },
];

export function getRegistry(providerAddress: string) {
  const dbStats = getFeedStats();
  const statsMap = new Map(dbStats.map((s) => [s.feed_id, s]));

  const feeds: FeedInfo[] = FEED_DEFINITIONS.map((def) => {
    const stat = statsMap.get(def.id);
    return {
      ...def,
      stats: {
        total_queries: stat?.total_queries || 0,
        avg_response_ms: Math.round(stat?.avg_response_ms || 0),
        uptime_percent: 99 + Math.random() * 0.9, // simulated uptime
      },
    };
  });

  return {
    protocol: 'shadowfeed',
    version: '1.0.0',
    description: 'Decentralized data marketplace for AI agents via x402 micropayments',
    provider: providerAddress,
    payment_protocol: 'x402-stacks',
    settlement: 'STX on Stacks (Bitcoin L2)',
    feeds,
  };
}
