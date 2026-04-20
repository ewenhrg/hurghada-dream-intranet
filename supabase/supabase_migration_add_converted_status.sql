-- Migration: Ajouter les colonnes pour gérer le statut "converted" des demandes
-- Date: 2024

-- Ajouter la colonne converted_at si elle n'existe pas
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'client_requests' 
        AND column_name = 'converted_at'
    ) THEN
        ALTER TABLE client_requests 
        ADD COLUMN converted_at TIMESTAMP WITH TIME ZONE;
        
        RAISE NOTICE 'Colonne converted_at ajoutée avec succès';
    ELSE
        RAISE NOTICE 'Colonne converted_at existe déjà';
    END IF;
END $$;

-- Ajouter la colonne converted_by si elle n'existe pas
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'client_requests' 
        AND column_name = 'converted_by'
    ) THEN
        ALTER TABLE client_requests 
        ADD COLUMN converted_by TEXT;
        
        RAISE NOTICE 'Colonne converted_by ajoutée avec succès';
    ELSE
        RAISE NOTICE 'Colonne converted_by existe déjà';
    END IF;
END $$;

-- Vérifier que la colonne status existe et peut accepter la valeur "converted"
DO $$ 
BEGIN
    -- Vérifier si la colonne status existe
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'client_requests' 
        AND column_name = 'status'
    ) THEN
        -- Vérifier si le type permet "converted" (généralement TEXT ou VARCHAR)
        RAISE NOTICE 'Colonne status existe déjà';
    ELSE
        -- Créer la colonne status si elle n'existe pas
        ALTER TABLE client_requests 
        ADD COLUMN status TEXT DEFAULT 'pending';
        
        -- Mettre à jour les enregistrements existants sans statut
        UPDATE client_requests 
        SET status = 'pending' 
        WHERE status IS NULL;
        
        RAISE NOTICE 'Colonne status créée avec succès';
    END IF;
END $$;

-- Afficher un résumé des colonnes de la table client_requests
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'client_requests' 
ORDER BY ordinal_position;

