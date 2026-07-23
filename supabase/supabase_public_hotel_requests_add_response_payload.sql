-- =============================================================================
-- Réponse devis hôtel (sélection catégories de chambres, puis tarifs plus tard)
-- À exécuter dans Supabase → SQL Editor.
-- =============================================================================

ALTER TABLE public.public_hotel_requests
  ADD COLUMN IF NOT EXISTS response_payload JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.public_hotel_requests.response_payload IS
  'Réponse intranet : catégories de chambres choisies par hôtel (et tarifs plus tard).';

NOTIFY pgrst, 'reload schema';
