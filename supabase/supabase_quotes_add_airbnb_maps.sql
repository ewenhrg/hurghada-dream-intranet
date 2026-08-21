-- Airbnb / lien Google Maps sur un devis activités.
-- Exécuter une fois dans le SQL Editor Supabase.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS client_is_airbnb BOOLEAN DEFAULT false;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS client_airbnb_maps_url TEXT DEFAULT '';

COMMENT ON COLUMN public.quotes.client_is_airbnb IS
  'True si le logement est un Airbnb (lien Maps plutôt qu’un hôtel catalogue).';

COMMENT ON COLUMN public.quotes.client_airbnb_maps_url IS
  'URL Google Maps du logement Airbnb.';
