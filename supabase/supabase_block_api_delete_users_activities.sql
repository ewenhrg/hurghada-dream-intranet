-- =============================================================================
-- Sécurité : bloquer les DELETE sur users et activities via l’API (clé anon)
--
-- Contexte : avec les politiques « Allow delete … USING (true) TO public »,
-- n’importe qui disposant de la clé anon (visible dans le navigateur) peut
-- supprimer des utilisateurs ou des activités — d’où des pertes « toutes seules ».
--
-- Après exécution :
--   - SELECT / INSERT / UPDATE depuis l’appli : inchangés.
--   - DELETE via supabase-js (navigateur) : refusé (RLS, aucune politique DELETE).
--   - DELETE manuel : SQL Editor Supabase avec un rôle qui bypass RLS (postgres).
--
-- Dashboard Supabase → SQL → New query → Run (une fois).
-- Optionnel : exécuter avant ou après supabase_fix_activities_security.sql (audit).
-- =============================================================================

-- --- Audit des suppressions d’utilisateurs (utile si suppression depuis le SQL Editor)
CREATE TABLE IF NOT EXISTS public.users_deletion_audit (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  user_name TEXT,
  user_code TEXT,
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_by TEXT,
  user_data JSONB
);

CREATE INDEX IF NOT EXISTS idx_users_deletion_audit_deleted_at
  ON public.users_deletion_audit (deleted_at);
CREATE INDEX IF NOT EXISTS idx_users_deletion_audit_user_id
  ON public.users_deletion_audit (user_id);

CREATE OR REPLACE FUNCTION public.audit_user_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users_deletion_audit (
    user_id,
    user_name,
    user_code,
    deleted_by,
    user_data
  )
  VALUES (
    OLD.id,
    OLD.name,
    OLD.code,
    auth.email(),
    row_to_json(OLD)::jsonb
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS user_deletion_audit_trigger ON public.users;
CREATE TRIGGER user_deletion_audit_trigger
  BEFORE DELETE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_user_deletion();

ALTER TABLE public.users_deletion_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select users deletion audit" ON public.users_deletion_audit;
CREATE POLICY "Allow select users deletion audit"
  ON public.users_deletion_audit
  FOR SELECT
  TO public
  USING (true);

-- --- Retrait des politiques DELETE permissives (effet : plus de DELETE via PostgREST anon)
DROP POLICY IF EXISTS "Allow delete users" ON public.users;
DROP POLICY IF EXISTS "Allow delete activities" ON public.activities;

-- Avec RLS activé et sans politique FOR DELETE, les suppressions via l’API publique sont refusées.
