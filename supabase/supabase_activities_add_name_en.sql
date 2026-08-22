-- Nom anglais des activités (affiché sur les tickets imprimés).
-- Exécuter une fois sur Supabase (SQL Editor).

ALTER TABLE public.activities
ADD COLUMN IF NOT EXISTS name_en TEXT DEFAULT '';

COMMENT ON COLUMN public.activities.name_en IS
  'English activity name for printed tickets; French name stays in name.';
