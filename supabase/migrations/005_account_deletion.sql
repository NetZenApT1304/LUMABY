-- ═══════════════════════════════════════════════════
--  LUMABY — Delete my account (required by the App Store and Google Play)
--  Run after 004_push_reminders.sql. Safe to re-run.
--
--  The app calls supabase.rpc('delete_my_account'). It removes the signed-in
--  user and everything that belongs to them:
--    • their babies, and every log/growth entry on those babies (including
--      entries a partner added), invites and partner memberships;
--    • their reminder settings, push subscriptions and sent-reminder log;
--    • their profile and subscription rows, and the login itself.
--  Entries they added to someone else's baby (as a partner) are handed to
--  that baby's owner, so the other parent keeps the record.
--
--  An active subscription that will renew blocks deletion (error
--  'active_subscription'): deleting the account wouldn't stop Lemon Squeezy
--  billing, so the app asks the user to cancel first.
-- ═══════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_signed_in'; END IF;

  IF EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.user_id = uid AND s.status IN ('active', 'trialing', 'past_due', 'unpaid', 'on_trial')
      AND NOT COALESCE(s.cancel_at_period_end, false)
      AND (s.expires_at IS NULL OR s.expires_at > NOW())
  ) THEN
    RAISE EXCEPTION 'active_subscription';
  END IF;

  -- Their entries on babies they don't own go to the baby's owner.
  UPDATE logs l SET user_id = b.user_id, updated_at = NOW()
    FROM babies b WHERE l.baby_id = b.id AND l.user_id = uid AND b.user_id <> uid;
  UPDATE growth_logs g SET user_id = b.user_id, updated_at = NOW()
    FROM babies b WHERE g.baby_id = b.id AND g.user_id = uid AND b.user_id <> uid;

  -- Everything on their own babies, whoever wrote it.
  DELETE FROM logs        WHERE baby_id IN (SELECT id FROM babies WHERE user_id = uid);
  DELETE FROM growth_logs WHERE baby_id IN (SELECT id FROM babies WHERE user_id = uid);
  DELETE FROM reminder_sent WHERE user_id = uid OR baby_id IN (SELECT id FROM babies WHERE user_id = uid);
  DELETE FROM invite_attempts WHERE user_id = uid;

  -- The rest (babies, baby_members, invites, logs without a baby, profile,
  -- subscriptions, push and reminder rows) cascades from auth.users.
  DELETE FROM auth.users WHERE id = uid;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
