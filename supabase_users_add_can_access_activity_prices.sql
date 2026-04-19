-- Accès optionnel à l’onglet « Maj prix » (tableau des tarifs)
-- À exécuter dans Supabase (SQL Editor) une fois.

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS can_access_activity_prices BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.users.can_access_activity_prices IS 'Onglet Maj prix : tableau rapide prix adulte/enfant/bébé + notes.';

-- Comptes admin : conserver l’accès (aligné sur les autres pages sensibles)
UPDATE public.users
SET can_access_activity_prices = true
WHERE name IN ('Ewen', 'Léa');
