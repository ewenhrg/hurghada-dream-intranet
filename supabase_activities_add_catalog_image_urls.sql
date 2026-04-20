-- Galerie publique : URLs d’images (HTTPS) stockées en JSONB.
-- Exécuter dans l’éditeur SQL Supabase après avoir appliqué supabase_add_description_to_activities.sql si besoin.

ALTER TABLE public.activities
ADD COLUMN IF NOT EXISTS catalog_image_urls JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.activities.catalog_image_urls IS
  'Tableau JSON d’URLs HTTPS affichées sur la fiche catalogue public (max 12 côté appli).';

-- Vérification
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'activities'
  AND column_name IN ('description', 'catalog_image_urls');
