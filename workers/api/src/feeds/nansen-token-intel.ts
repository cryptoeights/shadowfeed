const NANSEN_API = 'https://api.nansen.ai';

const TOP_TOKENS = [
  { chain: 'ethereum', address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', symbol: 'WETH' },
  { chain: 'ethereum', address: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', symbol: 'WBTC' },
  { chain: 'ethereum', address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9', symbol: 'AAVE' },
  { chain: 'ethereum', address: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', symbol: 'UNI' },
  { chain: 'ethereum', address: '0x514910771af9ca656af840dff83e8264ecf986ca', symbol: 'LINK' },
  { chain: 'solana', address: 'So11111111111111111111111111111111111111112', symbol: 'SOL' },
];

export async function generateTokenIntelligence(kv: KVNamespace, apiKey: string, tokenAddress?: string, chain?: string) {
  const targetChain = chain || 'ethereum';
  const targetAddress = tokenAddress || TOP_TOKENS[0].address;
  const cacheKey = `nansen_token_intel_${targetChain}_${targetAddress}`;
  const cached = await kv.get(cacheKey, 'json');
  if (cached) return cached;

  const sources: string[] = [];

  try {
    const infoRes = await fetch(`${NANSEN_API}/api/v1/tgm/token-information`, {
      method: 'POST',
      headers: { 'apiKey': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chain: targetChain,
        token_address: targetAddress,
        timeframe: '1d',
      }),
    });

    if (!infoRes.ok) {
      throw new Error(`Nansen API error: ${infoRes.status}`);
    }

    const info = await infoRes.json() as { data?: any };
    const tokenData = info?.data;
    sources.push('Nansen Token God Mode');

    if (!tokenData) {
      throw new Error('No token data returned');
    }

    const spot = tokenData.spot_metrics || {};
    const details = tokenData.token_details || {};

    const buyPressure = (spot.total_buys || 0) / Math.max(1, (spot.total_buys || 0) + (spot.total_sells || 0));
    const volumeRatio = (spot.buy_volume_usd || 0) / Math.max(1, spot.sell_volume_usd || 1);

    const result = {
      token: {
        name: tokenData.name,
        symbol: tokenData.symbol,
        chain: targetChain,
        address: targetAddress,
        market_cap_usd: details.market_cap_usd,
        fdv_usd: details.fdv_usd,
        circulating_supply: details.circulating_supply,
        total_supply: details.total_supply,
        deployed: details.token_deployment_date,
      },
      trading_metrics_24h: {
        total_volume_usd: spot.volume_total_usd,
        buy_volume_usd: spot.buy_volume_usd,
        sell_volume_usd: spot.sell_volume_usd,
        total_buys: spot.total_buys,
        total_sells: spot.total_sells,
        unique_buyers: spot.unique_buyers,
        unique_sellers: spot.unique_sellers,
        buy_sell_ratio: Math.round(volumeRatio * 100) / 100,
        buy_pressure_pct: Math.round(buyPressure * 10000) / 100,
      },
      liquidity: {
        liquidity_usd: spot.liquidity_usd,
        total_holders: spot.total_holders,
      },
      signal: volumeRatio > 2 ? 'STRONG_BUY' :
              volumeRatio > 1.2 ? 'BUY' :
              volumeRatio < 0.5 ? 'STRONG_SELL' :
              volumeRatio < 0.8 ? 'SELL' : 'NEUTRAL',
      links: {
        website: details.website,
        twitter: details.x,
        telegram: details.telegram,
      },
      data_source: sources.join(' + '),
      generated_at: Date.now(),
    };

    await kv.put(cacheKey, JSON.stringify(result), { expirationTtl: 300 });
    return result;
  } catch (err: any) {
    return {
      token: { symbol: 'unknown', chain: targetChain, address: targetAddress },
      error: err.message,
      data_source: 'error',
      generated_at: Date.now(),
    };
  }
}
