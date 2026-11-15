-- ═══════════════════════════════════════════════════
--  LUMABY — Two-way sync (logs, growth, babies)
--  Run after supabase-schema.sql. Safe to re-run.
--
--  Every synced table has the same sync columns:
--    id          client-generated id (TEXT)
--    user_id     owner
--    data        the full record as the app stores it
--    updated_at  when the record was last edited (set by the client;
--                the newest edit wins when two devices disagree)
--    deleted     soft-delete flag, so deletions reach other devices
--    synced_at   set by the server on every write; devices pull rows
--                with synced_at after their last pull
-- ═══════════════════════════════════════════════════

-- ── Premium check used by the write policies ──
-- Same rule as the app: active/trialing (not past expires_at), or
-- cancelled with a future expires_at. SECURITY DEFINER so it can read
-- subscriptions regardless of the caller's grants.
CREATE OR REPLACE FUNCTION public.has_premium(uid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = uid
      AND (
        (s.status IN ('active','trialing') AND (s.expires_at IS NULL OR s.expires_at > NOW()))
        OR (s.status = 'cancelled' AND s.expires_at > NOW())
      )
  );
$$;
REVOKE ALL ON FUNCTION public.has_premium(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_premium(UUID) TO authenticated;

-- ── Server-side sync timestamp ──
CREATE OR REPLACE FUNCTION public.touch_synced_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.synced_at = clock_timestamp(); RETURN NEW; END;
$$;

-- ── Logs: add sync columns ──
ALTER TABLE logs ALTER COLUMN type DROP NOT NULL;
ALTER TABLE logs ALTER COLUMN logged_at DROP NOT NULL;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS baby_id    TEXT;
ALTER TABLE logs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE logs ADD COLUMN IF NOT EXISTS deleted    BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Growth logs: recreate with text ids and sync columns ──
-- The original table used server-generated UUIDs, which can't work for
-- offline-first sync. Only replaced while it is still in the old shape
-- (no "data" column); it held no rows when this was written.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'growth_logs' AND column_name = 'data') THEN
    IF EXISTS (SELECT 1 FROM growth_logs LIMIT 1) THEN
      RAISE EXCEPTION 'growth_logs has rows; migrate them by hand before running this';
    END IF;
    DROP TABLE growth_logs;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS growth_logs (
  id          TEXT PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  baby_id     TEXT,
  log_date    DATE,
  weight_lbs  NUMERIC(6,2),
  height_in   NUMERIC(6,2),
  head_cm     NUMERIC(6,2),
  notes       TEXT,
  data        JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted     BOOLEAN NOT NULL DEFAULT FALSE,
  synced_at   TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Babies ──
CREATE TABLE IF NOT EXISTS babies (
  id          TEXT PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name        TEXT,
  dob         DATE,
  emoji       TEXT,
  data        JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted     BOOLEAN NOT NULL DEFAULT FALSE,
  synced_at   TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Triggers, indexes, RLS, realtime for all three ──
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['logs','growth_logs','babies'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_touch_synced_at ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_touch_synced_at BEFORE INSERT OR UPDATE ON %I
                    FOR EACH ROW EXECUTE FUNCTION public.touch_synced_at()', t, t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I_user_synced ON %I (user_id, synced_at)', t, t);

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- Replace any older per-table policies with one consistent set.
    EXECUTE format('DROP POLICY IF EXISTS "Users can view own %s" ON %I', replace(t, '_', ' '), t);
    EXECUTE format('DROP POLICY IF EXISTS "Users can insert own %s" ON %I', replace(t, '_', ' '), t);
    EXECUTE format('DROP POLICY IF EXISTS "Users can update own %s" ON %I', replace(t, '_', ' '), t);
    EXECUTE format('DROP POLICY IF EXISTS "Users can delete own %s" ON %I', replace(t, '_', ' '), t);
    EXECUTE format('DROP POLICY IF EXISTS sync_select ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS sync_insert ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS sync_update ON %I', t);

    -- Anyone can read their own data (so a lapsed subscriber can still get
    -- it back); only Premium members can write synced data.
    EXECUTE format('CREATE POLICY sync_select ON %I FOR SELECT TO authenticated
                    USING (auth.uid() = user_id)', t);
    EXECUTE format('CREATE POLICY sync_insert ON %I FOR INSERT TO authenticated
                    WITH CHECK (auth.uid() = user_id AND public.has_premium(auth.uid()))', t);
    EXECUTE format('CREATE POLICY sync_update ON %I FOR UPDATE TO authenticated
                    USING (auth.uid() = user_id)
                    WITH CHECK (auth.uid() = user_id AND public.has_premium(auth.uid()))', t);

    -- Deletes are soft (deleted = true) so they sync; no hard deletes or
    -- truncates from clients.
    EXECUTE format('REVOKE DELETE, TRUNCATE ON %I FROM anon, authenticated', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO authenticated', t);

    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                   WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END $$;
