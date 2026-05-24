-- Demandes hôtel envoyées depuis le formulaire public (/demande-hotel).

CREATE TABLE IF NOT EXISTS public.public_hotel_requests (
  id BIGSERIAL PRIMARY KEY,
  site_key TEXT NOT NULL,
  first_name TEXT DEFAULT '',
  last_name TEXT DEFAULT '',
  client_phone TEXT DEFAULT '',
  client_email TEXT DEFAULT '',
  arrival_date TEXT DEFAULT '',
  departure_date TEXT DEFAULT '',
  hotel_option_1 TEXT DEFAULT '',
  hotel_option_2 TEXT DEFAULT '',
  hotel_option_3 TEXT DEFAULT '',
  budget TEXT DEFAULT '',
  wants_custom_offer BOOLEAN NOT NULL DEFAULT false,
  board_all_inclusive BOOLEAN NOT NULL DEFAULT false,
  board_full_board BOOLEAN NOT NULL DEFAULT false,
  board_breakfast BOOLEAN NOT NULL DEFAULT false,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_hotel_requests_site_key ON public.public_hotel_requests (site_key);
CREATE INDEX IF NOT EXISTS idx_public_hotel_requests_created_at ON public.public_hotel_requests (created_at DESC);

ALTER TABLE public.public_hotel_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow insert public_hotel_requests"
  ON public.public_hotel_requests FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Allow select public_hotel_requests"
  ON public.public_hotel_requests FOR SELECT TO public USING (true);

CREATE POLICY "Allow update public_hotel_requests"
  ON public.public_hotel_requests FOR UPDATE TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete public_hotel_requests"
  ON public.public_hotel_requests FOR DELETE TO public USING (true);

-- Temps réel (optionnel) :
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.public_hotel_requests;
