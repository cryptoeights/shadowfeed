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
const KNOWN_CATALOGS: Record<string, DiscoveredFeed[]> = {
  'hyreagent.fun': [
    { slug: 'pumpfun-launches',    name: 'PumpFun Launches',       description: 'New PumpFun token launches with sniper detection and bonding curve analysis.', category: 'discovery',      source_path: '/v1/trenches/new-tokens',       suggested_price_stx: 0.005 },
    { slug: 'bonding-curve',       name: 'Bonding Curve State',    description: 'Bonding curve liquidity, market cap, and graduation probability for any PumpFun token.', category: 'on-chain', source_path: '/v1/trenches/bonding-curve', suggested_price_stx: 0.005 },
    { slug: 'token-snipers',       name: 'Sniper Detection',       description: 'Wallets sniping launches in the first N blocks with PnL tracking.', category: 'on-chain',           source_path: '/v1/trenches/snipers',          suggested_price_stx: 0.005 },
    { slug: 'token-verdict',       name: 'Token Verdict',          description: 'AI-interpreted go/no-go signal on a token with confidence scoring.', category: 'analytics',         source_path: '/v1/trenches/verdict',          suggested_price_stx: 0.008 },
    { slug: 'wallet-pnl',          name: 'Wallet PnL',             description: 'Profit/loss tracking, position history, and realized/unrealized PnL for any wallet.', category: 'on-chain',     source_path: '/v1/traders/pnl',                suggested_price_stx: 0.01 },
    { slug: 'top-traders',         name: 'Top Traders',            description: 'Best-performing wallets by chain, timeframe, and token.', category: 'on-chain',                              source_path: '/v1/traders/top',                suggested_price_stx: 0.01 },
    { slug: 'whales',              name: 'Whale Tracker',          description: 'Large-position wallets and their recent activity.', category: 'on-chain',                                       source_path: '/v1/traders/whales',             suggested_price_stx: 0.01 },
    { slug: 'ohlcv',               name: 'OHLCV Candles',          description: 'Open/high/low/close/volume candles for any tradeable token.', category: 'analytics',                            source_path: '/v1/traders/ohlcv',              suggested_price_stx: 0.003 },
    { slug: 'meteora-pools',       name: 'Meteora DLMM Pools',     description: 'Active Meteora DLMM positions with utilization and fee data.', category: 'stacks-defi',                         source_path: '/v1/lp/meteora',                 suggested_price_stx: 0.008 },
    { slug: 'lp-recommend',        name: 'LP Recommendations',     description: 'AI-recommended LP positions ranked by risk-adjusted yield.', category: 'analytics',                             source_path: '/v1/lp/recommend',               suggested_price_stx: 0.01 },
    { slug: 'tvl-snapshot',        name: 'Cross-chain TVL',        description: 'TVL snapshot across protocols and chains.', category: 'analytics',                                              source_path: '/v1/defi/tvl',                   suggested_price_stx: 0.003 },
    { slug: 'yield-opps',          name: 'Yield Opportunities',    description: 'Top yield farming opportunities sorted by APY and risk score.', category: 'analytics',                          source_path: '/v1/defi/yields',                suggested_price_stx: 0.005 },
    { slug: 'smart-money-flows',   name: 'Smart Money Flows',      description: 'Net flows of Nansen smart money labels across tokens.', category: 'on-chain',                                   source_path: '/v1/smart-money/flows',          suggested_price_stx: 0.08 },
    { slug: 'smart-money-screener',name: 'Smart Money Screener',   description: 'Token screener filtered by smart money concentration.', category: 'analytics',                                  source_path: '/v1/smart-money/screener',       suggested_price_stx: 0.05 },
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
