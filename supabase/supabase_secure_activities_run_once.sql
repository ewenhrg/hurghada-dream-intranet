-- =============================================================================
-- SÉCURITÉ ACTIVITÉS — à exécuter UNE FOIS dans Supabase → SQL Editor
--
-- Protège contre les suppressions « toutes seules » :
--   1) Audit : chaque DELETE est journalisé (table + trigger)
--   2) Blocage DELETE via l’API publique (clé anon du navigateur)
--
-- Après exécution :
--   - L’app peut toujours lire / créer / modifier les activités
--   - DELETE depuis le navigateur (supabase-js) : refusé sauf session Ewen/Léa Auth
--   - Diagnostic : supabase_diagnose_activity_deletions.sql
--   - Restauration : fonction restore_deleted_activity(audit_id)
-- =============================================================================

-- --- 1. Audit des suppressions d’activités ---
CREATE TABLE IF NOT EXISTS public.activities_deletion_audit (
  id BIGSERIAL PRIMARY KEY,
  activity_id BIGINT NOT NULL,
  activity_name TEXT,
  activity_site_key TEXT,
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_by TEXT,
  deletion_reason TEXT,
  activity_data JSONB
);

CREATE INDEX IF NOT EXISTS idx_activities_deletion_audit_activity_id
  ON public.activities_deletion_audit (activity_id);
CREATE INDEX IF NOT EXISTS idx_activities_deletion_audit_deleted_at
  ON public.activities_deletion_audit (deleted_at);
CREATE INDEX IF NOT EXISTS idx_activities_deletion_audit_site_key
  ON public.activities_deletion_audit (activity_site_key);

CREATE OR REPLACE FUNCTION public.audit_activity_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.activities_deletion_audit (
    activity_id,
    activity_name,
    activity_site_key,
    deleted_by,
    activity_data
  )
  VALUES (
    OLD.id,
    OLD.name,
    OLD.site_key,
    auth.email(),
    row_to_json(OLD)::jsonb
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS activity_deletion_audit_trigger ON public.activities;
CREATE TRIGGER activity_deletion_audit_trigger
  BEFORE DELETE ON public.activities
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_activity_deletion();

ALTER TABLE public.activities_deletion_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select deletion audit" ON public.activities_deletion_audit;
CREATE POLICY "Allow select deletion audit"
  ON public.activities_deletion_audit
  FOR SELECT
  TO public
  USING (true);

-- --- 2. Bloquer DELETE anon (politique permissive « Allow delete activities ») ---
DROP POLICY IF EXISTS "Allow delete activities" ON public.activities;

-- Si supabase_rls_ewen_lea_intranet_writers.sql est déjà appliqué, la politique
-- activities_delete_authenticated_ewen_lea reste active pour Ewen/Léa connectés Auth.

-- --- 3. Fonction de restauration depuis l’audit ---
CREATE OR REPLACE FUNCTION public.restore_deleted_activity(audit_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  restored_id BIGINT;
  activity_record JSONB;
BEGIN
  SELECT activity_data INTO activity_record
  FROM public.activities_deletion_audit
  WHERE id = audit_id;

  IF activity_record IS NULL THEN
    RAISE EXCEPTION 'Aucun enregistrement d''audit trouvé avec l''ID %', audit_id;
  END IF;

  INSERT INTO public.activities (
    site_key,
    name,
    category,
    price_adult,
    price_child,
    price_baby,
    age_child,
    age_baby,
    currency,
    available_days,
    notes,
    transfers,
    created_at
  )
  VALUES (
    activity_record->>'site_key',
    activity_record->>'name',
    COALESCE(activity_record->>'category', 'desert'),
    COALESCE((activity_record->>'price_adult')::NUMERIC, 0),
    COALESCE((activity_record->>'price_child')::NUMERIC, 0),
    COALESCE((activity_record->>'price_baby')::NUMERIC, 0),
    COALESCE(activity_record->>'age_child', ''),
    COALESCE(activity_record->>'age_baby', ''),
    COALESCE(activity_record->>'currency', 'EUR'),
    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(activity_record->'available_days')::BOOLEAN),
      ARRAY[false, false, false, false, false, false, false]::BOOLEAN[]
    ),
    COALESCE(activity_record->>'notes', ''),
    COALESCE((activity_record->>'transfers')::JSONB, '{}'::JSONB),
    COALESCE((activity_record->>'created_at')::TIMESTAMPTZ, NOW())
  )
  RETURNING id INTO restored_id;

  RETURN restored_id;
END;
$$;
