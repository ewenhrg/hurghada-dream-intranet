-- =============================================================================
-- Extension accès rédacteur intranet : ajouter Karim (même niveau qu’Ewen)
-- À exécuter dans Supabase → SQL Editor (une fois par projet).
--
-- Prérequis pour Karim (comme Ewen / Léa / Sophia) :
--   1) Créer un utilisateur Auth (ex. karim.intranet@…)
--   2) Mot de passe Auth = le code à 6 chiffres de public.users.code
--   3) UPDATE public.users SET intranet_auth_email = 'karim.intranet@…'
--      WHERE LOWER(BTRIM(name)) = 'karim';
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
          OR LOWER(BTRIM(u.name)) = 'karim'
        )
    );
$$;

COMMENT ON FUNCTION public.is_intranet_ewen_or_lea_writer() IS
  'Utilisé par les politiques RLS : rédacteurs base = Ewen/Léa/Sophia/Karim avec intranet_auth_email = email JWT.';

COMMENT ON COLUMN public.users.intranet_auth_email IS
  'Email du compte Supabase Auth pour Ewen/Léa/Sophia/Karim : doit matcher auth.jwt() après signInWithPassword (mot de passe = code à 6 chiffres).';
