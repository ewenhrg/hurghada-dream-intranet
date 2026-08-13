-- Marque qui a cliqué « Commencer le devis » sur une demande catalogue.
ALTER TABLE public.public_quotes
ADD COLUMN IF NOT EXISTS treated_by_name TEXT DEFAULT '';

ALTER TABLE public.public_quotes
ADD COLUMN IF NOT EXISTS treated_at TIMESTAMPTZ;

COMMENT ON COLUMN public.public_quotes.treated_by_name IS
  'Nom de l''utilisateur intranet qui a commencé le devis (vide = en attente).';

CREATE INDEX IF NOT EXISTS idx_public_quotes_pending
ON public.public_quotes (site_key, created_at DESC)
WHERE COALESCE(treated_by_name, '') = '';

NOTIFY pgrst, 'reload schema';
