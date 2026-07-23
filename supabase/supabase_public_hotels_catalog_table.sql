-- =============================================================================
-- Catalogue public des hôtels (fiche /hotels + admin intranet)
-- À exécuter dans Supabase → SQL Editor (une fois).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.public_hotels_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_key TEXT NOT NULL DEFAULT 'hurghada_dream_0606',
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  maps_url TEXT NOT NULL DEFAULT '',
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  tagline TEXT NOT NULL DEFAULT '',
  stars INTEGER NOT NULL DEFAULT 4 CHECK (stars >= 1 AND stars <= 5),
  badge TEXT NOT NULL DEFAULT '',
  accent TEXT NOT NULL DEFAULT 'violet',
  description TEXT NOT NULL DEFAULT '',
  highlights JSONB NOT NULL DEFAULT '[]'::jsonb,
  amenities JSONB NOT NULL DEFAULT '[]'::jsonb,
  image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  baby_age_min INTEGER NOT NULL DEFAULT 0,
  baby_age_max INTEGER NOT NULL DEFAULT 1,
  child_age_min INTEGER NOT NULL DEFAULT 2,
  child_age_max INTEGER NOT NULL DEFAULT 11,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT public_hotels_catalog_site_slug_unique UNIQUE (site_key, slug),
  CONSTRAINT public_hotels_catalog_baby_age_range CHECK (baby_age_min >= 0 AND baby_age_max >= baby_age_min AND baby_age_max <= 17),
  CONSTRAINT public_hotels_catalog_child_age_range CHECK (child_age_min >= 0 AND child_age_max >= child_age_min AND child_age_max <= 17)
);

CREATE INDEX IF NOT EXISTS idx_public_hotels_catalog_site_sort
  ON public.public_hotels_catalog (site_key, sort_order ASC, name ASC);

CREATE INDEX IF NOT EXISTS idx_public_hotels_catalog_published
  ON public.public_hotels_catalog (site_key, is_published);

ALTER TABLE public.public_hotels_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_hotels_catalog_select_anon" ON public.public_hotels_catalog;
DROP POLICY IF EXISTS "public_hotels_catalog_select_authenticated" ON public.public_hotels_catalog;
DROP POLICY IF EXISTS "public_hotels_catalog_insert_anon" ON public.public_hotels_catalog;
DROP POLICY IF EXISTS "public_hotels_catalog_insert_authenticated" ON public.public_hotels_catalog;
DROP POLICY IF EXISTS "public_hotels_catalog_update_anon" ON public.public_hotels_catalog;
DROP POLICY IF EXISTS "public_hotels_catalog_update_authenticated" ON public.public_hotels_catalog;
DROP POLICY IF EXISTS "public_hotels_catalog_delete_anon" ON public.public_hotels_catalog;
DROP POLICY IF EXISTS "public_hotels_catalog_delete_authenticated" ON public.public_hotels_catalog;

-- Lecture publique (catalogue client) + écriture intranet (anon PIN / JWT)
CREATE POLICY "public_hotels_catalog_select_anon"
  ON public.public_hotels_catalog FOR SELECT TO anon USING (true);
CREATE POLICY "public_hotels_catalog_select_authenticated"
  ON public.public_hotels_catalog FOR SELECT TO authenticated USING (true);

CREATE POLICY "public_hotels_catalog_insert_anon"
  ON public.public_hotels_catalog FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "public_hotels_catalog_insert_authenticated"
  ON public.public_hotels_catalog FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "public_hotels_catalog_update_anon"
  ON public.public_hotels_catalog FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_hotels_catalog_update_authenticated"
  ON public.public_hotels_catalog FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "public_hotels_catalog_delete_anon"
  ON public.public_hotels_catalog FOR DELETE TO anon USING (true);
CREATE POLICY "public_hotels_catalog_delete_authenticated"
  ON public.public_hotels_catalog FOR DELETE TO authenticated USING (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.public_hotels_catalog TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_public_hotels_catalog_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_public_hotels_catalog_updated_at ON public.public_hotels_catalog;
CREATE TRIGGER trg_public_hotels_catalog_updated_at
  BEFORE UPDATE ON public.public_hotels_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.update_public_hotels_catalog_updated_at();

NOTIFY pgrst, 'reload schema';

COMMENT ON TABLE public.public_hotels_catalog IS
  'Catalogue public des hôtels (/hotels) — éditable depuis l''intranet.';
