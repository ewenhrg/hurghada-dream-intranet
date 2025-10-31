-- Créer la table quotes dans Supabase
CREATE TABLE IF NOT EXISTS public.quotes (
  id BIGSERIAL PRIMARY KEY,
  site_key TEXT NOT NULL,
  client_name TEXT DEFAULT '',
  client_phone TEXT DEFAULT '',
  client_hotel TEXT DEFAULT '',
  client_room TEXT DEFAULT '',
  client_neighborhood TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  total NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'EUR',
  items JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Créer un index pour les recherches rapides
CREATE INDEX IF NOT EXISTS idx_quotes_site_key ON public.quotes(site_key);
CREATE INDEX IF NOT EXISTS idx_quotes_client_phone ON public.quotes(client_phone);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON public.quotes(created_at);

-- Activer Row Level Security (RLS)
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

-- Politique pour permettre l'INSERT (création)
CREATE POLICY "Allow insert quotes"
ON public.quotes
FOR INSERT
TO public
WITH CHECK (true);

-- Politique pour permettre le SELECT (lecture)
CREATE POLICY "Allow select quotes"
ON public.quotes
FOR SELECT
TO public
USING (true);

-- Politique pour permettre l'UPDATE (modification)
CREATE POLICY "Allow update quotes"
ON public.quotes
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Politique pour permettre le DELETE (suppression)
CREATE POLICY "Allow delete quotes"
ON public.quotes
FOR DELETE
TO public
USING (true);

