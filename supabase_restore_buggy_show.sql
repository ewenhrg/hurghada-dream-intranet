-- Script pour restaurer/configurer l'activité BUGGY + SHOW correctement
-- Exécutez ce script dans l'éditeur SQL de Supabase

-- ⚠️ IMPORTANT : Remplacez 'hurghada_dream_0606' par votre site_key réel si différent
-- Vous pouvez vérifier votre site_key dans la table activities existante :
-- SELECT DISTINCT site_key FROM public.activities LIMIT 5;

-- 1. Mettre à jour l'activité BUGGY + SHOW existante avec la configuration correcte
UPDATE public.activities 
SET 
  name = 'BUGGY + SHOW', -- Nom exact (en majuscules avec le signe +)
  category = 'desert', -- Catégorie Désert
  price_adult = 0, -- price_adult = 0 (les prix sont gérés par le système spécial : Buggy Simple 120€, Buggy Family 160€)
  price_child = 0, -- price_child = 0
  price_baby = 0, -- price_baby = 0
  age_child = '', -- age_child vide
  age_baby = '', -- age_baby vide
  currency = 'EUR', -- currency
  available_days = ARRAY[true, true, true, true, true, true, true]::BOOLEAN[], -- Disponible tous les jours (ou ajustez selon vos besoins)
  notes = 'Buggy Simple : 120€ | Buggy Family : 160€', -- Notes descriptives
  transfers = '{}'::JSONB -- transfers vide par défaut (vous pouvez configurer les transferts par quartier si nécessaire)
WHERE (LOWER(name) LIKE '%buggy%show%'
  OR LOWER(name) LIKE '%buggy + show%'
  OR LOWER(name) = 'buggy + show')
  AND site_key = 'hurghada_dream_0606'; -- ⚠️ REMPLACEZ PAR VOTRE SITE_KEY SI NÉCESSAIRE

-- 2. Si l'activité n'existe pas, la créer
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
SELECT 
  'hurghada_dream_0606', -- ⚠️ REMPLACEZ PAR VOTRE SITE_KEY SI NÉCESSAIRE
  'BUGGY + SHOW', -- Nom exact (en majuscules avec le signe +)
  'desert', -- Catégorie Désert
  0, -- price_adult = 0 (les prix sont gérés par le système spécial)
  0, -- price_child = 0
  0, -- price_baby = 0
  '', -- age_child vide
  '', -- age_baby vide
  'EUR', -- currency
  ARRAY[true, true, true, true, true, true, true]::BOOLEAN[], -- Disponible tous les jours (ou ajustez selon vos besoins)
  'Buggy Simple : 120€ | Buggy Family : 160€', -- Notes descriptives
  '{}'::JSONB, -- transfers vide par défaut (vous pouvez configurer les transferts par quartier si nécessaire)
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM public.activities 
  WHERE (LOWER(name) LIKE '%buggy%show%'
    OR LOWER(name) LIKE '%buggy + show%'
    OR LOWER(name) = 'buggy + show')
    AND site_key = 'hurghada_dream_0606' -- ⚠️ REMPLACEZ PAR VOTRE SITE_KEY SI NÉCESSAIRE
);

-- 3. Vérifier que l'activité a été configurée correctement
SELECT 
  id,
  site_key,
  name,
  category,
  price_adult,
  price_child,
  price_baby,
  available_days,
  notes,
  created_at
FROM public.activities
WHERE (LOWER(name) LIKE '%buggy%show%'
  OR LOWER(name) LIKE '%buggy + show%'
  OR LOWER(name) = 'buggy + show')
  AND site_key = 'hurghada_dream_0606' -- ⚠️ REMPLACEZ PAR VOTRE SITE_KEY SI NÉCESSAIRE
ORDER BY created_at DESC
LIMIT 5;
