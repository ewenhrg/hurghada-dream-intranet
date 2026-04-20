-- Migration: Ajouter les colonnes paid_stripe et paid_cash à la table quotes
-- Date: 2024

-- Ajouter la colonne paid_stripe si elle n'existe pas
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'quotes' 
        AND column_name = 'paid_stripe'
    ) THEN
        ALTER TABLE public.quotes 
        ADD COLUMN paid_stripe NUMERIC(10, 2) DEFAULT 0;
        
        RAISE NOTICE 'Colonne paid_stripe ajoutée avec succès à la table quotes';
    ELSE
        RAISE NOTICE 'Colonne paid_stripe existe déjà dans la table quotes';
    END IF;
END $$;

-- Ajouter la colonne paid_cash si elle n'existe pas
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'quotes' 
        AND column_name = 'paid_cash'
    ) THEN
        ALTER TABLE public.quotes 
        ADD COLUMN paid_cash NUMERIC(10, 2) DEFAULT 0;
        
        RAISE NOTICE 'Colonne paid_cash ajoutée avec succès à la table quotes';
    ELSE
        RAISE NOTICE 'Colonne paid_cash existe déjà dans la table quotes';
    END IF;
END $$;

-- Afficher un résumé des colonnes de paiement de la table quotes
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'quotes' 
AND column_name IN ('paid_stripe', 'paid_cash')
ORDER BY ordinal_position;

