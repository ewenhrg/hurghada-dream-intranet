-- Créer ou mettre à jour la table client_requests dans Supabase
CREATE TABLE IF NOT EXISTS public.client_requests (
  id BIGSERIAL PRIMARY KEY,
  site_key TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  client_name TEXT DEFAULT '',
  client_phone TEXT DEFAULT '',
  client_email TEXT DEFAULT '',
  client_hotel TEXT DEFAULT '',
  client_room TEXT DEFAULT '',
  client_neighborhood TEXT DEFAULT '',
  arrival_date DATE,
  departure_date DATE,
  selected_activities JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ajouter la colonne client_email si elle n'existe pas
ALTER TABLE public.client_requests 
ADD COLUMN IF NOT EXISTS client_email TEXT DEFAULT '';

-- Créer des index pour les recherches rapides
CREATE INDEX IF NOT EXISTS idx_client_requests_site_key ON public.client_requests(site_key);
CREATE INDEX IF NOT EXISTS idx_client_requests_token ON public.client_requests(token);
CREATE INDEX IF NOT EXISTS idx_client_requests_status ON public.client_requests(status);
CREATE INDEX IF NOT EXISTS idx_client_requests_created_at ON public.client_requests(created_at);

-- Activer Row Level Security (RLS)
ALTER TABLE public.client_requests ENABLE ROW LEVEL SECURITY;

-- Supprimer les politiques existantes si elles existent (pour éviter les erreurs)
DROP POLICY IF EXISTS "Allow insert client_requests" ON public.client_requests;
DROP POLICY IF EXISTS "Allow select client_requests" ON public.client_requests;
DROP POLICY IF EXISTS "Allow update client_requests" ON public.client_requests;
DROP POLICY IF EXISTS "Allow delete client_requests" ON public.client_requests;

-- Politique pour permettre l'INSERT (création)
CREATE POLICY "Allow insert client_requests"
ON public.client_requests
FOR INSERT
TO public
WITH CHECK (true);

-- Politique pour permettre le SELECT (lecture)
CREATE POLICY "Allow select client_requests"
ON public.client_requests
FOR SELECT
TO public
USING (true);

-- Politique pour permettre l'UPDATE (modification)
CREATE POLICY "Allow update client_requests"
ON public.client_requests
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Politique pour permettre le DELETE (suppression)
CREATE POLICY "Allow delete client_requests"
ON public.client_requests
FOR DELETE
TO public
USING (true);
