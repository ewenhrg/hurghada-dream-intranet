-- Dates de séjour pour les demandes catalogue public (à exécuter si la table existe déjà sans ces colonnes).
ALTER TABLE public.public_quotes
  ADD COLUMN IF NOT EXISTS client_arrival_date TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS client_departure_date TEXT DEFAULT '';
