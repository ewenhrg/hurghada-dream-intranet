-- Programme client (appli Mon séjour) : lookup par téléphone, champs publics uniquement.

CREATE OR REPLACE FUNCTION public.phone_match_key(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  d TEXT := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
BEGIN
  IF left(d, 2) = '00' THEN
    d := substr(d, 3);
  END IF;
  IF length(d) >= 12 AND left(d, 2) = '20' THEN
    RETURN right(d, 10);
  END IF;
  IF length(d) >= 11 AND left(d, 1) = '0' THEN
    RETURN right(d, 10);
  END IF;
  IF length(d) >= 10 AND left(d, 1) = '1' THEN
    RETURN right(d, 10);
  END IF;
  RETURN right(d, LEAST(10, length(d)));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_client_stay_by_phone(
  p_site_key TEXT,
  p_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site TEXT := trim(p_site_key);
  v_key TEXT;
  v_name TEXT := '';
  v_hotel TEXT := '';
  v_room TEXT := '';
  v_neighborhood TEXT := '';
  v_arrival TEXT := '';
  v_departure TEXT := '';
  v_items JSONB := '[]'::jsonb;
  v_updated TIMESTAMPTZ;
  r RECORD;
  item JSONB;
  v_name_item TEXT;
  v_date TEXT;
  v_pickup TEXT;
  v_ticket TEXT;
  v_rest NUMERIC;
  v_adults INT;
  v_children INT;
  v_babies INT;
BEGIN
  IF v_site IS NULL OR length(v_site) = 0 THEN
    RAISE EXCEPTION 'site_key required';
  END IF;

  v_key := public.phone_match_key(p_phone);
  IF v_key IS NULL OR length(v_key) < 10 THEN
    RETURN jsonb_build_object('ok', true, 'found', false);
  END IF;

  FOR r IN
    SELECT
      q.client_phone,
      q.client_name,
      q.client_hotel,
      q.client_room,
      q.client_neighborhood,
      q.client_arrival_date,
      q.client_departure_date,
      q.items,
      q.updated_at,
      q.created_at
    FROM public.quotes q
    WHERE q.site_key = v_site
      AND regexp_replace(coalesce(q.client_phone, ''), '[^0-9]', '', 'g') LIKE '%' || v_key
      AND public.phone_match_key(q.client_phone) = v_key
    ORDER BY coalesce(q.updated_at, q.created_at) DESC
  LOOP
    IF length(v_name) = 0 AND length(trim(coalesce(r.client_name, ''))) > 0 THEN
      v_name := trim(r.client_name);
    END IF;
    IF length(v_hotel) = 0 AND length(trim(coalesce(r.client_hotel, ''))) > 0 THEN
      v_hotel := trim(r.client_hotel);
    END IF;
    IF length(v_room) = 0 AND length(trim(coalesce(r.client_room, ''))) > 0 THEN
      v_room := trim(r.client_room);
    END IF;
    IF length(v_neighborhood) = 0 AND length(trim(coalesce(r.client_neighborhood, ''))) > 0 THEN
      v_neighborhood := trim(r.client_neighborhood);
    END IF;
    IF length(v_arrival) = 0 AND r.client_arrival_date IS NOT NULL THEN
      v_arrival := r.client_arrival_date::text;
    END IF;
    IF length(v_departure) = 0 AND r.client_departure_date IS NOT NULL THEN
      v_departure := r.client_departure_date::text;
    END IF;
    IF r.updated_at IS NOT NULL AND (v_updated IS NULL OR r.updated_at > v_updated) THEN
      v_updated := r.updated_at;
    ELSIF r.created_at IS NOT NULL AND (v_updated IS NULL OR r.created_at > v_updated) THEN
      v_updated := r.created_at;
    END IF;

    IF jsonb_typeof(r.items) = 'array' THEN
      FOR item IN SELECT value FROM jsonb_array_elements(r.items) AS t(value)
      LOOP
        IF jsonb_typeof(item) <> 'object' THEN
          CONTINUE;
        END IF;
        v_name_item := trim(coalesce(item->>'activityName', item->>'activity_name', ''));
        IF length(v_name_item) = 0 THEN
          CONTINUE;
        END IF;
        v_date := trim(coalesce(item->>'date', ''));
        v_pickup := trim(coalesce(item->>'pickupTime', item->>'pickup_time', ''));
        v_ticket := trim(coalesce(item->>'ticketNumber', item->>'ticket_number', ''));
        BEGIN
          v_rest := coalesce(NULLIF(item->>'restAmount', '')::numeric, 0);
        EXCEPTION WHEN others THEN
          v_rest := 0;
        END;
        BEGIN
          v_adults := coalesce(NULLIF(item->>'adults', '')::int, 0);
          v_children := coalesce(NULLIF(item->>'children', '')::int, 0);
          v_babies := coalesce(NULLIF(item->>'babies', '')::int, 0);
        EXCEPTION WHEN others THEN
          v_adults := 0;
          v_children := 0;
          v_babies := 0;
        END;

        v_items := v_items || jsonb_build_array(jsonb_build_object(
          'activityName', v_name_item,
          'date', v_date,
          'pickupTime', v_pickup,
          'ticketNumber', v_ticket,
          'restAmount', v_rest,
          'adults', v_adults,
          'children', v_children,
          'babies', v_babies
        ));
      END LOOP;
    END IF;
  END LOOP;

  IF jsonb_array_length(v_items) = 0 AND length(v_name) = 0 AND length(v_hotel) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'found', false);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'found', true,
    'client', jsonb_build_object(
      'name', v_name,
      'hotel', v_hotel,
      'room', v_room,
      'neighborhood', v_neighborhood,
      'arrivalDate', v_arrival,
      'departureDate', v_departure
    ),
    'items', v_items,
    'updatedAt', CASE WHEN v_updated IS NULL THEN '' ELSE v_updated::text END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.phone_match_key(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_stay_by_phone(TEXT, TEXT) TO anon, authenticated, service_role;
