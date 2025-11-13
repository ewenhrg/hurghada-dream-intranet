-- Créer la table client_requests dans Supabase
CREATE TABLE IF NOT EXISTS public.client_requests (
  id BIGSERIAL PRIMARY KEY,
  site_key TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  client_name TEXT DEFAULT '',
  client_phone TEXT DEFAULT '',
  client_hotel TEXT DEFAULT '',
  client_room TEXT DEFAULT '',
  client_neighborhood TEXT DEFAULT '',
  arrival_date DATE,
  departure_date DATE,
  selected_activities JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'pending',
  notes TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  converted_at TIMESTAMP WITH TIME ZONE,
  converted_to_quote_id BIGINT
);

-- Créer des index pour les recherches rapides
CREATE INDEX IF NOT EXISTS idx_client_requests_site_key ON public.client_requests(site_key);
CREATE INDEX IF NOT EXISTS idx_client_requests_token ON public.client_requests(token);
CREATE INDEX IF NOT EXISTS idx_client_requests_status ON public.client_requests(status);
CREATE INDEX IF NOT EXISTS idx_client_requests_created_at ON public.client_requests(created_at);

-- Activer Row Level Security (RLS)
ALTER TABLE public.client_requests ENABLE ROW LEVEL SECURITY;

-- Politique pour permettre l'INSERT (création) - public pour permettre aux clients de créer des demandes
CREATE POLICY "Allow insert client_requests"
ON public.client_requests
FOR INSERT
TO public
WITH CHECK (true);

-- Politique pour permettre le SELECT (lecture) - public pour permettre aux clients de voir leur demande via token
CREATE POLICY "Allow select client_requests"
ON public.client_requests
FOR SELECT
TO public
USING (true);

-- Politique pour permettre l'UPDATE (modification) - public pour permettre aux clients de modifier leur demande
CREATE POLICY "Allow update client_requests"
ON public.client_requests
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Politique pour permettre le DELETE (suppression) - public pour permettre aux clients de supprimer leur demande
CREATE POLICY "Allow delete client_requests"
ON public.client_requests
FOR DELETE
TO public
USING (true);

