const NANSEN_API = 'https://api.nansen.ai';

export async function generateWalletProfile(kv: KVNamespace, apiKey: string, address?: string, chain?: string) {
  const targetAddress = address || '0x28c6c06298d514db089934071355e5743bf21d60'; // Binance default
  const targetChain = chain || 'ethereum';
  const cacheKey = `nansen_wallet_${targetChain}_${targetAddress}`;
  const cached = await kv.get(cacheKey, 'json');
  if (cached) return cached;

  const sources: string[] = [];

  try {
    const balanceRes = await fetch(`${NANSEN_API}/api/v1/profiler/address/current-balance`, {
      method: 'POST',
      headers: { 'apiKey': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chain: targetChain,
        address: targetAddress,
        hide_spam_token: true,
        pagination: { page: 1, per_page: 20 },
        order_by: [{ field: 'value_usd', direction: 'DESC' }],
      }),
    });

    if (!balanceRes.ok) {
      throw new Error(`Nansen API error: ${balanceRes.status}`);
    }

    const balanceData = await balanceRes.json() as { data?: any[] };
    const holdings = balanceData?.data ?? [];
    sources.push('Nansen Profiler');

    const totalValue = holdings.reduce((sum: number, h: any) => sum + (h.value_usd || 0), 0);

    const topHoldings = holdings.slice(0, 15).map((h: any) => ({
      token: h.token_symbol,
      name: h.token_name,
      chain: h.chain,
      amount: h.token_amount,
      price_usd: h.price_usd,
      value_usd: Math.round(h.value_usd || 0),
      allocation_pct: totalValue > 0 ? Math.round((h.value_usd / totalValue) * 10000) / 100 : 0,
    }));

    const chainBreakdown: Record<string, number> = {};
    for (const h of holdings) {
      const c = h.chain || 'unknown';
      chainBreakdown[c] = (chainBreakdown[c] || 0) + (h.value_usd || 0);
    }

    const result = {
      wallet: {
        address: targetAddress,
        chain_filter: targetChain,
        total_value_usd: Math.round(totalValue),
        token_count: holdings.length,
      },
      top_holdings: topHoldings,
      chain_breakdown: Object.entries(chainBreakdown)
        .map(([chain, value]) => ({
          chain,
          value_usd: Math.round(value),
          allocation_pct: Math.round((value / Math.max(1, totalValue)) * 10000) / 100,
        }))
        .sort((a, b) => b.value_usd - a.value_usd),
      concentration: {
        top_3_pct: topHoldings.slice(0, 3).reduce((s: number, h: any) => s + h.allocation_pct, 0),
        top_5_pct: topHoldings.slice(0, 5).reduce((s: number, h: any) => s + h.allocation_pct, 0),
        diversification: holdings.length > 20 ? 'high' : holdings.length > 10 ? 'medium' : 'low',
      },
      data_source: sources.join(' + '),
      generated_at: Date.now(),
    };

    await kv.put(cacheKey, JSON.stringify(result), { expirationTtl: 300 });
    return result;
  } catch (err: any) {
    return {
      wallet: { address: targetAddress, error: err.message },
      top_holdings: [],
      data_source: 'error',
      generated_at: Date.now(),
    };
  }
}
