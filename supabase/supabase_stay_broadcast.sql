-- Message intranet vers les clients qui ont ouvert Mon séjour avec un n° de réservation.
-- Seuls Ewen et Karim sont acceptés. Le code n'est jamais renvoyé.

ALTER TABLE public.client_stay_push_subscriptions
  ADD COLUMN IF NOT EXISTS reservation_code TEXT;

CREATE INDEX IF NOT EXISTS client_stay_push_subscriptions_code_idx
  ON public.client_stay_push_subscriptions (site_key)
  WHERE reservation_code IS NOT NULL;

DROP FUNCTION IF EXISTS public.register_client_stay_push(TEXT, TEXT, TEXT, TEXT, TEXT);

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
    site_key, phone_key, endpoint, p256dh, auth, reservation_code, updated_at
  )
  VALUES (v_site, v_key, v_endpoint, v_p256dh, v_auth, v_code, now())
  ON CONFLICT (endpoint) DO UPDATE SET
    site_key = EXCLUDED.site_key,
    phone_key = EXCLUDED.phone_key,
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth,
    reservation_code = COALESCE(EXCLUDED.reservation_code, public.client_stay_push_subscriptions.reservation_code),
    updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.register_client_stay_push(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_client_stay_push(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.intranet_confirm_ewen_or_karim(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT := trim(coalesce(p_code, ''));
  v_key TEXT;
  v_locked TIMESTAMPTZ;
  v_ok BOOLEAN := false;
BEGIN
  IF v_code !~ '^[0-9]{6}$' THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  v_key := md5(v_code);

  SELECT locked_until
    INTO v_locked
  FROM public.intranet_login_guard
  WHERE code_key = v_key;

  IF v_locked IS NOT NULL AND v_locked > now() THEN
    RETURN jsonb_build_object('ok', false, 'locked', true);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE code = v_code
      AND lower(trim(translate(name, 'ÉÈÊËéèêëÀÁÂàáâ', 'EEEEeeeeAAAaaa'))) IN ('ewen', 'karim')
  )
  INTO v_ok;

  IF NOT v_ok THEN
    INSERT INTO public.intranet_login_guard (code_key, failures, locked_until)
    VALUES (v_key, 1, NULL)
    ON CONFLICT (code_key) DO UPDATE
      SET failures = public.intranet_login_guard.failures + 1,
          locked_until = CASE
            WHEN public.intranet_login_guard.failures + 1 >= 8 THEN now() + interval '15 minutes'
            ELSE NULL
          END;
    RETURN jsonb_build_object('ok', false);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.intranet_confirm_ewen_or_karim(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intranet_confirm_ewen_or_karim(TEXT) TO service_role;
