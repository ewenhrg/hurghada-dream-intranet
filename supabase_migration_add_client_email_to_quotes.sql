-- Migration: Ajouter les colonnes manquantes à la table quotes
-- Date: 2024

-- Ajouter la colonne client_email si elle n'existe pas
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'quotes' 
        AND column_name = 'client_email'
    ) THEN
        ALTER TABLE public.quotes 
        ADD COLUMN client_email TEXT DEFAULT '';
        
        RAISE NOTICE 'Colonne client_email ajoutée avec succès à la table quotes';
    ELSE
        RAISE NOTICE 'Colonne client_email existe déjà dans la table quotes';
    END IF;
END $$;

-- Ajouter la colonne client_arrival_date si elle n'existe pas
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'quotes' 
        AND column_name = 'client_arrival_date'
    ) THEN
        ALTER TABLE public.quotes 
        ADD COLUMN client_arrival_date TIMESTAMP WITH TIME ZONE;
        
        RAISE NOTICE 'Colonne client_arrival_date ajoutée avec succès à la table quotes';
    ELSE
        RAISE NOTICE 'Colonne client_arrival_date existe déjà dans la table quotes';
    END IF;
END $$;

-- Ajouter la colonne client_departure_date si elle n'existe pas
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'quotes' 
        AND column_name = 'client_departure_date'
    ) THEN
        ALTER TABLE public.quotes 
        ADD COLUMN client_departure_date TIMESTAMP WITH TIME ZONE;
        
        RAISE NOTICE 'Colonne client_departure_date ajoutée avec succès à la table quotes';
    ELSE
        RAISE NOTICE 'Colonne client_departure_date existe déjà dans la table quotes';
    END IF;
END $$;

-- Ajouter la colonne updated_at si elle n'existe pas
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'quotes' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE public.quotes 
        ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        
        RAISE NOTICE 'Colonne updated_at ajoutée avec succès à la table quotes';
    ELSE
        RAISE NOTICE 'Colonne updated_at existe déjà dans la table quotes';
    END IF;
END $$;

-- Afficher un résumé des colonnes de la table quotes
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'quotes' 
ORDER BY ordinal_position;

