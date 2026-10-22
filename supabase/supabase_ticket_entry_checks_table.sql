-- Cases « Vu » de la page Data entry, partagées entre les comptes autorisés.

CREATE TABLE IF NOT EXISTS public.ticket_entry_checks (
  id BIGSERIAL PRIMARY KEY,
  site_key TEXT NOT NULL,
  ticket_number TEXT NOT NULL,
  checked_by TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ticket_entry_checks_site_ticket UNIQUE (site_key, ticket_number)
);

CREATE INDEX IF NOT EXISTS idx_ticket_entry_checks_site
  ON public.ticket_entry_checks (site_key, ticket_number);

ALTER TABLE public.ticket_entry_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select ticket_entry_checks" ON public.ticket_entry_checks;
DROP POLICY IF EXISTS "Allow insert ticket_entry_checks" ON public.ticket_entry_checks;
DROP POLICY IF EXISTS "Allow update ticket_entry_checks" ON public.ticket_entry_checks;
DROP POLICY IF EXISTS "Allow delete ticket_entry_checks" ON public.ticket_entry_checks;

CREATE POLICY "Allow select ticket_entry_checks"
  ON public.ticket_entry_checks FOR SELECT TO public USING (true);

CREATE POLICY "Allow insert ticket_entry_checks"
  ON public.ticket_entry_checks FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Allow update ticket_entry_checks"
  ON public.ticket_entry_checks FOR UPDATE TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete ticket_entry_checks"
  ON public.ticket_entry_checks FOR DELETE TO public USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ticket_entry_checks TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.ticket_entry_checks_id_seq TO anon, authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_entry_checks;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
