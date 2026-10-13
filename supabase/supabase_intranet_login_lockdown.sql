-- Connexion intranet : plus de lecture publique de la table users.
-- Le code n’est vérifié que par la fonction, avec blocage après plusieurs échecs.

CREATE TABLE IF NOT EXISTS public.intranet_login_guard (
  code_key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ
);

ALTER TABLE public.intranet_login_guard ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.intranet_login_guard FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.intranet_login(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT := trim(coalesce(p_code, ''));
  v_key TEXT;
  v_failures INTEGER := 0;
  v_locked TIMESTAMPTZ;
  r public.users%ROWTYPE;
BEGIN
  IF v_code !~ '^[0-9]{6}$' THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  v_key := md5(v_code);

  SELECT failures, locked_until
    INTO v_failures, v_locked
  FROM public.intranet_login_guard
  WHERE code_key = v_key;

  IF v_locked IS NOT NULL AND v_locked > now() THEN
    RETURN jsonb_build_object('ok', false, 'locked', true);
  END IF;

  SELECT *
    INTO r
  FROM public.users
  WHERE code = v_code
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.intranet_login_guard (code_key, failures, locked_until)
    VALUES (
      v_key,
      1,
      NULL
    )
    ON CONFLICT (code_key) DO UPDATE
      SET failures = public.intranet_login_guard.failures + 1,
          locked_until = CASE
            WHEN public.intranet_login_guard.failures + 1 >= 8 THEN now() + interval '15 minutes'
            ELSE NULL
          END;
    RETURN jsonb_build_object('ok', false);
  END IF;

  DELETE FROM public.intranet_login_guard WHERE code_key = v_key;

  RETURN jsonb_build_object(
    'ok', true,
    'user', jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'can_delete_quote', r.can_delete_quote,
      'can_add_activity', r.can_add_activity,
      'can_edit_activity', r.can_edit_activity,
      'can_delete_activity', r.can_delete_activity,
      'can_reset_data', r.can_reset_data,
      'can_access_activities', r.can_access_activities,
      'can_access_history', r.can_access_history,
      'can_access_users', r.can_access_users,
      'can_access_tickets', r.can_access_tickets,
      'can_access_modifications', r.can_access_modifications,
      'can_access_situation', r.can_access_situation,
      'can_access_activity_prices', r.can_access_activity_prices,
      'intranet_auth_email', r.intranet_auth_email
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.intranet_login(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.intranet_login(TEXT) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS users_select_public ON public.users;
CREATE POLICY users_select_authenticated
  ON public.users
  FOR SELECT
  TO authenticated
  USING (true);

REVOKE ALL ON FUNCTION public.get_client_stay_by_phone(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'update_hotels_updated_at',
        'update_public_hotels_catalog_updated_at',
        'update_public_hotel_rates_updated_at',
        'format_ticket_number',
        'quote_item_ticket_numbers',
        'phone_match_key',
        'reservation_name_prefix',
        'quote_has_open_activity'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path = public',
      r.proname,
      r.args
    );
  END LOOP;
END $$;

ALTER VIEW IF EXISTS public.recent_activity_deletions SET (security_invoker = true);
