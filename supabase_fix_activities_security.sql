-- Script de sécurité pour protéger les activités contre les suppressions accidentelles
-- Exécutez ce script dans l'éditeur SQL de Supabase

-- 1. Créer une table d'audit pour tracer toutes les suppressions
CREATE TABLE IF NOT EXISTS public.activities_deletion_audit (
  id BIGSERIAL PRIMARY KEY,
  activity_id BIGINT NOT NULL,
  activity_name TEXT,
  activity_site_key TEXT,
  deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_by TEXT, -- email ou identifiant de l'utilisateur si disponible
  deletion_reason TEXT,
  activity_data JSONB -- sauvegarde complète de l'activité supprimée
);

-- Index pour les recherches rapides
CREATE INDEX IF NOT EXISTS idx_activities_deletion_audit_activity_id ON public.activities_deletion_audit(activity_id);
CREATE INDEX IF NOT EXISTS idx_activities_deletion_audit_deleted_at ON public.activities_deletion_audit(deleted_at);
CREATE INDEX IF NOT EXISTS idx_activities_deletion_audit_site_key ON public.activities_deletion_audit(activity_site_key);

-- 2. Créer un trigger pour sauvegarder automatiquement les activités avant suppression
CREATE OR REPLACE FUNCTION public.audit_activity_deletion()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.activities_deletion_audit (
    activity_id,
    activity_name,
    activity_site_key,
    deleted_by,
    activity_data
  ) VALUES (
    OLD.id,
    OLD.name,
    OLD.site_key,
    auth.email(), -- email de l'utilisateur connecté si disponible
    row_to_json(OLD) -- sauvegarde complète de toutes les données
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Supprimer le trigger s'il existe déjà
DROP TRIGGER IF EXISTS activity_deletion_audit_trigger ON public.activities;

-- Créer le trigger
CREATE TRIGGER activity_deletion_audit_trigger
  BEFORE DELETE ON public.activities
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_activity_deletion();

-- 3. Activer RLS sur la table d'audit
ALTER TABLE public.activities_deletion_audit ENABLE ROW LEVEL SECURITY;

-- Politique pour permettre la lecture de l'audit (pour les admins)
CREATE POLICY "Allow select deletion audit"
ON public.activities_deletion_audit
FOR SELECT
TO public
USING (true);

-- 4. IMPORTANT : La politique DELETE actuelle est trop permissive
-- Elle permet à n'importe qui de supprimer des activités
-- Pour l'instant, on garde la politique existante mais on ajoute l'audit
-- Pour une sécurité maximale, vous devriez restreindre cette politique

-- Note : Pour restreindre les suppressions uniquement aux utilisateurs authentifiés,
-- vous pouvez remplacer la politique DELETE par :
/*
DROP POLICY IF EXISTS "Allow delete activities" ON public.activities;
CREATE POLICY "Allow delete activities"
ON public.activities
FOR DELETE
TO authenticated
USING (true);
*/

-- 5. Fonction pour restaurer une activité supprimée depuis l'audit
CREATE OR REPLACE FUNCTION public.restore_deleted_activity(audit_id BIGINT)
RETURNS BIGINT AS $$
DECLARE
  restored_id BIGINT;
  activity_record JSONB;
BEGIN
  -- Récupérer les données de l'audit
  SELECT activity_data INTO activity_record
  FROM public.activities_deletion_audit
  WHERE id = audit_id;
  
  IF activity_record IS NULL THEN
    RAISE EXCEPTION 'Aucun enregistrement d''audit trouvé avec l''ID %', audit_id;
  END IF;
  
  -- Insérer l'activité restaurée
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
  ) VALUES (
    activity_record->>'site_key',
    activity_record->>'name',
    COALESCE(activity_record->>'category', 'desert'),
    (activity_record->>'price_adult')::NUMERIC,
    (activity_record->>'price_child')::NUMERIC,
    (activity_record->>'price_baby')::NUMERIC,
    COALESCE(activity_record->>'age_child', ''),
    COALESCE(activity_record->>'age_baby', ''),
    COALESCE(activity_record->>'currency', 'EUR'),
    (activity_record->>'available_days')::BOOLEAN[],
    COALESCE(activity_record->>'notes', ''),
    COALESCE((activity_record->>'transfers')::JSONB, '{}'::JSONB),
    COALESCE((activity_record->>'created_at')::TIMESTAMP WITH TIME ZONE, NOW())
  ) RETURNING id INTO restored_id;
  
  RETURN restored_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Vue pour voir les suppressions récentes
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

-- Permettre la lecture de la vue
GRANT SELECT ON public.recent_activity_deletions TO public;
