-- Demandes de devis envoyées depuis la page Événements du site public.

CREATE TABLE IF NOT EXISTS public.public_event_requests (
  id BIGSERIAL PRIMARY KEY,
  site_key TEXT NOT NULL,
  last_name TEXT DEFAULT '',
  first_name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  hotel TEXT DEFAULT '',
  arrival_date TEXT DEFAULT '',
  departure_date TEXT DEFAULT '',
  message TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_event_requests_site_key ON public.public_event_requests (site_key);
CREATE INDEX IF NOT EXISTS idx_public_event_requests_created_at ON public.public_event_requests (created_at DESC);

ALTER TABLE public.public_event_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow insert public_event_requests" ON public.public_event_requests;
DROP POLICY IF EXISTS "Allow select public_event_requests" ON public.public_event_requests;
DROP POLICY IF EXISTS "Allow update public_event_requests" ON public.public_event_requests;
DROP POLICY IF EXISTS "Allow delete public_event_requests" ON public.public_event_requests;

CREATE POLICY "Allow insert public_event_requests"
  ON public.public_event_requests FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Allow select public_event_requests"
  ON public.public_event_requests FOR SELECT TO public USING (true);

CREATE POLICY "Allow update public_event_requests"
  ON public.public_event_requests FOR UPDATE TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete public_event_requests"
  ON public.public_event_requests FOR DELETE TO public USING (true);
