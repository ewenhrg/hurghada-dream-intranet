-- Airbnb / lien Google Maps sur les demandes catalogue public (public_quotes).
-- Exécuter une fois dans le SQL Editor Supabase.

ALTER TABLE public.public_quotes
  ADD COLUMN IF NOT EXISTS client_is_airbnb BOOLEAN DEFAULT false;

ALTER TABLE public.public_quotes
  ADD COLUMN IF NOT EXISTS client_airbnb_maps_url TEXT DEFAULT '';

COMMENT ON COLUMN public.public_quotes.client_is_airbnb IS
  'True si le logement est un Airbnb (lien Maps fourni par le client).';

COMMENT ON COLUMN public.public_quotes.client_airbnb_maps_url IS
  'URL Google Maps du logement Airbnb (catalogue public).';
