-- Script SQL pour réparer la table activities
-- Exécutez ce script dans l'éditeur SQL de Supabase pour corriger toutes les colonnes

-- 1. S'assurer que la table existe avec les colonnes de base
CREATE TABLE IF NOT EXISTS public.activities (
  id BIGSERIAL PRIMARY KEY,
  site_key TEXT NOT NULL,
  name TEXT NOT NULL
);

-- 2. Ajouter toutes les colonnes nécessaires si elles n'existent pas
-- (Ne cause pas d'erreur si elles existent déjà grâce à IF NOT EXISTS)

-- Colonne category
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'activities' AND column_name = 'category') THEN
    ALTER TABLE public.activities ADD COLUMN category TEXT DEFAULT 'desert';
  END IF;
END $$;

-- Colonne price_adult
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'activities' AND column_name = 'price_adult') THEN
    ALTER TABLE public.activities ADD COLUMN price_adult NUMERIC DEFAULT 0;
  END IF;
END $$;

-- Colonne price_child
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'activities' AND column_name = 'price_child') THEN
    ALTER TABLE public.activities ADD COLUMN price_child NUMERIC DEFAULT 0;
  END IF;
END $$;

-- Colonne price_baby
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'activities' AND column_name = 'price_baby') THEN
    ALTER TABLE public.activities ADD COLUMN price_baby NUMERIC DEFAULT 0;
  END IF;
END $$;

-- Colonne age_child
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'activities' AND column_name = 'age_child') THEN
    ALTER TABLE public.activities ADD COLUMN age_child TEXT DEFAULT '';
  END IF;
END $$;

-- Colonne age_baby
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'activities' AND column_name = 'age_baby') THEN
    ALTER TABLE public.activities ADD COLUMN age_baby TEXT DEFAULT '';
  END IF;
END $$;

-- Colonne currency
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'activities' AND column_name = 'currency') THEN
    ALTER TABLE public.activities ADD COLUMN currency TEXT DEFAULT 'EUR';
  END IF;
END $$;

-- Colonne available_days
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'activities' AND column_name = 'available_days') THEN
    ALTER TABLE public.activities ADD COLUMN available_days BOOLEAN[] DEFAULT ARRAY[false, false, false, false, false, false, false]::BOOLEAN[];
  END IF;
END $$;

-- Colonne notes
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'activities' AND column_name = 'notes') THEN
    ALTER TABLE public.activities ADD COLUMN notes TEXT DEFAULT '';
  END IF;
END $$;

-- Colonne transfers
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'activities' AND column_name = 'transfers') THEN
    ALTER TABLE public.activities ADD COLUMN transfers JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Colonne created_at
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'activities' AND column_name = 'created_at') THEN
    ALTER TABLE public.activities ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
  END IF;
END $$;

-- 3. Créer les index pour les recherches rapides
CREATE INDEX IF NOT EXISTS idx_activities_site_key ON public.activities(site_key);
CREATE INDEX IF NOT EXISTS idx_activities_category ON public.activities(category);

-- 4. Activer Row Level Security (RLS)
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- 5. Supprimer les politiques existantes si elles existent
DROP POLICY IF EXISTS "Allow insert activities" ON public.activities;
DROP POLICY IF EXISTS "Allow select activities" ON public.activities;
DROP POLICY IF EXISTS "Allow update activities" ON public.activities;
DROP POLICY IF EXISTS "Allow delete activities" ON public.activities;

-- 6. Recréer les politiques RLS
CREATE POLICY "Allow insert activities"
ON public.activities
FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Allow select activities"
ON public.activities
FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow update activities"
ON public.activities
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow delete activities"
ON public.activities
FOR DELETE
TO public
USING (true);

-- 7. Vérifier la structure finale de la table
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'activities'
ORDER BY ordinal_position;

