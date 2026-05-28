// Provider feed auto-discovery.
//
// When a partner enters their API base URL during onboarding, we probe it
// with a fallback chain of discovery methods so the wizard can pre-populate
// the feed catalog instead of asking them to type each one by hand.
//
// Fallback order:
//   1. /.well-known/shadowfeed-feeds.json   (explicit, our spec — most reliable)
//   2. x402 v2 probing                       (for x402-native APIs like Hyre)
//   3. OpenAPI / swagger                     (TODO — common standard, very varied)
//
// We never modify the partner's endpoint — just probe HEAD/GET on a few paths.

const TIMEOUT_MS = 6000;
const MAX_PROBES = 25;       // soft cap to bound discovery cost

const COMMON_X402_PROBE_PATHS = [
  '/feeds',
  '/v1/feeds',
  '/api/feeds',
];

const COMMON_DISCOVERY_PATHS = [
  '/.well-known/shadowfeed-feeds.json',
  '/.well-known/x402-feeds.json',
  '/shadowfeed-feeds.json',
];

// Static knowledge of well-known x402-native API endpoint catalogs. Keys are
// apex domains; we match by suffix so any subdomain (api., partner., v1., etc.)
// resolves to the same catalog.
//
// Hyre is our flagship M2 partner; we ship a curated list so partners can
// import in one click without standing up a `.well-known` file first.
// Add more entries here as we onboard more APIs.
// Each catalog entry must reference a STATIC GET path (no `{param}` segments)
// on the partner's endpoint, because the proxy can't synthesize path params
// for arbitrary buyers. Path-param routes (e.g. /traders/wallet/{address}/pnl)
// are intentionally excluded — they belong in a future query-style feed model.
//
// Paths verified against Hyre's live OpenAPI spec at mpp.hyreagent.fun/openapi.json
// on 2026-05-28. The previous `/v1/...` paths were a hand-rolled guess from an
// early integration draft and never matched the deployed API — they would have
// produced 404s on every proxy call (the same failure shape that bricked Xona).
const KNOWN_CATALOGS: Record<string, DiscoveredFeed[]> = {
  'hyreagent.fun': [
    { slug: 'pumpfun-launches',       name: 'PumpFun Launches',           description: 'Latest PumpFun token creations with AI snipe signal.',                              category: 'discovery', source_path: '/trenches/new-tokens',          suggested_price_stx: 0.04  },
    { slug: 'pumpfun-graduating',     name: 'PumpFun Graduating',         description: 'PumpFun tokens close to graduating, with urgency scores.',                          category: 'discovery', source_path: '/trenches/graduating',          suggested_price_stx: 0.015 },
    { slug: 'bags-launches',          name: 'Bags.fm Launches',           description: 'Bags.fm token launches with creator info and fee-share data.',                      category: 'discovery', source_path: '/trenches/bags/new-tokens',     suggested_price_stx: 0.04  },
    { slug: 'top-wallets',            name: 'Top Solana Traders',         description: 'Wallet PnL leaderboard ranked by period.',                                          category: 'traders',   source_path: '/traders/top-wallets',          suggested_price_stx: 0.04  },
    { slug: 'meteora-pools',          name: 'Meteora DLMM Pools',         description: 'Live Meteora DLMM pool list with TVL, volume, fees, APR.',                          category: 'lp',        source_path: '/lp/meteora/pools',             suggested_price_stx: 0.005 },
    { slug: 'meteora-pool-recommend', name: 'Meteora Pool Recommendation',description: 'AI-recommended pool pick with add-liquidity / hold signal.',                        category: 'lp',        source_path: '/lp/meteora/pools/recommend',   suggested_price_stx: 0.04  },
    { slug: 'meteora-pool-strategy',  name: 'Meteora Pool Strategy',      description: 'Best pool + range + expected APR for given capital input.',                         category: 'lp',        source_path: '/lp/meteora/pools/strategy',    suggested_price_stx: 0.05  },
    { slug: 'defi-tvl',               name: 'DeFi TVL Rankings',          description: 'Chain TVL rankings with trend narrative across major chains.',                      category: 'defi',      source_path: '/defi/tvl',                     suggested_price_stx: 0.005 },
    { slug: 'defi-yields',            name: 'DeFi Top Yields',            description: 'Top yield farming opportunities sorted by APY and risk score.',                     category: 'defi',      source_path: '/defi/yields',                  suggested_price_stx: 0.01  },
    { slug: 'yield-migrate',          name: 'Cross-chain Yield Migrate',  description: 'Cross-chain yield migration paths with deBridge routing.',                          category: 'defi',      source_path: '/debridge/yield-migrate',       suggested_price_stx: 0.01  },
  ],
};

export interface DiscoveredFeed {
  readonly slug: string;
  readonly name: string;
  readonly description?: string;
  readonly category?: string;
  readonly source_path: string;
  readonly source_method?: 'GET' | 'POST';
  readonly suggested_price_stx: number;
}

export type DiscoverySource = 'well_known' | 'x402_probe' | 'known_catalog' | 'manual';

export interface DiscoveryResult {
  readonly source: DiscoverySource;
  readonly feeds: DiscoveredFeed[];
  readonly notes?: string;
}

function normalizeEndpoint(url: string): string {
  return url.replace(/\/+$/, '');
}

function isValidPath(p: string): p is string {
  return typeof p === 'string' && p.startsWith('/') && p.length <= 200;
}

function isValidSlug(s: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/.test(s);
}

async function fetchWithTimeout(url: string, init?: RequestInit, timeoutMs = TIMEOUT_MS): Promise<Response | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ----- Method 1: /.well-known/shadowfeed-feeds.json --------------------------
//
// Schema we publish (partners host this static JSON file):
// {
//   "version": "1",
//   "provider": { "name": "...", "description": "..." },
//   "feeds": [
//     {
//       "slug": "pumpfun-launches",
//       "name": "PumpFun Launches",
//       "description": "...",
//       "category": "discovery",
//       "path": "/v1/trenches/new-tokens",
//       "method": "GET",
//       "suggested_price_stx": 0.005
//     }
//   ]
// }
async function tryWellKnown(endpoint: string): Promise<DiscoveryResult | null> {
  for (const path of COMMON_DISCOVERY_PATHS) {
    const res = await fetchWithTimeout(`${endpoint}${path}`, {
      headers: { accept: 'application/json' },
    });
    if (!res || !res.ok) continue;
    let body: any;
    try { body = await res.json(); } catch { continue; }

    if (!Array.isArray(body?.feeds)) continue;

    const feeds: DiscoveredFeed[] = [];
    for (const raw of body.feeds.slice(0, MAX_PROBES)) {
      const slug = String(raw?.slug ?? '').toLowerCase();
      const name = String(raw?.name ?? slug);
      const path = String(raw?.path ?? '');
      const method = (raw?.method ?? 'GET').toString().toUpperCase();
      const price = Number(raw?.suggested_price_stx ?? raw?.price_stx ?? 0);
      if (!isValidSlug(slug) || !isValidPath(path)) continue;
      if (method !== 'GET' && method !== 'POST') continue;
      if (!Number.isFinite(price) || price <= 0 || price > 100) continue;
      feeds.push({
        slug,
        name: name.slice(0, 100),
        description: raw?.description ? String(raw.description).slice(0, 500) : undefined,
        category: raw?.category ? String(raw.category).slice(0, 50) : undefined,
        source_path: path,
        source_method: method as 'GET' | 'POST',
        suggested_price_stx: price,
      });
    }

    if (feeds.length > 0) {
      return {
        source: 'well_known',
        feeds,
        notes: `Imported from ${path}`,
      };
    }
  }
  return null;
}

// ----- Method 2: x402 v2 probing --------------------------------------------
//
// Many partner APIs are x402-native — every paid endpoint returns 402 with
// a payment-required body that tells us the price. We probe a small set of
// common index paths first; if any returns a 402 we read pricing from it.
//
// This is a best-effort heuristic — it works for known patterns and gives
// up cheaply otherwise.
async function tryX402Probe(endpoint: string): Promise<DiscoveryResult | null> {
  for (const path of COMMON_X402_PROBE_PATHS) {
    const res = await fetchWithTimeout(`${endpoint}${path}`, {
      headers: { accept: 'application/json' },
    });
    if (!res) continue;

    // Some partners expose an unauthenticated /feeds index that returns 200
    // with a JSON manifest. Treat it like well-known shape.
    if (res.ok) {
      let body: any;
      try { body = await res.json(); } catch { continue; }
      if (Array.isArray(body?.feeds)) {
        const feeds = body.feeds
          .slice(0, MAX_PROBES)
          .map((raw: any) => normalizeFeedShape(raw))
          .filter((f: DiscoveredFeed | null): f is DiscoveredFeed => f !== null);
        if (feeds.length > 0) {
          return {
            source: 'x402_probe',
            feeds,
            notes: `Discovered from ${path} index endpoint`,
          };
        }
      }
    }
  }
  return null;
}

function normalizeFeedShape(raw: any): DiscoveredFeed | null {
  const slug = String(raw?.slug ?? raw?.id ?? '').toLowerCase();
  const path = String(raw?.path ?? raw?.endpoint ?? '');
  if (!isValidSlug(slug) || !isValidPath(path)) return null;

  // Derive a price hint — accept STX or convert USDC roughly via parity (1:1 cap).
  const priceStx = Number(raw?.price_stx ?? raw?.price?.stx ?? 0);
  const priceUsdc = Number(raw?.price_usdc ?? raw?.price?.usdc ?? 0);
  const suggested = priceStx > 0 ? priceStx : (priceUsdc > 0 ? Math.min(priceUsdc / 2, 0.05) : 0.005);

  return {
    slug,
    name: String(raw?.name ?? slug).slice(0, 100),
    description: raw?.description ? String(raw.description).slice(0, 500) : undefined,
    category: raw?.category ? String(raw.category).slice(0, 50) : undefined,
    source_path: path,
    source_method: 'GET',
    suggested_price_stx: suggested,
  };
}

// ----- Method 3: known catalog -----------------------------------------------
//
// For high-priority partners we've onboarded manually, we ship a curated list
// directly in this module so the wizard pre-fills feeds in one click. This is
// the path that handles Hyre during M2 without requiring them to publish a
// well-known file first.
function tryKnownCatalog(endpoint: string): DiscoveryResult | null {
  let host: string;
  try {
    host = new URL(endpoint).host.toLowerCase();
  } catch {
    return null;
  }
  // Match against any apex domain key by suffix — so api.example.com,
  // partner.example.com, and example.com all resolve to KNOWN_CATALOGS['example.com'].
  for (const apex of Object.keys(KNOWN_CATALOGS)) {
    if (host === apex || host.endsWith('.' + apex)) {
      return {
        source: 'known_catalog',
        feeds: KNOWN_CATALOGS[apex],
        notes: `Curated catalog for ${apex} (matched ${host})`,
      };
    }
  }
  return null;
}

// ----- Main entry ------------------------------------------------------------

export async function discoverFeeds(rawEndpoint: string): Promise<DiscoveryResult> {
  const endpoint = normalizeEndpoint(rawEndpoint);
  if (!/^https:\/\/[^\s]+$/.test(endpoint)) {
    return { source: 'manual', feeds: [], notes: 'Endpoint must be https://...' };
  }

  // 1. Most explicit signal first.
  const wk = await tryWellKnown(endpoint);
  if (wk) return wk;

  // 2. Known partners we have a hardcoded catalog for.
  const known = tryKnownCatalog(endpoint);
  if (known) return known;

  // 3. Generic x402 / index probing.
  const probe = await tryX402Probe(endpoint);
  if (probe) return probe;

  return {
    source: 'manual',
    feeds: [],
    notes: 'No feeds auto-detected. Add them manually via the feed editor.',
  };
}
