-- Garde-fous anti-trous :
-- 1) Les n° assigned/held absents du JSON devis sont recyclés (released).
-- 2) Un trigger aligne le registre sur quotes.items (source de vérité).
-- 3) reserve_ticket_numbers recycle d’abord, réutilise les trous, ignore un exclude périmé.
-- Ré-exécutable / idempotent.

CREATE OR REPLACE FUNCTION public.quote_item_ticket_numbers(p_items JSONB)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(array_agg(DISTINCT trim(item->>'ticketNumber')), ARRAY[]::TEXT[])
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END
  ) AS item
  WHERE jsonb_typeof(item) = 'object'
    AND length(trim(COALESCE(item->>'ticketNumber', ''))) > 0;
$$;

CREATE OR REPLACE FUNCTION public.ticket_number_in_quotes(
  p_site_key TEXT,
  p_ticket_number TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.quotes q
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(q.items) = 'array' THEN q.items ELSE '[]'::jsonb END
    ) AS item
    WHERE q.site_key = trim(p_site_key)
      AND jsonb_typeof(item) = 'object'
      AND lower(trim(COALESCE(item->>'ticketNumber', ''))) = lower(trim(p_ticket_number))
  );
$$;

CREATE OR REPLACE FUNCTION public.recycle_orphan_ticket_allocations(
  p_site_key TEXT,
  p_grace_seconds INTEGER DEFAULT 120
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site TEXT;
  v_grace INTERVAL;
  v_count INT := 0;
BEGIN
  v_site := trim(p_site_key);
  IF v_site IS NULL OR length(v_site) = 0 THEN
    RAISE EXCEPTION 'site_key required';
  END IF;
  v_grace := make_interval(secs => GREATEST(0, COALESCE(p_grace_seconds, 0)));

  WITH live AS MATERIALIZED (
    SELECT DISTINCT lower(trim(item->>'ticketNumber')) AS k
    FROM public.quotes q
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(q.items) = 'array' THEN q.items ELSE '[]'::jsonb END
    ) AS item
    WHERE q.site_key = v_site
      AND jsonb_typeof(item) = 'object'
      AND length(trim(COALESCE(item->>'ticketNumber', ''))) > 0
  )
  UPDATE public.ticket_allocations ta
  SET
    status = 'released',
    quote_id = NULL,
    item_index = NULL,
    released_at = NOW(),
    assigned_at = NULL,
    updated_at = NOW()
  WHERE ta.site_key = v_site
    AND (
      (
        ta.status = 'assigned'
        AND ta.updated_at <= NOW() - v_grace
        AND ta.updated_at >= NOW() - INTERVAL '7 days'
      )
      OR (ta.status = 'held' AND ta.held_at < NOW() - INTERVAL '20 minutes')
    )
    AND NOT EXISTS (
      SELECT 1 FROM live lt WHERE lt.k = lower(ta.ticket_number)
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'recycled', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.try_hold_ticket_number(
  p_site_key TEXT,
  p_number TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site TEXT;
  v_num TEXT;
  v_status TEXT;
BEGIN
  v_site := trim(p_site_key);
  v_num := trim(p_number);
  IF v_site IS NULL OR length(v_site) = 0 OR v_num IS NULL OR length(v_num) = 0 THEN
    RETURN false;
  END IF;

  SELECT ta.status INTO v_status
  FROM public.ticket_allocations ta
  WHERE ta.site_key = v_site
    AND lower(ta.ticket_number) = lower(v_num)
  FOR UPDATE;

  IF v_status = 'released' THEN
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
      AND lower(ticket_number) = lower(v_num)
      AND status = 'released';
    RETURN FOUND;
  END IF;

  IF v_status IN ('held', 'assigned') THEN
    RETURN false;
  END IF;

  BEGIN
    INSERT INTO public.ticket_allocations (site_key, ticket_number, status, held_at, updated_at)
    VALUES (v_site, v_num, 'held', NOW(), NOW());
    RETURN true;
  EXCEPTION WHEN unique_violation THEN
    RETURN false;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_ticket_allocations_from_quote()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site TEXT;
  v_id BIGINT;
  v_nums TEXT[] := ARRAY[]::TEXT[];
  n TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.ticket_allocations
    SET
      status = 'released',
      quote_id = NULL,
      item_index = NULL,
      released_at = NOW(),
      assigned_at = NULL,
      updated_at = NOW()
    WHERE site_key = OLD.site_key
      AND quote_id = OLD.id
      AND status IN ('held', 'assigned');
    RETURN OLD;
  END IF;

  v_site := NEW.site_key;
  v_id := NEW.id;
  v_nums := public.quote_item_ticket_numbers(NEW.items);

  IF v_nums IS NOT NULL AND cardinality(v_nums) > 0 THEN
    FOREACH n IN ARRAY v_nums LOOP
      INSERT INTO public.ticket_allocations (
        site_key, ticket_number, status, quote_id, assigned_at, held_at, released_at, updated_at
      )
      VALUES (v_site, n, 'assigned', v_id, NOW(), NOW(), NULL, NOW())
      ON CONFLICT (site_key, ticket_number) DO UPDATE
      SET
        status = 'assigned',
        quote_id = v_id,
        assigned_at = COALESCE(public.ticket_allocations.assigned_at, NOW()),
        released_at = NULL,
        updated_at = NOW()
      WHERE
        public.ticket_allocations.status <> 'assigned'
        OR public.ticket_allocations.quote_id IS NULL
        OR public.ticket_allocations.quote_id = v_id;
    END LOOP;
  END IF;

  UPDATE public.ticket_allocations
  SET
    status = 'released',
    quote_id = NULL,
    item_index = NULL,
    released_at = NOW(),
    assigned_at = NULL,
    updated_at = NOW()
  WHERE site_key = v_site
    AND quote_id = v_id
    AND status IN ('held', 'assigned')
    AND (
      v_nums IS NULL
      OR cardinality(v_nums) = 0
      OR NOT (ticket_number = ANY (v_nums))
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotes_sync_ticket_allocations ON public.quotes;
CREATE TRIGGER trg_quotes_sync_ticket_allocations
AFTER INSERT OR UPDATE OF items OR DELETE ON public.quotes
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_ticket_allocations_from_quote();

DROP FUNCTION IF EXISTS public.reserve_ticket_numbers(TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.reserve_ticket_numbers(TEXT, INTEGER, TEXT[]);
DROP FUNCTION IF EXISTS public.reserve_ticket_numbers(TEXT, INTEGER, TEXT[], TEXT[]);

CREATE OR REPLACE FUNCTION public.reserve_ticket_numbers(
  p_site_key TEXT,
  p_count INTEGER,
  p_exclude TEXT[] DEFAULT NULL,
  p_prefer TEXT[] DEFAULT NULL
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
  v_prefer TEXT[] := ARRAY[]::TEXT[];
  v_reuse TEXT;
  n TEXT;
  v_guard INT := 0;
  v_max_guard INT;
  v_start BIGINT;
  v_blocked BOOLEAN;
  v_already BOOLEAN;
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

  IF p_prefer IS NOT NULL THEN
    SELECT coalesce(array_agg(trim(x)), ARRAY[]::TEXT[])
    INTO v_prefer
    FROM unnest(p_prefer) AS x
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

  PERFORM public.recycle_orphan_ticket_allocations(v_site, 120);

  -- 0) Préférer les n° déjà affichés s’ils sont encore libres.
  IF v_prefer IS NOT NULL AND cardinality(v_prefer) > 0 THEN
    FOREACH v_reuse IN ARRAY v_prefer LOOP
      EXIT WHEN cardinality(v_nums) >= p_count;
      IF v_reuse = ANY (v_nums) THEN
        CONTINUE;
      END IF;
      IF cardinality(v_exclude) > 0 AND lower(v_reuse) = ANY (v_exclude) THEN
        CONTINUE;
      END IF;
      IF public.try_hold_ticket_number(v_site, v_reuse) THEN
        v_nums := array_append(v_nums, v_reuse);
      END IF;
    END LOOP;
  END IF;

  -- 1) Réutiliser les n° released (trous), plus petit d’abord.
  FOR v_reuse IN
    SELECT ta.ticket_number
    FROM public.ticket_allocations ta
    WHERE ta.site_key = v_site
      AND ta.status = 'released'
      AND NOT (ta.ticket_number = ANY (v_nums))
      AND (
        ta.ticket_number !~ '^[0-9]+$'
        OR ta.ticket_number::bigint >= v_cursor - 200
      )
      AND (
        cardinality(v_exclude) = 0
        OR NOT (lower(ta.ticket_number) = ANY (v_exclude))
      )
    ORDER BY
      CASE WHEN ta.ticket_number ~ '^[0-9]+$' THEN ta.ticket_number::bigint ELSE NULL END NULLS LAST,
      ta.ticket_number
    FOR UPDATE SKIP LOCKED
  LOOP
    EXIT WHEN cardinality(v_nums) >= p_count;
    IF public.try_hold_ticket_number(v_site, v_reuse) THEN
      v_nums := array_append(v_nums, v_reuse);
    END IF;
  END LOOP;

  -- 2) Compléter depuis le compteur (ne saute un n° que s’il est vraiment pris ou exclu).
  v_start := NULL;
  v_max_guard := GREATEST(p_count * 30, 800);
  WHILE cardinality(v_nums) < p_count AND v_guard < v_max_guard LOOP
    v_guard := v_guard + 1;
    n := public.format_ticket_number(v_cursor, v_prefix, v_pad);
    v_already := EXISTS (
      SELECT 1 FROM unnest(v_nums) AS x WHERE lower(x) = lower(n)
    );
    v_blocked := cardinality(v_exclude) > 0 AND lower(n) = ANY (v_exclude);

    IF NOT v_already AND NOT v_blocked THEN
      IF public.try_hold_ticket_number(v_site, n) THEN
        v_nums := array_append(v_nums, n);
        IF v_start IS NULL THEN v_start := v_cursor; END IF;
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

GRANT EXECUTE ON FUNCTION public.quote_item_ticket_numbers(JSONB) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ticket_number_in_quotes(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recycle_orphan_ticket_allocations(TEXT, INTEGER) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.try_hold_ticket_number(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_ticket_numbers(TEXT, INTEGER, TEXT[], TEXT[]) TO anon, authenticated, service_role;

-- Ne pas recycler en masse les anciens trous historiques (le carnet reprend à next_value).
-- Les orphelins récents (échec sync / double-clic) restent recyclés à la volée (7 jours max).
