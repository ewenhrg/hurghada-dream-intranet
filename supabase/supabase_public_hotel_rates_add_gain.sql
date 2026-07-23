-- =============================================================================
-- Gain (bénéfice) sur tarifs hôtel : montant fixe OU pourcentage
-- À exécuter dans Supabase → SQL Editor.
-- =============================================================================

ALTER TABLE public.public_hotel_rates
  ADD COLUMN IF NOT EXISTS gain_type TEXT NOT NULL DEFAULT 'amount',
  ADD COLUMN IF NOT EXISTS gain_value NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.public_hotel_rates
  DROP CONSTRAINT IF EXISTS public_hotel_rates_gain_type_ok;
ALTER TABLE public.public_hotel_rates
  ADD CONSTRAINT public_hotel_rates_gain_type_ok
  CHECK (gain_type IN ('amount', 'percent'));

ALTER TABLE public.public_hotel_rates
  DROP CONSTRAINT IF EXISTS public_hotel_rates_gain_value_ok;
ALTER TABLE public.public_hotel_rates
  ADD CONSTRAINT public_hotel_rates_gain_value_ok
  CHECK (gain_value >= 0);

COMMENT ON COLUMN public.public_hotel_rates.gain_type IS
  'amount = bénéfice en € ; percent = bénéfice en % sur le prix de touche';
COMMENT ON COLUMN public.public_hotel_rates.gain_value IS
  'Valeur du bénéfice (montant ou pourcentage selon gain_type)';

NOTIFY pgrst, 'reload schema';
