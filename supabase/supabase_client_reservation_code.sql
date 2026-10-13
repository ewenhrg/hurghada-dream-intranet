-- N° de réservation client (Mon séjour) : 2 lettres du prénom + tiret + numéro unique.
-- Un même client (même téléphone) garde un seul code tant qu’une activité n’est pas passée.
-- L’accès Mon séjour tombe quand toutes les dates d’activité sont passées.

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS reservation_code TEXT;

CREATE INDEX IF NOT EXISTS idx_quotes_reservation_code
  ON public.quotes (site_key, reservation_code);

CREATE SEQUENCE IF NOT EXISTS public.reservation_code_seq START WITH 10000;

CREATE OR REPLACE FUNCTION public.reservation_name_prefix(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_first TEXT;
  v_letters TEXT;
BEGIN
  v_first := split_part(trim(coalesce(p_name, '')), ' ', 1);
  v_first := translate(
    v_first,
    'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
    'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY'
  );
  v_letters := regexp_replace(upper(v_first), '[^A-Z]', '', 'g');
  IF length(v_letters) < 2 THEN
    v_letters := v_letters || 'XX';
  END IF;
  RETURN left(v_letters, 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.quote_has_open_activity(p_items JSONB, p_today DATE)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  item JSONB;
  v_date TEXT;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' THEN
    RETURN false;
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) AS t(value)
  LOOP
    v_date := trim(coalesce(item->>'date', ''));
    IF v_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND v_date::date >= p_today THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_client_reservation_code(
  p_site_key TEXT,
  p_quote_id BIGINT,
  p_client_name TEXT,
  p_phone TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site TEXT := trim(p_site_key);
  v_today DATE := (now() AT TIME ZONE 'Africa/Cairo')::date;
  v_existing TEXT;
  v_key TEXT;
  v_code TEXT;
BEGIN
  IF v_site IS NULL OR length(v_site) = 0 OR p_quote_id IS NULL THEN
    RAISE EXCEPTION 'site_key and quote id required';
  END IF;

  SELECT trim(coalesce(reservation_code, ''))
    INTO v_existing
  FROM public.quotes
  WHERE id = p_quote_id
    AND site_key = v_site;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'quote not found';
  END IF;

  IF length(v_existing) > 0 THEN
    RETURN v_existing;
  END IF;

  v_key := public.phone_match_key(p_phone);
  IF v_key IS NOT NULL AND length(v_key) >= 10 THEN
    SELECT trim(q.reservation_code)
      INTO v_existing
    FROM public.quotes q
    WHERE q.site_key = v_site
      AND q.id <> p_quote_id
      AND length(trim(coalesce(q.reservation_code, ''))) > 0
      AND public.phone_match_key(q.client_phone) = v_key
      AND public.quote_has_open_activity(q.items, v_today)
    ORDER BY coalesce(q.updated_at, q.created_at) DESC
    LIMIT 1;
  END IF;

  IF v_existing IS NOT NULL AND length(v_existing) > 0 THEN
    v_code := v_existing;
  ELSE
    v_code := public.reservation_name_prefix(p_client_name)
      || '-'
      || nextval('public.reservation_code_seq')::text;
  END IF;

  UPDATE public.quotes
  SET reservation_code = v_code
  WHERE id = p_quote_id
    AND site_key = v_site;

  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_client_stay_by_code(
  p_site_key TEXT,
  p_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site TEXT := trim(p_site_key);
  v_code TEXT := upper(regexp_replace(trim(coalesce(p_code, '')), '\s+', '', 'g'));
  v_today DATE := (now() AT TIME ZONE 'Africa/Cairo')::date;
  v_name TEXT := '';
  v_phone TEXT := '';
  v_hotel TEXT := '';
  v_room TEXT := '';
  v_neighborhood TEXT := '';
  v_arrival TEXT := '';
  v_departure TEXT := '';
  v_items JSONB := '[]'::jsonb;
  v_updated TIMESTAMPTZ;
  v_has_date BOOLEAN := false;
  v_has_open BOOLEAN := false;
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
  IF v_code !~ '^[A-Z]{2}-[0-9]{3,}$' THEN
    RETURN jsonb_build_object('ok', true, 'found', false, 'expired', false);
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
      AND upper(trim(coalesce(q.reservation_code, ''))) = v_code
    ORDER BY coalesce(q.updated_at, q.created_at) DESC
  LOOP
    IF length(v_name) = 0 AND length(trim(coalesce(r.client_name, ''))) > 0 THEN
      v_name := trim(r.client_name);
    END IF;
    IF length(v_phone) = 0 AND length(trim(coalesce(r.client_phone, ''))) > 0 THEN
      v_phone := trim(r.client_phone);
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
        IF v_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
          v_has_date := true;
          IF v_date::date >= v_today THEN
            v_has_open := true;
          END IF;
        END IF;
        v_pickup := trim(coalesce(item->>'pickupTime', item->>'pickup_time', ''));
        IF lower(coalesce(item->>'pickupPublished', '')) IS DISTINCT FROM 'true' THEN
          v_pickup := '';
        END IF;
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

  IF jsonb_array_length(v_items) = 0 AND length(v_name) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'found', false, 'expired', false);
  END IF;

  IF v_has_date AND NOT v_has_open THEN
    RETURN jsonb_build_object('ok', true, 'found', false, 'expired', true);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'found', true,
    'expired', false,
    'reservationCode', v_code,
    'client', jsonb_build_object(
      'name', v_name,
      'phone', v_phone,
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

GRANT EXECUTE ON FUNCTION public.reservation_name_prefix(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.quote_has_open_activity(JSONB, DATE) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_client_reservation_code(TEXT, BIGINT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_stay_by_code(TEXT, TEXT) TO anon, authenticated, service_role;
