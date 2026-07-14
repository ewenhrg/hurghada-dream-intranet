-- =============================================================================
-- Extension accès rédacteur intranet : Ewen, Léa / Lea, Sophia
-- À exécuter dans Supabase → SQL Editor (une fois par projet).
--
-- Prérequis pour Sophia (comme Ewen / Léa) :
--   1) Créer un utilisateur Auth (ex. sophia.intranet@…)
--   2) Mot de passe Auth = le code à 6 chiffres de public.users.code
--   3) UPDATE public.users SET intranet_auth_email = 'sophia.intranet@…'
--      WHERE LOWER(BTRIM(name)) = 'sophia';
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_intranet_ewen_or_lea_writer()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND COALESCE(TRIM(auth.jwt() ->> 'email'), '') <> ''
    AND EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.intranet_auth_email IS NOT NULL
        AND LENGTH(TRIM(u.intranet_auth_email)) > 0
        AND LOWER(TRIM(u.intranet_auth_email)) = LOWER(TRIM((auth.jwt() ->> 'email')))
        AND (
          LOWER(BTRIM(u.name)) = 'ewen'
          OR LOWER(BTRIM(u.name)) IN ('léa', 'lea')
          OR LOWER(BTRIM(u.name)) = 'sophia'
        )
    );
$$;

COMMENT ON FUNCTION public.is_intranet_ewen_or_lea_writer() IS
  'Utilisé par les politiques RLS : rédacteurs base = Ewen/Léa/Sophia avec intranet_auth_email = email JWT.';

COMMENT ON COLUMN public.users.intranet_auth_email IS
  'Email du compte Supabase Auth pour Ewen/Léa/Sophia : doit matcher auth.jwt() après signInWithPassword (mot de passe = code à 6 chiffres).';
