// Agent templates — each template defines:
//   - config schema (what the user configures when creating the agent)
//   - default schedule
//   - which feeds it queries
//   - trigger function (given feed data + config, should we fire the webhook?)
//
// Templates are intentionally simple: pure functions over fetched data.
// More expressive logic (custom flows, multi-feed, math) lives in Phase 2.

export type TemplateId =
  | 'whale-tracker'
  | 'dca-bot'
  | 'gas-optimizer'
  | 'liquidation-hunter'
  | 'stacks-defi-monitor';

export interface ConfigField {
  readonly key: string;
  readonly label: string;
  readonly type: 'number' | 'string' | 'boolean' | 'enum';
  readonly default: number | string | boolean;
  readonly enum_values?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  readonly description?: string;
  readonly suffix?: string;
}

export interface AgentTemplate {
  readonly id: TemplateId;
  readonly name: string;
  readonly emoji: string;
  readonly description: string;
  readonly category: 'monitor' | 'trader' | 'optimizer' | 'alert';
  readonly feeds: readonly string[];
  readonly default_schedule: string;
  readonly schedule_options: readonly { readonly cron: string; readonly label: string }[];
  readonly config_fields: readonly ConfigField[];
}

export const TEMPLATES: Record<TemplateId, AgentTemplate> = {
  'whale-tracker': {
    id: 'whale-tracker',
    name: 'Whale Tracker',
    emoji: '🐋',
    description: 'Alert when a whale moves more than your threshold across exchanges or wallets.',
    category: 'monitor',
    feeds: ['whale-alerts'],
    default_schedule: '*/5 * * * *',
    schedule_options: [
      { cron: '*/5 * * * *', label: 'Every 5 minutes' },
      { cron: '*/15 * * * *', label: 'Every 15 minutes' },
      { cron: '*/30 * * * *', label: 'Every 30 minutes' },
      { cron: '0 * * * *', label: 'Hourly' },
    ],
    config_fields: [
      {
        key: 'min_btc_threshold',
        label: 'Minimum BTC moved',
        type: 'number',
        default: 100,
        min: 1,
        max: 100000,
        suffix: 'BTC',
        description: 'Fire alert when any whale transfer exceeds this amount.',
      },
      {
        key: 'direction',
        label: 'Direction',
        type: 'enum',
        default: 'both',
        enum_values: ['inflow', 'outflow', 'both'],
        description: 'Track exchange inflows (sell pressure), outflows (accumulation), or both.',
      },
    ],
  },

  'dca-bot': {
    id: 'dca-bot',
    name: 'DCA Bot',
    emoji: '📊',
    description: 'Notify you to buy BTC when Fear & Greed Index drops below your level (extreme fear = good entry).',
    category: 'trader',
    feeds: ['btc-sentiment'],
    default_schedule: '0 */6 * * *',
    schedule_options: [
      { cron: '0 * * * *', label: 'Hourly' },
      { cron: '0 */6 * * *', label: 'Every 6 hours' },
      { cron: '0 0,12 * * *', label: 'Twice daily' },
      { cron: '0 0 * * *', label: 'Once daily' },
    ],
    config_fields: [
      {
        key: 'buy_below_fear_greed',
        label: 'Buy when Fear & Greed below',
        type: 'number',
        default: 30,
        min: 0,
        max: 100,
        description: 'Lower numbers = more extreme fear. 30 = "fear", 20 = "extreme fear".',
      },
      {
        key: 'min_24h_drop_pct',
        label: 'Also require 24h drop ≥',
        type: 'number',
        default: 0,
        min: 0,
        max: 50,
        suffix: '%',
        description: 'Optional: only fire if BTC also dropped this much in 24h. 0 = ignore.',
      },
    ],
  },

  'gas-optimizer': {
    id: 'gas-optimizer',
    name: 'Gas Optimizer',
    emoji: '⛽',
    description: 'Tell you when ETH gas or BTC fees drop low enough to time your transactions.',
    category: 'optimizer',
    feeds: ['gas-prediction'],
    default_schedule: '*/10 * * * *',
    schedule_options: [
      { cron: '*/5 * * * *', label: 'Every 5 minutes' },
      { cron: '*/10 * * * *', label: 'Every 10 minutes' },
      { cron: '*/30 * * * *', label: 'Every 30 minutes' },
    ],
    config_fields: [
      {
        key: 'max_eth_gwei',
        label: 'Max ETH gas (Gwei)',
        type: 'number',
        default: 10,
        min: 1,
        max: 500,
        suffix: 'gwei',
        description: 'Fire when ETH instant gas price drops to this level or lower.',
      },
      {
        key: 'max_btc_sat_vb',
        label: 'Max BTC fee (sat/vB)',
        type: 'number',
        default: 5,
        min: 1,
        max: 200,
        suffix: 'sat/vB',
        description: 'Fire when BTC fastest fee drops to this level or lower.',
      },
    ],
  },

  'liquidation-hunter': {
    id: 'liquidation-hunter',
    name: 'Liquidation Hunter',
    emoji: '⚡',
    description: 'Get notified when futures liquidation volume spikes — often precedes cascading moves.',
    category: 'alert',
    feeds: ['liquidation-alerts'],
    default_schedule: '*/2 * * * *',
    schedule_options: [
      { cron: '* * * * *', label: 'Every minute' },
      { cron: '*/2 * * * *', label: 'Every 2 minutes' },
      { cron: '*/5 * * * *', label: 'Every 5 minutes' },
    ],
    config_fields: [
      {
        key: 'min_total_liquidation_usd',
        label: 'Minimum total liquidations',
        type: 'number',
        default: 10_000_000,
        min: 100_000,
        max: 1_000_000_000,
        suffix: 'USD',
        description: 'Fire when 24h total liquidations exceed this dollar amount.',
      },
      {
        key: 'side',
        label: 'Liquidation side',
        type: 'enum',
        default: 'both',
        enum_values: ['longs', 'shorts', 'both'],
        description: 'Long liquidations = bearish signal, short liquidations = bullish.',
      },
    ],
  },

  'stacks-defi-monitor': {
    id: 'stacks-defi-monitor',
    name: 'Stacks DeFi Monitor',
    emoji: '🏛️',
    description: 'Alert on significant TVL changes or volume spikes in the ALEX Lab ecosystem.',
    category: 'monitor',
    feeds: ['alex-tvl-flows', 'alex-swap-activity'],
    default_schedule: '*/15 * * * *',
    schedule_options: [
      { cron: '*/5 * * * *', label: 'Every 5 minutes' },
      { cron: '*/15 * * * *', label: 'Every 15 minutes' },
      { cron: '0 * * * *', label: 'Hourly' },
    ],
    config_fields: [
      {
        key: 'min_24h_volume_usd',
        label: 'Minimum 24h volume',
        type: 'number',
        default: 100_000,
        min: 1_000,
        max: 10_000_000,
        suffix: 'USD',
        description: 'Fire when total ALEX swap volume in last 24h exceeds this.',
      },
      {
        key: 'min_tvl_usd',
        label: 'Minimum platform TVL',
        type: 'number',
        default: 500_000,
        min: 10_000,
        max: 100_000_000,
        suffix: 'USD',
        description: 'Optional sanity check — fire only if TVL is also above this floor.',
      },
    ],
  },
};

// Trigger evaluators. Each takes the feed data + agent config and returns
// either a triggered result (with a reason for the webhook payload) or null.
//
// Keeping these as pure functions makes them easy to unit-test.
export interface TriggerResult {
  readonly triggered: true;
  readonly reason: string;
  readonly payload: Record<string, unknown>;
}

export type TriggerEvaluator = (
  feedData: Record<string, any>,
  config: Record<string, any>,
) => TriggerResult | null;

export const TRIGGERS: Record<TemplateId, TriggerEvaluator> = {
  'whale-tracker': (data, config) => {
    const minBtc = Number(config.min_btc_threshold ?? 100);
    const direction = String(config.direction ?? 'both');
    const alerts: any[] = data.alerts || [];
    const matching = alerts.filter(a => {
      const amount = Number(a.btc_amount ?? a.amount ?? 0);
      if (amount < minBtc) return false;
      if (direction === 'both') return true;
      const isInflow = (a.flow_direction || a.direction || '').includes('inflow') ||
        (a.to || '').toLowerCase().includes('exchange');
      return direction === 'inflow' ? isInflow : !isInflow;
    });
    if (matching.length === 0) return null;
    const total = matching.reduce((s, a) => s + Number(a.btc_amount ?? a.amount ?? 0), 0);
    return {
      triggered: true,
      reason: `${matching.length} whale movement${matching.length > 1 ? 's' : ''} above ${minBtc} BTC (total ${total.toFixed(2)} BTC)`,
      payload: { matching_alerts: matching.slice(0, 5), total_btc: total },
    };
  },

  'dca-bot': (data, config) => {
    const threshold = Number(config.buy_below_fear_greed ?? 30);
    const minDrop = Number(config.min_24h_drop_pct ?? 0);
    const fg = Number(data?.fear_greed?.value ?? 50);
    const change = Number(data?.btc_market?.change_24h_pct ?? 0);
    if (fg >= threshold) return null;
    if (minDrop > 0 && change > -minDrop) return null;
    return {
      triggered: true,
      reason: `Fear & Greed = ${fg} (below ${threshold}); BTC ${change >= 0 ? '+' : ''}${change}% 24h`,
      payload: {
        fear_greed: fg,
        fear_greed_classification: data?.fear_greed?.classification,
        btc_price: data?.btc_market?.price_usd,
        btc_24h_change: change,
      },
    };
  },

  'gas-optimizer': (data, config) => {
    const maxGwei = Number(config.max_eth_gwei ?? 10);
    const maxSatVb = Number(config.max_btc_sat_vb ?? 5);
    // gas-prediction feed shape: { ethereum: { instant_gwei, ... }, bitcoin: { fastest_sat_per_vb, ... } }
    const ethGwei = Number(data?.ethereum?.instant_gwei ?? data?.ethereum?.fast_gwei ?? 999);
    const btcSatVb = Number(data?.bitcoin?.fastest_sat_per_vb ?? data?.bitcoin?.fast_sat_per_vb ?? 999);
    const ethBelow = ethGwei <= maxGwei;
    const btcBelow = btcSatVb <= maxSatVb;
    if (!ethBelow && !btcBelow) return null;
    const which = ethBelow && btcBelow ? 'ETH + BTC' : ethBelow ? 'ETH' : 'BTC';
    return {
      triggered: true,
      reason: `${which} fees dropped to target — ETH ${ethGwei} gwei, BTC ${btcSatVb} sat/vB`,
      payload: { eth_gwei: ethGwei, btc_sat_vb: btcSatVb, eth_below: ethBelow, btc_below: btcBelow },
    };
  },

  'liquidation-hunter': (data, config) => {
    const minTotal = Number(config.min_total_liquidation_usd ?? 10_000_000);
    const side = String(config.side ?? 'both');
    const longUsd = Number(data?.summary?.total_long_liquidations_usd ?? data?.long_24h_usd ?? 0);
    const shortUsd = Number(data?.summary?.total_short_liquidations_usd ?? data?.short_24h_usd ?? 0);
    const totalUsd = longUsd + shortUsd;
    if (totalUsd < minTotal) return null;
    if (side === 'longs' && longUsd < minTotal) return null;
    if (side === 'shorts' && shortUsd < minTotal) return null;
    return {
      triggered: true,
      reason: `Liquidations spiked: $${(totalUsd / 1e6).toFixed(1)}M total ($${(longUsd / 1e6).toFixed(1)}M longs, $${(shortUsd / 1e6).toFixed(1)}M shorts)`,
      payload: { total_usd: totalUsd, long_usd: longUsd, short_usd: shortUsd },
    };
  },

  'stacks-defi-monitor': (data, config) => {
    const minVolume = Number(config.min_24h_volume_usd ?? 100_000);
    const minTvl = Number(config.min_tvl_usd ?? 500_000);
    // data is an OBJECT: { 'alex-tvl-flows': {...}, 'alex-swap-activity': {...} }
    const tvl = Number(data?.['alex-tvl-flows']?.platform?.total_tvl_usd ?? 0);
    const volume = Number(data?.['alex-swap-activity']?.summary?.total_volume_usd ?? 0);
    if (volume < minVolume) return null;
    if (tvl < minTvl) return null;
    return {
      triggered: true,
      reason: `ALEX 24h volume $${(volume).toLocaleString()} (above $${minVolume.toLocaleString()}) with TVL $${(tvl).toLocaleString()}`,
      payload: { volume_24h_usd: volume, tvl_usd: tvl },
    };
  },
};
