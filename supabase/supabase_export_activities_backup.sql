-- Export / sauvegarde de toutes les activités (Supabase)
-- Exécutez ce script dans l'éditeur SQL de Supabase pour obtenir une sauvegarde

-- 1. Voir le nombre d'activités par site
SELECT 
  site_key,
  COUNT(*) AS nombre_activites,
  MIN(created_at) AS plus_ancienne,
  MAX(created_at) AS plus_recente
FROM public.activities
GROUP BY site_key
ORDER BY site_key;

-- 2. Exporter toutes les activités en JSON (copier le résultat)
-- Vous pouvez copier le résultat et le sauvegarder dans un fichier .json
SELECT json_build_object(
  'version', 1,
  'exportedAt', NOW()::TIMESTAMPTZ::TEXT,
  'source', 'supabase',
  'count', (SELECT COUNT(*) FROM public.activities),
  'activities', (
    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
    FROM (
      SELECT 
        id,
        site_key,
        name,
        category,
        price_adult AS "priceAdult",
        price_child AS "priceChild",
        price_baby AS "priceBaby",
        age_child AS "ageChild",
        age_baby AS "ageBaby",
        currency,
        available_days AS "availableDays",
        notes,
        description,
        transfers,
        created_at AS "createdAt"
      FROM public.activities
      ORDER BY id DESC
    ) t
  )
) AS backup;

-- 3. (Optionnel) Exporter uniquement votre site_key
-- Remplacez 'hurghada_dream_0606' par votre site_key
/*
SELECT json_build_object(
  'version', 1,
  'exportedAt', NOW()::TIMESTAMPTZ::TEXT,
  'site_key', 'hurghada_dream_0606',
  'source', 'supabase',
  'count', (SELECT COUNT(*) FROM public.activities WHERE site_key = 'hurghada_dream_0606'),
  'activities', (
    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
    FROM (
      SELECT 
        id AS supabase_id,
        site_key,
        name,
        category,
        price_adult AS "priceAdult",
        price_child AS "priceChild",
        price_baby AS "priceBaby",
        age_child AS "ageChild",
        age_baby AS "ageBaby",
        currency,
        available_days AS "availableDays",
        notes,
        description,
        transfers,
        created_at AS "createdAt"
      FROM public.activities
      WHERE site_key = 'hurghada_dream_0606'
      ORDER BY id DESC
    ) t
  )
) AS backup;
*/
