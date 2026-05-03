-- =============================================================================
-- RLS : seuls les comptes intranet « Ewen » et « Léa » (ou « Lea ») peuvent
-- INSERT / UPDATE / DELETE sur public.users et public.activities.
--
-- Mécanisme : l’application ouvre une session Supabase Auth après la connexion
-- par code (LoginPage) si la ligne public.users a intranet_auth_email renseigné
-- et que le nom est Ewen ou Léa. Le JWT porte l’email ; cette migration vérifie
-- l’alignement email + nom.
--
-- À faire AVANT ou JUSTE APRÈS ce script (Dashboard Supabase → Authentication) :
--   1) Créer deux utilisateurs Auth (ex. ewen.intranet@votredomaine.tld, lea.intranet@…).
--   2) Mot de passe Auth = le même code à 6 chiffres que dans public.users.code
--      (vous pouvez le changer ensuite via Authentication → user → reset password).
--   3) Mettre à jour les lignes métier :
--        UPDATE public.users SET intranet_auth_email = 'ewen.intranet@…' WHERE …;
--        UPDATE public.users SET intranet_auth_email = 'lea.intranet@…' WHERE …;
--   4) Si vous changez public.users.code pour un de ces comptes, mettez à jour le
--      mot de passe Auth pour qu’il reste identique au code (sinon signIn échoue).
--
-- Exécutez dans Supabase → SQL Editor (une fois par projet).
-- Incompatible avec les anciennes politiques « Allow * TO public USING (true) »
-- sur INSERT/UPDATE/DELETE pour users et activities : elles sont remplacées ici.
-- =============================================================================

-- Colonne optionnelle : email Supabase Auth pour la session « rédacteur » (unicité partielle : une valeur par email non nul)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS intranet_auth_email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_intranet_auth_email_unique
  ON public.users (intranet_auth_email)
  WHERE intranet_auth_email IS NOT NULL AND length(trim(intranet_auth_email)) > 0;

COMMENT ON COLUMN public.users.intranet_auth_email IS
  'Email du compte Supabase Auth pour Ewen/Léa : doit matcher auth.jwt() après signInWithPassword (mot de passe = code à 6 chiffres).';

-- Vrai si le JWT courant correspond à une ligne users Ewen/Léa avec email aligné
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
        )
    );
$$;

COMMENT ON FUNCTION public.is_intranet_ewen_or_lea_writer() IS
  'Utilisé par les politiques RLS : rédacteurs base = Ewen/Léa avec intranet_auth_email = email JWT.';

-- ---------------------------------------------------------------------------
-- public.users
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow select users" ON public.users;
DROP POLICY IF EXISTS "Allow insert users" ON public.users;
DROP POLICY IF EXISTS "Allow update users" ON public.users;
DROP POLICY IF EXISTS "Allow delete users" ON public.users;

CREATE POLICY "users_select_public"
  ON public.users
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "users_insert_authenticated_ewen_lea"
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_intranet_ewen_or_lea_writer());

CREATE POLICY "users_update_authenticated_ewen_lea"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (public.is_intranet_ewen_or_lea_writer())
  WITH CHECK (public.is_intranet_ewen_or_lea_writer());

CREATE POLICY "users_delete_authenticated_ewen_lea"
  ON public.users
  FOR DELETE
  TO authenticated
  USING (public.is_intranet_ewen_or_lea_writer());

-- ---------------------------------------------------------------------------
-- public.activities
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow insert activities" ON public.activities;
DROP POLICY IF EXISTS "Allow select activities" ON public.activities;
DROP POLICY IF EXISTS "Allow update activities" ON public.activities;
DROP POLICY IF EXISTS "Allow delete activities" ON public.activities;

CREATE POLICY "activities_select_public"
  ON public.activities
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "activities_insert_authenticated_ewen_lea"
  ON public.activities
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_intranet_ewen_or_lea_writer());

CREATE POLICY "activities_update_authenticated_ewen_lea"
  ON public.activities
  FOR UPDATE
  TO authenticated
  USING (public.is_intranet_ewen_or_lea_writer())
  WITH CHECK (public.is_intranet_ewen_or_lea_writer());

CREATE POLICY "activities_delete_authenticated_ewen_lea"
  ON public.activities
  FOR DELETE
  TO authenticated
  USING (public.is_intranet_ewen_or_lea_writer());
