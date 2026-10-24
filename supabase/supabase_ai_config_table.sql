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

-- Ne jamais committer une vraie clé Gemini ici.
-- Après création de la table, renseigner la clé via le SQL Editor / un secret :
--   update public.ai_config
--   set gemini_api_key = '<clé>', updated_at = now(), updated_by = 'admin'
--   where site_key = 'hurghada_dream_0606';
-- Ou insert initial sans secret :
-- INSERT INTO public.ai_config (site_key, gemini_api_key, provider, updated_by)
-- VALUES ('hurghada_dream_0606', '', 'gemini', 'System')
-- ON CONFLICT (site_key) DO NOTHING;

