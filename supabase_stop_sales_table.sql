-- Créer la table stop_sales dans Supabase
CREATE TABLE IF NOT EXISTS public.stop_sales (
  id BIGSERIAL PRIMARY KEY,
  site_key TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  activity_name TEXT NOT NULL,
  date DATE NOT NULL,
  created_by TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(site_key, activity_id, date)
);

-- Créer un index pour les recherches rapides
CREATE INDEX IF NOT EXISTS idx_stop_sales_site_key ON public.stop_sales(site_key);
CREATE INDEX IF NOT EXISTS idx_stop_sales_activity_id ON public.stop_sales(activity_id);
CREATE INDEX IF NOT EXISTS idx_stop_sales_date ON public.stop_sales(date);

-- Activer Row Level Security (RLS)
ALTER TABLE public.stop_sales ENABLE ROW LEVEL SECURITY;

-- Politique pour permettre l'INSERT (création)
CREATE POLICY "Allow insert stop_sales"
ON public.stop_sales
FOR INSERT
TO public
WITH CHECK (true);

-- Politique pour permettre le SELECT (lecture)
CREATE POLICY "Allow select stop_sales"
ON public.stop_sales
FOR SELECT
TO public
USING (true);

-- Politique pour permettre l'UPDATE (modification)
CREATE POLICY "Allow update stop_sales"
ON public.stop_sales
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Politique pour permettre le DELETE (suppression)
CREATE POLICY "Allow delete stop_sales"
ON public.stop_sales
FOR DELETE
TO public
USING (true);

-- Créer la table push_sales dans Supabase
CREATE TABLE IF NOT EXISTS public.push_sales (
  id BIGSERIAL PRIMARY KEY,
  site_key TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  activity_name TEXT NOT NULL,
  date DATE NOT NULL,
  created_by TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(site_key, activity_id, date)
);

-- Créer un index pour les recherches rapides
CREATE INDEX IF NOT EXISTS idx_push_sales_site_key ON public.push_sales(site_key);
CREATE INDEX IF NOT EXISTS idx_push_sales_activity_id ON public.push_sales(activity_id);
CREATE INDEX IF NOT EXISTS idx_push_sales_date ON public.push_sales(date);

-- Activer Row Level Security (RLS)
ALTER TABLE public.push_sales ENABLE ROW LEVEL SECURITY;

-- Politique pour permettre l'INSERT (création)
CREATE POLICY "Allow insert push_sales"
ON public.push_sales
FOR INSERT
TO public
WITH CHECK (true);

-- Politique pour permettre le SELECT (lecture)
CREATE POLICY "Allow select push_sales"
ON public.push_sales
FOR SELECT
TO public
USING (true);

-- Politique pour permettre l'UPDATE (modification)
CREATE POLICY "Allow update push_sales"
ON public.push_sales
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Politique pour permettre le DELETE (suppression)
CREATE POLICY "Allow delete push_sales"
ON public.push_sales
FOR DELETE
TO public
USING (true);

