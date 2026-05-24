-- Dates de séjour (formulaire public).

ALTER TABLE public.public_hotel_requests
  ADD COLUMN IF NOT EXISTS arrival_date TEXT DEFAULT '';

ALTER TABLE public.public_hotel_requests
  ADD COLUMN IF NOT EXISTS departure_date TEXT DEFAULT '';
