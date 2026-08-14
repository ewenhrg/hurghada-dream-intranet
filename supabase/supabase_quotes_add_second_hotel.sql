-- Double hôtel sur un devis (2e séjour : hôtel, chambre, quartier, dates)
-- À exécuter dans le SQL Editor Supabase.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS client_has_second_hotel BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS client_second_hotel TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS client_second_room TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS client_second_neighborhood TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS client_second_arrival_date DATE,
  ADD COLUMN IF NOT EXISTS client_second_departure_date DATE;

COMMENT ON COLUMN quotes.client_has_second_hotel IS 'Client avec un 2e hôtel sur une partie du séjour';
COMMENT ON COLUMN quotes.client_second_neighborhood IS 'Quartier du 2e hôtel (clés NEIGHBORHOODS)';
