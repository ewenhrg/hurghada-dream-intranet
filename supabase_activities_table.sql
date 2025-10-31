-- Créer ou mettre à jour la table activities dans Supabase
CREATE TABLE IF NOT EXISTS public.activities (
  id BIGSERIAL PRIMARY KEY,
  site_key TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'desert',
  price_adult NUMERIC DEFAULT 0,
  price_child NUMERIC DEFAULT 0,
  price_baby NUMERIC DEFAULT 0,
  age_child TEXT DEFAULT '',
  age_baby TEXT DEFAULT '',
  currency TEXT DEFAULT 'EUR',
  available_days BOOLEAN[] DEFAULT ARRAY[false, false, false, false, false, false, false]::BOOLEAN[],
  notes TEXT DEFAULT '',
  transfers JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ajouter les colonnes manquantes si elles n'existent pas (pour les tables existantes)
ALTER TABLE public.activities 
ADD COLUMN IF NOT EXISTS age_child TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS age_baby TEXT DEFAULT '';

-- Créer des index pour les recherches rapides
CREATE INDEX IF NOT EXISTS idx_activities_site_key ON public.activities(site_key);
CREATE INDEX IF NOT EXISTS idx_activities_category ON public.activities(category);

-- Activer Row Level Security (RLS)
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- Politique pour permettre l'INSERT (création)
CREATE POLICY "Allow insert activities"
ON public.activities
FOR INSERT
TO public
WITH CHECK (true);

-- Politique pour permettre le SELECT (lecture)
CREATE POLICY "Allow select activities"
ON public.activities
FOR SELECT
TO public
USING (true);

-- Politique pour permettre l'UPDATE (modification)
CREATE POLICY "Allow update activities"
ON public.activities
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Politique pour permettre le DELETE (suppression)
CREATE POLICY "Allow delete activities"
ON public.activities
FOR DELETE
TO public
USING (true);

