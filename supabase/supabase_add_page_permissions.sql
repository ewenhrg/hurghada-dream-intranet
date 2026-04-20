-- Ajouter des colonnes pour contrôler l'accès aux pages
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS can_access_activities BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS can_access_history BOOLEAN DEFAULT true;

-- Mettre à jour les utilisateurs existants pour qu'ils gardent l'accès à toutes les pages
UPDATE public.users 
SET can_access_activities = true, can_access_history = true
WHERE can_access_activities IS NULL OR can_access_history IS NULL;

