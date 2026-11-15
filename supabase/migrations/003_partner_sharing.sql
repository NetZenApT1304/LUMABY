-- ═══════════════════════════════════════════════════
--  LUMABY — Partner sharing
--  Run after 002_two_way_sync.sql. Safe to re-run.
--
--  A baby's owner is babies.user_id. The owner (with Premium) can invite
--  partners with a one-time code; a partner who accepts gets a row in
--  baby_members and can then read and add to that baby's logs and growth.
--  Partners don't need their own subscription: writes are allowed while
--  the baby's owner has Premium.
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS baby_members (
  baby_id     TEXT REFERENCES babies(id) ON DELETE CASCADE NOT NULL,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role        TEXT NOT NULL DEFAULT 'partner' CHECK (role IN ('partner')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (baby_id, user_id)
);
CREATE INDEX IF NOT EXISTS baby_members_user ON baby_members (user_id);

CREATE TABLE IF NOT EXISTS partner_invites (
  code        TEXT PRIMARY KEY,
  baby_id     TEXT REFERENCES babies(id) ON DELETE CASCADE NOT NULL,
  created_by  UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Failed code entries, to stop guessing codes.
CREATE TABLE IF NOT EXISTS invite_attempts (
  user_id     UUID NOT NULL,
  at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS invite_attempts_user_at ON invite_attempts (user_id, at);

-- Only reachable through the functions below.
ALTER TABLE baby_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON baby_members, partner_invites, invite_attempts FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS logs_baby ON logs (baby_id);
CREATE INDEX IF NOT EXISTS growth_logs_baby ON growth_logs (baby_id);

-- ── Access helpers (SECURITY DEFINER so policies don't recurse) ──
CREATE OR REPLACE FUNCTION public.can_access_baby(bid TEXT, uid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM babies b WHERE b.id = bid AND b.user_id = uid)
      OR EXISTS (SELECT 1 FROM baby_members m WHERE m.baby_id = bid AND m.user_id = uid);
$$;

-- May uid write entries for baby bid? Owner needs Premium; a partner may
-- write while the owner has Premium. Entries without a baby need Premium.
CREATE OR REPLACE FUNCTION public.can_write_baby(bid TEXT, uid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN bid IS NULL THEN public.has_premium(uid)
    ELSE EXISTS (
      SELECT 1 FROM babies b
      WHERE b.id = bid
        AND public.has_premium(b.user_id)
        AND (b.user_id = uid OR EXISTS (SELECT 1 FROM baby_members m WHERE m.baby_id = bid AND m.user_id = uid))
    )
    -- a baby that isn't on the server yet (pushed in the same sync) is the caller's own
    OR (NOT EXISTS (SELECT 1 FROM babies b WHERE b.id = bid) AND public.has_premium(uid))
  END;
$$;

-- May uid read an entry (log/growth)? Access follows the baby, so a
-- removed partner loses it, including entries they wrote. Entries without
-- a baby, or whose baby isn't on the server yet (an upsert checks this
-- before the baby's row is visible), belong to their writer.
CREATE OR REPLACE FUNCTION public.can_read_entry(bid TEXT, writer UUID, uid UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN bid IS NULL THEN writer = uid
    WHEN EXISTS (SELECT 1 FROM babies b WHERE b.id = bid) THEN public.can_access_baby(bid, uid)
    ELSE writer = uid
  END;
$$;

REVOKE ALL ON FUNCTION public.can_access_baby(TEXT, UUID), public.can_write_baby(TEXT, UUID), public.can_read_entry(TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_baby(TEXT, UUID), public.can_write_baby(TEXT, UUID), public.can_read_entry(TEXT, UUID, UUID) TO authenticated;

-- ── Policies: logs and growth are shared through their baby ──
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['logs','growth_logs'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS sync_select ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS sync_insert ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS sync_update ON %I', t);
    EXECUTE format('CREATE POLICY sync_select ON %I FOR SELECT TO authenticated
      USING (public.can_read_entry(baby_id, user_id, auth.uid()))', t);
    -- user_id records who last wrote the entry.
    EXECUTE format('CREATE POLICY sync_insert ON %I FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id AND public.can_write_baby(baby_id, auth.uid()))', t);
    EXECUTE format('CREATE POLICY sync_update ON %I FOR UPDATE TO authenticated
      USING (public.can_read_entry(baby_id, user_id, auth.uid()))
      WITH CHECK (auth.uid() = user_id AND public.can_write_baby(baby_id, auth.uid()))', t);
  END LOOP;
END $$;

-- ── Policies: babies ──
DROP POLICY IF EXISTS sync_select ON babies;
DROP POLICY IF EXISTS sync_insert ON babies;
DROP POLICY IF EXISTS sync_update ON babies;
-- user_id check first: an upsert must pass this for a row that isn't in
-- the table yet, which can_access_baby() can't see.
CREATE POLICY sync_select ON babies FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.can_access_baby(id, auth.uid()));
CREATE POLICY sync_insert ON babies FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.has_premium(auth.uid()));
CREATE POLICY sync_update ON babies FOR UPDATE TO authenticated
  USING (public.can_access_baby(id, auth.uid()))
  WITH CHECK (public.can_write_baby(id, auth.uid()));

-- The owner never changes, and only the owner can delete a baby.
CREATE OR REPLACE FUNCTION public.protect_baby_owner()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.user_id = OLD.user_id;
  IF NEW.deleted AND NOT OLD.deleted AND auth.uid() IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Only the baby''s owner can delete it';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS babies_protect_owner ON babies;
CREATE TRIGGER babies_protect_owner BEFORE UPDATE ON babies
  FOR EACH ROW EXECUTE FUNCTION public.protect_baby_owner();

-- ── RPCs used by the app ──

-- Owner (with Premium) creates a 6-character code, valid for 7 days.
-- Replaces any unused code for that baby.
CREATE OR REPLACE FUNCTION public.create_partner_invite(p_baby_id TEXT)
RETURNS TABLE (code TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  alphabet CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c TEXT; i INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM babies b WHERE b.id = p_baby_id AND b.user_id = auth.uid() AND NOT b.deleted) THEN
    RAISE EXCEPTION 'Only the baby''s owner can invite a partner';
  END IF;
  IF NOT public.has_premium(auth.uid()) THEN
    RAISE EXCEPTION 'Partner sharing needs Premium';
  END IF;
  DELETE FROM partner_invites pi WHERE pi.baby_id = p_baby_id AND pi.used_by IS NULL;
  LOOP
    c := '';
    FOR i IN 1..6 LOOP
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::INT, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM partner_invites pi WHERE pi.code = c);
  END LOOP;
  INSERT INTO partner_invites (code, baby_id, created_by, expires_at)
    VALUES (c, p_baby_id, auth.uid(), NOW() + INTERVAL '7 days');
  RETURN QUERY SELECT c, NOW() + INTERVAL '7 days';
END;
$$;

-- Partner redeems a code. Returns the baby's id, or NULL if the code is
-- wrong or expired (returned rather than raised, so the failed attempt is
-- recorded). Limited to 10 failed attempts per hour per user.
CREATE OR REPLACE FUNCTION public.accept_partner_invite(p_code TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv partner_invites%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in first'; END IF;
  IF (SELECT count(*) FROM invite_attempts a WHERE a.user_id = auth.uid() AND a.at > NOW() - INTERVAL '1 hour') >= 10 THEN
    RAISE EXCEPTION 'Too many attempts. Try again in an hour.';
  END IF;
  SELECT * INTO inv FROM partner_invites pi
    WHERE pi.code = upper(trim(p_code)) AND pi.used_by IS NULL AND pi.expires_at > NOW()
    FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO invite_attempts (user_id) VALUES (auth.uid());
    RETURN NULL;
  END IF;
  IF inv.created_by = auth.uid() THEN
    RAISE EXCEPTION 'That''s your own invite code. Send it to your partner.';
  END IF;
  INSERT INTO baby_members (baby_id, user_id) VALUES (inv.baby_id, auth.uid())
    ON CONFLICT DO NOTHING;
  UPDATE partner_invites SET used_by = auth.uid(), used_at = NOW() WHERE partner_invites.code = inv.code;
  RETURN inv.baby_id;
END;
$$;

-- Everyone with access to a baby, for the sharing screen.
CREATE OR REPLACE FUNCTION public.list_baby_members(p_baby_id TEXT)
RETURNS TABLE (user_id UUID, email TEXT, role TEXT, is_me BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT u.id, u.email::TEXT, 'owner', u.id = auth.uid()
    FROM babies b JOIN auth.users u ON u.id = b.user_id
    WHERE b.id = p_baby_id AND public.can_access_baby(p_baby_id, auth.uid())
  UNION ALL
  SELECT u.id, u.email::TEXT, m.role, u.id = auth.uid()
    FROM baby_members m JOIN auth.users u ON u.id = m.user_id
    WHERE m.baby_id = p_baby_id AND public.can_access_baby(p_baby_id, auth.uid());
$$;

-- The owner removes a partner, or a partner removes themselves.
CREATE OR REPLACE FUNCTION public.remove_baby_member(p_baby_id TEXT, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_user_id <> auth.uid()
     AND NOT EXISTS (SELECT 1 FROM babies b WHERE b.id = p_baby_id AND b.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only the baby''s owner can remove a partner';
  END IF;
  DELETE FROM baby_members m WHERE m.baby_id = p_baby_id AND m.user_id = p_user_id;
END;
$$;

-- True if the user is a partner on a baby whose owner has Premium
-- (so the app should sync for them even without their own subscription).
CREATE OR REPLACE FUNCTION public.has_shared_access()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM baby_members m JOIN babies b ON b.id = m.baby_id
    WHERE m.user_id = auth.uid() AND NOT b.deleted AND public.has_premium(b.user_id)
  );
$$;

REVOKE ALL ON FUNCTION public.create_partner_invite(TEXT), public.accept_partner_invite(TEXT),
  public.list_baby_members(TEXT), public.remove_baby_member(TEXT, UUID), public.has_shared_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_partner_invite(TEXT), public.accept_partner_invite(TEXT),
  public.list_baby_members(TEXT), public.remove_baby_member(TEXT, UUID), public.has_shared_access() TO authenticated;
