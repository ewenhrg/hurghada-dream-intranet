-- Migration: Ajouter les colonnes client_arrival_date et client_departure_date à la table quotes
-- Date: 2024

-- Ajouter la colonne client_arrival_date si elle n'existe pas
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'quotes' 
        AND column_name = 'client_arrival_date'
    ) THEN
        ALTER TABLE quotes 
        ADD COLUMN client_arrival_date DATE;
        
        RAISE NOTICE 'Colonne client_arrival_date ajoutée avec succès';
    ELSE
        RAISE NOTICE 'Colonne client_arrival_date existe déjà';
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
        ALTER TABLE quotes 
        ADD COLUMN client_departure_date DATE;
        
        RAISE NOTICE 'Colonne client_departure_date ajoutée avec succès';
    ELSE
        RAISE NOTICE 'Colonne client_departure_date existe déjà';
    END IF;
END $$;

-- Vérifier que la colonne updated_at existe (nécessaire pour la synchronisation)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'quotes' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE quotes 
        ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
        
        -- Mettre à jour les enregistrements existants
        UPDATE quotes 
        SET updated_at = created_at 
        WHERE updated_at IS NULL;
        
        RAISE NOTICE 'Colonne updated_at ajoutée avec succès';
    ELSE
        RAISE NOTICE 'Colonne updated_at existe déjà';
    END IF;
END $$;

-- Afficher un résumé des colonnes de la table quotes
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'quotes' 
ORDER BY ordinal_position;

