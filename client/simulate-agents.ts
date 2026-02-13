import 'dotenv/config';
import axios from 'axios';
import { generateKeypair } from 'x402-stacks';

const SHADOWFEED_URL = process.env.SHADOWFEED_URL || 'http://localhost:4002';
const NETWORK = (process.env.NETWORK || 'testnet') as 'testnet' | 'mainnet';

// ============================================
// Agent Profiles — 10 different AI agents
// ============================================

interface AgentProfile {
  name: string;
  type: string;
  description: string;
  feeds: string[];        // which feeds this agent queries
  queryInterval: number;  // ms between queries
  queriesPerRound: number;
  address?: string;
}

const AGENT_PROFILES: AgentProfile[] = [
  {
    name: 'AlphaBot-1',
    type: 'Trading Agent',
    description: 'High-frequency trading bot that needs whale + sentiment data for every trade decision',
    feeds: ['whale-alerts', 'btc-sentiment'],
    queryInterval: 800,
    queriesPerRound: 6,
  },
  {
    name: 'DeepResearch-AI',
    type: 'Research Agent',
    description: 'Analyzes DeFi protocols before recommending investments to users',
    feeds: ['defi-scores', 'btc-sentiment'],
    queryInterval: 1500,
    queriesPerRound: 4,
  },
  {
    name: 'WhaleWatcher-3',
    type: 'Alert Agent',
    description: 'Monitors whale movements and triggers notifications for portfolio managers',
    feeds: ['whale-alerts'],
    queryInterval: 600,
    queriesPerRound: 8,
  },
  {
    name: 'SentimentScanner',
    type: 'Social Intelligence',
    description: 'Continuously scans social sentiment to build market mood indicators',
    feeds: ['btc-sentiment'],
    queryInterval: 1000,
    queriesPerRound: 5,
  },
  {
    name: 'PortfolioGuard',
    type: 'Risk Manager',
    description: 'Evaluates DeFi exposure risks and suggests rebalancing actions',
    feeds: ['defi-scores', 'whale-alerts'],
    queryInterval: 2000,
    queriesPerRound: 3,
  },
  {
    name: 'MEV-Hunter-7',
    type: 'MEV Bot',
    description: 'Tracks whale movements to front-run large trades on DEXs',
    feeds: ['whale-alerts', 'btc-sentiment', 'defi-scores'],
    queryInterval: 500,
    queriesPerRound: 7,
  },
  {
    name: 'YieldFarmer-AI',
    type: 'DeFi Agent',
    description: 'Automatically moves liquidity to highest-yield protocols based on scores',
    feeds: ['defi-scores'],
    queryInterval: 3000,
    queriesPerRound: 2,
  },
  {
    name: 'NewsDigest-Bot',
    type: 'Content Agent',
    description: 'Aggregates sentiment and whale data to generate daily market summaries',
    feeds: ['btc-sentiment', 'whale-alerts'],
    queryInterval: 1200,
    queriesPerRound: 4,
  },
  {
    name: 'Arbitrage-X9',
    type: 'Arbitrage Bot',
    description: 'Uses whale data to predict price impact and execute cross-exchange arbitrage',
    feeds: ['whale-alerts', 'defi-scores'],
    queryInterval: 700,
    queriesPerRound: 6,
  },
  {
    name: 'DAO-Advisor',
    type: 'Governance Agent',
    description: 'Analyzes protocol health scores to vote on DAO governance proposals',
    feeds: ['defi-scores', 'btc-sentiment'],
    queryInterval: 4000,
    queriesPerRound: 2,
  },
];

// ============================================
// Colors & Formatting
// ============================================

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

const AGENT_COLORS = [
  COLORS.cyan, COLORS.magenta, COLORS.yellow, COLORS.blue, COLORS.green,
  COLORS.red, COLORS.cyan, COLORS.magenta, COLORS.yellow, COLORS.blue,
];

function log(agentIdx: number, agent: AgentProfile, msg: string) {
  const color = AGENT_COLORS[agentIdx % AGENT_COLORS.length];
  const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  console.log(`  ${COLORS.dim}${time}${COLORS.reset}  ${color}[${agent.name.padEnd(18)}]${COLORS.reset}  ${msg}`);
}

// ============================================
// Simulation Engine
// ============================================

const feedPrices: Record<string, number> = {
  'whale-alerts': 0.005,
  'btc-sentiment': 0.003,
  'defi-scores': 0.01,
};

interface SimStats {
  totalQueries: number;
  totalSpent: number;
  perAgent: Map<string, { queries: number; spent: number; errors: number }>;
  perFeed: Map<string, number>;
  startTime: number;
}

const stats: SimStats = {
  totalQueries: 0,
  totalSpent: 0,
  perAgent: new Map(),
  perFeed: new Map(),
  startTime: Date.now(),
};

async function queryFeed(agentIdx: number, agent: AgentProfile, feedId: string): Promise<boolean> {
  const url = `${SHADOWFEED_URL}/demo/feeds/${feedId}`;
  const start = Date.now();

  try {
    const res = await axios.get(url, {
      headers: { 'x-agent-address': agent.address || agent.name },
      timeout: 10000,
    });

    const elapsed = Date.now() - start;
    const price = feedPrices[feedId] || 0;

    stats.totalQueries++;
    stats.totalSpent += price;
    stats.perFeed.set(feedId, (stats.perFeed.get(feedId) || 0) + 1);

    const agentStats = stats.perAgent.get(agent.name) || { queries: 0, spent: 0, errors: 0 };
    agentStats.queries++;
    agentStats.spent += price;
    stats.perAgent.set(agent.name, agentStats);

    // Show different info based on feed type
    let detail = '';
    if (feedId === 'whale-alerts') {
      const alerts = res.data.data?.alerts?.length || 0;
      const vol = res.data.data?.summary?.total_volume_btc || 0;
      detail = `${alerts} alerts, ${vol} BTC volume`;
    } else if (feedId === 'btc-sentiment') {
      const score = res.data.data?.overall_score || 0;
      const label = res.data.data?.overall_label || '?';
      detail = `score: ${score} (${label})`;
    } else if (feedId === 'defi-scores') {
      const top = res.data.data?.protocols?.[0];
      detail = top ? `top: ${top.protocol} (${top.composite_score}/100)` : 'parsed';
    }

    log(agentIdx, agent, `${COLORS.green}PAID${COLORS.reset} ${feedId} ${COLORS.dim}→${COLORS.reset} ${detail} ${COLORS.dim}[${elapsed}ms, ${price} STX]${COLORS.reset}`);
    return true;
  } catch (err: any) {
    const agentStats = stats.perAgent.get(agent.name) || { queries: 0, spent: 0, errors: 0 };
    agentStats.errors++;
    stats.perAgent.set(agent.name, agentStats);

    log(agentIdx, agent, `${COLORS.red}FAIL${COLORS.reset} ${feedId} → ${err.message}`);
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runAgent(agentIdx: number, agent: AgentProfile): Promise<void> {
  // Stagger agent start
  await sleep(agentIdx * 300);

  log(agentIdx, agent, `${COLORS.bright}ONLINE${COLORS.reset} — ${agent.type} | ${agent.description}`);
  log(agentIdx, agent, `${COLORS.dim}Feeds: [${agent.feeds.join(', ')}] | ${agent.queriesPerRound} queries/round${COLORS.reset}`);

  // Discovery phase
  await sleep(200);
  try {
    const registry = await axios.get(`${SHADOWFEED_URL}/registry/feeds`);
    log(agentIdx, agent, `${COLORS.cyan}DISCOVER${COLORS.reset} Found ${registry.data.feeds.length} feeds from provider`);
  } catch {
    log(agentIdx, agent, `${COLORS.red}DISCOVER FAILED${COLORS.reset} — server unreachable`);
    return;
  }

  // Query rounds
  for (let round = 0; round < agent.queriesPerRound; round++) {
    const feedId = agent.feeds[round % agent.feeds.length];
    await queryFeed(agentIdx, agent, feedId);
    await sleep(agent.queryInterval + Math.random() * 500);
  }

  const agentStats = stats.perAgent.get(agent.name);
  log(agentIdx, agent, `${COLORS.bright}DONE${COLORS.reset} — ${agentStats?.queries || 0} queries, ${(agentStats?.spent || 0).toFixed(3)} STX spent`);
}

function printSummary() {
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);

  console.log('\n');
  console.log(`  ${'='.repeat(72)}`);
  console.log(`  ${COLORS.bright}${COLORS.white}SIMULATION SUMMARY${COLORS.reset}`);
  console.log(`  ${'='.repeat(72)}`);
  console.log(`  Duration: ${elapsed}s | Total Queries: ${stats.totalQueries} | Total Spent: ${stats.totalSpent.toFixed(3)} STX`);
  console.log();

  // Per agent table
  console.log(`  ${COLORS.bright}Agent                  Type                  Queries   Spent (STX)   Errors${COLORS.reset}`);
  console.log(`  ${'-'.repeat(72)}`);

  for (const agent of AGENT_PROFILES) {
    const s = stats.perAgent.get(agent.name);
    if (!s) continue;
    const name = agent.name.padEnd(22);
    const type = agent.type.padEnd(22);
    const queries = String(s.queries).padStart(5);
    const spent = s.spent.toFixed(3).padStart(11);
    const errors = String(s.errors).padStart(6);
    const color = s.errors > 0 ? COLORS.red : COLORS.green;
    console.log(`  ${name}${type}${queries}${spent}${color}${errors}${COLORS.reset}`);
  }

  console.log();

  // Per feed table
  console.log(`  ${COLORS.bright}Feed                  Queries   Revenue (STX)${COLORS.reset}`);
  console.log(`  ${'-'.repeat(48)}`);

  for (const [feedId, count] of stats.perFeed) {
    const price = feedPrices[feedId] || 0;
    const revenue = count * price;
    console.log(`  ${feedId.padEnd(22)}${String(count).padStart(5)}   ${revenue.toFixed(3).padStart(12)}`);
  }

  const providerRevenue = stats.totalSpent * 0.95;
  const protocolFee = stats.totalSpent * 0.05;

  console.log();
  console.log(`  ${'-'.repeat(48)}`);
  console.log(`  ${COLORS.bright}Gross Volume:${COLORS.reset}              ${stats.totalSpent.toFixed(3)} STX`);
  console.log(`  ${COLORS.green}Provider Revenue (95%):${COLORS.reset}    ${providerRevenue.toFixed(3)} STX`);
  console.log(`  ${COLORS.yellow}Protocol Fee (5%):${COLORS.reset}         ${protocolFee.toFixed(3)} STX`);
  console.log();
  console.log(`  ${COLORS.dim}vs Traditional API: 10 agents x $129/mo CoinGecko = $1,290/month${COLORS.reset}`);
  console.log(`  ${COLORS.dim}ShadowFeed equivalent: ~${stats.totalSpent.toFixed(3)} STX (~$${(stats.totalSpent * 0.8).toFixed(2)})${COLORS.reset}`);
  console.log(`  ${'='.repeat(72)}\n`);
}

// ============================================
// Main — Run all 10 agents
// ============================================

async function main() {
  console.log('\n');
  console.log(`  ${'='.repeat(72)}`);
  console.log(`  ${COLORS.bright}${COLORS.white}  ShadowFeed Multi-Agent Simulation${COLORS.reset}`);
  console.log(`  ${COLORS.dim}  10 AI agents autonomously discovering and purchasing data feeds${COLORS.reset}`);
  console.log(`  ${'='.repeat(72)}`);
  console.log();
  console.log(`  ${COLORS.dim}Server:${COLORS.reset}  ${SHADOWFEED_URL}`);
  console.log(`  ${COLORS.dim}Network:${COLORS.reset} ${NETWORK}`);
  console.log(`  ${COLORS.dim}Agents:${COLORS.reset}  ${AGENT_PROFILES.length}`);
  console.log(`  ${COLORS.dim}Mode:${COLORS.reset}    Demo (simulated x402 payments)`);
  console.log();

  // Generate wallets for each agent
  console.log(`  ${COLORS.bright}Generating agent wallets...${COLORS.reset}`);
  for (const agent of AGENT_PROFILES) {
    const kp = generateKeypair(NETWORK);
    agent.address = kp.address;
  }
  console.log(`  ${COLORS.green}${AGENT_PROFILES.length} wallets generated${COLORS.reset}\n`);

  // Check server is running
  try {
    await axios.get(`${SHADOWFEED_URL}/health`, { timeout: 3000 });
    console.log(`  ${COLORS.green}Server is online${COLORS.reset}\n`);
  } catch {
    console.error(`  ${COLORS.red}ERROR: Server not reachable at ${SHADOWFEED_URL}${COLORS.reset}`);
    console.error(`  ${COLORS.dim}Start the server first: DEMO_MODE=true npm run dev${COLORS.reset}\n`);
    process.exit(1);
  }

  console.log(`  ${'-'.repeat(72)}`);
  console.log(`  ${COLORS.bright}PHASE 1: Agent Initialization & Discovery${COLORS.reset}`);
  console.log(`  ${'-'.repeat(72)}\n`);

  // Phase 1: Staggered agent start (parallel but staggered)
  const agentPromises = AGENT_PROFILES.map((agent, idx) => runAgent(idx, agent));

  // Wait for all agents to complete
  await Promise.all(agentPromises);

  // Print summary
  printSummary();

  // Show live stats from server
  console.log(`  ${COLORS.bright}Fetching live server stats...${COLORS.reset}\n`);
  try {
    const statsRes = await axios.get(`${SHADOWFEED_URL}/stats`);
    const s = statsRes.data;
    console.log(`  ${COLORS.bright}Provider Reputation:${COLORS.reset}`);
    console.log(`    Score:   ${s.reputation_score}/100 (${s.tier})`);
    console.log(`    Queries: ${s.total_queries_served}`);
    console.log(`    Uptime:  ${s.uptime_percent.toFixed(1)}%`);
    console.log();
    console.log(`  ${COLORS.bright}Feed Breakdown:${COLORS.reset}`);
    for (const f of s.feed_breakdown) {
      console.log(`    ${f.feed_id.padEnd(20)} ${f.queries} queries  ${f.avg_response_ms}ms avg`);
    }
  } catch {}

  console.log(`\n  ${COLORS.bright}${COLORS.green}Simulation complete!${COLORS.reset}`);
  console.log(`  ${COLORS.dim}Open http://localhost:4002 to see updated stats on the dashboard.${COLORS.reset}\n`);
}

main().catch(console.error);
