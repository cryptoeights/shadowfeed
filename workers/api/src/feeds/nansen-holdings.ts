const NANSEN_API = 'https://api.nansen.ai';

export async function generateSmartMoneyHoldings(kv: KVNamespace, apiKey: string) {
  const cacheKey = 'nansen_sm_holdings';
  const cached = await kv.get(cacheKey, 'json');
  if (cached) return cached;

  const sources: string[] = [];

  try {
    const res = await fetch(`${NANSEN_API}/api/v1/smart-money/holdings`, {
      method: 'POST',
      headers: { 'apiKey': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chains: ['ethereum', 'solana', 'base', 'arbitrum'],
        pagination: { page: 1, per_page: 30 },
        order_by: [{ field: 'value_usd', direction: 'DESC' }],
      }),
    });

    if (!res.ok) {
      throw new Error(`Nansen API error: ${res.status}`);
    }

    const data = await res.json() as { data?: any[] };
    const holdings = data?.data ?? [];
    sources.push('Nansen Smart Money Holdings');

    const totalValue = holdings.reduce((sum: number, h: any) => sum + (h.value_usd || 0), 0);

    const topHoldings = holdings.slice(0, 25).map((h: any, idx: number) => ({
      rank: idx + 1,
      token: h.token_symbol,
      chain: h.chain,
      value_usd: Math.round(h.value_usd || 0),
      holders_count: h.holders_count,
      share_of_holdings_pct: h.share_of_holdings_percent,
      change_24h_pct: h.balance_24h_percent_change,
      market_cap_usd: h.market_cap_usd,
      sectors: h.token_sectors,
      signal: (h.balance_24h_percent_change || 0) > 5 ? 'ACCUMULATING' :
              (h.balance_24h_percent_change || 0) < -5 ? 'DISTRIBUTING' : 'HOLDING',
    }));

    const accumulating = topHoldings.filter(h => h.signal === 'ACCUMULATING');
    const distributing = topHoldings.filter(h => h.signal === 'DISTRIBUTING');

    const chainAllocation: Record<string, number> = {};
    for (const h of holdings) {
      const c = h.chain || 'unknown';
      chainAllocation[c] = (chainAllocation[c] || 0) + (h.value_usd || 0);
    }

    const result = {
      summary: {
        total_tracked_value_usd: Math.round(totalValue),
        tokens_held: holdings.length,
        accumulating_count: accumulating.length,
        distributing_count: distributing.length,
        market_sentiment: accumulating.length > distributing.length ? 'bullish' : 'bearish',
      },
      top_holdings: topHoldings,
      trending_accumulation: accumulating.slice(0, 5),
      trending_distribution: distributing.slice(0, 5),
      chain_allocation: Object.entries(chainAllocation)
        .map(([chain, value]) => ({ chain, value_usd: Math.round(value) }))
        .sort((a, b) => b.value_usd - a.value_usd),
      data_source: sources.join(' + '),
      generated_at: Date.now(),
    };

    await kv.put(cacheKey, JSON.stringify(result), { expirationTtl: 300 });
    return result;
  } catch (err: any) {
    return {
      summary: { error: err.message },
      top_holdings: [],
      data_source: 'error',
      generated_at: Date.now(),
    };
  }
}
