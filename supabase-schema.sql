-- ═══════════════════════════════════════════════════
--  LUMABY BABY TRACKER — Supabase Database Schema
--  Run this in your Supabase dashboard → SQL Editor
-- ═══════════════════════════════════════════════════

-- ── 1. Profiles table ──
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  parent_name   TEXT,
  baby_name     TEXT,
  baby_dob      TIMESTAMPTZ,
  baby_emoji    TEXT DEFAULT '🌙',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Subscriptions table ──
CREATE TABLE IF NOT EXISTS subscriptions (
  id                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                  UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  stripe_subscription_id   TEXT UNIQUE,
  stripe_customer_id       TEXT,
  status                   TEXT NOT NULL DEFAULT 'free' CHECK (status IN ('free','trialing','active','past_due','cancelled','unpaid')),
  -- status values: free | trialing | active | past_due | cancelled | unpaid
  plan                     TEXT,
  current_period_start     TIMESTAMPTZ,
  current_period_end       TIMESTAMPTZ,
  expires_at               TIMESTAMPTZ,
  cancel_at_period_end     BOOLEAN DEFAULT FALSE,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. Logs table (for premium cross-device sync) ──
CREATE TABLE IF NOT EXISTS logs (
  id          TEXT PRIMARY KEY,  -- matches client-side uid()
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type        TEXT NOT NULL,
  icon        TEXT,
  title       TEXT,
  detail      TEXT,
  logged_at   TIMESTAMPTZ NOT NULL,
  data        JSONB,  -- full log entry as JSON
  synced_at   TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. Growth logs table ──
CREATE TABLE IF NOT EXISTS growth_logs (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  log_date    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  weight_lbs  NUMERIC(5,2),
  height_in   NUMERIC(5,2),
  head_cm     NUMERIC(5,2),
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════
--  ROW LEVEL SECURITY (RLS)
--  Critical: users can only see their own data
-- ═══════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_logs     ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only read/write their own
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = user_id);

-- Subscriptions: users can ONLY READ their own subscription
-- ALL writes go through service key via webhook - users CANNOT update status
CREATE POLICY "Users can view own subscription"
  ON subscriptions FOR SELECT USING (auth.uid() = user_id);

-- Explicitly deny any INSERT/UPDATE/DELETE from client
-- Only service_role key (used in webhook) can write to subscriptions
REVOKE INSERT, UPDATE, DELETE ON subscriptions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON subscriptions FROM anon;

-- Logs: users can only read/write their own
CREATE POLICY "Users can view own logs"
  ON logs FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own logs"
  ON logs FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own logs"
  ON logs FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own logs"
  ON logs FOR DELETE USING (auth.uid() = user_id);

-- Growth logs: users can only read/write their own
CREATE POLICY "Users can view own growth logs"
  ON growth_logs FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own growth logs"
  ON growth_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own growth logs"
  ON growth_logs FOR UPDATE USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════
--  INDEXES for performance
-- ═══════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS logs_user_id_logged_at ON logs (user_id, logged_at DESC);
CREATE INDEX IF NOT EXISTS growth_logs_user_id ON growth_logs (user_id, log_date DESC);
CREATE INDEX IF NOT EXISTS subscriptions_user_id ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS subscriptions_customer_id ON subscriptions (stripe_customer_id);

-- ═══════════════════════════════════════════════════
--  AUTO-UPDATE updated_at timestamps
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════
--  VERIFY — Run this to confirm setup worked
-- ═══════════════════════════════════════════════════
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
