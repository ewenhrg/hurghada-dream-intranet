-- =============================================================================
-- Catégories de chambres (interne admin — non affiché sur le catalogue public)
-- À exécuter dans Supabase → SQL Editor.
-- =============================================================================

ALTER TABLE public.public_hotels_catalog
  ADD COLUMN IF NOT EXISTS room_categories JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.public_hotels_catalog.room_categories IS
  'Catégories de chambres (objets {name, maxAdults, maxChildren, maxBabies} ou noms) — intranet uniquement.';

NOTIFY pgrst, 'reload schema';
