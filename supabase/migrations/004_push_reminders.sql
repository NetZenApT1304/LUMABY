-- ═══════════════════════════════════════════════════
--  LUMABY — Push reminders
--  Run after 003_partner_sharing.sql. Safe to re-run.
--
--  The app saves each device's Web Push subscription and the user's
--  reminder settings. A scheduled Netlify function (send-reminders) works
--  out what is due from the synced logs and sends the pushes, so reminders
--  arrive even when the app is closed.
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint     TEXT PRIMARY KEY,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  user_agent   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user ON push_subscriptions (user_id);

CREATE TABLE IF NOT EXISTS reminder_settings (
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
  tz          TEXT NOT NULL DEFAULT 'UTC',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- One row per reminder sent, so each due reminder is sent once.
CREATE TABLE IF NOT EXISTS reminder_sent (
  user_id   UUID NOT NULL,
  baby_id   TEXT NOT NULL,
  kind      TEXT NOT NULL,
  due_key   TEXT NOT NULL,
  sent_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, baby_id, kind, due_key)
);
CREATE INDEX IF NOT EXISTS reminder_sent_at ON reminder_sent (sent_at);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_sent      ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON push_subscriptions, reminder_settings, reminder_sent FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON push_subscriptions, reminder_settings TO authenticated;

DROP POLICY IF EXISTS own_rows ON push_subscriptions;
CREATE POLICY own_rows ON push_subscriptions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS own_rows ON reminder_settings;
CREATE POLICY own_rows ON reminder_settings FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Who to remind about which baby: users with a push subscription and
-- reminder settings, for each baby they own (with Premium) or share
-- (while the owner has Premium). Called by the scheduled function with
-- the service key only.
CREATE OR REPLACE FUNCTION public.reminder_targets()
RETURNS TABLE (user_id UUID, baby_id TEXT, baby_name TEXT, settings JSONB, tz TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH users AS (
    SELECT DISTINCT ps.user_id FROM push_subscriptions ps
    JOIN reminder_settings rs ON rs.user_id = ps.user_id
  ),
  access AS (
    SELECT b.user_id, b.id AS baby_id, b.user_id AS owner_id FROM babies b WHERE NOT b.deleted
    UNION
    SELECT m.user_id, m.baby_id, b.user_id FROM baby_members m JOIN babies b ON b.id = m.baby_id WHERE NOT b.deleted
  )
  SELECT a.user_id, a.baby_id, COALESCE(b.name, b.data->>'baby', 'Baby'), rs.settings, rs.tz
  FROM access a
  JOIN users u ON u.user_id = a.user_id
  JOIN reminder_settings rs ON rs.user_id = a.user_id
  JOIN babies b ON b.id = a.baby_id
  WHERE public.has_premium(a.owner_id);
$$;
REVOKE ALL ON FUNCTION public.reminder_targets() FROM PUBLIC, anon, authenticated;
