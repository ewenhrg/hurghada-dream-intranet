-- Qui a modifié modifiéifié le devis (Historique → Modifier).
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS updated_by_name TEXT DEFAULT '';

COMMENT ON COLUMN public.quotes.updated_by_name IS
  'Nom de la dernière personne ayant modifié le devis (édition Historique).';

NOTIFY pgrst, 'reload schema';
