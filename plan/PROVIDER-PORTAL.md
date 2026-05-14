# Provider Portal — Spec & Plan

**Purpose:** Onboarding + management portal untuk external data providers.
**Target:** M2 deliverable (2+ external providers registered).
**Deadline:** May 22, 2026 (9 hari dari spec ini).

---

## Design Principles

1. **Zero-crypto onboarding** — Provider tidak wajib punya Stacks wallet untuk daftar. Kita generate custodial wallet otomatis.
2. **Withdraw anytime** — Saldo bisa di-withdraw ke wallet Stacks pribadi mereka kapan aja.
3. **Mirror agent wallet pattern** — Reuse encryption + KMS approach dari `agent-wallet.ts` (sudah battle-tested).
4. **2 integration modes saja** untuk M2 push: Partner Bridge + Hosted Mirror.

---

## 1. Authentication & Onboarding

### Sign-up Options (provider pilih salah satu)

| Method | Flow | Use case |
|--------|------|----------|
| **Email + magic link** | Email → token → session | Non-crypto provider (data analyst, solo dev) |
| **SIWS (Sign-In With Stacks)** | Leather/Xverse connect → sign challenge | Crypto-native provider |
| **GitHub OAuth** | Repo-based identity verification | Developer-friendly, link with future open-data sources |

Default: Email magic link (lowest friction). SIWS optional, hanya wajib pas mau withdraw (wallet recipient verification).

### Onboarding Wizard (4 step, ~5 menit)

**Step 1 — Account**
- Email
- Provider name, description, logo URL, website, X handle
- Auto-generate Stacks wallet di backend → tampilkan address ke provider

**Step 2 — Integration Mode**
- ○ Partner Bridge (you have an API)
- ○ Hosted Mirror (we host your data)

**Step 3 — Endpoint Setup**

Jika **Partner Bridge:**
- Partner endpoint URL (e.g., `https://partner.hyreagent.fun`)
- Generate HMAC secret (show once + download `.env`)
- Test connection button

Jika **Hosted Mirror:**
- Data source type: R2/S3 URL · GitHub raw · Webhook push · Manual upload
- Polling interval (5min / 15min / hourly / daily)
- Sample data preview (validate JSON schema)

**Step 4 — Catalog Feeds**
- Per feed: mirror slug, source path/key, description, price STX, sample response
- "Add another" — minimum 1, no max
- Submit → live di marketplace

---

## 2. Provider Wallet System

### Generation (mirror `agent-wallet.ts`)

```typescript
// workers/api/src/lib/provider-wallet.ts (NEW)
import { generateKeypair, privateKeyToAccount } from 'x402-stacks';
import { encryptWithMasterKey, decryptWithMasterKey } from './crypto';

export interface ProviderWalletRecord {
  readonly address: string;
  readonly encryptedKey: string;
  readonly iv: string;
}

export async function createProviderWallet(masterKeyB64: string): Promise<ProviderWalletRecord> {
  const keypair = generateKeypair('mainnet');
  const encrypted = await encryptWithMasterKey(keypair.privateKey, masterKeyB64);
  return {
    address: keypair.address,
    encryptedKey: encrypted.ciphertext,
    iv: encrypted.iv,
  };
}

export async function loadProviderAccount(
  encryptedKey: string,
  iv: string,
  masterKeyB64: string,
) {
  const privateKey = await decryptWithMasterKey({ ciphertext: encryptedKey, iv }, masterKeyB64);
  return privateKeyToAccount(privateKey, 'mainnet');
}
```

**Key handling:**
- Private key di-encrypt pake `MASTER_KEY` wrangler secret (existing untuk agent platform)
- Stored sebagai ciphertext di D1 (kolom `encrypted_key`, `iv` di tabel `providers`)
- Decrypt **hanya** di code path withdrawal + settlement signing (never expose)

---

## 3. Revenue & Settlement Flow

### Per-Query Flow

```
1. Agent hit ShadowFeed: GET /feeds/hyre/pumpfun-launches
2. paymentMiddleware verify STX (0.005 STX)
3. STX masuk ke platform wallet (full amount)
4. Increment provider balance counter di D1:
   UPDATE providers SET pending_revenue_microstx = pending_revenue_microstx + 4850
   WHERE address = 'SP-HYRE-WALLET' -- 97% of 5000 microSTX
5. Forward request:
   - Partner Bridge: HMAC sign → call partner endpoint
   - Hosted Mirror: serve from KV cache
6. Return data ke agent
```

**Revenue dicatat sebagai counter di DB, bukan langsung kirim STX per call** (efisien, tidak boros gas).

### Withdrawal Flow

```
Provider dashboard → click "Withdraw"
  ↓
Input destination address (Stacks wallet pribadi)
  ↓
Confirm amount (full / partial)
  ↓
Backend:
  1. Validate destination is valid Stacks address
  2. Validate amount <= pending_revenue
  3. Load provider account (decrypt key)
  4. Build STX transfer TX: provider_custodial_wallet → destination
  5. Sign + broadcast via Hiro API
  6. Wait for TX confirmation (poll)
  7. Decrement pending_revenue, append to settlements table
  ↓
Return TX hash to dashboard
```

**Validation guards:**
- Min withdrawal: 1 STX (avoid dust)
- Max per day: 1000 STX (rate limit, prevent compromise)
- Required: SIWS verification of destination ownership (sign challenge dengan destination wallet) **kalau** destination berbeda dari linked wallet
- 24-jam cooldown setelah security event (password reset, dll)

### Auto-Settlement (Optional)

Provider bisa enable auto-withdraw: setiap pending balance hit threshold (default 10 STX), trigger automatic withdrawal ke linked wallet.

---

## 4. Database Schema

```sql
-- New: Providers table (mirror agents pattern)
CREATE TABLE providers (
  id TEXT PRIMARY KEY,                  -- uuid
  email TEXT UNIQUE,                    -- for magic link auth
  name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  website TEXT,
  twitter_handle TEXT,

  -- Custodial wallet (auto-generated)
  custodial_address TEXT UNIQUE NOT NULL,
  encrypted_key TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,

  -- Linked withdrawal wallet (set via SIWS)
  linked_address TEXT,                  -- nullable until provider links

  -- Integration mode
  mode TEXT NOT NULL CHECK (mode IN ('partner_bridge', 'hosted_mirror')),
  partner_endpoint TEXT,                -- for partner_bridge
  hmac_secret_hash TEXT,                -- hash of secret (verify only)

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'banned')),
  pending_revenue_microstx INTEGER DEFAULT 0,
  total_earned_microstx INTEGER DEFAULT 0,

  created_at INTEGER NOT NULL,
  activated_at INTEGER
);

-- Provider feeds (mirror configurations)
CREATE TABLE provider_feeds (
  id TEXT PRIMARY KEY,                  -- e.g. 'hyre-pumpfun-launches'
  provider_id TEXT NOT NULL REFERENCES providers(id),
  slug TEXT UNIQUE NOT NULL,            -- url path slug
  name TEXT NOT NULL,
  description TEXT,
  price_microstx INTEGER NOT NULL,

  -- For partner_bridge
  source_path TEXT,                     -- '/v1/trenches/new-tokens'

  -- For hosted_mirror
  data_source_type TEXT,                -- 'r2_url' | 'github_raw' | 'webhook' | 'manual_upload'
  data_source_url TEXT,
  poll_interval_seconds INTEGER,
  last_polled_at INTEGER,

  active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);

-- Cached data for hosted_mirror feeds (also in KV for hot path)
CREATE TABLE feed_cache (
  feed_id TEXT PRIMARY KEY REFERENCES provider_feeds(id),
  data_json TEXT NOT NULL,
  cached_at INTEGER NOT NULL
);

-- Settlement / withdrawal history
CREATE TABLE provider_settlements (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id),
  amount_microstx INTEGER NOT NULL,
  destination_address TEXT NOT NULL,
  tx_hash TEXT,                         -- nullable until confirmed
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'broadcast', 'confirmed', 'failed')),
  created_at INTEGER NOT NULL,
  confirmed_at INTEGER
);

-- HMAC nonce cache (for replay prevention on partner endpoints, if we expose any)
CREATE TABLE hmac_nonces (
  nonce TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

-- Provider sessions (magic link)
CREATE TABLE provider_sessions (
  token TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
```

---

## 5. API Endpoints

### Public (no auth)
- `GET  /providers` — list active providers
- `GET  /providers/:id` — provider public profile
- `GET  /providers/:id/feeds` — feeds offered by provider

### Auth — Sign-up & Sign-in
- `POST /providers/auth/signup` — email + magic link
- `POST /providers/auth/verify` — verify magic link token
- `POST /providers/auth/siws-link` — link Stacks wallet via signature (for withdrawal)

### Auth required (provider dashboard)
- `GET  /providers/me` — current provider profile
- `PUT  /providers/me` — update profile
- `POST /providers/me/feeds` — add feed
- `PUT  /providers/me/feeds/:slug` — update feed
- `DELETE /providers/me/feeds/:slug` — soft delete
- `GET  /providers/me/analytics` — revenue, queries, uptime
- `GET  /providers/me/settlements` — withdrawal history
- `POST /providers/me/withdraw` — initiate withdrawal
- `POST /providers/me/hmac-rotate` — generate new HMAC secret
- `POST /providers/me/data-push` — webhook receiver for hosted_mirror push mode

### Feed serving (replaces existing single-tier feeds path for provider feeds)
- `GET  /feeds/:providerSlug/:feedSlug` — proxy to provider source, gated by x402

---

## 6. Partner Dashboard — UI Scope

### Page: `/providers/dashboard` (after login)

**Header:**
- Provider name + logo
- Custodial address with QR + copy button
- Linked withdrawal wallet status (Connect Leather to link)

**Section 1 — Revenue Overview**
- Big number: pending balance (STX) + USD equivalent
- "Withdraw" button (prominent)
- Last 7 days revenue chart
- Lifetime total earned

**Section 2 — Feeds**
- Table: slug, queries 24h, queries 7d, revenue 7d, uptime, status
- Per-row actions: Pause, Edit, View public page, Delete
- "Add new feed" button

**Section 3 — Analytics**
- Query distribution per feed (pie chart)
- Top buyer agents (anonymized: last 4 chars of address)
- Geographic distribution (optional, from Cloudflare IP)
- Avg response latency
- Error rate

**Section 4 — Settlement History**
- Table: date, amount, destination, TX hash (link to Hiro explorer), status

**Section 5 — Integration**
- Mode (Partner Bridge / Hosted Mirror) — read-only after creation
- For Partner Bridge: endpoint URL, HMAC secret status (last rotated, rotate button)
- For Hosted Mirror: data source URL, last poll time, polling status

**Section 6 — Account Settings**
- Email
- Profile (name, logo, description, social links)
- Linked withdrawal wallet
- API access tokens (for programmatic feed updates, optional M3)
- Danger zone: pause all feeds, delete account

### Page: `/providers/dashboard/withdraw`

```
┌────────────────────────────────────────┐
│  Withdraw STX                          │
├────────────────────────────────────────┤
│  Available: 12.4 STX  (~$24.80)        │
│                                         │
│  Amount: [12.4________] STX             │
│  [Withdraw All]                         │
│                                         │
│  Destination wallet:                    │
│  ○ Linked: SP2KMT...JF8WZ              │
│  ○ Other Stacks address:               │
│    [_____________________________]      │
│                                         │
│  Network fee: ~0.001 STX                │
│  You'll receive: 12.399 STX             │
│                                         │
│  [Cancel]  [Confirm Withdrawal →]       │
└────────────────────────────────────────┘
```

**Confirmation modal:**
- Show summary
- Require typing "WITHDRAW" or sign challenge
- Loading state while TX broadcasts
- Success: show TX hash + Hiro explorer link
- Failure: revert pending balance + show error

---

## 7. Security Considerations

### Threat model
| Threat | Mitigation |
|--------|-----------|
| Provider email compromised | Magic link expires 15min, require SIWS for withdraw to new address |
| Withdrawal to wrong address | 24h cooldown after destination change, email confirmation |
| Master key leaked | Wallet rotation procedure (re-encrypt all keys), audit logs |
| Replay attack on settlement | Idempotency key per withdrawal request |
| HMAC secret leak | Provider can rotate from dashboard, old secret invalidated immediately |
| Hosted mirror data poisoning | Schema validation on poll/upload, hash provenance per record |
| Provider drains pending balance via SQL inj | Parameterized queries (D1 default), Zod schema validation |
| Webhook spam (hosted_mirror push) | Auth via HMAC, rate limit per provider |

### Audit log table (recommended)
```sql
CREATE TABLE provider_audit_log (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  action TEXT NOT NULL,           -- 'login', 'withdraw_init', 'feed_create', 'hmac_rotate', etc
  metadata_json TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL
);
```

---

## 8. Implementation Breakdown (9 hari)

### Day 1 (May 14) — Backend Foundation
- [ ] D1 migration: 6 tables (providers, provider_feeds, feed_cache, provider_settlements, hmac_nonces, provider_sessions, provider_audit_log)
- [ ] Provider wallet lib (mirror `agent-wallet.ts`)
- [ ] HMAC lib (sign + verify, with nonce KV)
- [ ] Repository: `providers-repo.ts` (CRUD + revenue counters)

### Day 2 (May 15) — Auth & Onboarding API
- [ ] `POST /providers/auth/signup` — email magic link (use Cloudflare Email Workers atau Resend)
- [ ] `POST /providers/auth/verify` — token → session
- [ ] `POST /providers/auth/siws-link` — link Stacks wallet
- [ ] Session middleware
- [ ] Onboarding flow endpoint: `POST /providers/me` create + wizard

### Day 3 (May 16) — Feed Serving + Settlement
- [ ] Provider feed proxy route: `/feeds/:providerSlug/:feedSlug`
- [ ] paymentMiddleware integration for provider feeds
- [ ] Revenue counter logic (97/3 split)
- [ ] Hosted mirror poller (cron worker, KV cache)
- [ ] Partner bridge HMAC forward

### Day 4 (May 17) — Withdrawal Flow
- [ ] `POST /providers/me/withdraw` — validate + sign + broadcast
- [ ] Settlement record + TX poller
- [ ] Audit log entries

### Day 5 (May 18) — Dashboard Frontend
- [ ] Extend [public/index.html](public/index.html) dengan `/providers/dashboard` view
- [ ] Components: overview cards, feeds table, revenue chart, withdraw modal
- [ ] Magic link landing page

### Day 6 (May 19) — Onboarding Wizard UI
- [ ] 4-step wizard (account, mode, endpoint, feeds)
- [ ] HMAC secret display + download
- [ ] Test connection button
- [ ] Public provider profile page

### Day 7 (May 20) — Hyre Integration
- [ ] Generate Hyre's HMAC secret
- [ ] Provide them HMAC verifier code snippet
- [ ] Wire up 6 mirror feeds (pumpfun, whales, wallet-pnl, etc)
- [ ] End-to-end test: agent pay STX → ShadowFeed → Hyre → data

### Day 8 (May 21) — Provider #2 + Polish
- [ ] Onboard solo dev / hackathon alumni as provider #2 (hosted_mirror mode)
- [ ] Smoke test withdrawal flow with real STX
- [ ] Documentation: integration guide page

### Day 9 (May 22) — Submit M2
- [ ] Verify 2+ providers active on `/providers`
- [ ] Verify 50+ unique buyer wallets (paralel push via agent platform marketing)
- [ ] Collect evidence: TX hashes, screenshots, dashboard videos
- [ ] Submit completion report ke grants@stacksendowment.co

---

## 9. Updated Mode Naming (clarity)

Sebelumnya:
- ~~Partner Bridge~~ → **"Connect Your API"** (HMAC-authenticated bridge)
- ~~Hosted Mirror~~ → **"Drop Your Data"** (we host)
- ~~Self-Hosted Proxy~~ → (skipped for M2)

---

## 10. Open Questions

1. **Email service:** Cloudflare Email Workers atau Resend? Resend lebih reliable, ~$0/month for 100 emails/day.
2. **Master key rotation:** Procedure kalau ada compromise — perlu spec terpisah di M3.
3. **Provider verification:** "Verified" badge — manual atau auto (DNS TXT record / on-chain signature)?
4. **KYC for high-value withdrawals:** > 1000 STX? Probably not for M2, revisit M3.
5. **Tax reporting:** US tax form 1099 — out of scope untuk M2.

---

## 11. Success Criteria (M2 Submission)

- [ ] 2+ providers registered with active feeds di `/providers`
- [ ] Setiap provider menerima minimum 1 real STX payment (on-chain proof)
- [ ] Setiap provider berhasil withdraw ke linked wallet (on-chain proof)
- [ ] Dashboard accessible & functional di shadowfeed.app/providers/dashboard
- [ ] 50+ unique buyer wallets total

---

## Appendix A — Stack Decisions

- **Backend:** Hono on Cloudflare Workers (existing)
- **DB:** D1 (existing) + KV for hot cache (existing)
- **Encryption:** Web Crypto API + AES-GCM (mirror agent wallet)
- **Email:** Resend (proposed) atau Cloudflare Email Workers
- **Validation:** Zod schemas
- **Frontend:** Vanilla JS extend existing index.html
- **Charts:** Chart.js (already used)

## Appendix B — Reference Files

- Agent wallet pattern: [workers/api/src/lib/agent-wallet.ts](../workers/api/src/lib/agent-wallet.ts)
- Crypto utilities: [workers/api/src/lib/crypto.ts](../workers/api/src/lib/crypto.ts)
- Agents repo (CRUD pattern): [workers/api/src/lib/agents-repo.ts](../workers/api/src/lib/agents-repo.ts)
- Main API entry: [workers/api/src/index.ts](../workers/api/src/index.ts)
- Existing dashboard: [public/index.html](../public/index.html)
