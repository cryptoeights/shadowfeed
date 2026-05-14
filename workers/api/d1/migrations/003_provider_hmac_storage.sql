-- Store HMAC partner secret encrypted in the providers table so ShadowFeed
-- doesn't need a Worker secret per partner.
--
-- Trust model is identical to the agent-wallet keys: AES-GCM with the platform
-- AGENT_MASTER_KEY. Only the deployed Worker can decrypt; if a partner ever
-- rotates, we re-encrypt and overwrite.
--
-- Both columns are nullable so the migration is additive — existing providers
-- (e.g. @hyre) keep working via the Worker env fallback until the next rotate.

ALTER TABLE providers ADD COLUMN hmac_encrypted_secret TEXT;
ALTER TABLE providers ADD COLUMN hmac_secret_iv TEXT;
