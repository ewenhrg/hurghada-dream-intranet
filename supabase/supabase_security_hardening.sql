-- =============================================================================
-- Durcissement sécurité (à exécuter APRÈS supabase_rls_lock_anon_writes.sql)
-- À exécuter dans Supabase → SQL Editor.
--
-- 1) is_intranet_authenticated() : une simple session Auth ne suffit plus
--    (un signUp public donnerait sinon les droits staff). Il faut la session
--    « ops » délivrée par intranet-session, ou un compte rédacteur lié à users.
-- 2) Table users (codes PIN) : lecture réservée aux sessions intranet valides.
-- 3) Anti brute-force PIN : l’ancien blocage était par code (md5), donc
--    inefficace contre un balayage 000000 → 999999. On ajoute un blocage par IP
--    et un plafond global, et intranet_login n’est plus appelable par anon.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Session intranet valide
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_intranet_authenticated()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      COALESCE((auth.jwt() -> 'app_metadata' ->> 'intranet_ops')::boolean, false)
      OR EXISTS (
        SELECT 1
        FROM public.users u
        WHERE u.intranet_auth_email IS NOT NULL
          AND LENGTH(TRIM(u.intranet_auth_email)) > 0
          AND LOWER(TRIM(u.intranet_auth_email)) = LOWER(TRIM(COALESCE(auth.jwt() ->> 'email', '')))
      )
    );
$$;

COMMENT ON FUNCTION public.is_intranet_authenticated() IS
  'Vrai si la session Auth est la session ops intranet (app_metadata.intranet_ops) ou un compte rédacteur lié à public.users.';

REVOKE ALL ON FUNCTION public.is_intranet_authenticated() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_intranet_authenticated() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Table users : plus lisible par n’importe quel compte Auth
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS users_select_authenticated ON public.users;
CREATE POLICY users_select_authenticated
  ON public.users
  FOR SELECT
  TO authenticated
  USING (public.is_intranet_authenticated());

-- ---------------------------------------------------------------------------
-- 3) Anti brute-force PIN (par IP + plafond global)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.intranet_login_failures (
  id BIGSERIAL PRIMARY KEY,
  ip TEXT NOT NULL,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intranet_login_failures_ip_at
  ON public.intranet_login_failures (ip, at);
CREATE INDEX IF NOT EXISTS idx_intranet_login_failures_at
  ON public.intranet_login_failures (at);

ALTER TABLE public.intranet_login_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.intranet_login_failures FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.intranet_login_guarded(p_code TEXT, p_ip TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ip TEXT := COALESCE(NULLIF(TRIM(p_ip), ''), 'unknown');
  v_ip_failures INTEGER;
  v_global_failures INTEGER;
  v_result JSONB;
BEGIN
  DELETE FROM public.intranet_login_failures WHERE at < now() - interval '1 day';

  -- 10 échecs / 15 min par IP
  SELECT count(*) INTO v_ip_failures
  FROM public.intranet_login_failures
  WHERE ip = v_ip AND at > now() - interval '15 minutes';

  -- 300 échecs / heure toutes IP confondues (attaque distribuée)
  SELECT count(*) INTO v_global_failures
  FROM public.intranet_login_failures
  WHERE at > now() - interval '1 hour';

  IF v_ip_failures >= 10 OR v_global_failures >= 300 THEN
    RETURN jsonb_build_object('ok', false, 'locked', true);
  END IF;

  v_result := public.intranet_login(p_code);

  IF COALESCE((v_result ->> 'ok')::boolean, false) THEN
    DELETE FROM public.intranet_login_failures WHERE ip = v_ip;
  ELSE
    INSERT INTO public.intranet_login_failures (ip) VALUES (v_ip);
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.intranet_login_guarded(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intranet_login_guarded(TEXT, TEXT) TO service_role;

-- L’Edge Function intranet-session (service_role) est désormais le seul point d’entrée.
REVOKE ALL ON FUNCTION public.intranet_login(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intranet_login(TEXT) TO service_role;
