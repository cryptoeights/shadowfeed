// Agent platform HTTP routes — auth, CRUD, runs, public discovery.
// Mounted from index.ts so the main file stays focused on x402 plumbing.

import { Hono } from 'hono';
import type { Env } from '../types';
import {
  issueNonce,
  consumeNonce,
  verifyStacksSignature,
  buildAuthMessage,
  upsertUser,
  createSession,
  authenticate,
  revokeSession,
} from './auth';
import { createAgentWallet, getAgentBalance } from './agent-wallet';
import {
  insertAgent,
  getAgentById,
  getAgentBySlug,
  listAgentsForUser,
  listPublicAgents,
  updateAgent,
  deleteAgent,
  listAgentRuns,
  type AgentRow,
} from './agents-repo';
import { TEMPLATES, type TemplateId } from './agent-templates';

export const agentRoutes = new Hono<{ Bindings: Env }>();

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function bearerToken(authHeader: string | undefined): string | undefined {
  if (!authHeader) return undefined;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader);
  return m ? m[1] : undefined;
}

// Return only the fields safe to send to clients — never leak the encrypted
// private key fields, even though they're encrypted, to keep attack surface
// minimal.
function publicAgentView(agent: AgentRow) {
  const config = (() => {
    try { return JSON.parse(agent.config_json); } catch { return {}; }
  })();
  return {
    id: agent.id,
    user_id: agent.user_id,
    name: agent.name,
    description: agent.description,
    template: agent.template_type,
    config,
    schedule_cron: agent.schedule_cron,
    active: !!agent.active,
    webhook_url: agent.webhook_url,
    is_public: !!agent.is_public,
    public_slug: agent.public_slug,
    wallet_address: agent.agent_wallet_address,
    stats: {
      total_runs: agent.total_runs,
      total_queries: agent.total_queries,
      total_triggered: agent.total_triggered,
      total_spent_microstx: agent.total_spent_microstx,
      total_spent_stx: agent.total_spent_microstx / 1_000_000,
      last_run_at: agent.last_run_at,
    },
    created_at: agent.created_at,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Auth — Sign-In With Stacks
// ────────────────────────────────────────────────────────────────────────────

// Step 1: client requests a nonce + the message to sign.
agentRoutes.post('/auth/nonce', async c => {
  const body = await c.req.json().catch(() => ({} as any));
  const wallet = String(body?.wallet_address || '').trim();
  if (!/^S[PT][0-9A-Z]{38,40}$/.test(wallet)) {
    return c.json({ error: 'invalid wallet_address' }, 400);
  }
  const issued = await issueNonce(c.env.DB, wallet);
  return c.json(issued);
});

// Step 2: client posts back the signature; we verify and issue a session token.
agentRoutes.post('/auth/verify', async c => {
  const body = await c.req.json().catch(() => ({} as any));
  const wallet = String(body?.wallet_address || '').trim();
  const nonce = String(body?.nonce || '').trim();
  const signature = String(body?.signature || '').trim();
  const publicKey = String(body?.public_key || '').trim();
  if (!wallet || !nonce || !signature || !publicKey) {
    return c.json({ error: 'missing wallet_address, nonce, signature, or public_key' }, 400);
  }

  const fresh = await consumeNonce(c.env.DB, nonce, wallet);
  if (!fresh) return c.json({ error: 'nonce invalid, expired, or already used' }, 400);

  const message = buildAuthMessage(nonce, wallet);
  const ok = verifyStacksSignature({ message, signature, publicKey });
  if (!ok) return c.json({ error: 'signature verification failed' }, 401);

  const user = await upsertUser(c.env.DB, wallet);
  const session = await createSession(c.env.DB, user.id);
  return c.json({
    token: session.token,
    expires_at: session.expires_at,
    user: { id: user.id, wallet_address: user.wallet_address },
  });
});

agentRoutes.post('/auth/logout', async c => {
  const token = bearerToken(c.req.header('Authorization'));
  if (token) await revokeSession(c.env.DB, token);
  return c.json({ ok: true });
});

agentRoutes.get('/auth/me', async c => {
  const token = bearerToken(c.req.header('Authorization'));
  const me = await authenticate(c.env.DB, token);
  if (!me) return c.json({ error: 'unauthenticated' }, 401);
  return c.json({ user: me });
});

// ────────────────────────────────────────────────────────────────────────────
// Templates — public, no auth needed
// ────────────────────────────────────────────────────────────────────────────

agentRoutes.get('/agents/templates', c => {
  return c.json({ templates: Object.values(TEMPLATES) });
});

// ────────────────────────────────────────────────────────────────────────────
// Agents CRUD — auth required for write ops
// ────────────────────────────────────────────────────────────────────────────

async function requireAuth(c: any) {
  const token = bearerToken(c.req.header('Authorization'));
  const me = await authenticate(c.env.DB, token);
  if (!me) {
    c.json({ error: 'unauthenticated' }, 401);
    return null;
  }
  return me;
}

agentRoutes.post('/agents', async c => {
  const me = await requireAuth(c);
  if (!me) return c.json({ error: 'unauthenticated' }, 401);

  const body = await c.req.json().catch(() => ({} as any));
  const templateId = String(body?.template || '') as TemplateId;
  const template = TEMPLATES[templateId];
  if (!template) return c.json({ error: 'invalid template' }, 400);

  const name = String(body?.name || '').trim().slice(0, 100);
  if (!name) return c.json({ error: 'name required' }, 400);

  const description = body?.description ? String(body.description).slice(0, 500) : undefined;
  const config = (body?.config && typeof body.config === 'object') ? body.config : {};
  const schedule_cron = String(body?.schedule_cron || template.default_schedule);
  const webhook_url = body?.webhook_url ? String(body.webhook_url).slice(0, 500) : undefined;
  if (webhook_url && !/^https?:\/\//.test(webhook_url)) {
    return c.json({ error: 'webhook_url must start with http(s)://' }, 400);
  }
  const is_public = !!body?.is_public;

  if (!c.env.AGENT_MASTER_KEY) {
    return c.json({ error: 'AGENT_MASTER_KEY not configured on server' }, 500);
  }

  const wallet = await createAgentWallet(c.env.AGENT_MASTER_KEY);
  const agent = await insertAgent(c.env.DB, {
    user_id: me.user_id,
    name,
    description,
    template_type: templateId,
    config,
    schedule_cron,
    webhook_url,
    is_public,
    wallet_address: wallet.address,
    wallet_encrypted_key: wallet.encryptedKey,
    wallet_iv: wallet.iv,
  });

  return c.json({ agent: publicAgentView(agent) }, 201);
});

agentRoutes.get('/agents', async c => {
  const me = await requireAuth(c);
  if (!me) return c.json({ error: 'unauthenticated' }, 401);
  const rows = await listAgentsForUser(c.env.DB, me.user_id);
  return c.json({ agents: rows.map(publicAgentView) });
});

agentRoutes.get('/agents/:id', async c => {
  try {
    const id = c.req.param('id');
    const agent = await getAgentById(c.env.DB, id);
    if (!agent) return c.json({ error: 'agent not found' }, 404);

    // Authenticate once, then use to gate access + balance lookup.
    const me = await authenticate(c.env.DB, bearerToken(c.req.header('Authorization')));

    // Private agents are only visible to their owner.
    if (!agent.is_public && (!me || me.user_id !== agent.user_id)) {
      return c.json({ error: 'forbidden' }, 403);
    }

    const view: any = publicAgentView(agent);

    // Include live STX balance for owner views (best-effort; never 500 on Hiro outage).
    if (me?.user_id === agent.user_id) {
      try {
        const network = c.env.NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
        view.balance = await getAgentBalance(agent.agent_wallet_address, network, c.env.HIRO_API_KEY);
      } catch (err) {
        console.error('[agents/:id] balance fetch failed:', err);
        view.balance = null;
      }
    }
    return c.json({ agent: view });
  } catch (err: any) {
    console.error('[agents/:id] handler crashed:', err?.message ?? err, err?.stack);
    return c.json({ error: 'internal error', detail: err?.message ?? 'unknown' }, 500);
  }
});

agentRoutes.patch('/agents/:id', async c => {
  const me = await requireAuth(c);
  if (!me) return c.json({ error: 'unauthenticated' }, 401);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({} as any));
  const updated = await updateAgent(c.env.DB, id, me.user_id, {
    name: body?.name,
    description: body?.description,
    config: body?.config,
    schedule_cron: body?.schedule_cron,
    webhook_url: body?.webhook_url,
    active: body?.active,
    is_public: body?.is_public,
  });
  if (!updated) return c.json({ error: 'agent not found or not yours' }, 404);
  return c.json({ agent: publicAgentView(updated) });
});

agentRoutes.delete('/agents/:id', async c => {
  const me = await requireAuth(c);
  if (!me) return c.json({ error: 'unauthenticated' }, 401);
  const ok = await deleteAgent(c.env.DB, c.req.param('id'), me.user_id);
  if (!ok) return c.json({ error: 'agent not found or not yours' }, 404);
  return c.json({ ok: true });
});

agentRoutes.get('/agents/:id/runs', async c => {
  try {
    const id = c.req.param('id');
    const agent = await getAgentById(c.env.DB, id);
    if (!agent) return c.json({ error: 'agent not found' }, 404);

    const me = await authenticate(c.env.DB, bearerToken(c.req.header('Authorization')));
    if (!agent.is_public && (!me || me.user_id !== agent.user_id)) {
      return c.json({ error: 'forbidden' }, 403);
    }

    const limit = Math.min(parseInt(c.req.query('limit') || '50', 10) || 50, 200);
    const runs = await listAgentRuns(c.env.DB, id, limit);
    return c.json({ runs });
  } catch (err: any) {
    console.error('[agents/:id/runs] handler crashed:', err?.message ?? err);
    return c.json({ error: 'internal error', detail: err?.message ?? 'unknown' }, 500);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// Discovery — public marketplace
// ────────────────────────────────────────────────────────────────────────────

agentRoutes.get('/discover/agents', async c => {
  const template = c.req.query('template');
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10) || 50, 100);
  const rows = await listPublicAgents(c.env.DB, { template, limit });
  return c.json({ agents: rows.map(publicAgentView) });
});

agentRoutes.get('/discover/agents/:slug', async c => {
  const slug = c.req.param('slug');
  const agent = await getAgentBySlug(c.env.DB, slug);
  if (!agent) return c.json({ error: 'agent not found' }, 404);
  return c.json({ agent: publicAgentView(agent) });
});
