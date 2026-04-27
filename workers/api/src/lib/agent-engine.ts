// Agent execution engine — runs scheduled agents, fetches feed data,
// evaluates triggers, and dispatches webhooks.
//
// Called from the Worker's scheduled() handler every minute. We keep this
// pure-data for testability: the engine consumes a feed-generator function
// and a webhook-delivery function so we can swap them in tests.

import type { Env } from '../types';
import type { AgentRow } from './agents-repo';
import { recordAgentRun } from './agents-repo';
import { TEMPLATES, TRIGGERS, type TemplateId } from './agent-templates';

// Minimal cron parser — supports the small subset we generate from
// templates: '* * * * *', '*/N * * * *', and '0 */N * * *', plus
// 'M H * * *' literal minute/hour. We don't need full cron grammar.
export function cronMatches(cron: string, date: Date): boolean {
  const parts = cron.split(/\s+/);
  if (parts.length !== 5) return false;
  const [m, h] = parts;
  const minute = date.getUTCMinutes();
  const hour = date.getUTCHours();
  return cronFieldMatches(m, minute, 0, 59) && cronFieldMatches(h, hour, 0, 23);
}

function cronFieldMatches(spec: string, value: number, min: number, max: number): boolean {
  if (spec === '*') return true;
  if (spec.startsWith('*/')) {
    const step = parseInt(spec.slice(2), 10);
    return Number.isFinite(step) && step > 0 && value % step === 0;
  }
  if (spec.includes(',')) {
    return spec.split(',').some(part => cronFieldMatches(part, value, min, max));
  }
  if (spec.includes('-')) {
    const [a, b] = spec.split('-').map(s => parseInt(s, 10));
    return value >= a && value <= b;
  }
  const n = parseInt(spec, 10);
  return Number.isFinite(n) && n === value;
}

export interface ExecuteOpts {
  readonly env: Env;
  readonly fetchFeed: (feedId: string) => Promise<unknown>;
  readonly deliverWebhook: (url: string, body: unknown) => Promise<{ status: number }>;
}

export interface AgentRunOutcome {
  readonly agent_id: string;
  readonly status: 'success' | 'failed' | 'condition_not_met' | 'insufficient_funds';
  readonly queries_made: number;
  readonly spent_microstx: number;
  readonly triggered: boolean;
  readonly webhook_called: boolean;
  readonly webhook_status: number | null;
  readonly error_message: string | null;
  readonly trigger_snapshot: Record<string, unknown> | null;
}

// Execute a single agent. Always records a run row for audit trail.
export async function executeAgent(agent: AgentRow, opts: ExecuteOpts): Promise<AgentRunOutcome> {
  const startedAt = Math.floor(Date.now() / 1000);
  const template = TEMPLATES[agent.template_type as TemplateId];

  // Defensive defaults if template was deleted/renamed
  if (!template) {
    const outcome: AgentRunOutcome = {
      agent_id: agent.id,
      status: 'failed',
      queries_made: 0,
      spent_microstx: 0,
      triggered: false,
      webhook_called: false,
      webhook_status: null,
      error_message: `Unknown template: ${agent.template_type}`,
      trigger_snapshot: null,
    };
    await recordAgentRun(opts.env.DB, { ...outcome, started_at: startedAt });
    return outcome;
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(agent.config_json);
  } catch {
    config = {};
  }

  // Fetch all feeds the template needs. Phase 1: bypass payment by using
  // the internal feed-generator (we own this agent so we don't pay ourselves).
  // Phase 2 will support buying via x402 with the agent's own wallet for
  // external providers.
  const feedData: Record<string, unknown> = {};
  let queriesMade = 0;
  for (const feedId of template.feeds) {
    try {
      feedData[feedId] = await opts.fetchFeed(feedId);
      queriesMade++;
    } catch (err: any) {
      const outcome: AgentRunOutcome = {
        agent_id: agent.id,
        status: 'failed',
        queries_made: queriesMade,
        spent_microstx: 0,
        triggered: false,
        webhook_called: false,
        webhook_status: null,
        error_message: `Feed ${feedId} fetch failed: ${err?.message ?? String(err)}`,
        trigger_snapshot: null,
      };
      await recordAgentRun(opts.env.DB, { ...outcome, started_at: startedAt });
      return outcome;
    }
  }

  // Evaluate trigger. Single-feed templates pass the unwrapped data; multi-feed
  // templates receive the keyed dictionary so the trigger can read both.
  const triggerInput =
    template.feeds.length === 1
      ? (feedData[template.feeds[0]] as Record<string, any>)
      : (feedData as Record<string, any>);

  const evaluator = TRIGGERS[agent.template_type as TemplateId];
  let triggerResult = null as ReturnType<typeof evaluator>;
  try {
    triggerResult = evaluator(triggerInput, config);
  } catch (err: any) {
    const outcome: AgentRunOutcome = {
      agent_id: agent.id,
      status: 'failed',
      queries_made: queriesMade,
      spent_microstx: 0,
      triggered: false,
      webhook_called: false,
      webhook_status: null,
      error_message: `Trigger eval failed: ${err?.message ?? String(err)}`,
      trigger_snapshot: null,
    };
    await recordAgentRun(opts.env.DB, { ...outcome, started_at: startedAt });
    return outcome;
  }

  if (!triggerResult) {
    const outcome: AgentRunOutcome = {
      agent_id: agent.id,
      status: 'condition_not_met',
      queries_made: queriesMade,
      spent_microstx: 0,
      triggered: false,
      webhook_called: false,
      webhook_status: null,
      error_message: null,
      trigger_snapshot: null,
    };
    await recordAgentRun(opts.env.DB, { ...outcome, started_at: startedAt });
    return outcome;
  }

  // Trigger fired — deliver webhook if configured.
  let webhookCalled = false;
  let webhookStatus: number | null = null;
  let webhookErr: string | null = null;
  if (agent.webhook_url) {
    try {
      const result = await opts.deliverWebhook(agent.webhook_url, {
        agent_id: agent.id,
        agent_name: agent.name,
        template: agent.template_type,
        triggered_at: Math.floor(Date.now() / 1000),
        reason: triggerResult.reason,
        payload: triggerResult.payload,
        snapshot: feedData,
      });
      webhookCalled = true;
      webhookStatus = result.status;
    } catch (err: any) {
      webhookErr = `Webhook delivery failed: ${err?.message ?? String(err)}`;
    }
  }

  const outcome: AgentRunOutcome = {
    agent_id: agent.id,
    status: 'success',
    queries_made: queriesMade,
    spent_microstx: 0, // Phase 1: free internal fetches; Phase 2 will track x402 spend
    triggered: true,
    webhook_called: webhookCalled,
    webhook_status: webhookStatus,
    error_message: webhookErr,
    trigger_snapshot: { reason: triggerResult.reason, ...triggerResult.payload },
  };
  await recordAgentRun(opts.env.DB, { ...outcome, started_at: startedAt });
  return outcome;
}

// Default webhook delivery — POST JSON, 5s timeout, returns status.
// Called via opts.deliverWebhook so tests can mock it.
export async function defaultWebhookDelivery(url: string, body: unknown): Promise<{ status: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'shadowfeed-agent/1.0' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return { status: res.status };
  } finally {
    clearTimeout(timeoutId);
  }
}
