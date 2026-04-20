-- Créer la table pour stocker la configuration de l'IA (clé API Gemini)
CREATE TABLE IF NOT EXISTS public.ai_config (
  id BIGSERIAL PRIMARY KEY,
  site_key TEXT NOT NULL,
  gemini_api_key TEXT NOT NULL,
  provider TEXT DEFAULT 'gemini',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by TEXT DEFAULT '',
  UNIQUE(site_key)
);

-- Créer un index pour les recherches rapides
CREATE INDEX IF NOT EXISTS idx_ai_config_site_key ON public.ai_config(site_key);

-- Activer Row Level Security (RLS)
ALTER TABLE public.ai_config ENABLE ROW LEVEL SECURITY;

-- Politique pour permettre la lecture (SELECT) - tous les utilisateurs peuvent lire
CREATE POLICY "Allow select ai_config"
ON public.ai_config
FOR SELECT
TO public
USING (true);

-- Politique pour permettre l'UPDATE (modification) - tous les utilisateurs peuvent modifier
CREATE POLICY "Allow update ai_config"
ON public.ai_config
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

-- Politique pour permettre l'INSERT (création)
CREATE POLICY "Allow insert ai_config"
ON public.ai_config
FOR INSERT
TO public
WITH CHECK (true);

-- Insérer la clé API Gemini pour le site
-- Utilise la clé de site par défaut 'hurghada_dream_0606'
INSERT INTO public.ai_config (site_key, gemini_api_key, provider, updated_by)
VALUES ('hurghada_dream_0606', 'AIzaSyA3u5F90QmxDe-YKvLQy31cfkrC5emuhwM', 'gemini', 'System')
ON CONFLICT (site_key) DO UPDATE SET
  gemini_api_key = EXCLUDED.gemini_api_key,
  provider = EXCLUDED.provider,
  updated_at = NOW(),
  updated_by = EXCLUDED.updated_by;

