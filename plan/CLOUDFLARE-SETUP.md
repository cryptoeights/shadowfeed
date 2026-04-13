# Cloudflare Infrastructure Setup

**Domain:** shadowfeed.app
**Stack:** Workers + Pages + D1 + KV

---

## Architecture

```
                    shadowfeed.app (Cloudflare DNS)
                           |
              ┌────────────┴────────────┐
              |                         |
     shadowfeed.app              api.shadowfeed.app
     (Cloudflare Pages)          (Cloudflare Worker)
              |                         |
        Dashboard UI            ┌───────┼───────┐
        - Activity feed         |       |       |
        - Leaderboard          D1      KV    Hono
        - Wallet connect     (SQLite) (Cache) (Router)
        - Feed registry         |       |       |
                            queries  feed     15+ feed
                            feed_stats cache  endpoints
                                              facilitator
                                              discovery API
```

---

## Step-by-Step Setup

### 1. Add Domain to Cloudflare

```bash
# In Cloudflare Dashboard:
# 1. Add site -> shadowfeed.app
# 2. Update nameservers at domain registrar to Cloudflare's
# 3. Wait for DNS propagation (usually < 1 hour)
```

### 2. Create Worker Project

```bash
# Initialize Workers project
npx wrangler init shadowfeed-api --type javascript
cd shadowfeed-api

# Install dependencies
npm install hono x402-stacks @stacks/transactions @stacks/network
npm install -D wrangler @cloudflare/workers-types
```

### 3. Create D1 Database

```bash
# Create database
npx wrangler d1 create shadowfeed

# Apply schema
npx wrangler d1 execute shadowfeed --file=./d1/schema.sql
```

**D1 Schema (schema.sql):**
```sql
CREATE TABLE IF NOT EXISTS queries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed TEXT NOT NULL,
  agent_address TEXT,
  amount TEXT,
  tx_hash TEXT,
  response_data TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feed_stats (
  feed TEXT PRIMARY KEY,
  total_queries INTEGER DEFAULT 0,
  total_revenue TEXT DEFAULT '0',
  unique_agents INTEGER DEFAULT 0,
  last_query_at TEXT
);

CREATE INDEX idx_queries_agent ON queries(agent_address);
CREATE INDEX idx_queries_feed ON queries(feed);
CREATE INDEX idx_queries_created ON queries(created_at);
```

### 4. Create KV Namespace

```bash
# Create KV for caching
npx wrangler kv:namespace create CACHE
# Copy the ID into wrangler.toml
```

### 5. Configure wrangler.toml

```toml
name = "shadowfeed-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[vars]
NETWORK = "mainnet"
FACILITATOR_URL = "https://api.shadowfeed.app"

[[d1_databases]]
binding = "DB"
database_name = "shadowfeed"
database_id = "<from step 3>"

[[kv_namespaces]]
binding = "CACHE"
id = "<from step 4>"

[env.production]
routes = [
  { pattern = "api.shadowfeed.app", custom_domain = true }
]
```

### 6. Set Secrets

```bash
# Set sensitive vars as secrets (not in wrangler.toml)
npx wrangler secret put SERVER_PRIVATE_KEY
npx wrangler secret put SERVER_ADDRESS
npx wrangler secret put AGENT_PRIVATE_KEY
```

### 7. Deploy Worker

```bash
npx wrangler deploy
```

### 8. Setup Cloudflare Pages (Dashboard)

```bash
# Option A: CLI
npx wrangler pages project create shadowfeed-dashboard
npx wrangler pages deploy ./public --project-name=shadowfeed-dashboard

# Option B: Dashboard
# 1. Cloudflare Dashboard -> Pages -> Create project
# 2. Connect to GitHub repo (cryptoeights/shadowfeed)
# 3. Build command: (none, static files)
# 4. Output directory: public
# 5. Custom domain: shadowfeed.app
```

### 9. DNS Records

```
Type  | Name | Content               | Proxy
------+------+-----------------------+------
CNAME | @    | shadowfeed-dashboard.pages.dev | Yes (Pages)
CNAME | api  | (auto-configured by Worker custom domain)
```

---

## Express -> Hono Migration Cheatsheet

```typescript
// EXPRESS (before)                    // HONO (after)
import express from 'express';         import { Hono } from 'hono';
const app = express();                 const app = new Hono<{ Bindings: Env }>();

app.use(express.json());               // Built-in, no middleware needed

app.get('/path', (req, res) => {       app.get('/path', (c) => {
  res.json({ data });                    return c.json({ data });
});                                    });

app.use(middleware);                   app.use('*', middleware);

app.listen(3000);                      export default app;  // Workers export
```

### Key Differences
| Express | Hono (Workers) |
|---------|---------------|
| `req.body` | `await c.req.json()` |
| `req.params.id` | `c.req.param('id')` |
| `req.query.x` | `c.req.query('x')` |
| `req.headers['x']` | `c.req.header('x')` |
| `res.json(data)` | `return c.json(data)` |
| `res.status(402).json()` | `return c.json(data, 402)` |
| `process.env.X` | `c.env.X` |
| `db.prepare(sql)` | `c.env.DB.prepare(sql)` (async!) |

### D1 vs better-sqlite3

```typescript
// better-sqlite3 (sync)
const row = db.prepare('SELECT * FROM queries WHERE id = ?').get(id);

// D1 (async)
const { results } = await c.env.DB.prepare('SELECT * FROM queries WHERE id = ?')
  .bind(id)
  .all();
```

---

## Deployment Commands

```bash
# Dev (local)
npx wrangler dev

# Deploy API worker
npx wrangler deploy

# Deploy dashboard (Pages)
npx wrangler pages deploy ./public --project-name=shadowfeed-dashboard

# Check logs
npx wrangler tail

# D1 queries
npx wrangler d1 execute shadowfeed --command="SELECT COUNT(*) FROM queries"
```

---

## Cost Estimate

| Service | Free Tier | Paid ($5/mo) |
|---------|-----------|-------------|
| Workers requests | 100K/day | 10M/month |
| D1 reads | 5M/day | 25B/month |
| D1 writes | 100K/day | 50M/month |
| D1 storage | 5GB | 5GB (then $0.75/GB) |
| KV reads | 100K/day | 10M/month |
| KV writes | 1K/day | 1M/month |
| Pages | Unlimited | Unlimited |
| Bandwidth | Unlimited | Unlimited |

**For ShadowFeed's scale (< 10K queries/day initially), the FREE tier is more than sufficient.**
Upgrade to Workers Paid ($5/mo) only when approaching limits.
