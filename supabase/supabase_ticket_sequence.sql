-- Suite automatique des numéros de ticket (partagée entre tous les postes).
-- Suggestion à l’ouverture du paiement (lecture seule) ;
-- le compteur n’avance qu’à la validation via reserve_ticket_numbers (atomique).
--
-- Règles anti-trous :
-- 1) On n’avance JAMAIS le compteur jusqu’à max(historique)+1 si des n° intermédiaires
--    n’ont pas été distribués (ça créait des tickets « sautés »).
-- 2) La réservation saute uniquement les n° listés dans p_exclude (déjà distribués).
-- 3) En cas d’échec après réservation, rollback_ticket_reservation remet le compteur
--    (CAS) pour ne pas laisser des n° orphelins.
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

-- Remplace les anciennes signatures pour éviter les surcharges ambiguës.
DROP FUNCTION IF EXISTS public.reserve_ticket_numbers(TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.reserve_ticket_numbers(TEXT, INTEGER, TEXT[]);
DROP FUNCTION IF EXISTS public.rollback_ticket_reservation(TEXT, BIGINT, BIGINT);

-- Réserve p_count numéros (atomique, multi-PC).
-- Saute uniquement les n° listés dans p_exclude (déjà distribués).
CREATE OR REPLACE FUNCTION public.reserve_ticket_numbers(
  p_site_key TEXT,
  p_count INTEGER,
  p_exclude TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start BIGINT;
  v_cursor BIGINT;
  v_next BIGINT;
  v_prefix TEXT;
  v_pad INT;
  v_nums TEXT[] := ARRAY[]::TEXT[];
  v_exclude TEXT[] := ARRAY[]::TEXT[];
  n TEXT;
  v_guard INT := 0;
  v_max_guard INT;
BEGIN
  IF p_site_key IS NULL OR length(trim(p_site_key)) = 0 THEN
    RAISE EXCEPTION 'site_key required';
  END IF;
  IF p_count IS NULL OR p_count < 1 THEN
    RETURN jsonb_build_object('ok', true, 'numbers', '[]'::jsonb, 'start', NULL, 'next', NULL);
  END IF;
  IF p_count > 100 THEN
    RAISE EXCEPTION 'count too large (max 100)';
  END IF;

  IF p_exclude IS NOT NULL THEN
    SELECT coalesce(array_agg(lower(trim(x))), ARRAY[]::TEXT[])
    INTO v_exclude
    FROM unnest(p_exclude) AS x
    WHERE length(trim(x)) > 0;
  END IF;

  INSERT INTO public.ticket_sequence (site_key, next_value)
  VALUES (trim(p_site_key), 1)
  ON CONFLICT (site_key) DO NOTHING;

  SELECT next_value, prefix, pad_width
  INTO v_cursor, v_prefix, v_pad
  FROM public.ticket_sequence
  WHERE site_key = trim(p_site_key)
  FOR UPDATE;

  IF v_cursor IS NULL THEN
    RAISE EXCEPTION 'ticket_sequence row missing for site_key %', p_site_key;
  END IF;

  v_start := NULL;
  v_max_guard := GREATEST(p_count * 20, 500);

  WHILE cardinality(v_nums) < p_count AND v_guard < v_max_guard LOOP
    v_guard := v_guard + 1;
    n := public.format_ticket_number(v_cursor, v_prefix, v_pad);

    IF v_exclude IS NULL OR cardinality(v_exclude) = 0 OR NOT (lower(n) = ANY (v_exclude)) THEN
      IF v_start IS NULL THEN
        v_start := v_cursor;
      END IF;
      v_nums := array_append(v_nums, n);
    END IF;

    v_cursor := v_cursor + 1;
  END LOOP;

  IF cardinality(v_nums) <> p_count THEN
    RAISE EXCEPTION 'unable to reserve % ticket numbers (exhausted search)', p_count;
  END IF;

  v_next := v_cursor;

  UPDATE public.ticket_sequence
  SET
    next_value = v_next,
    updated_at = NOW()
  WHERE site_key = trim(p_site_key);

  RETURN jsonb_build_object(
    'ok', true,
    'numbers', to_jsonb(v_nums),
    'start', v_start,
    'next', v_next,
    'count', p_count
  );
END;
$$;

-- Annule une réservation si le compteur n’a pas bougé depuis (CAS multi-PC safe).
CREATE OR REPLACE FUNCTION public.rollback_ticket_reservation(
  p_site_key TEXT,
  p_expected_next BIGINT,
  p_restore_next BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current BIGINT;
  v_restored BOOLEAN := false;
BEGIN
  IF p_site_key IS NULL OR length(trim(p_site_key)) = 0 THEN
    RAISE EXCEPTION 'site_key required';
  END IF;
  IF p_expected_next IS NULL OR p_restore_next IS NULL OR p_restore_next < 1 THEN
    RETURN jsonb_build_object('ok', false, 'restored', false, 'reason', 'invalid_args');
  END IF;
  IF p_restore_next > p_expected_next THEN
    RETURN jsonb_build_object('ok', false, 'restored', false, 'reason', 'invalid_range');
  END IF;

  SELECT next_value INTO v_current
  FROM public.ticket_sequence
  WHERE site_key = trim(p_site_key)
  FOR UPDATE;

  IF v_current IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'restored', false, 'reason', 'missing_row');
  END IF;

  IF v_current = p_expected_next THEN
    UPDATE public.ticket_sequence
    SET
      next_value = p_restore_next,
      updated_at = NOW()
    WHERE site_key = trim(p_site_key);
    v_restored := true;
    v_current := p_restore_next;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'restored', v_restored,
    'next_value', v_current
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_ticket_sequence(TEXT, BIGINT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.format_ticket_number(BIGINT, TEXT, INT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_ticket_sequence_next(TEXT, BIGINT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_ticket_numbers(TEXT, INTEGER, TEXT[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rollback_ticket_reservation(TEXT, BIGINT, BIGINT) TO anon, authenticated, service_role;

COMMENT ON TABLE public.ticket_sequence IS
  'Compteur partagé des n° de ticket intranet (suggestion lecture seule, réservation atomique à la validation, rollback CAS, realtime multi-postes).';
