-- Script de diagnostic pour identifier les suppressions d'activités
-- Exécutez ce script dans l'éditeur SQL de Supabase pour comprendre ce qui s'est passé

-- 1. Vérifier si la table d'audit existe et compter les suppressions
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'activities_deletion_audit')
    THEN 'Table d''audit trouvée ✅'
    ELSE 'Table d''audit NON trouvée ⚠️ - Exécutez supabase_fix_activities_security.sql'
  END as audit_status;

-- 2. Compter les suppressions récentes (dernières 24h)
SELECT 
  COUNT(*) as suppressions_24h,
  COUNT(DISTINCT activity_site_key) as sites_affectes
FROM public.activities_deletion_audit
WHERE deleted_at >= NOW() - INTERVAL '24 hours';

-- 3. Compter les suppressions récentes (dernières 7 jours)
SELECT 
  COUNT(*) as suppressions_7j,
  COUNT(DISTINCT activity_site_key) as sites_affectes
FROM public.activities_deletion_audit
WHERE deleted_at >= NOW() - INTERVAL '7 days';

-- 4. Liste des suppressions récentes (dernières 24h) avec détails
SELECT 
  id as audit_id,
  activity_id,
  activity_name,
  activity_site_key,
  deleted_at,
  deleted_by,
  deletion_reason
FROM public.activities_deletion_audit
WHERE deleted_at >= NOW() - INTERVAL '24 hours'
ORDER BY deleted_at DESC;

-- 5. Vérifier les activités actuellement dans la base
SELECT 
  site_key,
  COUNT(*) as nombre_activites,
  MIN(created_at) as plus_ancienne,
  MAX(created_at) as plus_recente
FROM public.activities
GROUP BY site_key
ORDER BY site_key;

-- 6. Vérifier s'il y a des doublons (qui pourraient expliquer des suppressions via le script de déduplication)
SELECT 
  site_key,
  name,
  category,
  COUNT(*) as nombre_doublons,
  ARRAY_AGG(id ORDER BY created_at DESC) as ids,
  ARRAY_AGG(created_at ORDER BY created_at DESC) as dates_creation
FROM public.activities
GROUP BY site_key, name, category
HAVING COUNT(*) > 1
ORDER BY nombre_doublons DESC, name;

-- 7. Vérifier les politiques RLS actuelles sur la table activities
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'activities'
ORDER BY policyname;

-- 8. Vérifier si le trigger d'audit est actif
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'activities'
  AND trigger_name LIKE '%audit%';

-- 9. Statistiques sur les suppressions par site_key
SELECT 
  activity_site_key,
  COUNT(*) as nombre_suppressions,
  MIN(deleted_at) as premiere_suppression,
  MAX(deleted_at) as derniere_suppression
FROM public.activities_deletion_audit
GROUP BY activity_site_key
ORDER BY nombre_suppressions DESC;

-- 10. Vérifier les activités qui ont été supprimées mais pourraient être restaurées
SELECT 
  ada.id as audit_id,
  ada.activity_id,
  ada.activity_name,
  ada.activity_site_key,
  ada.deleted_at,
  ada.deleted_by,
  CASE 
    WHEN EXISTS (SELECT 1 FROM public.activities WHERE id = ada.activity_id)
    THEN '⚠️ Activité déjà restaurée ou ID réutilisé'
    ELSE '✅ Peut être restaurée'
  END as statut_restauration
FROM public.activities_deletion_audit ada
WHERE ada.deleted_at >= NOW() - INTERVAL '7 days'
ORDER BY ada.deleted_at DESC
LIMIT 50;
