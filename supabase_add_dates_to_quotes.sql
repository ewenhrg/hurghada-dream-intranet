-- Ajouter les colonnes client_arrival_date, client_departure_date et updated_at à la table quotes
-- (si elles n'existent pas déjà)

-- Ajouter client_arrival_date
ALTER TABLE public.quotes 
ADD COLUMN IF NOT EXISTS client_arrival_date TEXT DEFAULT '';

-- Ajouter client_departure_date
ALTER TABLE public.quotes 
ADD COLUMN IF NOT EXISTS client_departure_date TEXT DEFAULT '';

-- Ajouter updated_at
ALTER TABLE public.quotes 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Mettre à jour updated_at pour les devis existants (utiliser created_at comme valeur par défaut)
UPDATE public.quotes 
SET updated_at = created_at 
WHERE updated_at IS NULL;

