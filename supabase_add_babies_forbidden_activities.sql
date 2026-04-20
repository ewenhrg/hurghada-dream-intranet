-- Interdit aux bébés : désactive le choix bébé sur le catalogue public et l’intranet.
--
-- À EXÉCUTER DANS SUPABASE : Table Editor → SQL → coller → Run
-- (Sans ce script, l’intranet peut échouer à l’enregistrement si l’app envoie babies_forbidden.)
--
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS babies_forbidden BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.activities.babies_forbidden IS
  'Si true, les bébés ne sont pas acceptés (prix bébé ignoré, sélecteur masqué).';
