const NANSEN_API = 'https://api.nansen.ai';

export async function generateSmartMoneyFlows(kv: KVNamespace, apiKey: string) {
  const cacheKey = 'nansen_smart_money_flows';
  const cached = await kv.get(cacheKey, 'json');
  if (cached) return cached;

  const sources: string[] = [];

  try {
    const [netflowRes, dexTradesRes] = await Promise.all([
      fetch(`${NANSEN_API}/api/v1/smart-money/netflow`, {
        method: 'POST',
        headers: { 'apiKey': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chains: ['ethereum', 'solana', 'base', 'arbitrum'],
          pagination: { page: 1, per_page: 20 },
          order_by: [{ field: 'net_flow_24h_usd', direction: 'DESC' }],
        }),
      }),
      fetch(`${NANSEN_API}/api/v1/smart-money/dex-trades`, {
        method: 'POST',
        headers: { 'apiKey': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chains: ['ethereum', 'solana', 'base', 'arbitrum'],
          pagination: { page: 1, per_page: 15 },
          order_by: [{ field: 'trade_value_usd', direction: 'DESC' }],
        }),
      }),
    ]);

    let netflows: any[] = [];
    let dexTrades: any[] = [];

    if (netflowRes.ok) {
      const data = await netflowRes.json() as { data?: any[] };
      netflows = data?.data ?? [];
      sources.push('Nansen Smart Money Netflow');
    }

    if (dexTradesRes.ok) {
      const data = await dexTradesRes.json() as { data?: any[] };
      dexTrades = data?.data ?? [];
      sources.push('Nansen Smart Money DEX Trades');
    }

    const totalInflow = netflows.reduce((sum, n) => sum + Math.max(0, n.net_flow_24h_usd || 0), 0);
    const totalOutflow = netflows.reduce((sum, n) => sum + Math.abs(Math.min(0, n.net_flow_24h_usd || 0)), 0);

    const topInflows = netflows
      .filter(n => (n.net_flow_24h_usd || 0) > 0)
      .slice(0, 10)
      .map(n => ({
        token: n.token_symbol,
        chain: n.chain,
        net_flow_24h_usd: n.net_flow_24h_usd,
        net_flow_7d_usd: n.net_flow_7d_usd,
        trader_count: n.trader_count,
        market_cap_usd: n.market_cap_usd,
        sectors: n.token_sectors,
      }));

    const topOutflows = netflows
      .filter(n => (n.net_flow_24h_usd || 0) < 0)
      .sort((a, b) => (a.net_flow_24h_usd || 0) - (b.net_flow_24h_usd || 0))
      .slice(0, 10)
      .map(n => ({
        token: n.token_symbol,
        chain: n.chain,
        net_flow_24h_usd: n.net_flow_24h_usd,
        net_flow_7d_usd: n.net_flow_7d_usd,
        trader_count: n.trader_count,
        market_cap_usd: n.market_cap_usd,
      }));

    const recentTrades = dexTrades.slice(0, 10).map(t => ({
      trader: t.trader_address_label || t.trader_address?.slice(0, 10) + '...',
      action: t.token_bought_symbol ? 'BUY' : 'SELL',
      token_bought: t.token_bought_symbol,
      token_sold: t.token_sold_symbol,
      value_usd: t.trade_value_usd,
      chain: t.chain,
      timestamp: t.block_timestamp,
    }));

    const sentiment = totalInflow > totalOutflow ? 'accumulating' : 'distributing';

    const result = {
      summary: {
        total_inflow_24h_usd: Math.round(totalInflow),
        total_outflow_24h_usd: Math.round(totalOutflow),
        net_flow_24h_usd: Math.round(totalInflow - totalOutflow),
        smart_money_sentiment: sentiment,
        tokens_tracked: netflows.length,
        signal: totalInflow > totalOutflow * 1.5 ? 'STRONG_BUY' :
                totalInflow > totalOutflow ? 'BUY' :
                totalOutflow > totalInflow * 1.5 ? 'STRONG_SELL' : 'SELL',
      },
      top_inflows: topInflows,
      top_outflows: topOutflows,
      recent_trades: recentTrades,
      data_source: sources.join(' + '),
      generated_at: Date.now(),
    };

    await kv.put(cacheKey, JSON.stringify(result), { expirationTtl: 300 });
    return result;
  } catch (err: any) {
    return {
      summary: { error: 'Failed to fetch Nansen data', detail: err.message },
      top_inflows: [],
      top_outflows: [],
      recent_trades: [],
      data_source: 'error',
      generated_at: Date.now(),
    };
  }
}
