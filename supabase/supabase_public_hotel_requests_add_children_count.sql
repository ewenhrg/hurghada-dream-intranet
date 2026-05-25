-- Nombre d'enfants (formulaire public).

ALTER TABLE public.public_hotel_requests
  ADD COLUMN IF NOT EXISTS children_count INTEGER DEFAULT 0;
