-- Attribution exclusive multi-PC : un n° ne peut appartenir qu’à un seul devis.
-- claim_ticket_numbers_for_quote vérifie le JSON des devis (source de vérité)
-- + verrouille le registre ticket_allocations.

CREATE OR REPLACE FUNCTION public.ticket_number_taken_by_other_quote(
  p_site_key TEXT,
  p_quote_id BIGINT,
  p_ticket_number TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_other BIGINT;
  v_key TEXT := lower(trim(p_ticket_number));
BEGIN
  IF v_key IS NULL OR length(v_key) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT q.id INTO v_other
  FROM public.quotes q
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(q.items) = 'array' THEN q.items ELSE '[]'::jsonb END
  ) AS item
  WHERE q.site_key = trim(p_site_key)
    AND (p_quote_id IS NULL OR q.id <> p_quote_id)
    AND jsonb_typeof(item) = 'object'
    AND lower(trim(COALESCE(item->>'ticketNumber', ''))) = v_key
  LIMIT 1;

  RETURN v_other;
END;
$$;

-- Claim exclusif de TOUS les n° d’un devis avant enregistrement.
-- Échoue (ok=false) si un n° est déjà sur un autre devis.
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
      public.ticket_allocations.status <> 'assigned'
      OR public.ticket_allocations.quote_id IS NULL
      OR p_quote_id IS NULL
      OR public.ticket_allocations.quote_id = p_quote_id;

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
      WHERE site_key = v_site AND lower(ticket_number) = v_key;
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

GRANT EXECUTE ON FUNCTION public.ticket_number_taken_by_other_quote(TEXT, BIGINT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_ticket_numbers_for_quote(TEXT, BIGINT, TEXT[]) TO anon, authenticated, service_role;

-- Répare le registre : tous les n° présents sur devis → assigned
INSERT INTO public.ticket_allocations (site_key, ticket_number, status, quote_id, assigned_at, updated_at)
SELECT DISTINCT ON (trim(item->>'ticketNumber'))
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
ORDER BY trim(item->>'ticketNumber'), q.updated_at ASC
ON CONFLICT (site_key, ticket_number) DO UPDATE
SET
  status = 'assigned',
  quote_id = EXCLUDED.quote_id,
  assigned_at = COALESCE(public.ticket_allocations.assigned_at, NOW()),
  released_at = NULL,
  updated_at = NOW();

-- Nettoie held/released orphelins déjà réellement utilisés sur un devis
UPDATE public.ticket_allocations ta
SET status = 'assigned', released_at = NULL, updated_at = NOW()
WHERE ta.site_key = 'hurghada_dream_0606'
  AND ta.status IN ('held', 'released')
  AND EXISTS (
    SELECT 1
    FROM public.quotes q
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(q.items) = 'array' THEN q.items ELSE '[]'::jsonb END
    ) AS item
    WHERE q.site_key = ta.site_key
      AND jsonb_typeof(item) = 'object'
      AND lower(trim(COALESCE(item->>'ticketNumber', ''))) = lower(ta.ticket_number)
  );
