-- Nombre d'adultes et âges des enfants (formulaire public).

ALTER TABLE public.public_hotel_requests
  ADD COLUMN IF NOT EXISTS adults_count INTEGER DEFAULT 1;

ALTER TABLE public.public_hotel_requests
  ADD COLUMN IF NOT EXISTS child_ages TEXT DEFAULT '';
