/** Network type for Stacks blockchain */
export type Network = 'mainnet' | 'testnet';

/** Configuration for ShadowFeed client */
export interface ShadowFeedConfig {
  /** Stacks private key (hex string) */
  readonly privateKey: string;
  /** Network to use */
  readonly network: Network;
  /** API base URL (defaults to https://api.shadowfeed.app) */
  readonly baseUrl?: string;
  /** Agent name shown in ShadowFeed dashboard */
  readonly agentName?: string;
  /** Request timeout in ms (defaults to 30000) */
  readonly timeoutMs?: number;
}

/** Feed category */
export type FeedCategory =
  | 'on-chain'
  | 'social'
  | 'analytics'
  | 'derivatives'
  | 'infrastructure'
  | 'discovery'
  | 'governance'
  | 'security'
  | 'development'
  | 'cross-chain';

/** Feed information from the registry */
export interface FeedInfo {
  readonly id: string;
  readonly endpoint: string;
  readonly price_stx: number;
  readonly price_display: string;
  readonly description: string;
  readonly category: FeedCategory;
  readonly update_frequency: string;
  readonly response_format: string;
  readonly stats: {
    readonly total_queries: number;
    readonly avg_response_ms: number;
    readonly uptime_percent: number;
  };
}

/** Registry response from /registry/feeds */
export interface RegistryResponse {
  readonly protocol: string;
  readonly version: string;
  readonly description: string;
  readonly provider: string;
  readonly payment_protocol: string;
  readonly settlement: string;
  readonly feeds: readonly FeedInfo[];
}

/** Result of purchasing a feed */
export interface PurchaseResult<T = Record<string, unknown>> {
  readonly feed: string;
  readonly data: T;
  readonly price_stx: number;
  readonly tx?: string;
  readonly timestamp: string;
}

/** Result of chaining multiple feed purchases */
export interface ChainResult {
  readonly feeds: readonly PurchaseResult[];
  readonly total_spent_stx: number;
  readonly timestamp: string;
}

/** Feed filter options for discovery */
export interface DiscoverOptions {
  readonly category?: FeedCategory;
  readonly maxPrice?: number;
  readonly minPrice?: number;
}

/** Known feed IDs */
export type FeedId =
  | 'whale-alerts'
  | 'btc-sentiment'
  | 'defi-scores'
  | 'smart-money-flows'
  | 'token-intel'
  | 'wallet-profiler'
  | 'smart-money-holdings'
  | 'dex-trades'
  | 'liquidation-alerts'
  | 'gas-prediction'
  | 'token-launches'
  | 'governance'
  | 'stablecoin-flows'
  | 'security-alerts'
  | 'dev-activity'
  | 'bridge-flows';
