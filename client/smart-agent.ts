import 'dotenv/config';
import axios from 'axios';
import { wrapAxiosWithPayment, privateKeyToAccount, decodePaymentResponse } from 'x402-stacks';

/**
 * ShadowFeed Smart Agent — Autonomous AI Trading Intelligence
 *
 * This agent makes AUTONOMOUS economic decisions:
 * 1. Check market sentiment (paid query)
 * 2. Based on sentiment, decide whether to buy whale alerts
 * 3. If whale activity is extreme, buy DeFi scores to find safe havens
 * 4. Generate a final investment thesis
 *
 * Every data purchase is a real STX micropayment on Stacks testnet.
 */

const SHADOWFEED_URL = process.env.SHADOWFEED_URL || 'http://localhost:4002';
const AGENT_KEY = process.env.AGENT_PRIVATE_KEY;
const NETWORK = (process.env.NETWORK || 'testnet') as 'testnet' | 'mainnet';

// Agent reasoning chain
interface AgentDecision {
  step: number;
  action: string;
  reasoning: string;
  cost_stx: number;
  result: string;
}

const decisions: AgentDecision[] = [];
let totalSpent = 0;

function log(msg: string) {
  console.log(`  ${msg}`);
}

function think(msg: string) {
  console.log(`  \x1b[36m[THINK]\x1b[0m ${msg}`);
}

function decide(msg: string) {
  console.log(`  \x1b[33m[DECIDE]\x1b[0m ${msg}`);
}

function act(msg: string) {
  console.log(`  \x1b[32m[ACT]\x1b[0m ${msg}`);
}

function warn(msg: string) {
  console.log(`  \x1b[31m[ALERT]\x1b[0m ${msg}`);
}

async function main() {
  if (!AGENT_KEY) {
    console.error('ERROR: AGENT_PRIVATE_KEY required in .env');
    process.exit(1);
  }

  const account = privateKeyToAccount(AGENT_KEY, NETWORK);
  const api = wrapAxiosWithPayment(
    axios.create({ baseURL: SHADOWFEED_URL, timeout: 120000 }),
    account
  );

  console.log(`
  ╔═══════════════════════════════════════════════════════════╗
  ║         ShadowFeed Smart Agent v2.0                      ║
  ║         Autonomous Trading Intelligence                  ║
  ╠═══════════════════════════════════════════════════════════╣
  ║  Agent:    ${account.address}      ║
  ║  Network:  ${NETWORK.padEnd(47)}║
  ║  Server:   ${SHADOWFEED_URL.padEnd(47)}║
  ║  Mode:     Autonomous Decision Loop                      ║
  ╚═══════════════════════════════════════════════════════════╝
  `);

  // ========================================
  // STEP 1: Market Sentiment Assessment
  // ========================================
  console.log('━'.repeat(60));
  console.log('  STEP 1: Market Sentiment Assessment');
  console.log('━'.repeat(60));

  think('I need to understand current market conditions before making any decisions.');
  think('BTC sentiment data costs 0.003 STX — worth it for market overview.');
  decide('BUYING btc-sentiment feed (0.003 STX)');

  let sentiment: any = null;
  try {
    act('Sending x402 payment for btc-sentiment...');
    const sentRes = await api.get('/feeds/btc-sentiment');
    totalSpent += 0.003;
    sentiment = sentRes.data.data;

    const payment = decodePaymentResponse(sentRes.headers['payment-response']);
    log(`✓ Payment confirmed: ${payment?.transaction?.slice(0, 16)}...`);
    log(`  BTC Price: $${sentiment.btc_price_usd?.toLocaleString() || 'N/A'}`);
    log(`  Fear & Greed: ${sentiment.fear_greed_index}/100 (${sentiment.overall_label})`);
    log(`  Market Trend: ${sentiment.market_trend}`);
    log(`  24h Change: ${sentiment.btc_24h_change}%`);
    log(`  Data Source: ${sentiment.data_source}`);

    decisions.push({
      step: 1,
      action: 'BUY btc-sentiment',
      reasoning: 'Need market context before other decisions',
      cost_stx: 0.003,
      result: `${sentiment.overall_label} (FGI: ${sentiment.fear_greed_index}/100, trend: ${sentiment.market_trend})`,
    });
  } catch (err: any) {
    console.error(`  ✗ Failed: ${err.message}`);
    process.exit(1);
  }

  console.log();

  // ========================================
  // STEP 2: Conditional Whale Alert Check
  // ========================================
  console.log('━'.repeat(60));
  console.log('  STEP 2: Whale Movement Analysis (Conditional)');
  console.log('━'.repeat(60));

  const fearGreed = sentiment.fear_greed_index;
  const isBearish = sentiment.market_trend === 'bearish';
  const isExtremeGreed = fearGreed >= 75;
  const isExtremeFear = fearGreed <= 25;

  let whaleData: any = null;
  let shouldCheckWhales = false;

  if (isBearish || isExtremeFear) {
    think(`Market is ${isBearish ? 'bearish' : 'in extreme fear'} (FGI: ${fearGreed}).`);
    think('Large whale movements could signal further sell pressure or capitulation.');
    think('Whale alerts cost 0.005 STX — critical for risk management in bearish conditions.');
    decide('BUYING whale-alerts: bearish/fear conditions require whale monitoring');
    shouldCheckWhales = true;
  } else if (isExtremeGreed) {
    think(`Market is in extreme greed (FGI: ${fearGreed}).`);
    think('Smart money often exits during extreme greed — whales may be distributing.');
    think('Whale alerts cost 0.005 STX — worth checking for distribution signals.');
    decide('BUYING whale-alerts: extreme greed requires distribution monitoring');
    shouldCheckWhales = true;
  } else {
    think(`Market conditions are moderate (FGI: ${fearGreed}, trend: ${sentiment.market_trend}).`);
    think('No extreme conditions detected. Whale monitoring has lower priority.');
    decide('SKIPPING whale-alerts: moderate conditions, saving 0.005 STX');
    decisions.push({
      step: 2,
      action: 'SKIP whale-alerts',
      reasoning: `Moderate market (FGI: ${fearGreed}) — no urgent need for whale data`,
      cost_stx: 0,
      result: 'Saved 0.005 STX',
    });
  }

  if (shouldCheckWhales) {
    try {
      act('Sending x402 payment for whale-alerts...');
      const whaleRes = await api.get('/feeds/whale-alerts');
      totalSpent += 0.005;
      whaleData = whaleRes.data.data;

      const payment = decodePaymentResponse(whaleRes.headers['payment-response']);
      log(`✓ Payment confirmed: ${payment?.transaction?.slice(0, 16)}...`);
      log(`  Alerts: ${whaleData.alerts.length} whale movements detected`);
      log(`  Total Volume: ${whaleData.summary.total_volume_btc.toLocaleString()} BTC`);
      log(`  BTC Price Used: $${whaleData.btc_price_usd?.toLocaleString() || 'N/A'}`);

      // Analyze whale behavior
      const extremeAlerts = whaleData.alerts.filter((a: any) => a.significance === 'extreme');
      const exchangeInflows = whaleData.alerts.filter((a: any) => a.type === 'exchange_inflow');
      const exchangeOutflows = whaleData.alerts.filter((a: any) => a.type === 'exchange_outflow');

      log(`  Extreme alerts: ${extremeAlerts.length}`);
      log(`  Exchange inflows: ${exchangeInflows.length} (sell pressure)`);
      log(`  Exchange outflows: ${exchangeOutflows.length} (accumulation)`);

      const netFlow = exchangeInflows.length - exchangeOutflows.length;
      const flowSignal = netFlow > 0 ? 'NET INFLOW (bearish)' : netFlow < 0 ? 'NET OUTFLOW (bullish)' : 'BALANCED';
      log(`  Signal: ${flowSignal}`);

      decisions.push({
        step: 2,
        action: 'BUY whale-alerts',
        reasoning: isBearish ? 'Bearish market requires whale monitoring' : 'Extreme greed requires distribution check',
        cost_stx: 0.005,
        result: `${whaleData.alerts.length} alerts, ${whaleData.summary.total_volume_btc} BTC vol, ${flowSignal}`,
      });
    } catch (err: any) {
      console.error(`  ✗ Failed: ${err.message}`);
    }
  }

  console.log();

  // ========================================
  // STEP 3: Conditional DeFi Analysis
  // ========================================
  console.log('━'.repeat(60));
  console.log('  STEP 3: DeFi Opportunity Scan (Conditional)');
  console.log('━'.repeat(60));

  let defiData: any = null;
  let shouldCheckDefi = false;

  const hasExtremeWhales = whaleData && whaleData.alerts.some((a: any) => a.significance === 'extreme');
  const volumeHigh = whaleData && whaleData.summary.total_volume_btc > 5000;

  if (isExtremeFear) {
    think('Extreme fear often creates buying opportunities in DeFi.');
    think('Need to identify which protocols are undervalued relative to their fundamentals.');
    decide('BUYING defi-scores: looking for fear-driven opportunities');
    shouldCheckDefi = true;
  } else if (hasExtremeWhales || volumeHigh) {
    think(`Extreme whale activity detected (${whaleData?.summary.total_volume_btc} BTC volume).`);
    think('Large movements may impact DeFi protocols. Need to assess risk exposure.');
    decide('BUYING defi-scores: whale activity may impact DeFi TVL');
    shouldCheckDefi = true;
  } else if (isExtremeGreed) {
    think('Extreme greed — may want to rotate from risky DeFi to safer protocols.');
    decide('BUYING defi-scores: need to identify safer allocations');
    shouldCheckDefi = true;
  } else {
    think('No triggers for DeFi analysis at this time.');
    decide('SKIPPING defi-scores: no urgent catalyst, saving 0.01 STX');
    decisions.push({
      step: 3,
      action: 'SKIP defi-scores',
      reasoning: 'No extreme conditions or whale signals',
      cost_stx: 0,
      result: 'Saved 0.01 STX',
    });
  }

  if (shouldCheckDefi) {
    try {
      act('Sending x402 payment for defi-scores...');
      const defiRes = await api.get('/feeds/defi-scores');
      totalSpent += 0.01;
      defiData = defiRes.data.data;

      const payment = decodePaymentResponse(defiRes.headers['payment-response']);
      log(`✓ Payment confirmed: ${payment?.transaction?.slice(0, 16)}...`);
      log(`  Protocols analyzed: ${defiData.protocols.length}`);
      log(`  Data Source: ${defiData.data_source}`);

      // Find best opportunities
      const strongBuys = defiData.protocols.filter((p: any) => p.recommendation === 'strong_buy');
      const favorable = defiData.protocols.filter((p: any) => p.recommendation === 'favorable');
      const cautions = defiData.protocols.filter((p: any) => p.recommendation === 'caution' || p.recommendation === 'strong_avoid');

      log(`  Strong Buy: ${strongBuys.length} protocols`);
      log(`  Favorable: ${favorable.length} protocols`);
      log(`  Caution/Avoid: ${cautions.length} protocols`);

      const top3 = defiData.protocols.slice(0, 3);
      log('  Top 3:');
      for (const p of top3) {
        const tvlStr = p.tvl_usd >= 1e9 ? `$${(p.tvl_usd / 1e9).toFixed(1)}B` : `$${(p.tvl_usd / 1e6).toFixed(0)}M`;
        log(`    ${p.protocol} (${p.chain}): ${p.composite_score}/100 [${p.recommendation}] TVL: ${tvlStr}`);
      }

      decisions.push({
        step: 3,
        action: 'BUY defi-scores',
        reasoning: isExtremeFear ? 'Fear-driven opportunity scan' : 'Whale impact assessment',
        cost_stx: 0.01,
        result: `${defiData.protocols.length} protocols, ${strongBuys.length} strong_buy, top: ${top3[0]?.protocol}`,
      });
    } catch (err: any) {
      console.error(`  ✗ Failed: ${err.message}`);
    }
  }

  console.log();

  // ========================================
  // STEP 4: Generate Investment Thesis
  // ========================================
  console.log('━'.repeat(60));
  console.log('  STEP 4: Investment Thesis Generation');
  console.log('━'.repeat(60));

  think('Synthesizing all purchased data into actionable intelligence...');
  console.log();

  // Build thesis based on all collected data
  let thesis = '';
  let riskLevel = '';
  let recommendation = '';

  if (isExtremeFear && whaleData) {
    const outflows = whaleData.alerts.filter((a: any) => a.type === 'exchange_outflow').length;
    if (outflows > whaleData.alerts.filter((a: any) => a.type === 'exchange_inflow').length) {
      thesis = 'CONTRARIAN BUY SIGNAL: Extreme fear + whale accumulation (net outflows from exchanges).';
      riskLevel = 'MODERATE-HIGH';
      recommendation = 'Accumulate BTC and high-score DeFi protocols on dips.';
    } else {
      thesis = 'CAPITULATION WARNING: Extreme fear + whales moving to exchanges (sell pressure).';
      riskLevel = 'HIGH';
      recommendation = 'Reduce exposure, move to stablecoins, wait for capitulation bottom.';
    }
  } else if (isExtremeGreed) {
    thesis = 'DISTRIBUTION WARNING: Extreme greed historically precedes corrections.';
    riskLevel = 'HIGH';
    recommendation = 'Take profits on risky positions, rotate to safer DeFi protocols.';
  } else if (isBearish) {
    thesis = `BEARISH TREND: Market trending down (BTC ${sentiment.btc_24h_change}% 24h).`;
    riskLevel = 'MODERATE-HIGH';
    recommendation = 'Defensive positioning. Monitor whale flows for reversal signals.';
  } else {
    thesis = 'NEUTRAL MARKET: No extreme conditions detected.';
    riskLevel = 'LOW-MODERATE';
    recommendation = 'Maintain current positions. Re-evaluate if conditions change.';
  }

  if (defiData) {
    const topProtocol = defiData.protocols[0];
    recommendation += ` Top DeFi opportunity: ${topProtocol.protocol} (score: ${topProtocol.composite_score}/100).`;
  }

  log(`  THESIS: ${thesis}`);
  log(`  RISK LEVEL: ${riskLevel}`);
  log(`  RECOMMENDATION: ${recommendation}`);

  decisions.push({
    step: 4,
    action: 'GENERATE thesis',
    reasoning: 'Synthesis of all purchased data',
    cost_stx: 0,
    result: thesis,
  });

  // ========================================
  // FINAL SUMMARY
  // ========================================
  console.log();
  console.log('━'.repeat(60));
  console.log('  AGENT REASONING CHAIN');
  console.log('━'.repeat(60));

  for (const d of decisions) {
    const cost = d.cost_stx > 0 ? `\x1b[33m-${d.cost_stx} STX\x1b[0m` : '\x1b[32mFREE\x1b[0m';
    console.log(`  Step ${d.step}: ${d.action} [${cost}]`);
    console.log(`    Why: ${d.reasoning}`);
    console.log(`    Result: ${d.result}`);
    console.log();
  }

  const queriesBought = decisions.filter(d => d.cost_stx > 0).length;
  const queriesSkipped = decisions.filter(d => d.action.startsWith('SKIP')).length;

  console.log('━'.repeat(60));
  console.log('  COST ANALYSIS');
  console.log('━'.repeat(60));
  console.log(`  Data feeds purchased: ${queriesBought}/3`);
  console.log(`  Data feeds skipped:   ${queriesSkipped}/3 (agent decided not needed)`);
  console.log(`  Total spent:          ${totalSpent} STX`);
  console.log(`  Max possible spend:   0.018 STX (if bought all 3)`);
  console.log(`  Savings from AI:      ${(0.018 - totalSpent).toFixed(3)} STX (${Math.round((1 - totalSpent / 0.018) * 100)}%)`);
  console.log(`  vs CoinGecko Pro:     $129/month (${Math.round(129 / totalSpent).toLocaleString()}x more expensive)`);
  console.log();
  console.log(`  The agent autonomously decided WHICH data to buy based on`);
  console.log(`  market conditions — not all data is needed all the time.`);
  console.log(`  This is the power of x402: pay only for what you need.`);
  console.log();
  console.log('━'.repeat(60));
}

main().catch((err) => {
  console.error('\nAgent crashed:', err.message);
  process.exit(1);
});
