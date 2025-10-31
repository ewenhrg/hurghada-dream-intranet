-- Ajouter la colonne created_by_name à la table quotes (si elle n'existe pas déjà)
ALTER TABLE public.quotes 
ADD COLUMN IF NOT EXISTS created_by_name TEXT DEFAULT '';

-- Mettre à jour les devis existants sans créateur (optionnel, si vous voulez un placeholder)
-- UPDATE public.quotes SET created_by_name = '' WHERE created_by_name IS NULL;

