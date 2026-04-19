-- =============================================================================
-- Suppressions sécurisées (activités + utilisateurs) — PIN côté base
-- Exécuter dans Supabase : Dashboard → SQL → New query → Run.
--
-- Après exécution :
--   1) Changez le PIN par défaut :
--        UPDATE public.hd_delete_secrets
--        SET secret_value = 'votre_code_secret'
--        WHERE secret_key = 'pin';
--   2) Déployez l’intranet : les pages Activités / Utilisateurs appellent les RPC.
--
-- Effet : plus de DELETE direct via l’API PostgREST ; seuls les RPC (avec PIN)
--        peuvent supprimer une ligne. La clé anon seule ne suffit plus.
-- =============================================================================

-- Table interne : aucune lecture pour anon / authenticated (RLS sans politique)
CREATE TABLE IF NOT EXISTS public.hd_delete_secrets (
  secret_key text PRIMARY KEY,
  secret_value text NOT NULL
);

ALTER TABLE public.hd_delete_secrets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.hd_delete_secrets FROM PUBLIC;
REVOKE ALL ON TABLE public.hd_delete_secrets FROM anon, authenticated;

INSERT INTO public.hd_delete_secrets (secret_key, secret_value)
VALUES ('pin', 'CHANGE_ME_AVANT_PROD')
ON CONFLICT (secret_key) DO NOTHING;

-- Ancienne définition (ex. paramètre p_actor_code) : CREATE OR REPLACE ne peut pas renommer les args.
DROP FUNCTION IF EXISTS public.hd_delete_activity_secure(bigint, text);
DROP FUNCTION IF EXISTS public.hd_delete_user_secure(bigint, text);

CREATE OR REPLACE FUNCTION public.hd_delete_activity_secure(p_activity_id bigint, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expected text;
BEGIN
  SELECT s.secret_value INTO expected
  FROM public.hd_delete_secrets s
  WHERE s.secret_key = 'pin'
  LIMIT 1;

  IF expected IS NULL THEN
    RAISE EXCEPTION 'PIN non configuré (hd_delete_secrets)';
  END IF;

  IF p_pin IS NULL OR btrim(p_pin) = '' OR p_pin <> expected THEN
    RAISE EXCEPTION 'Code PIN incorrect';
  END IF;

  DELETE FROM public.activities
  WHERE id = p_activity_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aucune activité avec cet identifiant';
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', p_activity_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.hd_delete_user_secure(p_user_id bigint, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expected text;
BEGIN
  SELECT s.secret_value INTO expected
  FROM public.hd_delete_secrets s
  WHERE s.secret_key = 'pin'
  LIMIT 1;

  IF expected IS NULL THEN
    RAISE EXCEPTION 'PIN non configuré (hd_delete_secrets)';
  END IF;

  IF p_pin IS NULL OR btrim(p_pin) = '' OR p_pin <> expected THEN
    RAISE EXCEPTION 'Code PIN incorrect';
  END IF;

  DELETE FROM public.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aucun utilisateur avec cet identifiant';
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', p_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.hd_delete_activity_secure(bigint, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hd_delete_user_secure(bigint, text) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Allow delete activities" ON public.activities;
DROP POLICY IF EXISTS "Allow delete users" ON public.users;
