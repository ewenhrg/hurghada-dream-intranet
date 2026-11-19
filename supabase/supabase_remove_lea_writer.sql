-- Retirer Léa des rédacteurs RLS + supprimer le compte intranet.
CREATE OR REPLACE FUNCTION public.is_intranet_ewen_or_lea_writer()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
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
          OR LOWER(BTRIM(u.name)) = 'sophia'
          OR LOWER(BTRIM(u.name)) = 'karim'
        )
    );
$function$;

COMMENT ON FUNCTION public.is_intranet_ewen_or_lea_writer() IS
  'Utilisé par les politiques RLS : rédacteurs base = Ewen/Sophia/Karim avec intranet_auth_email = email JWT.';

DELETE FROM public.users
WHERE LOWER(BTRIM(name)) IN ('lea', 'léa');
