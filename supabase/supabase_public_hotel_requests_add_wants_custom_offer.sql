-- Case « Je n'ai pas de choix d'hôtel — faites-moi une offre » (formulaire public).

ALTER TABLE public.public_hotel_requests
  ADD COLUMN IF NOT EXISTS wants_custom_offer BOOLEAN NOT NULL DEFAULT false;
