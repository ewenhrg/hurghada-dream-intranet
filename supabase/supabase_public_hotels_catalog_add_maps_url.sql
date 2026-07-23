-- =============================================================================
-- Lien Google Maps par hôtel (catalogue public)
-- Les colonnes lat/lng restent remplies automatiquement à partir du lien.
-- À exécuter dans Supabase → SQL Editor.
-- =============================================================================

ALTER TABLE public.public_hotels_catalog
  ADD COLUMN IF NOT EXISTS maps_url TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN public.public_hotels_catalog.maps_url IS
  'Lien Google Maps collé depuis l''admin ; lat/lng dérivés pour la mini-carte.';

NOTIFY pgrst, 'reload schema';
