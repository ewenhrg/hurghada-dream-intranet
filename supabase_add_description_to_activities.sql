-- Ajouter la colonne description à la table activities dans Supabase
ALTER TABLE public.activities 
ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';

