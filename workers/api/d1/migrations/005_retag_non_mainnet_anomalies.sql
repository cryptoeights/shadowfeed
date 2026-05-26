-- Re-tag historical "real_onchain" rows whose payer wallet is NOT a Stacks
-- mainnet address (SP/SM prefix). These 10 rows in `queries` (IDs 72–93)
-- were tagged real_onchain by the format-based backfill in 004 because they
-- have valid 64-char hex tx_hashes, but their payer prefixes show they are
-- not mainnet Stacks activity:
--
--   6 rows × Bitcoin native segwit address (bc1q...) — early integration
--     test artifact from before Stacks payer extraction was solidified.
--   4 rows × Stacks testnet address (STacb5bf...) — testnet transactions
--     that pre-date the mainnet cutover.
--
-- These are honestly not "real on-chain mainnet" settlements and should not
-- count toward M2 grant deliverable traction metrics. We move them to the
-- 'unknown' bucket (kept in DB for auditability, excluded from /activity
-- default view and /admin/provider_query_log.csv).
--
-- provider_query_log already had clean mainnet-only data; no rows changed.

UPDATE queries
SET source_type = 'unknown'
WHERE source_type = 'real_onchain'
  AND (payer IS NULL OR (payer NOT LIKE 'SP%' AND payer NOT LIKE 'SM%'));

UPDATE provider_query_log
SET source_type = 'unknown'
WHERE source_type = 'real_onchain'
  AND (payer IS NULL OR (payer NOT LIKE 'SP%' AND payer NOT LIKE 'SM%'));
