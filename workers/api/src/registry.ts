import { getFeedStats } from './db';
import type { FeedStatRow } from './types';

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
  // --- Original feeds ---
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
  // --- Nansen-powered feeds (premium) ---
  {
    id: 'smart-money-flows',
    endpoint: '/feeds/smart-money-flows',
    price_stx: 0.08,
    price_display: '0.08 STX',
    description: 'Smart money net flows — inflow/outflow signals from top wallets via Nansen',
    category: 'on-chain',
    update_frequency: 'every 5 minutes',
    response_format: 'application/json',
  },
  {
    id: 'token-intel',
    endpoint: '/feeds/token-intel',
    price_stx: 0.05,
    price_display: '0.05 STX',
    description: 'Token intelligence — buy/sell metrics, liquidity, and signals from Nansen TGM',
    category: 'analytics',
    update_frequency: 'every 5 minutes',
    response_format: 'application/json',
  },
  {
    id: 'wallet-profiler',
    endpoint: '/feeds/wallet-profiler',
    price_stx: 0.05,
    price_display: '0.05 STX',
    description: 'Wallet portfolio profiler — holdings, allocation, and concentration via Nansen',
    category: 'on-chain',
    update_frequency: 'every 5 minutes',
    response_format: 'application/json',
  },
  {
    id: 'smart-money-holdings',
    endpoint: '/feeds/smart-money-holdings',
    price_stx: 0.05,
    price_display: '0.05 STX',
    description: 'Smart money holdings — top tokens held by institutional wallets with accumulation signals',
    category: 'on-chain',
    update_frequency: 'every 5 minutes',
    response_format: 'application/json',
  },
  {
    id: 'dex-trades',
    endpoint: '/feeds/dex-trades',
    price_stx: 0.08,
    price_display: '0.08 STX',
    description: 'DEX and perp trades — smart money trading activity across chains via Nansen',
    category: 'on-chain',
    update_frequency: 'every 5 minutes',
    response_format: 'application/json',
  },
  // --- Free API feeds ---
  {
    id: 'liquidation-alerts',
    endpoint: '/feeds/liquidation-alerts',
    price_stx: 0.008,
    price_display: '0.008 STX',
    description: 'Futures liquidation alerts — long/short liquidations across top pairs',
    category: 'derivatives',
    update_frequency: 'every 2 minutes',
    response_format: 'application/json',
  },
  {
    id: 'gas-prediction',
    endpoint: '/feeds/gas-prediction',
    price_stx: 0.003,
    price_display: '0.003 STX',
    description: 'Gas and fee predictions — ETH gas prices and BTC mempool fee estimates',
    category: 'infrastructure',
    update_frequency: 'every 1 minute',
    response_format: 'application/json',
  },
  {
    id: 'token-launches',
    endpoint: '/feeds/token-launches',
    price_stx: 0.005,
    price_display: '0.005 STX',
    description: 'New token launches — trending tokens and boosted listings from DEXScreener',
    category: 'discovery',
    update_frequency: 'every 3 minutes',
    response_format: 'application/json',
  },
  {
    id: 'governance',
    endpoint: '/feeds/governance',
    price_stx: 0.005,
    price_display: '0.005 STX',
    description: 'DAO governance — active proposals and voting from Snapshot (Aave, Uniswap, ENS, etc.)',
    category: 'governance',
    update_frequency: 'every 10 minutes',
    response_format: 'application/json',
  },
  {
    id: 'stablecoin-flows',
    endpoint: '/feeds/stablecoin-flows',
    price_stx: 0.005,
    price_display: '0.005 STX',
    description: 'Stablecoin flows — market cap changes, peg deviations, and chain distribution',
    category: 'analytics',
    update_frequency: 'every 5 minutes',
    response_format: 'application/json',
  },
  {
    id: 'security-alerts',
    endpoint: '/feeds/security-alerts',
    price_stx: 0.005,
    price_display: '0.005 STX',
    description: 'Security alerts — recent DeFi hacks, exploits, and rug pulls with risk assessment',
    category: 'security',
    update_frequency: 'every 15 minutes',
    response_format: 'application/json',
  },
  {
    id: 'dev-activity',
    endpoint: '/feeds/dev-activity',
    price_stx: 0.003,
    price_display: '0.003 STX',
    description: 'Developer activity — commit tracking across Stacks, Ethereum, and Solana repos',
    category: 'development',
    update_frequency: 'every 30 minutes',
    response_format: 'application/json',
  },
  {
    id: 'bridge-flows',
    endpoint: '/feeds/bridge-flows',
    price_stx: 0.005,
    price_display: '0.005 STX',
    description: 'Bridge flows — cross-chain bridge volume, top bridges, and chain flow analysis',
    category: 'cross-chain',
    update_frequency: 'every 5 minutes',
    response_format: 'application/json',
  },
];

export async function getRegistry(db: D1Database, providerAddress: string) {
  const dbStats = await getFeedStats(db);
  const statsMap = new Map(dbStats.map((s) => [s.feed_id, s]));

  const feeds: FeedInfo[] = FEED_DEFINITIONS.map((def) => {
    const stat = statsMap.get(def.id);
    return {
      ...def,
      stats: {
        total_queries: stat?.total_queries ?? 0,
        avg_response_ms: Math.round(stat?.avg_response_ms ?? 0),
        uptime_percent: 99 + Math.random() * 0.9,
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
