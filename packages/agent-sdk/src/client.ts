import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { wrapAxiosWithPayment, privateKeyToAccount } from 'x402-stacks';
import { fetchRegistry, filterFeeds, findFeed } from './discovery';
import type {
  ShadowFeedConfig,
  FeedInfo,
  FeedId,
  PurchaseResult,
  ChainResult,
  DiscoverOptions,
  RegistryResponse,
} from './types';

const DEFAULT_BASE_URL = 'https://api.shadowfeed.app';
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * ShadowFeed client for AI agents.
 *
 * Provides a simple interface to discover, purchase, and chain
 * data feeds from the ShadowFeed marketplace.
 *
 * @example
 * ```typescript
 * const sf = new ShadowFeed({
 *   privateKey: process.env.AGENT_PRIVATE_KEY!,
 *   network: 'mainnet',
 *   agentName: 'My Research Agent',
 * });
 *
 * const feeds = await sf.discover();
 * const data = await sf.buy('whale-alerts');
 * ```
 */
export class ShadowFeed {
  private readonly config: Readonly<Required<ShadowFeedConfig>>;
  private readonly paymentClient: AxiosInstance;
  private readonly freeClient: AxiosInstance;
  private registryCache: RegistryResponse | null = null;

  constructor(config: ShadowFeedConfig) {
    this.config = {
      privateKey: config.privateKey,
      network: config.network,
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      agentName: config.agentName ?? 'ShadowFeed Agent',
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };

    const account = privateKeyToAccount(
      this.config.privateKey,
      this.config.network,
    );

    const headers: Record<string, string> = {
      'x-agent-name': this.config.agentName,
    };

    this.freeClient = axios.create({
      timeout: this.config.timeoutMs,
      headers,
    });

    this.paymentClient = wrapAxiosWithPayment(
      axios.create({
        timeout: this.config.timeoutMs,
        headers,
      }),
      account,
    );
  }

  /** The wallet address derived from the private key */
  get address(): string {
    const account = privateKeyToAccount(
      this.config.privateKey,
      this.config.network,
    );
    return account.address;
  }

  /** The configured base URL */
  get baseUrl(): string {
    return this.config.baseUrl;
  }

  /** The configured network */
  get network(): string {
    return this.config.network;
  }

  /**
   * Discover available data feeds.
   * Results are cached; call with `refresh: true` to force reload.
   *
   * @param options - Optional filters (category, price range)
   * @param refresh - Force refresh the registry cache
   * @returns Array of available feed info
   */
  async discover(
    options?: DiscoverOptions,
    refresh = false,
  ): Promise<readonly FeedInfo[]> {
    if (!this.registryCache || refresh) {
      this.registryCache = await fetchRegistry(
        this.freeClient,
        this.config.baseUrl,
      );
    }

    const feeds = this.registryCache.feeds;
    return options ? filterFeeds(feeds, options) : feeds;
  }

  /**
   * Get info for a specific feed.
   *
   * @param feedId - The feed identifier
   * @returns Feed info or undefined if not found
   */
  async getFeed(feedId: FeedId | string): Promise<FeedInfo | undefined> {
    const feeds = await this.discover();
    return findFeed(feeds, feedId);
  }

  /**
   * Purchase a single data feed.
   * Payment is handled automatically via x402.
   *
   * @param feedId - The feed to purchase (e.g. 'whale-alerts')
   * @param queryParams - Optional query parameters (e.g. { address: '0x...' })
   * @returns The feed data along with purchase metadata
   */
  async buy<T = Record<string, unknown>>(
    feedId: FeedId | string,
    queryParams?: Record<string, string>,
  ): Promise<PurchaseResult<T>> {
    const url = this.buildFeedUrl(feedId, queryParams);
    const res = await this.paymentClient.get(url);
    const data = res.data;

    return {
      feed: feedId,
      data: data.data ?? data,
      price_stx: data.price ?? data.price_stx ?? 0,
      tx: data.tx ?? data.txId,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Purchase multiple feeds in sequence.
   * Useful for research agents that need cross-feed analysis.
   *
   * @param feedIds - Array of feed IDs to purchase
   * @param delayMs - Delay between purchases in ms (default: 1000)
   * @returns Combined results from all purchases
   */
  async chain(
    feedIds: readonly (FeedId | string)[],
    delayMs = 1000,
  ): Promise<ChainResult> {
    const results: PurchaseResult[] = [];
    let totalSpent = 0;

    for (let i = 0; i < feedIds.length; i++) {
      if (i > 0 && delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }

      const result = await this.buy(feedIds[i]);
      results.push(result);
      totalSpent += result.price_stx;
    }

    return {
      feeds: results,
      total_spent_stx: totalSpent,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Check the health of the ShadowFeed API.
   *
   * @returns Health check response
   */
  async health(): Promise<Record<string, unknown>> {
    const res = await this.freeClient.get(`${this.config.baseUrl}/health`);
    return res.data;
  }

  /**
   * Get provider stats (total queries, reputation, etc.)
   *
   * @returns Provider statistics
   */
  async stats(): Promise<Record<string, unknown>> {
    const res = await this.freeClient.get(`${this.config.baseUrl}/stats`);
    return res.data;
  }

  private buildFeedUrl(
    feedId: string,
    queryParams?: Record<string, string>,
  ): string {
    const base = `${this.config.baseUrl}/feeds/${feedId}`;
    if (!queryParams || Object.keys(queryParams).length === 0) return base;

    const params = new URLSearchParams(queryParams).toString();
    return `${base}?${params}`;
  }
}
