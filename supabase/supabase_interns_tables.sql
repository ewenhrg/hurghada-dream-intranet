-- Stagiaires + appartements (colloc) — page intranet Ewen / Karim uniquement.

CREATE TABLE IF NOT EXISTS public.intern_apartments (
  id BIGSERIAL PRIMARY KEY,
  site_key TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  capacity INT NOT NULL DEFAULT 2 CHECK (capacity >= 1 AND capacity <= 20),
  notes TEXT NOT NULL DEFAULT '',
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intern_apartments_site_key
  ON public.intern_apartments (site_key);

CREATE TABLE IF NOT EXISTS public.interns (
  id BIGSERIAL PRIMARY KEY,
  site_key TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  age INT NULL CHECK (age IS NULL OR (age >= 14 AND age <= 80)),
  stage_start DATE NOT NULL,
  stage_end DATE NOT NULL,
  cv_url TEXT NOT NULL DEFAULT '',
  cv_file_name TEXT NOT NULL DEFAULT '',
  apartment_id BIGINT NULL REFERENCES public.intern_apartments(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT interns_stage_dates_ok CHECK (stage_end >= stage_start)
);

CREATE INDEX IF NOT EXISTS idx_interns_site_key ON public.interns (site_key);
CREATE INDEX IF NOT EXISTS idx_interns_stage_dates ON public.interns (site_key, stage_start, stage_end);
CREATE INDEX IF NOT EXISTS idx_interns_apartment_id ON public.interns (apartment_id);

ALTER TABLE public.intern_apartments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select intern_apartments" ON public.intern_apartments;
DROP POLICY IF EXISTS "Allow insert intern_apartments" ON public.intern_apartments;
DROP POLICY IF EXISTS "Allow update intern_apartments" ON public.intern_apartments;
DROP POLICY IF EXISTS "Allow delete intern_apartments" ON public.intern_apartments;

CREATE POLICY "Allow select intern_apartments"
ON public.intern_apartments FOR SELECT TO public USING (true);
CREATE POLICY "Allow insert intern_apartments"
ON public.intern_apartments FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow update intern_apartments"
ON public.intern_apartments FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete intern_apartments"
ON public.intern_apartments FOR DELETE TO public USING (true);

DROP POLICY IF EXISTS "Allow select interns" ON public.interns;
DROP POLICY IF EXISTS "Allow insert interns" ON public.interns;
DROP POLICY IF EXISTS "Allow update interns" ON public.interns;
DROP POLICY IF EXISTS "Allow delete interns" ON public.interns;

CREATE POLICY "Allow select interns"
ON public.interns FOR SELECT TO public USING (true);
CREATE POLICY "Allow insert interns"
ON public.interns FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow update interns"
ON public.interns FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete interns"
ON public.interns FOR DELETE TO public USING (true);

COMMENT ON TABLE public.intern_apartments IS 'Appartements colloc pour stagiaires (intranet Ewen/Karim).';
COMMENT ON TABLE public.interns IS 'Stagiaires : identité, dates de stage, CV, attribution appartement.';
