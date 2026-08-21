-- Documents PDF / images liés à un devis activités (historique).
-- Exécuter une fois dans le SQL Editor Supabase.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS client_documents JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.quotes.client_documents IS
  'Fichiers client (passeport, billet, etc.) : [{ id, type, label, fileName, url, mimeType, uploadedAt }]';
