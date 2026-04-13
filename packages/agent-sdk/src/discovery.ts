import type { AxiosInstance } from 'axios';
import type { RegistryResponse, FeedInfo, DiscoverOptions } from './types';

const REGISTRY_PATH = '/registry/feeds';

/**
 * Fetch the full feed registry from ShadowFeed API.
 */
export async function fetchRegistry(
  client: AxiosInstance,
  baseUrl: string,
): Promise<RegistryResponse> {
  const res = await client.get<RegistryResponse>(`${baseUrl}${REGISTRY_PATH}`);
  return res.data;
}

/**
 * Filter feeds by category, price range, etc.
 */
export function filterFeeds(
  feeds: readonly FeedInfo[],
  options: DiscoverOptions,
): readonly FeedInfo[] {
  return feeds.filter((f) => {
    if (options.category && f.category !== options.category) return false;
    if (options.maxPrice !== undefined && f.price_stx > options.maxPrice) return false;
    if (options.minPrice !== undefined && f.price_stx < options.minPrice) return false;
    return true;
  });
}

/**
 * Find a specific feed by ID from the registry.
 */
export function findFeed(
  feeds: readonly FeedInfo[],
  feedId: string,
): FeedInfo | undefined {
  return feeds.find((f) => f.id === feedId);
}
