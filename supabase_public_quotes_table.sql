-- Table dédiée aux demandes envoyées depuis la page catalogue public (devis client).
-- Les devis intranet restent dans `public.quotes` ; ils n’apparaissent plus mélangés.

CREATE TABLE IF NOT EXISTS public.public_quotes (
  id BIGSERIAL PRIMARY KEY,
  site_key TEXT NOT NULL,
  client_name TEXT DEFAULT '',
  client_phone TEXT DEFAULT '',
  client_email TEXT DEFAULT '',
  client_hotel TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  total NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'EUR',
  items JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_quotes_site_key ON public.public_quotes (site_key);
CREATE INDEX IF NOT EXISTS idx_public_quotes_created_at ON public.public_quotes (created_at DESC);

ALTER TABLE public.public_quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow insert public_quotes"
  ON public.public_quotes FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Allow select public_quotes"
  ON public.public_quotes FOR SELECT TO public USING (true);

CREATE POLICY "Allow update public_quotes"
  ON public.public_quotes FOR UPDATE TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete public_quotes"
  ON public.public_quotes FOR DELETE TO public USING (true);

-- Temps réel : dans Supabase → Database → Publications, ajoutez la table `public_quotes`
-- (ou exécutez : ALTER PUBLICATION supabase_realtime ADD TABLE public.public_quotes;)

-- Optionnel : rapatrier les anciennes lignes encore dans `quotes` avec created_by_name « Public Devis »
/*
INSERT INTO public.public_quotes (
  site_key, client_name, client_phone, client_email, client_hotel, notes, total, currency, items, created_at, updated_at
)
SELECT
  site_key,
  COALESCE(client_name, ''),
  COALESCE(client_phone, ''),
  COALESCE(client_email, ''),
  COALESCE(client_hotel, ''),
  COALESCE(notes, ''),
  COALESCE(total, 0),
  COALESCE(currency, 'EUR'),
  CASE
    WHEN items IS NULL THEN '[]'::jsonb
    WHEN jsonb_typeof(items::jsonb) = 'array' THEN items::jsonb
    ELSE COALESCE(items::text::jsonb, '[]'::jsonb)
  END,
  COALESCE(created_at, NOW()),
  COALESCE(updated_at, created_at, NOW())
FROM public.quotes
WHERE LOWER(TRIM(COALESCE(created_by_name, ''))) = 'public devis'
  AND NOT EXISTS (
    SELECT 1 FROM public.public_quotes pq
    WHERE pq.site_key = quotes.site_key
      AND pq.client_phone IS NOT DISTINCT FROM quotes.client_phone
      AND pq.created_at = quotes.created_at
  );
*/
