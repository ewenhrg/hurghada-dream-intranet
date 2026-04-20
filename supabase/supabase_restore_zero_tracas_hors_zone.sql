-- Script pour restaurer/configurer l'activité ZERO TRACAS HORS ZONE correctement
-- Exécutez ce script dans l'éditeur SQL de Supabase

-- ⚠️ IMPORTANT : Remplacez 'hurghada_dream_0606' par votre site_key réel si différent
-- Vous pouvez vérifier votre site_key dans la table activities existante :
-- SELECT DISTINCT site_key FROM public.activities LIMIT 5;

-- 1. Mettre à jour l'activité ZERO TRACAS HORS ZONE existante avec la configuration correcte
UPDATE public.activities 
SET 
  name = 'ZERO TRACAS HORS ZONE', -- Nom exact (en majuscules)
  category = 'exploration_bien_etre', -- Catégorie Exploration / Bien-être
  price_adult = 0, -- price_adult = 0 (les prix sont gérés par le système spécial ZERO TRACAS HORS ZONE)
  price_child = 0, -- price_child = 0
  price_baby = 0, -- price_baby = 0
  age_child = '', -- age_child vide
  age_baby = '', -- age_baby vide
  currency = 'EUR', -- currency
  available_days = ARRAY[true, true, true, true, true, true, true]::BOOLEAN[], -- Disponible tous les jours
  notes = 'Service complet HORS ZONE : Transfert + Visa + SIM (50€), Transfert + Visa (45€), Transfert 3 personnes (25€), Transfert +3 personnes (30€), Visa + SIM (40€), Visa seul (30€)', -- Notes descriptives
  transfers = '{}'::JSONB -- transfers vide (pas de transferts par quartier car déjà inclus dans les prix)
WHERE LOWER(name) LIKE '%zero tracas hors zone%'
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
  'ZERO TRACAS HORS ZONE', -- Nom exact (en majuscules)
  'exploration_bien_etre', -- Catégorie Exploration / Bien-être
  0, -- price_adult = 0 (les prix sont gérés par le système spécial)
  0, -- price_child = 0
  0, -- price_baby = 0
  '', -- age_child vide
  '', -- age_baby vide
  'EUR', -- currency
  ARRAY[true, true, true, true, true, true, true]::BOOLEAN[], -- Disponible tous les jours
  'Service complet HORS ZONE : Transfert + Visa + SIM (50€), Transfert + Visa (45€), Transfert 3 personnes (25€), Transfert +3 personnes (30€), Visa + SIM (40€), Visa seul (30€)', -- Notes descriptives
  '{}'::JSONB, -- transfers vide (pas de transferts par quartier car déjà inclus dans les prix)
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM public.activities 
  WHERE LOWER(name) LIKE '%zero tracas hors zone%'
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
WHERE LOWER(name) LIKE '%zero tracas hors zone%'
  AND site_key = 'hurghada_dream_0606' -- ⚠️ REMPLACEZ PAR VOTRE SITE_KEY SI NÉCESSAIRE
ORDER BY created_at DESC
LIMIT 5;
