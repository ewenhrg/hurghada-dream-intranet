-- Ajouter la colonne description à la table activities dans Supabase
-- Exécutez ce script dans l'éditeur SQL de Supabase

-- Ajouter la colonne description si elle n'existe pas déjà
ALTER TABLE public.activities 
ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';

-- Vérifier que la colonne a été ajoutée
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'activities'
  AND column_name = 'description';
