// Repository layer for the agent platform — all D1 queries are here so the
// route handlers and the cron engine can share consistent shapes.

import { newUuid, randomNonce } from './crypto';
import type { TemplateId } from './agent-templates';

export interface AgentRow {
  readonly id: string;
  readonly user_id: string;
  readonly name: string;
  readonly description: string | null;
  readonly template_type: TemplateId;
  readonly config_json: string;
  readonly agent_wallet_address: string;
  readonly agent_wallet_encrypted_key: string;
  readonly agent_wallet_iv: string;
  readonly schedule_cron: string;
  readonly active: number;
  readonly webhook_url: string | null;
  readonly is_public: number;
  readonly public_slug: string | null;
  readonly total_runs: number;
  readonly total_queries: number;
  readonly total_triggered: number;
  readonly total_spent_microstx: number;
  readonly last_run_at: number | null;
  readonly created_at: number;
}

export interface AgentRunRow {
  readonly id: number;
  readonly agent_id: string;
  readonly started_at: number;
  readonly completed_at: number | null;
  readonly status: string;
  readonly queries_made: number;
  readonly spent_microstx: number;
  readonly triggered: number;
  readonly webhook_called: number;
  readonly webhook_status: number | null;
  readonly error_message: string | null;
  readonly trigger_snapshot: string | null;
}

export interface CreateAgentInput {
  readonly user_id: string;
  readonly name: string;
  readonly description?: string;
  readonly template_type: TemplateId;
  readonly config: Record<string, unknown>;
  readonly schedule_cron: string;
  readonly webhook_url?: string;
  readonly is_public?: boolean;
  readonly wallet_address: string;
  readonly wallet_encrypted_key: string;
  readonly wallet_iv: string;
}

export async function insertAgent(db: D1Database, input: CreateAgentInput): Promise<AgentRow> {
  const id = newUuid();
  const slug = input.is_public ? randomNonce(8).toLowerCase() : null;
  const now = Math.floor(Date.now() / 1000);

  await db
    .prepare(`
      INSERT INTO agents (
        id, user_id, name, description, template_type, config_json,
        agent_wallet_address, agent_wallet_encrypted_key, agent_wallet_iv,
        schedule_cron, active, webhook_url, is_public, public_slug,
        total_runs, total_queries, total_triggered, total_spent_microstx,
        last_run_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 0, 0, 0, 0, NULL, ?)
    `)
    .bind(
      id,
      input.user_id,
      input.name,
      input.description ?? null,
      input.template_type,
      JSON.stringify(input.config),
      input.wallet_address,
      input.wallet_encrypted_key,
      input.wallet_iv,
      input.schedule_cron,
      input.webhook_url ?? null,
      input.is_public ? 1 : 0,
      slug,
      now,
    )
    .run();

  const row = await getAgentById(db, id);
  if (!row) throw new Error('Inserted agent disappeared');
  return row;
}

export async function getAgentById(db: D1Database, id: string): Promise<AgentRow | null> {
  return db.prepare('SELECT * FROM agents WHERE id = ?').bind(id).first<AgentRow>();
}

export async function getAgentBySlug(db: D1Database, slug: string): Promise<AgentRow | null> {
  return db.prepare('SELECT * FROM agents WHERE public_slug = ? AND is_public = 1').bind(slug).first<AgentRow>();
}

export async function listAgentsForUser(db: D1Database, userId: string): Promise<readonly AgentRow[]> {
  const res = await db
    .prepare('SELECT * FROM agents WHERE user_id = ? ORDER BY created_at DESC LIMIT 200')
    .bind(userId)
    .all<AgentRow>();
  return res.results || [];
}

export async function listPublicAgents(
  db: D1Database,
  opts: { limit?: number; template?: string } = {},
): Promise<readonly AgentRow[]> {
  const limit = Math.min(opts.limit ?? 50, 100);
  if (opts.template) {
    const res = await db
      .prepare('SELECT * FROM agents WHERE is_public = 1 AND template_type = ? ORDER BY total_runs DESC LIMIT ?')
      .bind(opts.template, limit)
      .all<AgentRow>();
    return res.results || [];
  }
  const res = await db
    .prepare('SELECT * FROM agents WHERE is_public = 1 ORDER BY total_runs DESC LIMIT ?')
    .bind(limit)
    .all<AgentRow>();
  return res.results || [];
}

export interface UpdateAgentInput {
  readonly name?: string;
  readonly description?: string | null;
  readonly config?: Record<string, unknown>;
  readonly schedule_cron?: string;
  readonly webhook_url?: string | null;
  readonly active?: boolean;
  readonly is_public?: boolean;
}

export async function updateAgent(db: D1Database, agentId: string, userId: string, input: UpdateAgentInput): Promise<AgentRow | null> {
  // Only allow user to update their own agents.
  const owned = await db
    .prepare('SELECT id, public_slug, is_public FROM agents WHERE id = ? AND user_id = ?')
    .bind(agentId, userId)
    .first<{ id: string; public_slug: string | null; is_public: number }>();
  if (!owned) return null;

  const updates: string[] = [];
  const params: unknown[] = [];
  if (input.name !== undefined) { updates.push('name = ?'); params.push(input.name); }
  if (input.description !== undefined) { updates.push('description = ?'); params.push(input.description); }
  if (input.config !== undefined) { updates.push('config_json = ?'); params.push(JSON.stringify(input.config)); }
  if (input.schedule_cron !== undefined) { updates.push('schedule_cron = ?'); params.push(input.schedule_cron); }
  if (input.webhook_url !== undefined) { updates.push('webhook_url = ?'); params.push(input.webhook_url); }
  if (input.active !== undefined) { updates.push('active = ?'); params.push(input.active ? 1 : 0); }
  if (input.is_public !== undefined) {
    updates.push('is_public = ?');
    params.push(input.is_public ? 1 : 0);
    // Generate slug on first publish; preserve existing slug otherwise.
    if (input.is_public && !owned.public_slug) {
      updates.push('public_slug = ?');
      params.push(randomNonce(8).toLowerCase());
    }
  }
  if (updates.length === 0) return getAgentById(db, agentId);

  params.push(agentId);
  await db
    .prepare(`UPDATE agents SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();
  return getAgentById(db, agentId);
}

export async function deleteAgent(db: D1Database, agentId: string, userId: string): Promise<boolean> {
  const res = await db
    .prepare('DELETE FROM agents WHERE id = ? AND user_id = ?')
    .bind(agentId, userId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

export async function listAgentRuns(db: D1Database, agentId: string, limit = 50): Promise<readonly AgentRunRow[]> {
  const res = await db
    .prepare('SELECT * FROM agent_runs WHERE agent_id = ? ORDER BY started_at DESC LIMIT ?')
    .bind(agentId, Math.min(limit, 200))
    .all<AgentRunRow>();
  return res.results || [];
}

// Find agents whose cron spec matches the given timestamp (minute precision).
// We over-fetch to JS and filter cron there because D1 has no cron parsing.
export async function findActiveAgents(db: D1Database, limit = 500): Promise<readonly AgentRow[]> {
  const res = await db
    .prepare('SELECT * FROM agents WHERE active = 1 ORDER BY last_run_at ASC NULLS FIRST LIMIT ?')
    .bind(limit)
    .all<AgentRow>();
  return res.results || [];
}

export interface RunRecordInput {
  readonly agent_id: string;
  readonly status: string;
  readonly queries_made: number;
  readonly spent_microstx: number;
  readonly triggered: boolean;
  readonly webhook_called: boolean;
  readonly webhook_status?: number | null;
  readonly error_message?: string | null;
  readonly trigger_snapshot?: Record<string, unknown> | null;
  readonly started_at: number;
}

export async function recordAgentRun(db: D1Database, input: RunRecordInput): Promise<void> {
  const completedAt = Math.floor(Date.now() / 1000);
  await db
    .prepare(`
      INSERT INTO agent_runs (
        agent_id, started_at, completed_at, status,
        queries_made, spent_microstx, triggered,
        webhook_called, webhook_status, error_message, trigger_snapshot
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      input.agent_id,
      input.started_at,
      completedAt,
      input.status,
      input.queries_made,
      input.spent_microstx,
      input.triggered ? 1 : 0,
      input.webhook_called ? 1 : 0,
      input.webhook_status ?? null,
      input.error_message ?? null,
      input.trigger_snapshot ? JSON.stringify(input.trigger_snapshot) : null,
    )
    .run();

  // Update denormalized stats on the agent row.
  await db
    .prepare(`
      UPDATE agents SET
        total_runs = total_runs + 1,
        total_queries = total_queries + ?,
        total_triggered = total_triggered + ?,
        total_spent_microstx = total_spent_microstx + ?,
        last_run_at = ?
      WHERE id = ?
    `)
    .bind(
      input.queries_made,
      input.triggered ? 1 : 0,
      input.spent_microstx,
      completedAt,
      input.agent_id,
    )
    .run();
}
