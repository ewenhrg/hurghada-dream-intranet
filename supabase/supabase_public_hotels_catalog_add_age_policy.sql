-- =============================================================================
-- Âges bébé / enfant par hôtel (catalogue public)
-- À exécuter dans Supabase → SQL Editor.
-- =============================================================================

ALTER TABLE public.public_hotels_catalog
  ADD COLUMN IF NOT EXISTS baby_age_min INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS baby_age_max INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS child_age_min INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS child_age_max INTEGER NOT NULL DEFAULT 11;

ALTER TABLE public.public_hotels_catalog
  DROP CONSTRAINT IF EXISTS public_hotels_catalog_baby_age_range;
ALTER TABLE public.public_hotels_catalog
  ADD CONSTRAINT public_hotels_catalog_baby_age_range
  CHECK (baby_age_min >= 0 AND baby_age_max >= baby_age_min AND baby_age_max <= 17);

ALTER TABLE public.public_hotels_catalog
  DROP CONSTRAINT IF EXISTS public_hotels_catalog_child_age_range;
ALTER TABLE public.public_hotels_catalog
  ADD CONSTRAINT public_hotels_catalog_child_age_range
  CHECK (child_age_min >= 0 AND child_age_max >= child_age_min AND child_age_max <= 17);

COMMENT ON COLUMN public.public_hotels_catalog.baby_age_min IS 'Âge min inclus (ans) considéré comme bébé';
COMMENT ON COLUMN public.public_hotels_catalog.baby_age_max IS 'Âge max inclus (ans) considéré comme bébé';
COMMENT ON COLUMN public.public_hotels_catalog.child_age_min IS 'Âge min inclus (ans) considéré comme enfant';
COMMENT ON COLUMN public.public_hotels_catalog.child_age_max IS 'Âge max inclus (ans) considéré comme enfant';

NOTIFY pgrst, 'reload schema';
