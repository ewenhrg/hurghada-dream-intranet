-- Registre des n° de ticket : empêche les trous (réservation orpheline / suppression).
-- Les n° held non confirmés peuvent être relâchés et RÉUTILISÉS.
-- Les trous déjà présents sont réinjectés dans le pool (released).

CREATE TABLE IF NOT EXISTS public.ticket_allocations (
  site_key TEXT NOT NULL,
  ticket_number TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('held', 'assigned', 'released')),
  quote_id BIGINT NULL,
  item_index INT NULL,
  held_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_at TIMESTAMPTZ NULL,
  released_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (site_key, ticket_number)
);

CREATE INDEX IF NOT EXISTS ticket_allocations_status_idx
  ON public.ticket_allocations (site_key, status, ticket_number);

ALTER TABLE public.ticket_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select ticket_allocations" ON public.ticket_allocations;
DROP POLICY IF EXISTS "Allow insert ticket_allocations" ON public.ticket_allocations;
DROP POLICY IF EXISTS "Allow update ticket_allocations" ON public.ticket_allocations;
DROP POLICY IF EXISTS "Allow delete ticket_allocations" ON public.ticket_allocations;

CREATE POLICY "Allow select ticket_allocations"
ON public.ticket_allocations FOR SELECT TO public USING (true);

CREATE POLICY "Allow insert ticket_allocations"
ON public.ticket_allocations FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Allow update ticket_allocations"
ON public.ticket_allocations FOR UPDATE TO public USING (true) WITH CHECK (true);

CREATE POLICY "Allow delete ticket_allocations"
ON public.ticket_allocations FOR DELETE TO public USING (true);

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

DROP FUNCTION IF EXISTS public.reserve_ticket_numbers(TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.reserve_ticket_numbers(TEXT, INTEGER, TEXT[]);

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
  v_site TEXT;
  v_cursor BIGINT;
  v_seq_next BIGINT;
  v_prefix TEXT;
  v_pad INT;
  v_nums TEXT[] := ARRAY[]::TEXT[];
  v_exclude TEXT[] := ARRAY[]::TEXT[];
  v_reuse TEXT;
  n TEXT;
  v_guard INT := 0;
  v_max_guard INT;
  v_start BIGINT;
  v_taken BOOLEAN;
BEGIN
  v_site := trim(p_site_key);
  IF v_site IS NULL OR length(v_site) = 0 THEN
    RAISE EXCEPTION 'site_key required';
  END IF;
  IF p_count IS NULL OR p_count < 1 THEN
    RETURN jsonb_build_object('ok', true, 'numbers', '[]'::jsonb, 'start', NULL, 'next', NULL);
  END IF;
  IF p_count > 100 THEN
    RAISE EXCEPTION 'count too large (max 100)';
  END IF;

  IF p_exclude IS NOT NULL THEN
    SELECT coalesce(array_agg(DISTINCT lower(trim(x))), ARRAY[]::TEXT[])
    INTO v_exclude
    FROM unnest(p_exclude) AS x
    WHERE length(trim(x)) > 0;
  END IF;

  INSERT INTO public.ticket_sequence (site_key, next_value)
  VALUES (v_site, 1)
  ON CONFLICT (site_key) DO NOTHING;

  SELECT next_value, prefix, pad_width
  INTO v_cursor, v_prefix, v_pad
  FROM public.ticket_sequence
  WHERE site_key = v_site
  FOR UPDATE;

  IF v_cursor IS NULL THEN
    RAISE EXCEPTION 'ticket_sequence row missing for site_key %', v_site;
  END IF;

  -- Libère les holds abandonnés (crash navigateur / onglet fermé) → redeviennent réutilisables.
  UPDATE public.ticket_allocations
  SET
    status = 'released',
    quote_id = NULL,
    item_index = NULL,
    released_at = NOW(),
    assigned_at = NULL,
    updated_at = NOW()
  WHERE site_key = v_site
    AND status = 'held'
    AND held_at < NOW() - INTERVAL '20 minutes';

  -- 1) Réutiliser les n° released (trous), plus petit d’abord.
  FOR v_reuse IN
    SELECT ta.ticket_number
    FROM public.ticket_allocations ta
    WHERE ta.site_key = v_site
      AND ta.status = 'released'
      AND (
        v_exclude IS NULL
        OR cardinality(v_exclude) = 0
        OR NOT (lower(ta.ticket_number) = ANY (v_exclude))
      )
    ORDER BY
      CASE WHEN ta.ticket_number ~ '^[0-9]+$' THEN ta.ticket_number::bigint ELSE NULL END NULLS LAST,
      ta.ticket_number
    FOR UPDATE SKIP LOCKED
  LOOP
    EXIT WHEN cardinality(v_nums) >= p_count;
    UPDATE public.ticket_allocations
    SET
      status = 'held',
      quote_id = NULL,
      item_index = NULL,
      held_at = NOW(),
      assigned_at = NULL,
      released_at = NULL,
      updated_at = NOW()
    WHERE site_key = v_site
      AND ticket_number = v_reuse
      AND status = 'released';
    IF FOUND THEN
      v_nums := array_append(v_nums, v_reuse);
    END IF;
  END LOOP;

  -- 2) Compléter depuis le compteur.
  v_start := NULL;
  v_max_guard := GREATEST(p_count * 30, 800);
  WHILE cardinality(v_nums) < p_count AND v_guard < v_max_guard LOOP
    v_guard := v_guard + 1;
    n := public.format_ticket_number(v_cursor, v_prefix, v_pad);
    v_taken := false;

    IF v_exclude IS NULL OR cardinality(v_exclude) = 0 OR NOT (lower(n) = ANY (v_exclude)) THEN
      IF EXISTS (
        SELECT 1 FROM public.ticket_allocations ta
        WHERE ta.site_key = v_site
          AND lower(ta.ticket_number) = lower(n)
          AND ta.status IN ('held', 'assigned')
      ) THEN
        v_taken := true;
      ELSIF EXISTS (
        SELECT 1 FROM public.ticket_allocations ta
        WHERE ta.site_key = v_site
          AND lower(ta.ticket_number) = lower(n)
          AND ta.status = 'released'
      ) THEN
        UPDATE public.ticket_allocations
        SET
          status = 'held',
          quote_id = NULL,
          item_index = NULL,
          held_at = NOW(),
          assigned_at = NULL,
          released_at = NULL,
          updated_at = NOW()
        WHERE site_key = v_site
          AND ticket_number = n
          AND status = 'released';
        IF FOUND THEN
          v_nums := array_append(v_nums, n);
          IF v_start IS NULL THEN v_start := v_cursor; END IF;
        ELSE
          v_taken := true;
        END IF;
      ELSE
        BEGIN
          INSERT INTO public.ticket_allocations (site_key, ticket_number, status, held_at, updated_at)
          VALUES (v_site, n, 'held', NOW(), NOW());
          v_nums := array_append(v_nums, n);
          IF v_start IS NULL THEN v_start := v_cursor; END IF;
        EXCEPTION WHEN unique_violation THEN
          v_taken := true;
        END;
      END IF;
    END IF;

    v_cursor := v_cursor + 1;
  END LOOP;

  IF cardinality(v_nums) <> p_count THEN
    RAISE EXCEPTION 'unable to reserve % ticket numbers (got %)', p_count, cardinality(v_nums);
  END IF;

  UPDATE public.ticket_sequence
  SET
    next_value = GREATEST(next_value, v_cursor),
    updated_at = NOW()
  WHERE site_key = v_site
  RETURNING next_value INTO v_seq_next;

  RETURN jsonb_build_object(
    'ok', true,
    'numbers', to_jsonb(v_nums),
    'start', v_start,
    'next', v_seq_next,
    'count', p_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_ticket_allocations(
  p_site_key TEXT,
  p_numbers TEXT[],
  p_quote_id BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site TEXT;
  v_count INT := 0;
BEGIN
  v_site := trim(p_site_key);
  IF v_site IS NULL OR length(v_site) = 0 THEN
    RAISE EXCEPTION 'site_key required';
  END IF;
  IF p_numbers IS NULL OR cardinality(p_numbers) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'confirmed', 0);
  END IF;

  UPDATE public.ticket_allocations
  SET
    status = 'assigned',
    quote_id = COALESCE(p_quote_id, quote_id),
    assigned_at = NOW(),
    released_at = NULL,
    updated_at = NOW()
  WHERE site_key = v_site
    AND ticket_number = ANY (p_numbers)
    AND status IN ('held', 'assigned');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'confirmed', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_ticket_allocations(
  p_site_key TEXT,
  p_numbers TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site TEXT;
  v_count INT := 0;
  n TEXT;
BEGIN
  v_site := trim(p_site_key);
  IF v_site IS NULL OR length(v_site) = 0 THEN
    RAISE EXCEPTION 'site_key required';
  END IF;
  IF p_numbers IS NULL OR cardinality(p_numbers) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'released', 0);
  END IF;

  FOREACH n IN ARRAY p_numbers LOOP
    n := trim(n);
    IF length(n) = 0 THEN
      CONTINUE;
    END IF;
    INSERT INTO public.ticket_allocations (site_key, ticket_number, status, released_at, updated_at)
    VALUES (v_site, n, 'released', NOW(), NOW())
    ON CONFLICT (site_key, ticket_number) DO UPDATE
    SET
      status = 'released',
      quote_id = NULL,
      item_index = NULL,
      released_at = NOW(),
      assigned_at = NULL,
      updated_at = NOW();
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'released', v_count);
END;
$$;

DROP FUNCTION IF EXISTS public.rollback_ticket_reservation(TEXT, BIGINT, BIGINT);
DROP FUNCTION IF EXISTS public.rollback_ticket_reservation(TEXT, BIGINT, BIGINT, TEXT[]);

CREATE OR REPLACE FUNCTION public.rollback_ticket_reservation(
  p_site_key TEXT,
  p_expected_next BIGINT,
  p_restore_next BIGINT,
  p_numbers TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site TEXT;
  v_current BIGINT;
  v_restored BOOLEAN := false;
BEGIN
  v_site := trim(p_site_key);
  IF v_site IS NULL OR length(v_site) = 0 THEN
    RAISE EXCEPTION 'site_key required';
  END IF;

  IF p_numbers IS NOT NULL AND cardinality(p_numbers) > 0 THEN
    PERFORM public.release_ticket_allocations(v_site, p_numbers);
  END IF;

  IF p_expected_next IS NULL OR p_restore_next IS NULL OR p_restore_next < 1 THEN
    RETURN jsonb_build_object('ok', true, 'restored', false, 'reason', 'numbers_released_only');
  END IF;

  SELECT next_value INTO v_current
  FROM public.ticket_sequence
  WHERE site_key = v_site
  FOR UPDATE;

  IF v_current IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'restored', false, 'reason', 'missing_row');
  END IF;

  IF v_current = p_expected_next AND p_restore_next <= p_expected_next THEN
    UPDATE public.ticket_sequence
    SET next_value = p_restore_next, updated_at = NOW()
    WHERE site_key = v_site;
    v_restored := true;
    v_current := p_restore_next;
  END IF;

  RETURN jsonb_build_object('ok', true, 'restored', v_restored, 'next_value', v_current);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_ticket_numbers(TEXT, INTEGER, TEXT[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_ticket_allocations(TEXT, TEXT[], BIGINT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_ticket_allocations(TEXT, TEXT[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rollback_ticket_reservation(TEXT, BIGINT, BIGINT, TEXT[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.format_ticket_number(BIGINT, TEXT, INT) TO anon, authenticated, service_role;

-- Seed assigned depuis les devis
INSERT INTO public.ticket_allocations (site_key, ticket_number, status, quote_id, assigned_at, updated_at)
SELECT
  q.site_key,
  trim(item->>'ticketNumber'),
  'assigned',
  q.id,
  NOW(),
  NOW()
FROM public.quotes q
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(q.items) = 'array' THEN q.items ELSE '[]'::jsonb END
) AS item
WHERE q.site_key = 'hurghada_dream_0606'
  AND jsonb_typeof(item) = 'object'
  AND NULLIF(trim(item->>'ticketNumber'), '') IS NOT NULL
ON CONFLICT (site_key, ticket_number) DO UPDATE
SET
  status = 'assigned',
  quote_id = EXCLUDED.quote_id,
  assigned_at = COALESCE(public.ticket_allocations.assigned_at, NOW()),
  updated_at = NOW();

-- Seed released : trous entre 186080 et next_value-1
WITH used AS (
  SELECT DISTINCT trim(item->>'ticketNumber') AS ticket_number
  FROM public.quotes q
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(q.items) = 'array' THEN q.items ELSE '[]'::jsonb END
  ) AS item
  WHERE q.site_key = 'hurghada_dream_0606'
    AND jsonb_typeof(item) = 'object'
    AND (item->>'ticketNumber') ~ '^[0-9]{6}$'
),
bounds AS (
  SELECT 186080::bigint AS lo,
         GREATEST(
           186080,
           COALESCE((SELECT next_value - 1 FROM public.ticket_sequence WHERE site_key = 'hurghada_dream_0606'), 186080)
         ) AS hi
),
series AS (
  SELECT generate_series(lo, hi) AS n FROM bounds WHERE hi >= lo
)
INSERT INTO public.ticket_allocations (site_key, ticket_number, status, released_at, updated_at)
SELECT
  'hurghada_dream_0606',
  s.n::text,
  'released',
  NOW(),
  NOW()
FROM series s
LEFT JOIN used u ON u.ticket_number = s.n::text
WHERE u.ticket_number IS NULL
ON CONFLICT (site_key, ticket_number) DO NOTHING;

COMMENT ON TABLE public.ticket_allocations IS
  'Registre des n° ticket : held=réservé, assigned=sur un devis, released=trou réutilisable.';
