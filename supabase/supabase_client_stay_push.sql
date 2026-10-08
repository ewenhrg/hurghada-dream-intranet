-- Notifications push « Mon séjour » (Web Push, sans WhatsApp).

CREATE TABLE IF NOT EXISTS public.client_stay_push_subscriptions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  site_key TEXT NOT NULL,
  phone_key TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS client_stay_push_subscriptions_phone_idx
  ON public.client_stay_push_subscriptions (site_key, phone_key);

ALTER TABLE public.client_stay_push_subscriptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.client_stay_push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.client_stay_push_subscriptions TO service_role;

CREATE OR REPLACE FUNCTION public.register_client_stay_push(
  p_site_key TEXT,
  p_phone TEXT,
  p_endpoint TEXT,
  p_p256dh TEXT,
  p_auth TEXT
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

  INSERT INTO public.client_stay_push_subscriptions (
    site_key, phone_key, endpoint, p256dh, auth, updated_at
  )
  VALUES (v_site, v_key, v_endpoint, v_p256dh, v_auth, now())
  ON CONFLICT (endpoint) DO UPDATE SET
    site_key = EXCLUDED.site_key,
    phone_key = EXCLUDED.phone_key,
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth,
    updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_client_stay_push(TEXT, TEXT, TEXT, TEXT, TEXT)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_vapid_keys()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT jsonb_build_object(
    'public', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'vapid_public_key' LIMIT 1),
    'private', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'vapid_private_key' LIMIT 1),
    'subject', coalesce(
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'vapid_subject' LIMIT 1),
      'mailto:ewenkermorvantpro@gmail.com'
    )
  );
$$;

REVOKE ALL ON FUNCTION public.get_vapid_keys() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_vapid_keys() TO service_role;
