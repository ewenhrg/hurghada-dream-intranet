-- Options de pension (cases à cocher formulaire public).

ALTER TABLE public.public_hotel_requests
  ADD COLUMN IF NOT EXISTS board_all_inclusive BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.public_hotel_requests
  ADD COLUMN IF NOT EXISTS board_full_board BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.public_hotel_requests
  ADD COLUMN IF NOT EXISTS board_breakfast BOOLEAN NOT NULL DEFAULT false;
