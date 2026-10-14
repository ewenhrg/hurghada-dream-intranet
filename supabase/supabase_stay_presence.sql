-- Un client Mon séjour n'est compté que tant qu'il reste connecté.

ALTER TABLE public.client_stay_push_subscriptions
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.register_client_stay_push(
  p_site_key TEXT,
  p_phone TEXT,
  p_endpoint TEXT,
  p_p256dh TEXT,
  p_auth TEXT,
  p_reservation_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site TEXT := trim(p_site_key);
  v_key TEXT;
  v_endpoint TEXT := trim(p_endpoint);
  v_p256dh TEXT := trim(p_p256dh);
  v_auth TEXT := trim(p_auth);
  v_code TEXT := upper(regexp_replace(trim(coalesce(p_reservation_code, '')), '\s+', '', 'g'));
BEGIN
  IF v_site IS NULL OR length(v_site) = 0 THEN
    RAISE EXCEPTION 'site_key required';
  END IF;
  v_key := public.phone_match_key(p_phone);
  IF v_key IS NULL OR length(v_key) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'phone');
  END IF;
  IF length(v_endpoint) < 20 OR length(v_p256dh) < 10 OR length(v_auth) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'subscription');
  END IF;
  IF v_code !~ '^[A-Z]{2}-[0-9]{4,}$' THEN
    v_code := NULL;
  END IF;

  INSERT INTO public.client_stay_push_subscriptions (
    site_key, phone_key, endpoint, p256dh, auth, reservation_code, last_seen_at, updated_at
  )
  VALUES (v_site, v_key, v_endpoint, v_p256dh, v_auth, v_code, now(), now())
  ON CONFLICT (endpoint) DO UPDATE SET
    site_key = EXCLUDED.site_key,
    phone_key = EXCLUDED.phone_key,
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth,
    reservation_code = COALESCE(EXCLUDED.reservation_code, public.client_stay_push_subscriptions.reservation_code),
    last_seen_at = now(),
    updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.register_client_stay_push(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_client_stay_push(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.touch_client_stay_push(
  p_site_key TEXT,
  p_endpoint TEXT,
  p_reservation_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site TEXT := trim(coalesce(p_site_key, ''));
  v_endpoint TEXT := trim(coalesce(p_endpoint, ''));
  v_code TEXT := upper(regexp_replace(trim(coalesce(p_reservation_code, '')), '\s+', '', 'g'));
BEGIN
  IF length(v_site) = 0 OR length(v_endpoint) < 20 THEN
    RETURN jsonb_build_object('ok', false);
  END IF;
  IF v_code !~ '^[A-Z]{2}-[0-9]{4,}$' THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  UPDATE public.client_stay_push_subscriptions
  SET last_seen_at = now(),
      reservation_code = v_code,
      updated_at = now()
  WHERE site_key = v_site
    AND endpoint = v_endpoint;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.touch_client_stay_push(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_client_stay_push(TEXT, TEXT, TEXT)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.release_client_stay_push(
  p_site_key TEXT,
  p_endpoint TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site TEXT := trim(coalesce(p_site_key, ''));
  v_endpoint TEXT := trim(coalesce(p_endpoint, ''));
BEGIN
  IF length(v_site) = 0 OR length(v_endpoint) < 20 THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  UPDATE public.client_stay_push_subscriptions
  SET reservation_code = NULL,
      last_seen_at = NULL,
      updated_at = now()
  WHERE site_key = v_site
    AND endpoint = v_endpoint;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.release_client_stay_push(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_client_stay_push(TEXT, TEXT)
  TO anon, authenticated, service_role;
