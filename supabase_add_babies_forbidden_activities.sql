-- Interdit aux bébés : désactive le choix bébé sur le catalogue public et l’intranet.
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS babies_forbidden BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.activities.babies_forbidden IS
  'Si true, les bébés ne sont pas acceptés (prix bébé ignoré, sélecteur masqué).';
