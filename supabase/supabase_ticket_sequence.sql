-- Suite automatique des numéros de ticket (partagée entre tous les postes).
-- Suggestion à l’ouverture du paiement (lecture seule) ;
-- le compteur n’avance qu’à la validation via ensure_ticket_sequence(max+1).

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

-- Monte le compteur au minimum demandé (ex. après détection du max dans l'historique).
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

-- Réserve p_count numéros consécutifs et les retourne (atomique, multi-PC safe).
CREATE OR REPLACE FUNCTION public.reserve_ticket_numbers(
  p_site_key TEXT,
  p_count INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start BIGINT;
  v_next BIGINT;
  v_prefix TEXT;
  v_pad INT;
  v_nums TEXT[] := ARRAY[]::TEXT[];
  i INT;
  n TEXT;
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

  INSERT INTO public.ticket_sequence (site_key, next_value)
  VALUES (trim(p_site_key), 1)
  ON CONFLICT (site_key) DO NOTHING;

  UPDATE public.ticket_sequence
  SET
    next_value = next_value + p_count,
    updated_at = NOW()
  WHERE site_key = trim(p_site_key)
  RETURNING
    next_value - p_count,
    next_value,
    prefix,
    pad_width
  INTO v_start, v_next, v_prefix, v_pad;

  IF v_start IS NULL THEN
    RAISE EXCEPTION 'ticket_sequence row missing for site_key %', p_site_key;
  END IF;

  FOR i IN 0..(p_count - 1) LOOP
    n := (v_start + i)::TEXT;
    IF v_pad > 0 AND length(n) < v_pad THEN
      n := lpad(n, v_pad, '0');
    END IF;
    v_nums := array_append(v_nums, coalesce(v_prefix, '') || n);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'numbers', to_jsonb(v_nums),
    'start', v_start,
    'next', v_next
  );
END;
$$;

-- Force le prochain n° (peut baisser : reprise de carnet / réparation outliers).
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

GRANT EXECUTE ON FUNCTION public.ensure_ticket_sequence(TEXT, BIGINT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_ticket_numbers(TEXT, INTEGER) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_ticket_sequence_next(TEXT, BIGINT) TO anon, authenticated, service_role;

COMMENT ON TABLE public.ticket_sequence IS
  'Compteur partagé des n° de ticket intranet (réservation atomique multi-postes).';
