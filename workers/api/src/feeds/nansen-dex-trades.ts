const NANSEN_API = 'https://api.nansen.ai';

export async function generateDexTradingIntel(kv: KVNamespace, apiKey: string) {
  const cacheKey = 'nansen_dex_trading';
  const cached = await kv.get(cacheKey, 'json');
  if (cached) return cached;

  const sources: string[] = [];

  try {
    const [dexRes, perpRes] = await Promise.all([
      fetch(`${NANSEN_API}/api/v1/smart-money/dex-trades`, {
        method: 'POST',
        headers: { 'apiKey': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chains: ['ethereum', 'solana', 'base', 'arbitrum'],
          pagination: { page: 1, per_page: 20 },
          order_by: [{ field: 'trade_value_usd', direction: 'DESC' }],
        }),
      }),
      fetch(`${NANSEN_API}/api/v1/smart-money/perp-trades`, {
        method: 'POST',
        headers: { 'apiKey': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chains: ['ethereum', 'arbitrum'],
          pagination: { page: 1, per_page: 15 },
        }),
      }),
    ]);

    let dexTrades: any[] = [];
    let perpTrades: any[] = [];

    if (dexRes.ok) {
      const data = await dexRes.json() as { data?: any[] };
      dexTrades = data?.data ?? [];
      sources.push('Nansen DEX Trades');
    }

    if (perpRes.ok) {
      const data = await perpRes.json() as { data?: any[] };
      perpTrades = data?.data ?? [];
      sources.push('Nansen Perp Trades');
    }

    const totalDexVolume = dexTrades.reduce((sum, t) => sum + (t.trade_value_usd || 0), 0);

    const tokenBuys: Record<string, { count: number; volume: number }> = {};
    const tokenSells: Record<string, { count: number; volume: number }> = {};

    for (const t of dexTrades) {
      if (t.token_bought_symbol) {
        const key = t.token_bought_symbol;
        tokenBuys[key] = tokenBuys[key] || { count: 0, volume: 0 };
        tokenBuys[key].count++;
        tokenBuys[key].volume += t.trade_value_usd || 0;
      }
      if (t.token_sold_symbol) {
        const key = t.token_sold_symbol;
        tokenSells[key] = tokenSells[key] || { count: 0, volume: 0 };
        tokenSells[key].count++;
        tokenSells[key].volume += t.trade_value_usd || 0;
      }
    }

    const mostBought = Object.entries(tokenBuys)
      .map(([token, data]) => ({ token, ...data, volume: Math.round(data.volume) }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10);

    const mostSold = Object.entries(tokenSells)
      .map(([token, data]) => ({ token, ...data, volume: Math.round(data.volume) }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 10);

    const recentDex = dexTrades.slice(0, 15).map(t => ({
      trader: t.trader_address_label || (t.trader_address ? t.trader_address.slice(0, 10) + '...' : 'unknown'),
      bought: t.token_bought_symbol,
      sold: t.token_sold_symbol,
      value_usd: Math.round(t.trade_value_usd || 0),
      chain: t.chain,
      timestamp: t.block_timestamp,
    }));

    const recentPerps = perpTrades.slice(0, 10).map(t => ({
      trader: t.trader_address_label || (t.trader_address ? t.trader_address.slice(0, 10) + '...' : 'unknown'),
      token: t.token_symbol,
      side: t.side,
      size_usd: Math.round(t.size_usd || 0),
      chain: t.chain,
      timestamp: t.block_timestamp,
    }));

    const result = {
      summary: {
        total_dex_volume_usd: Math.round(totalDexVolume),
        total_dex_trades: dexTrades.length,
        total_perp_trades: perpTrades.length,
        buy_pressure: mostBought.length > 0 ? mostBought[0].token : 'N/A',
        sell_pressure: mostSold.length > 0 ? mostSold[0].token : 'N/A',
      },
      most_bought_tokens: mostBought,
      most_sold_tokens: mostSold,
      recent_dex_trades: recentDex,
      recent_perp_trades: recentPerps,
      data_source: sources.join(' + '),
      generated_at: Date.now(),
    };

    await kv.put(cacheKey, JSON.stringify(result), { expirationTtl: 300 });
    return result;
  } catch (err: any) {
    return {
      summary: { error: err.message },
      most_bought_tokens: [],
      most_sold_tokens: [],
      recent_dex_trades: [],
      recent_perp_trades: [],
      data_source: 'error',
      generated_at: Date.now(),
    };
  }
}
