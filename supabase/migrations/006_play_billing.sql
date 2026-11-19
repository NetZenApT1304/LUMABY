-- ═══════════════════════════════════════════════════
--  LUMABY — Google Play billing
--  Run after 005_account_deletion.sql. Safe to re-run.
--
--  Premium can come from Lemon Squeezy (website) or Google Play (Android
--  app). One row per user either way; has_premium() is unchanged. Play rows
--  are written only by the play-verify / play-refresh Netlify functions
--  (service key) after Google confirms the purchase.
-- ═══════════════════════════════════════════════════
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'lemonsqueezy';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS play_purchase_token TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS play_product_id TEXT;
DO $$ BEGIN
  ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_provider_check CHECK (provider IN ('lemonsqueezy', 'play'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- A purchase token belongs to one account (stops sharing one purchase).
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_play_token ON subscriptions (play_purchase_token) WHERE play_purchase_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS subscriptions_play_refresh ON subscriptions (expires_at) WHERE provider = 'play';
