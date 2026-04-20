-- ============================================================
-- Page Documents : table + stockage des fichiers (Supabase)
-- Exécuter ce script dans l'éditeur SQL de ton projet Supabase.
-- ============================================================

-- Table des documents (titre, lien, fichier, note)
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_key TEXT NOT NULL DEFAULT 'hurghada_dream_0606',
  title TEXT NOT NULL DEFAULT '',
  link TEXT DEFAULT '',
  file_url TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by_name TEXT DEFAULT ''
);

-- Index pour filtrer par site
CREATE INDEX IF NOT EXISTS idx_documents_site_key ON public.documents(site_key);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON public.documents(created_at DESC);

-- RLS (Row Level Security)
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select documents"
ON public.documents FOR SELECT TO public USING (true);

CREATE POLICY "Allow insert documents"
ON public.documents FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Allow update documents"
ON public.documents FOR UPDATE TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete documents"
ON public.documents FOR DELETE TO public USING (true);

-- ============================================================
-- Stockage des fichiers (optionnel)
-- Crée un bucket "documents" dans Supabase : Storage > New bucket
-- Nom : documents | Public: Oui | Taille max : 50 Mo
-- ============================================================
-- 50 Mo = 52428800 octets (augmenté pour les PDF volumineux)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  true,
  52428800,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
ON CONFLICT (id) DO NOTHING;

-- Si le bucket existe déjà avec une ancienne limite (ex. 10 Mo), exécute cette ligne pour passer à 50 Mo :
-- UPDATE storage.buckets SET file_size_limit = 52428800 WHERE id = 'documents';

-- Politique : tout le monde peut lire les fichiers du bucket documents
CREATE POLICY "Public read documents bucket"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'documents');

-- Politique : tout le monde peut uploader dans documents (utilisateurs connectés à ton app)
CREATE POLICY "Public upload documents bucket"
ON storage.objects FOR INSERT TO public
WITH CHECK (bucket_id = 'documents');
