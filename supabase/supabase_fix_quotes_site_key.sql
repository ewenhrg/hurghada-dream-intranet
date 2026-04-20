-- Corrige site_key sur les devis si des lignes ont été créées avec une mauvaise valeur
-- (ex. URL Supabase collée à la place de la clé métier, comme pour `documents`).
-- À adapter après : SELECT DISTINCT site_key FROM public.quotes ORDER BY 1;

UPDATE public.quotes
SET site_key = 'hurghada_dream_0606'
WHERE site_key LIKE 'https://%.supabase.co%';

-- Vérification rapide
-- SELECT id, client_name, site_key, created_at FROM public.quotes ORDER BY created_at DESC LIMIT 30;
