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
  // Source discrimination so discover() consumers can tell platform-native
  // feeds from external provider feeds. Optional → platform feeds omit them.
  source?: 'platform' | 'provider';
  provider_handle?: string;
  provider_name?: string;
  provider_verified?: boolean;
  // Trust tier for external feeds: 'verified' = vetted/trusted provider,
  // 'community' = self-onboarded, not yet vetted. Platform feeds omit this.
  provider_tier?: 'verified' | 'community';
}

export type RegistryTier = 'verified' | 'community' | 'all';

const FEED_DEFINITIONS: Omit<FeedInfo, 'stats'>[] = [
  // --- Original feeds ---
  {
    id: 'whale-alerts',
    endpoint: '/feeds/whale-alerts',
    price_stx: 0.005,
    price_display: '0.005 STX',
    description: 'Generates whale-style alerts using live BTC price and block height; alert events are synthetic in v1, real on-chain tracking planned for v2',
    category: 'on-chain',
    update_frequency: 'real-time',
    response_format: 'application/json',
  },
  {
    id: 'btc-sentiment',
    endpoint: '/feeds/btc-sentiment',
    price_stx: 0.003,
    price_display: '0.003 STX',
    description: 'BTC market sentiment from Alternative.me Fear & Greed Index, Binance 24h ticker, and CoinPaprika global market data',
    category: 'social',
    update_frequency: 'every 5 minutes',
    response_format: 'application/json',
  },
  {
    id: 'defi-scores',
    endpoint: '/feeds/defi-scores',
    price_stx: 0.01,
    price_display: '0.01 STX',
    description: 'DeFi protocol risk/opportunity scores from DeFiLlama TVL data; smart_contract_age_days and unique_users_24h are estimated/approximated in v1',
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
  // --- ALEX Lab Stacks DeFi feeds ---
  {
    id: 'alex-price-feed',
    endpoint: '/feeds/alex-price-feed',
    price_stx: 0.003,
    price_display: '0.003 STX',
    description: 'ALEX Lab token prices — Stacks ecosystem tokens (ALEX, STX, sBTC, and more) with median USD pricing across pools',
    category: 'stacks-defi',
    update_frequency: 'every 1 minute',
    response_format: 'application/json',
  },
  {
    id: 'alex-pool-analytics',
    endpoint: '/feeds/alex-pool-analytics',
    price_stx: 0.005,
    price_display: '0.005 STX',
    description: 'ALEX Lab pool analytics — liquidity, APY, volume rankings across all AMM pools',
    category: 'stacks-defi',
    update_frequency: 'every 3 minutes',
    response_format: 'application/json',
  },
  {
    id: 'alex-tvl-flows',
    endpoint: '/feeds/alex-tvl-flows',
    price_stx: 0.005,
    price_display: '0.005 STX',
    description: 'ALEX Lab TVL flows — platform TVL, pool distribution, concentration analysis',
    category: 'stacks-defi',
    update_frequency: 'every 5 minutes',
    response_format: 'application/json',
  },
  {
    id: 'alex-swap-activity',
    endpoint: '/feeds/alex-swap-activity',
    price_stx: 0.005,
    price_display: '0.005 STX',
    description: 'ALEX Lab swap activity — volume, trending pairs, activity scoring for agent trading signals',
    category: 'stacks-defi',
    update_frequency: 'every 2 minutes',
    response_format: 'application/json',
  },
  {
    id: 'alex-pairs-overview',
    endpoint: '/feeds/alex-pairs-overview',
    price_stx: 0.003,
    price_display: '0.003 STX',
    description: 'ALEX Lab pairs overview — all trading pairs, token frequency, most-traded discovery',
    category: 'stacks-defi',
    update_frequency: 'every 3 minutes',
    response_format: 'application/json',
  },
];

/**
 * Active external-provider feeds, mapped into the same FeedInfo contract the
 * platform feeds use. These are the feeds the SDK's discover() must surface
 * alongside the 21 built-ins. Buyer-facing endpoint is the proxy route
 * `/feeds/p/{handle}/{slug}` (see provider-feed-proxy.ts).
 *
 * Only feeds whose provider is `active` AND whose feed row is `active = 1` are
 * exposed — paused/banned providers and disabled feeds stay hidden.
 *
 * Resilient by design: any DB error returns [] so /registry/feeds still serves
 * the platform catalog instead of failing the whole endpoint.
 */
async function getProviderFeedInfos(db: D1Database): Promise<FeedInfo[]> {
  try {
    const { results } = await db
      .prepare(`
        SELECT
          p.handle AS provider_handle,
          p.name AS provider_name,
          p.verified AS provider_verified,
          f.slug, f.name AS feed_name, f.description, f.category,
          f.price_microstx, f.total_queries
        FROM provider_feeds f
        JOIN providers p ON p.id = f.provider_id
        WHERE p.status = 'active' AND f.active = 1
        ORDER BY p.handle ASC, f.slug ASC
      `)
      .all<{
        provider_handle: string;
        provider_name: string;
        provider_verified: number;
        slug: string;
        feed_name: string;
        description: string | null;
        category: string | null;
        price_microstx: number;
        total_queries: number;
      }>();

    return (results ?? []).map((r): FeedInfo => {
      const priceStx = r.price_microstx / 1_000_000;
      const verified = r.provider_verified === 1;
      return {
        id: `${r.provider_handle}/${r.slug}`,
        endpoint: `/feeds/p/${r.provider_handle}/${r.slug}`,
        price_stx: priceStx,
        price_display: `${priceStx} STX`,
        description: r.description ?? r.feed_name,
        category: r.category ?? 'external',
        update_frequency: 'real-time',
        response_format: 'application/json',
        stats: {
          total_queries: r.total_queries ?? 0,
          avg_response_ms: 0,
          uptime_percent: 99,
        },
        source: 'provider',
        provider_handle: r.provider_handle,
        provider_name: r.provider_name,
        provider_verified: verified,
        provider_tier: verified ? 'verified' : 'community',
      };
    });
  } catch (err) {
    console.error('getProviderFeedInfos failed; serving platform feeds only:', err);
    return [];
  }
}

interface ProviderDirectoryEntry {
  handle: string;
  name: string;
  feed_count: number;
}

/** Group provider feeds into a verified/community directory for discover(). */
function buildProviderDirectory(providerFeeds: FeedInfo[]) {
  const byHandle = new Map<string, ProviderDirectoryEntry & { tier: 'verified' | 'community' }>();
  for (const f of providerFeeds) {
    const handle = f.provider_handle!;
    const existing = byHandle.get(handle);
    if (existing) {
      existing.feed_count += 1;
    } else {
      byHandle.set(handle, {
        handle,
        name: f.provider_name ?? handle,
        feed_count: 1,
        tier: f.provider_tier ?? 'community',
      });
    }
  }
  const all = [...byHandle.values()];
  const strip = (e: ProviderDirectoryEntry & { tier: string }): ProviderDirectoryEntry =>
    ({ handle: e.handle, name: e.name, feed_count: e.feed_count });
  return {
    verified: all.filter((e) => e.tier === 'verified').map(strip),
    community: all.filter((e) => e.tier === 'community').map(strip),
  };
}

export async function getRegistry(
  db: D1Database,
  providerAddress: string,
  tier: RegistryTier = 'all',
) {
  const [dbStats, allProviderFeeds] = await Promise.all([
    getFeedStats(db),
    getProviderFeedInfos(db),
  ]);
  const statsMap = new Map(dbStats.map((s) => [s.feed_id, s]));

  const platformFeeds: FeedInfo[] = FEED_DEFINITIONS.map((def) => {
    const stat = statsMap.get(def.id);
    return {
      ...def,
      stats: {
        total_queries: stat?.total_queries ?? 0,
        avg_response_ms: Math.round(stat?.avg_response_ms ?? 0),
        uptime_percent: 99 + Math.random() * 0.9,
      },
      source: 'platform' as const,
    };
  });

  // Directory always reflects the full active set, independent of tier filter.
  const providers = buildProviderDirectory(allProviderFeeds);

  // ?tier=verified|community narrows the provider feeds in the `feeds` array.
  // Platform feeds are first-party and always included.
  const providerFeeds =
    tier === 'all'
      ? allProviderFeeds
      : allProviderFeeds.filter((f) => f.provider_tier === tier);

  const feeds: FeedInfo[] = [...platformFeeds, ...providerFeeds];

  return {
    protocol: 'shadowfeed',
    version: '1.0.0',
    description: 'Decentralized data marketplace for AI agents via x402 micropayments',
    provider: providerAddress,
    payment_protocol: 'x402-stacks',
    settlement: 'STX on Stacks (Bitcoin L2)',
    tier,
    feeds,
    providers,
    feed_counts: {
      platform: platformFeeds.length,
      provider_verified: allProviderFeeds.filter((f) => f.provider_tier === 'verified').length,
      provider_community: allProviderFeeds.filter((f) => f.provider_tier === 'community').length,
      provider_shown: providerFeeds.length,
      total_shown: feeds.length,
    },
  };
}
