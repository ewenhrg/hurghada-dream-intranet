-- Interdit aux bébés : désactive le choix bébé sur le catalogue public et l’intranet.
--
-- 1) Supabase Dashboard → SQL → coller ce fichier → Run
-- 2) Frontend : dans .env ou variables Vercel, définir :
--    VITE_SUPABASE_ACTIVITIES_BABIES_FORBIDDEN=true
--    puis rebuild / redéployer pour que l’app enregistre la case « Interdit aux bébés » en base.
--    (Sans la variable, l’app n’envoie pas ce champ pour éviter PGRST204 tant que la colonne n’existe pas.)
--
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS babies_forbidden BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.activities.babies_forbidden IS
  'Si true, les bébés ne sont pas acceptés (prix bébé ignoré, sélecteur masqué).';
