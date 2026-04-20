-- Corrige site_key sur la table documents si des lignes ont été créées
-- quand VITE_SITE_KEY était par erreur l’URL du projet Supabase.
-- À exécuter une fois dans l’éditeur SQL Supabase.

UPDATE public.documents
SET site_key = 'hurghada_dream_0606'
WHERE site_key LIKE 'https://%.supabase.co%'
   OR site_key = 'https://uvqzqlfzhgbknkpvybbj.supabase.co';

-- Si votre clé métier n’est pas hurghada_dream_0606, remplacez-la ci-dessus
-- (même valeur que activities.site_key et VITE_SITE_KEY).

SELECT id, title, site_key FROM public.documents ORDER BY created_at DESC LIMIT 20;
