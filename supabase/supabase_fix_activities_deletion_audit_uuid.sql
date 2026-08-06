-- =============================================================================
-- Fix audit suppressions activités : activity_id était BIGINT alors que
-- public.activities.id est UUID → le trigger bloquait tout DELETE.
--
-- Exécuter dans Supabase → SQL Editor → Run (une fois).
-- =============================================================================

DROP VIEW IF EXISTS public.recent_activity_deletions;

-- Conserver l’historique : passer en TEXT d’abord (bigint et uuid cohabitent),
-- puis en UUID (anciens ids numériques → uuid nil pour rester NOT NULL).
ALTER TABLE public.activities_deletion_audit
  ALTER COLUMN activity_id TYPE text USING activity_id::text;

ALTER TABLE public.activities_deletion_audit
  ALTER COLUMN activity_id TYPE uuid USING (
    CASE
      WHEN activity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN activity_id::uuid
      ELSE '00000000-0000-0000-0000-000000000000'::uuid
    END
  );

-- Trigger d’audit (inchangé fonctionnellement, types alignés)
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

-- Restauration : retourne l’uuid de la ligne réinsérée
DROP FUNCTION IF EXISTS public.restore_deleted_activity(BIGINT);
CREATE OR REPLACE FUNCTION public.restore_deleted_activity(audit_id BIGINT)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  restored_id uuid;
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

CREATE OR REPLACE VIEW public.recent_activity_deletions AS
SELECT
  id,
  activity_id,
  activity_name,
  activity_site_key,
  deleted_at,
  deleted_by,
  deletion_reason
FROM public.activities_deletion_audit
ORDER BY deleted_at DESC
LIMIT 100;

GRANT SELECT ON public.recent_activity_deletions TO public;

NOTIFY pgrst, 'reload schema';
