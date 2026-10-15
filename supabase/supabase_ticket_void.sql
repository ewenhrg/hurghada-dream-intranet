-- Numéros annulés : statut void, jamais remis dans le pool.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE n.nspname = 'public'
      AND t.relname = 'ticket_allocations'
      AND c.contype = 'c'
      AND a.attname = 'status'
  LOOP
    EXECUTE format('ALTER TABLE public.ticket_allocations DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.ticket_allocations
  ADD CONSTRAINT ticket_allocations_status_check
  CHECK (status IN ('held', 'assigned', 'released', 'void'));

CREATE OR REPLACE FUNCTION public.void_ticket_allocations(
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
    RETURN jsonb_build_object('ok', true, 'voided', 0);
  END IF;

  FOREACH n IN ARRAY p_numbers LOOP
    n := trim(n);
    IF length(n) = 0 THEN
      CONTINUE;
    END IF;
    INSERT INTO public.ticket_allocations (site_key, ticket_number, status, updated_at)
    VALUES (v_site, n, 'void', NOW())
    ON CONFLICT (site_key, ticket_number) DO UPDATE
    SET
      status = 'void',
      released_at = NULL,
      updated_at = NOW();
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'voided', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.void_ticket_allocations(TEXT, TEXT[]) TO anon, authenticated, service_role;

COMMENT ON TABLE public.ticket_allocations IS
  'Registre des n° ticket : held=réservé, assigned=sur un devis, released=trou récent réutilisable, void=annulé et jamais redonné.';

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

  IF v_status = 'void' THEN
    RETURN false;
  END IF;

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
        public.ticket_allocations.status <> 'void'
        AND (
          public.ticket_allocations.status <> 'assigned'
          OR public.ticket_allocations.quote_id IS NULL
          OR public.ticket_allocations.quote_id = v_id
        );
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

CREATE OR REPLACE FUNCTION public.claim_ticket_numbers_for_quote(
  p_site_key TEXT,
  p_quote_id BIGINT,
  p_numbers TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site TEXT;
  n TEXT;
  v_key TEXT;
  v_other BIGINT;
  v_conflicts TEXT[] := ARRAY[]::TEXT[];
  v_claimed TEXT[] := ARRAY[]::TEXT[];
  v_norm TEXT[] := ARRAY[]::TEXT[];
BEGIN
  v_site := trim(p_site_key);
  IF v_site IS NULL OR length(v_site) = 0 THEN
    RAISE EXCEPTION 'site_key required';
  END IF;
  IF p_numbers IS NULL OR cardinality(p_numbers) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'claimed', '[]'::jsonb, 'conflicts', '[]'::jsonb);
  END IF;

  -- Normalise + dédoublonne la liste demandée
  SELECT coalesce(array_agg(DISTINCT trim(x)), ARRAY[]::TEXT[])
  INTO v_norm
  FROM unnest(p_numbers) AS x
  WHERE length(trim(x)) > 0;

  -- Verrouille la séquence (sérialise les claims concurrentes)
  PERFORM 1 FROM public.ticket_sequence WHERE site_key = v_site FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.ticket_sequence (site_key, next_value) VALUES (v_site, 1);
    PERFORM 1 FROM public.ticket_sequence WHERE site_key = v_site FOR UPDATE;
  END IF;

  FOREACH n IN ARRAY v_norm LOOP
    v_key := lower(trim(n));
    v_other := public.ticket_number_taken_by_other_quote(v_site, p_quote_id, n);
    IF v_other IS NOT NULL THEN
      v_conflicts := array_append(v_conflicts, n || ' (devis #' || v_other::text || ')');
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.ticket_allocations ta
      WHERE ta.site_key = v_site
        AND lower(ta.ticket_number) = v_key
        AND ta.status = 'void'
    ) THEN
      v_conflicts := array_append(v_conflicts, n || ' (annulé, numéro mort)');
      CONTINUE;
    END IF;

    -- Aussi bloquer si le registre dit assigned à un autre devis
    IF EXISTS (
      SELECT 1 FROM public.ticket_allocations ta
      WHERE ta.site_key = v_site
        AND lower(ta.ticket_number) = v_key
        AND ta.status = 'assigned'
        AND ta.quote_id IS NOT NULL
        AND (p_quote_id IS NULL OR ta.quote_id <> p_quote_id)
    ) THEN
      SELECT ta.quote_id INTO v_other
      FROM public.ticket_allocations ta
      WHERE ta.site_key = v_site
        AND lower(ta.ticket_number) = v_key
        AND ta.status = 'assigned'
      LIMIT 1;
      v_conflicts := array_append(v_conflicts, n || ' (registre #' || coalesce(v_other::text, '?') || ')');
      CONTINUE;
    END IF;

    INSERT INTO public.ticket_allocations (
      site_key, ticket_number, status, quote_id, assigned_at, held_at, released_at, updated_at
    )
    VALUES (
      v_site, trim(n), 'assigned', p_quote_id, NOW(), NOW(), NULL, NOW()
    )
    ON CONFLICT (site_key, ticket_number) DO UPDATE
    SET
      status = 'assigned',
      quote_id = COALESCE(p_quote_id, public.ticket_allocations.quote_id),
      assigned_at = NOW(),
      released_at = NULL,
      updated_at = NOW()
    WHERE
      public.ticket_allocations.status <> 'void'
      AND (
        public.ticket_allocations.status <> 'assigned'
        OR public.ticket_allocations.quote_id IS NULL
        OR p_quote_id IS NULL
        OR public.ticket_allocations.quote_id = p_quote_id
      );

    IF NOT EXISTS (
      SELECT 1 FROM public.ticket_allocations
      WHERE site_key = v_site
        AND lower(ticket_number) = v_key
        AND status = 'assigned'
        AND (p_quote_id IS NULL OR quote_id = p_quote_id OR quote_id IS NULL)
    ) THEN
      v_conflicts := array_append(v_conflicts, n);
    ELSE
      -- Assure quote_id
      UPDATE public.ticket_allocations
      SET quote_id = COALESCE(p_quote_id, quote_id), status = 'assigned', assigned_at = COALESCE(assigned_at, NOW()), released_at = NULL, updated_at = NOW()
      WHERE site_key = v_site AND lower(ticket_number) = v_key AND status <> 'void';
      v_claimed := array_append(v_claimed, trim(n));
    END IF;
  END LOOP;

  IF cardinality(v_conflicts) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'claimed', to_jsonb(v_claimed),
      'conflicts', to_jsonb(v_conflicts),
      'error', 'duplicate_ticket_number'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'claimed', to_jsonb(v_claimed),
    'conflicts', '[]'::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.try_hold_ticket_number(TEXT, TEXT) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.claim_ticket_numbers_for_quote(TEXT, BIGINT, TEXT[]) TO anon, authenticated, service_role;
