-- Script pour supprimer la table ai_config et toutes ses données
-- À exécuter dans Supabase SQL Editor

-- Supprimer les politiques RLS d'abord
DROP POLICY IF EXISTS "Allow select ai_config" ON public.ai_config;
DROP POLICY IF EXISTS "Allow update ai_config" ON public.ai_config;
DROP POLICY IF EXISTS "Allow insert ai_config" ON public.ai_config;

-- Supprimer l'index
DROP INDEX IF EXISTS public.idx_ai_config_site_key;

-- Supprimer la table (cela supprimera aussi toutes les données)
DROP TABLE IF EXISTS public.ai_config;

-- Vérification : cette requête ne devrait rien retourner si la table est bien supprimée
-- SELECT * FROM information_schema.tables WHERE table_name = 'ai_config';

