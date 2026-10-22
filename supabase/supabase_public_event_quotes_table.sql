-- Devis événementiels rédigés depuis l'intranet (lignes libres + statut d'envoi).
-- Même accès que public_event_requests : l'intranet s'authentifie par code PIN,
-- pas par Supabase Auth, et lit ces tables avec la clé publique.

CREATE TABLE IF NOT EXISTS public.public_event_quotes (
  id BIGSERIAL PRIMARY KEY,
  site_key TEXT NOT NULL,
  request_id BIGINT REFERENCES public.public_event_requests(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  hotel TEXT NOT NULL DEFAULT '',
  arrival_date TEXT NOT NULL DEFAULT '',
  departure_date TEXT NOT NULL DEFAULT '',
  event_type TEXT NOT NULL DEFAULT '',
  event_date TEXT NOT NULL DEFAULT '',
  guest_count INTEGER,
  budget TEXT NOT NULL DEFAULT '',
  wants_photographer BOOLEAN NOT NULL DEFAULT false,
  client_message TEXT NOT NULL DEFAULT '',
  lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT public_event_quotes_status_ok
    CHECK (status IN ('pending', 'sent', 'awaiting_payment')),
  CONSTRAINT public_event_quotes_lines_ok
    CHECK (jsonb_typeof(lines) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_public_event_quotes_site_key
  ON public.public_event_quotes (site_key, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_public_event_quotes_request
  ON public.public_event_quotes (request_id)
  WHERE request_id IS NOT NULL;

ALTER TABLE public.public_event_quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow insert public_event_quotes" ON public.public_event_quotes;
DROP POLICY IF EXISTS "Allow select public_event_quotes" ON public.public_event_quotes;
DROP POLICY IF EXISTS "Allow update public_event_quotes" ON public.public_event_quotes;
DROP POLICY IF EXISTS "Allow delete public_event_quotes" ON public.public_event_quotes;

CREATE POLICY "Allow insert public_event_quotes"
  ON public.public_event_quotes FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Allow select public_event_quotes"
  ON public.public_event_quotes FOR SELECT TO public USING (true);

CREATE POLICY "Allow update public_event_quotes"
  ON public.public_event_quotes FOR UPDATE TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete public_event_quotes"
  ON public.public_event_quotes FOR DELETE TO public USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.public_event_quotes TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.public_event_quotes_id_seq TO anon, authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.public_event_quotes;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
