-- Créer la table users dans Supabase
CREATE TABLE IF NOT EXISTS public.users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  can_delete_quote BOOLEAN DEFAULT false,
  can_add_activity BOOLEAN DEFAULT false,
  can_edit_activity BOOLEAN DEFAULT false,
  can_delete_activity BOOLEAN DEFAULT false,
  can_reset_data BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Créer un index pour les recherches rapides par code
CREATE INDEX IF NOT EXISTS idx_users_code ON public.users(code);

-- Activer Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Politique pour permettre la lecture (SELECT) - pour la connexion
CREATE POLICY "Allow select users"
ON public.users
FOR SELECT
TO public
USING (true);

-- Insérer l'utilisateur Ewen avec tous les accès
INSERT INTO public.users (name, code, can_delete_quote, can_add_activity, can_edit_activity, can_delete_activity, can_reset_data)
VALUES ('Ewen', '040203', true, true, true, true, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  can_delete_quote = EXCLUDED.can_delete_quote,
  can_add_activity = EXCLUDED.can_add_activity,
  can_edit_activity = EXCLUDED.can_edit_activity,
  can_delete_activity = EXCLUDED.can_delete_activity,
  can_reset_data = EXCLUDED.can_reset_data;

-- Insérer l'utilisateur Rayan avec accès limité
INSERT INTO public.users (name, code, can_delete_quote, can_add_activity, can_edit_activity, can_delete_activity, can_reset_data)
VALUES ('Rayan', '180203', false, false, false, false, false)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  can_delete_quote = EXCLUDED.can_delete_quote,
  can_add_activity = EXCLUDED.can_add_activity,
  can_edit_activity = EXCLUDED.can_edit_activity,
  can_delete_activity = EXCLUDED.can_delete_activity,
  can_reset_data = EXCLUDED.can_reset_data;

