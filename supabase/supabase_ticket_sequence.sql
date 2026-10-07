-- Suite automatique des numéros de ticket (partagée entre tous les postes).
-- Suggestion à l’ouverture du paiement (lecture seule) ;
-- le compteur n’avance qu’à la validation via reserve_ticket_numbers (atomique).
--
-- reserve / rollback / registre : supabase_ticket_holes_guard.sql
-- (ne PAS recréer ici une version qui saute les n° exclus sans les recycler).
--
-- À exécuter dans le SQL Editor Supabase (ré-exécutable / idempotent).

CREATE TABLE IF NOT EXISTS public.ticket_sequence (
  site_key TEXT PRIMARY KEY,
  next_value BIGINT NOT NULL DEFAULT 1 CHECK (next_value >= 1),
  prefix TEXT NOT NULL DEFAULT '',
  pad_width INT NOT NULL DEFAULT 0 CHECK (pad_width >= 0 AND pad_width <= 12),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ticket_sequence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select ticket_sequence" ON public.ticket_sequence;
DROP POLICY IF EXISTS "Allow insert ticket_sequence" ON public.ticket_sequence;
DROP POLICY IF EXISTS "Allow update ticket_sequence" ON public.ticket_sequence;

CREATE POLICY "Allow select ticket_sequence"
ON public.ticket_sequence FOR SELECT TO public USING (true);

CREATE POLICY "Allow insert ticket_sequence"
ON public.ticket_sequence FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Allow update ticket_sequence"
ON public.ticket_sequence FOR UPDATE TO public USING (true) WITH CHECK (true);

-- Monte le compteur au minimum demandé (tête déjà utilisée).
-- Ne doit PAS servir à sauter un bloc entier jusqu’à un max distant.
CREATE OR REPLACE FUNCTION public.ensure_ticket_sequence(
  p_site_key TEXT,
  p_min_next BIGINT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next BIGINT;
BEGIN
  IF p_site_key IS NULL OR length(trim(p_site_key)) = 0 THEN
    RAISE EXCEPTION 'site_key required';
  END IF;
  IF p_min_next IS NULL OR p_min_next < 1 THEN
    p_min_next := 1;
  END IF;

  INSERT INTO public.ticket_sequence (site_key, next_value)
  VALUES (trim(p_site_key), p_min_next)
  ON CONFLICT (site_key) DO UPDATE
  SET
    next_value = GREATEST(public.ticket_sequence.next_value, EXCLUDED.next_value),
    updated_at = NOW();

  SELECT next_value INTO v_next
  FROM public.ticket_sequence
  WHERE site_key = trim(p_site_key);

  RETURN jsonb_build_object('ok', true, 'next_value', v_next);
END;
$$;

CREATE OR REPLACE FUNCTION public.format_ticket_number(
  p_n BIGINT,
  p_prefix TEXT,
  p_pad INT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  n TEXT;
BEGIN
  n := p_n::TEXT;
  IF p_pad > 0 AND length(n) < p_pad THEN
    n := lpad(n, p_pad, '0');
  END IF;
  RETURN coalesce(p_prefix, '') || n;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_ticket_sequence_next(
  p_site_key TEXT,
  p_next BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next BIGINT;
BEGIN
  IF p_site_key IS NULL OR length(trim(p_site_key)) = 0 THEN
    RAISE EXCEPTION 'site_key required';
  END IF;
  IF p_next IS NULL OR p_next < 1 THEN
    RAISE EXCEPTION 'p_next must be >= 1';
  END IF;

  INSERT INTO public.ticket_sequence (site_key, next_value)
  VALUES (trim(p_site_key), p_next)
  ON CONFLICT (site_key) DO UPDATE
  SET
    next_value = EXCLUDED.next_value,
    updated_at = NOW();

  SELECT next_value INTO v_next
  FROM public.ticket_sequence
  WHERE site_key = trim(p_site_key);

  RETURN jsonb_build_object('ok', true, 'next_value', v_next);
END;
$$;

-- Ancienne surcharge 3 args (sans p_numbers) : à retirer pour éviter l’ambiguïté PostgREST.
DROP FUNCTION IF EXISTS public.rollback_ticket_reservation(TEXT, BIGINT, BIGINT);

GRANT EXECUTE ON FUNCTION public.ensure_ticket_sequence(TEXT, BIGINT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.format_ticket_number(BIGINT, TEXT, INT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_ticket_sequence_next(TEXT, BIGINT) TO anon, authenticated, service_role;

COMMENT ON TABLE public.ticket_sequence IS
  'Compteur partagé des n° de ticket intranet (suggestion lecture seule, réservation atomique à la validation, rollback CAS, realtime multi-postes).';
