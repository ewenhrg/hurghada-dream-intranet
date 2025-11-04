-- Ajouter les colonnes pour l'accès aux pages dans la table users
-- Ce script ajoute toutes les colonnes d'accès aux pages

-- Ajouter la colonne can_access_activities si elle n'existe pas déjà
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS can_access_activities BOOLEAN DEFAULT true;

-- Ajouter la colonne can_access_history si elle n'existe pas déjà
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS can_access_history BOOLEAN DEFAULT true;

-- Ajouter la colonne can_access_tickets si elle n'existe pas déjà
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS can_access_tickets BOOLEAN DEFAULT true;

-- Ajouter la colonne can_access_modifications si elle n'existe pas déjà
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS can_access_modifications BOOLEAN DEFAULT false;

-- Ajouter la colonne can_access_situation si elle n'existe pas déjà
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS can_access_situation BOOLEAN DEFAULT false;

-- Ajouter la colonne can_access_users si elle n'existe pas déjà
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS can_access_users BOOLEAN DEFAULT false;

-- Mettre à jour les utilisateurs existants pour leur donner l'accès aux pages par défaut
UPDATE public.users 
SET can_access_activities = true 
WHERE can_access_activities IS NULL;

UPDATE public.users 
SET can_access_history = true 
WHERE can_access_history IS NULL;

UPDATE public.users 
SET can_access_tickets = true 
WHERE can_access_tickets IS NULL;

-- Donner l'accès aux pages spéciales à Ewen et Léa
UPDATE public.users 
SET can_access_modifications = true,
    can_access_situation = true,
    can_access_users = true 
WHERE name IN ('Ewen', 'Léa') AND (can_access_modifications IS NULL OR can_access_modifications = false OR can_access_situation IS NULL OR can_access_situation = false OR can_access_users IS NULL OR can_access_users = false);

