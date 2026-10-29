-- Client public : lire les demandes de modification encore en cours (sans ouvrir toute la table).
CREATE OR REPLACE FUNCTION public.get_open_modification_requests_by_code(
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
  v_rows JSONB;
BEGIN
  IF v_site IS NULL OR length(v_site) = 0 THEN
    RAISE EXCEPTION 'site_key required';
  END IF;
  IF v_code !~ '^[A-Z]{2}-[0-9]{3,}$' THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      id,
      ticket_number,
      activity_name,
      activity_date::text AS activity_date,
      kind,
      change_type,
      status,
      created_at
    FROM public.public_modification_requests
    WHERE site_key = v_site
      AND upper(regexp_replace(trim(coalesce(reservation_code, '')), '\s+', '', 'g')) = v_code
      AND status IN ('pending', 'accepted', 'to_send', 'sent', 'to_refund')
  ) t;

  RETURN coalesce(v_rows, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_open_modification_requests_by_code(TEXT, TEXT) TO anon, authenticated, service_role;
