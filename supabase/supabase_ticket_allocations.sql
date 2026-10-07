-- Registre des n° de ticket : empêche les trous (réservation orpheline / suppression).
-- Les n° held non confirmés peuvent être relâchés et RÉUTILISÉS.
-- Recyclage orphelins + reserve atomique : supabase_ticket_holes_guard.sql.

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

-- reserve_ticket_numbers : version canonique dans supabase_ticket_holes_guard.sql
-- (ne pas DROP/CREATE ici — ça écraserait les garde-fous anti-trous).


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

GRANT EXECUTE ON FUNCTION public.reserve_ticket_numbers(TEXT, INTEGER, TEXT[], TEXT[]) TO anon, authenticated, service_role;
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

-- Recyclage des orphelins + reserve : supabase_ticket_holes_guard.sql

COMMENT ON TABLE public.ticket_allocations IS
  'Registre des n° ticket : held=réservé, assigned=sur un devis, released=trou récent réutilisable (pas les trous historiques).';
