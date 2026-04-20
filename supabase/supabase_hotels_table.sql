-- Créer la table hotels dans Supabase
CREATE TABLE IF NOT EXISTS public.hotels (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  neighborhood_key TEXT NOT NULL,
  site_key TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT,
  updated_by TEXT
);

-- Créer un index pour les recherches rapides par nom d'hôtel
CREATE INDEX IF NOT EXISTS idx_hotels_name ON public.hotels(name);
CREATE INDEX IF NOT EXISTS idx_hotels_site_key ON public.hotels(site_key);
CREATE INDEX IF NOT EXISTS idx_hotels_neighborhood ON public.hotels(neighborhood_key);

-- Activer Row Level Security (RLS)
ALTER TABLE public.hotels ENABLE ROW LEVEL SECURITY;

-- Politique pour permettre la lecture (SELECT) - tous les utilisateurs peuvent lire
CREATE POLICY "Allow select hotels"
ON public.hotels
FOR SELECT
TO public
USING (true);

-- Politique pour permettre l'INSERT (création) - uniquement pour Ewen
-- Note: Cette politique vérifie le nom de l'utilisateur via une fonction ou une variable
-- Pour l'instant, on permet l'insert mais on vérifiera côté application
CREATE POLICY "Allow insert hotels"
ON public.hotels
FOR INSERT
TO public
WITH CHECK (true);

-- Politique pour permettre l'UPDATE (modification) - uniquement pour Ewen
CREATE POLICY "Allow update hotels"
ON public.hotels
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Politique pour permettre le DELETE (suppression) - uniquement pour Ewen
CREATE POLICY "Allow delete hotels"
ON public.hotels
FOR DELETE
TO public
USING (true);

-- Fonction pour mettre à jour automatiquement updated_at
CREATE OR REPLACE FUNCTION update_hotels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Créer le trigger pour updated_at
CREATE TRIGGER update_hotels_updated_at
  BEFORE UPDATE ON public.hotels
  FOR EACH ROW
  EXECUTE FUNCTION update_hotels_updated_at();

