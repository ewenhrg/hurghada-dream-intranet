-- Masque une activité du catalogue public (site /catalogue) sans la supprimer de l’intranet.
ALTER TABLE public.activities
ADD COLUMN IF NOT EXISTS catalog_paused BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.activities.catalog_paused IS
  'Si true, l''activité n''apparaît plus sur le catalogue public (/catalogue).';

CREATE INDEX IF NOT EXISTS idx_activities_catalog_paused
ON public.activities (site_key, id DESC)
WHERE catalog_paused = true;

-- Recharge le cache schéma PostgREST (optionnel mais recommandé)
NOTIFY pgrst, 'reload schema';
