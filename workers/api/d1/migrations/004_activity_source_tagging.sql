-- Add explicit source_type to disambiguate real on-chain mainnet payments
-- from simulation/test/demo data. This is the field grant reviewers and
-- public dashboards filter on.
--
-- Run with:
--   wrangler d1 execute shadowfeed --remote --file=./d1/migrations/004_activity_source_tagging.sql
-- Test locally first:
--   wrangler d1 execute shadowfeed --local --file=./d1/migrations/004_activity_source_tagging.sql

ALTER TABLE queries ADD COLUMN source_type TEXT NOT NULL DEFAULT 'unknown'
  CHECK (source_type IN ('real_onchain', 'demo', 'simulation', 'unknown'));

ALTER TABLE provider_query_log ADD COLUMN source_type TEXT NOT NULL DEFAULT 'unknown'
  CHECK (source_type IN ('real_onchain', 'demo', 'simulation', 'unknown'));

CREATE INDEX IF NOT EXISTS idx_queries_source ON queries(source_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pql_source ON provider_query_log(source_type, created_at DESC);

-- Backfill: derive source_type from existing data honestly.
-- real_onchain = tx_hash is 64-char hex, no demo_ prefix.
-- demo         = tx_hash starts with 'demo_'.
-- simulation   = tx_hash IS NULL (no payment broadcast was recorded).
-- unknown      = anything else (non-hex, unexpected length, etc.).
UPDATE queries SET source_type =
  CASE
    WHEN tx_hash IS NULL THEN 'simulation'
    WHEN tx_hash LIKE 'demo_%' THEN 'demo'
    WHEN length(tx_hash) >= 60 AND tx_hash GLOB '[0-9a-fA-F]*' THEN 'real_onchain'
    ELSE 'unknown'
  END;

UPDATE provider_query_log SET source_type =
  CASE
    WHEN tx_hash IS NULL THEN 'simulation'
    WHEN tx_hash LIKE 'demo_%' THEN 'demo'
    WHEN length(tx_hash) >= 60 AND tx_hash GLOB '[0-9a-fA-F]*' THEN 'real_onchain'
    ELSE 'unknown'
  END;
