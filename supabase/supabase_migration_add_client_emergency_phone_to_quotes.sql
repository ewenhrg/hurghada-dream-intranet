-- Migration: numéro d'urgence client sur les devis
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'quotes'
          AND column_name = 'client_emergency_phone'
    ) THEN
        ALTER TABLE public.quotes
        ADD COLUMN client_emergency_phone TEXT DEFAULT '';

        RAISE NOTICE 'Colonne client_emergency_phone ajoutée à public.quotes';
    ELSE
        RAISE NOTICE 'Colonne client_emergency_phone existe déjà';
    END IF;
END $$;
