-- =============================================================================
-- Accès page par page (utilisateurs). Exécuter dans Supabase → SQL Editor.
-- Puis l’intranet lit ces colonnes au login et affiche uniquement les pages cochées.
-- =============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS can_access_devis BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_access_planning BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_access_catalog_admin BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_access_data_entry BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_access_receipt BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_access_b2b BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_access_events BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_access_public_devis BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_access_hotel_history BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_access_void_tickets BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_access_modif_demandes BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_access_stop_sale BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_access_hotels BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_access_interns BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_access_stay_broadcast BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_access_flyer BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_access_documents BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_access_ewen_dashboard BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_access_activity_prices BOOLEAN DEFAULT false;

-- Conserver le comportement historique pour les comptes déjà connus
UPDATE public.users SET
  can_access_devis = COALESCE(can_access_devis, true),
  can_access_planning = COALESCE(can_access_planning, can_access_activities, true),
  can_access_documents = COALESCE(can_access_documents, true),
  can_access_activities = COALESCE(can_access_activities, true),
  can_access_history = COALESCE(can_access_history, true),
  can_access_tickets = COALESCE(can_access_tickets, true);

UPDATE public.users SET
  can_access_data_entry = true,
  can_access_receipt = CASE WHEN lower(btrim(name)) IN ('ewen', 'karim', 'ramy') THEN true ELSE can_access_receipt END,
  can_access_events = CASE WHEN lower(btrim(name)) IN ('ewen', 'karim', 'sophia') THEN true ELSE can_access_events END,
  can_access_hotel_history = CASE
    WHEN lower(btrim(translate(name, 'éÉ', 'eE'))) IN ('ewen', 'karim', 'lea', 'amr', 'sara', 'mayar') THEN true
    ELSE can_access_hotel_history
  END,
  can_access_void_tickets = CASE WHEN lower(btrim(name)) IN ('ewen', 'karim') THEN true ELSE can_access_void_tickets END,
  can_access_hotels = CASE
    WHEN lower(btrim(translate(name, 'éÉ', 'eE'))) IN ('ewen', 'lea', 'sophia', 'karim') THEN true
    ELSE can_access_hotels
  END,
  can_access_interns = CASE WHEN lower(btrim(name)) IN ('ewen', 'karim') THEN true ELSE can_access_interns END,
  can_access_stay_broadcast = CASE WHEN lower(btrim(name)) IN ('ewen', 'karim') THEN true ELSE can_access_stay_broadcast END,
  can_access_flyer = CASE WHEN lower(btrim(name)) IN ('ewen', 'karim') THEN true ELSE can_access_flyer END,
  can_access_ewen_dashboard = CASE
    WHEN lower(btrim(translate(name, 'éÉ', 'eE'))) IN ('ewen', 'lea', 'sophia', 'karim') THEN true
    ELSE can_access_ewen_dashboard
  END,
  can_access_catalog_admin = CASE WHEN can_edit_activity IS TRUE THEN true ELSE COALESCE(can_access_catalog_admin, false) END,
  can_access_b2b = CASE WHEN can_access_history IS NOT FALSE THEN true ELSE COALESCE(can_access_b2b, false) END,
  can_access_public_devis = CASE WHEN can_access_history IS NOT FALSE THEN true ELSE COALESCE(can_access_public_devis, false) END,
  can_access_modif_demandes = CASE WHEN can_access_history IS NOT FALSE THEN true ELSE COALESCE(can_access_modif_demandes, false) END,
  can_access_stop_sale = CASE
    WHEN can_access_situation IS TRUE OR lower(btrim(name)) = 'situation'
      OR lower(btrim(translate(name, 'éÉ', 'eE'))) IN ('ewen', 'lea', 'sophia', 'karim')
    THEN true
    ELSE COALESCE(can_access_stop_sale, false)
  END
WHERE true;

UPDATE public.users SET can_access_data_entry = true
WHERE lower(btrim(name)) IN ('situation', 'ewen', 'karim');

-- Login : renvoyer toutes les colonnes d’accès pages
CREATE OR REPLACE FUNCTION public.intranet_login(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_code TEXT := trim(coalesce(p_code, ''));
  v_key TEXT;
  v_failures INTEGER := 0;
  v_locked TIMESTAMPTZ;
  r public.users%ROWTYPE;
BEGIN
  IF v_code !~ '^[0-9]{6}$' THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  v_key := md5(v_code);

  SELECT failures, locked_until
    INTO v_failures, v_locked
  FROM public.intranet_login_guard
  WHERE code_key = v_key;

  IF v_locked IS NOT NULL AND v_locked > now() THEN
    RETURN jsonb_build_object('ok', false, 'locked', true);
  END IF;

  SELECT *
    INTO r
  FROM public.users
  WHERE code = v_code
  LIMIT 1;

  IF NOT FOUND THEN
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

  DELETE FROM public.intranet_login_guard WHERE code_key = v_key;

  RETURN jsonb_build_object(
    'ok', true,
    'user', jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'can_delete_quote', r.can_delete_quote,
      'can_add_activity', r.can_add_activity,
      'can_edit_activity', r.can_edit_activity,
      'can_delete_activity', r.can_delete_activity,
      'can_reset_data', r.can_reset_data,
      'can_access_activities', r.can_access_activities,
      'can_access_history', r.can_access_history,
      'can_access_tickets', r.can_access_tickets,
      'can_access_modifications', r.can_access_modifications,
      'can_access_situation', r.can_access_situation,
      'can_access_users', r.can_access_users,
      'can_access_activity_prices', r.can_access_activity_prices,
      'can_access_devis', r.can_access_devis,
      'can_access_planning', r.can_access_planning,
      'can_access_catalog_admin', r.can_access_catalog_admin,
      'can_access_data_entry', r.can_access_data_entry,
      'can_access_receipt', r.can_access_receipt,
      'can_access_b2b', r.can_access_b2b,
      'can_access_events', r.can_access_events,
      'can_access_public_devis', r.can_access_public_devis,
      'can_access_hotel_history', r.can_access_hotel_history,
      'can_access_void_tickets', r.can_access_void_tickets,
      'can_access_modif_demandes', r.can_access_modif_demandes,
      'can_access_stop_sale', r.can_access_stop_sale,
      'can_access_hotels', r.can_access_hotels,
      'can_access_interns', r.can_access_interns,
      'can_access_stay_broadcast', r.can_access_stay_broadcast,
      'can_access_flyer', r.can_access_flyer,
      'can_access_documents', r.can_access_documents,
      'can_access_ewen_dashboard', r.can_access_ewen_dashboard,
      'intranet_auth_email', r.intranet_auth_email
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.intranet_login(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intranet_login(TEXT) TO service_role;
