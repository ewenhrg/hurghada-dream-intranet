-- Demandes de modification ou d'annulation envoyées depuis le site client.

CREATE TABLE IF NOT EXISTS public.public_modification_requests (
  id BIGSERIAL PRIMARY KEY,
  site_key TEXT NOT NULL,
  reservation_code TEXT NOT NULL DEFAULT '',
  ticket_number TEXT NOT NULL DEFAULT '',
  client_name TEXT NOT NULL DEFAULT '',
  client_phone TEXT NOT NULL DEFAULT '',
  hotel TEXT NOT NULL DEFAULT '',
  activity_name TEXT NOT NULL DEFAULT '',
  activity_date TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'modify',
  change_type TEXT NOT NULL DEFAULT '',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  refund_percent INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT public_modification_requests_kind_ok CHECK (kind IN ('modify', 'cancel')),
  CONSTRAINT public_modification_requests_status_ok CHECK (
    status IN ('pending', 'accepted', 'refused', 'to_send', 'sent', 'to_refund', 'done')
  )
);

CREATE INDEX IF NOT EXISTS idx_public_modification_requests_site
  ON public.public_modification_requests (site_key, status, created_at DESC);

ALTER TABLE public.public_modification_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow insert public_modification_requests" ON public.public_modification_requests;
DROP POLICY IF EXISTS "Allow select public_modification_requests" ON public.public_modification_requests;
DROP POLICY IF EXISTS "Allow update public_modification_requests" ON public.public_modification_requests;
DROP POLICY IF EXISTS "Allow delete public_modification_requests" ON public.public_modification_requests;

CREATE POLICY "Allow insert public_modification_requests"
  ON public.public_modification_requests FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Allow select public_modification_requests"
  ON public.public_modification_requests FOR SELECT TO public USING (true);

CREATE POLICY "Allow update public_modification_requests"
  ON public.public_modification_requests FOR UPDATE TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete public_modification_requests"
  ON public.public_modification_requests FOR DELETE TO public USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.public_modification_requests TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.public_modification_requests_id_seq TO anon, authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.public_modification_requests;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
