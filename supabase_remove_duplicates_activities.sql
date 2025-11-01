-- Script pour supprimer les activités en double dans Supabase
-- Les doublons sont identifiés par site_key, name, et category
-- On garde la version la plus récente (created_at le plus récent) de chaque activité

-- Étape 1 : Voir les doublons (pour vérification)
SELECT 
  site_key,
  name,
  category,
  COUNT(*) as count,
  ARRAY_AGG(id ORDER BY created_at DESC) as ids,
  ARRAY_AGG(created_at ORDER BY created_at DESC) as created_dates
FROM public.activities
GROUP BY site_key, name, category
HAVING COUNT(*) > 1
ORDER BY count DESC, name;

-- Étape 2 : Supprimer les doublons (garder le plus récent)
-- Supprimer les activités en double en gardant uniquement celle avec l'ID le plus élevé (la plus récente)
DELETE FROM public.activities
WHERE id IN (
  SELECT id
  FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY site_key, name, category 
        ORDER BY created_at DESC, id DESC
      ) as row_num
    FROM public.activities
  ) sub
  WHERE row_num > 1
);

-- Vérification finale : compter les doublons restants (devrait être 0)
SELECT 
  site_key,
  name,
  category,
  COUNT(*) as count
FROM public.activities
GROUP BY site_key, name, category
HAVING COUNT(*) > 1;

