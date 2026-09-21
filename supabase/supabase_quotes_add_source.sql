-- Origine du devis : 'manual' (saisie intranet) ou 'web' (demande catalogue public).
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

COMMENT ON COLUMN public.quotes.source IS
  'manual = devis saisi dans l’intranet ; web = issu d’une demande catalogue public.';

UPDATE public.quotes
SET source = 'web'
WHERE source IS DISTINCT FROM 'web'
  AND LOWER(TRIM(COALESCE(created_by_name, ''))) IN ('public devis', 'public');
