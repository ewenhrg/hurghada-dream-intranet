-- =============================================================================
-- Tarifs hôtels (contrats) : prix par catégorie + période de dates
-- À exécuter dans Supabase → SQL Editor.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.public_hotel_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_key TEXT NOT NULL DEFAULT 'hurghada_dream_0606',
  hotel_slug TEXT NOT NULL,
  hotel_name TEXT NOT NULL DEFAULT '',
  room_category TEXT NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  price_adult NUMERIC(12, 2) NOT NULL,
  price_child NUMERIC(12, 2),
  price_baby NUMERIC(12, 2),
  currency TEXT NOT NULL DEFAULT 'EUR',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT public_hotel_rates_dates_ok CHECK (date_to >= date_from),
  CONSTRAINT public_hotel_rates_adult_ok CHECK (price_adult >= 0),
  CONSTRAINT public_hotel_rates_child_ok CHECK (price_child IS NULL OR price_child >= 0),
  CONSTRAINT public_hotel_rates_baby_ok CHECK (price_baby IS NULL OR price_baby >= 0)
);

CREATE INDEX IF NOT EXISTS idx_public_hotel_rates_site_hotel
  ON public.public_hotel_rates (site_key, hotel_slug, room_category);

CREATE INDEX IF NOT EXISTS idx_public_hotel_rates_dates
  ON public.public_hotel_rates (site_key, hotel_slug, date_from, date_to);

ALTER TABLE public.public_hotel_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_hotel_rates_select_anon" ON public.public_hotel_rates;
DROP POLICY IF EXISTS "public_hotel_rates_select_authenticated" ON public.public_hotel_rates;
DROP POLICY IF EXISTS "public_hotel_rates_insert_anon" ON public.public_hotel_rates;
DROP POLICY IF EXISTS "public_hotel_rates_insert_authenticated" ON public.public_hotel_rates;
DROP POLICY IF EXISTS "public_hotel_rates_update_anon" ON public.public_hotel_rates;
DROP POLICY IF EXISTS "public_hotel_rates_update_authenticated" ON public.public_hotel_rates;
DROP POLICY IF EXISTS "public_hotel_rates_delete_anon" ON public.public_hotel_rates;
DROP POLICY IF EXISTS "public_hotel_rates_delete_authenticated" ON public.public_hotel_rates;

CREATE POLICY "public_hotel_rates_select_anon"
  ON public.public_hotel_rates FOR SELECT TO anon USING (true);
CREATE POLICY "public_hotel_rates_select_authenticated"
  ON public.public_hotel_rates FOR SELECT TO authenticated USING (true);

CREATE POLICY "public_hotel_rates_insert_anon"
  ON public.public_hotel_rates FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "public_hotel_rates_insert_authenticated"
  ON public.public_hotel_rates FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "public_hotel_rates_update_anon"
  ON public.public_hotel_rates FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "public_hotel_rates_update_authenticated"
  ON public.public_hotel_rates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "public_hotel_rates_delete_anon"
  ON public.public_hotel_rates FOR DELETE TO anon USING (true);
CREATE POLICY "public_hotel_rates_delete_authenticated"
  ON public.public_hotel_rates FOR DELETE TO authenticated USING (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.public_hotel_rates TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.update_public_hotel_rates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_public_hotel_rates_updated_at ON public.public_hotel_rates;
CREATE TRIGGER trg_public_hotel_rates_updated_at
  BEFORE UPDATE ON public.public_hotel_rates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_public_hotel_rates_updated_at();

COMMENT ON TABLE public.public_hotel_rates IS
  'Tarifs contrats hôtel (catégorie + période) pour devis intranet.';

NOTIFY pgrst, 'reload schema';
