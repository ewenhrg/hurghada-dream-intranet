-- =============================================================================
-- Sécurise les tables ouvertes en écriture à la clé anon.
-- - Lecture publique conservée seulement pour le catalogue client (activités,
--   stop/push sales, hôtels, flyers, catalogues).
-- - INSERT public conservé uniquement pour les boîtes de dépôt client.
-- - UPDATE / DELETE (et la plupart des INSERT intranet) : auth.uid() requis.
-- La session Auth est délivrée par l’Edge Function intranet-session après PIN.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_intranet_authenticated()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL;
$$;

COMMENT ON FUNCTION public.is_intranet_authenticated() IS
  'Vrai si une session Supabase Auth est ouverte (délivrée après login PIN intranet).';

REVOKE ALL ON FUNCTION public.is_intranet_authenticated() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_intranet_authenticated() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helper: drop all policies on a table (idempotent recreation below)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  tables text[] := ARRAY[
    'quotes',
    'stop_sales',
    'push_sales',
    'public_quotes',
    'public_hotel_requests',
    'public_modification_requests',
    'public_event_quotes',
    'public_event_requests',
    'documents',
    'hotels',
    'intern_apartments',
    'interns',
    'message_settings',
    'client_flyers',
    'ticket_allocations',
    'ticket_entry_checks',
    'ticket_sequence',
    'b2b_access_requests',
    'b2b_accounts',
    'b2b_quotes',
    'public_hotels_catalog',
    'public_hotel_rates',
    'intranet_presence_sessions'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    FOR r IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- Also drop the leftover public insert hole on activities
DROP POLICY IF EXISTS "insert activities for this site" ON public.activities;

-- ========================= quotes (staff only) =========================
CREATE POLICY quotes_select_authenticated
  ON public.quotes FOR SELECT TO authenticated
  USING (public.is_intranet_authenticated());
CREATE POLICY quotes_insert_authenticated
  ON public.quotes FOR INSERT TO authenticated
  WITH CHECK (public.is_intranet_authenticated());
CREATE POLICY quotes_update_authenticated
  ON public.quotes FOR UPDATE TO authenticated
  USING (public.is_intranet_authenticated())
  WITH CHECK (public.is_intranet_authenticated());
CREATE POLICY quotes_delete_authenticated
  ON public.quotes FOR DELETE TO authenticated
  USING (public.is_intranet_authenticated());

-- ========================= stop_sales / push_sales =========================
-- SELECT public : catalogue client
CREATE POLICY stop_sales_select_public
  ON public.stop_sales FOR SELECT TO public USING (true);
CREATE POLICY stop_sales_insert_authenticated
  ON public.stop_sales FOR INSERT TO authenticated
  WITH CHECK (public.is_intranet_authenticated());
CREATE POLICY stop_sales_update_authenticated
  ON public.stop_sales FOR UPDATE TO authenticated
  USING (public.is_intranet_authenticated())
  WITH CHECK (public.is_intranet_authenticated());
CREATE POLICY stop_sales_delete_authenticated
  ON public.stop_sales FOR DELETE TO authenticated
  USING (public.is_intranet_authenticated());

CREATE POLICY push_sales_select_public
  ON public.push_sales FOR SELECT TO public USING (true);
CREATE POLICY push_sales_insert_authenticated
  ON public.push_sales FOR INSERT TO authenticated
  WITH CHECK (public.is_intranet_authenticated());
CREATE POLICY push_sales_update_authenticated
  ON public.push_sales FOR UPDATE TO authenticated
  USING (public.is_intranet_authenticated())
  WITH CHECK (public.is_intranet_authenticated());
CREATE POLICY push_sales_delete_authenticated
  ON public.push_sales FOR DELETE TO authenticated
  USING (public.is_intranet_authenticated());

-- ========================= public inbox tables =========================
-- INSERT anon (formulaires site) ; le reste authentifié
CREATE POLICY public_quotes_insert_anon
  ON public.public_quotes FOR INSERT TO anon, authenticated
  WITH CHECK (true);
CREATE POLICY public_quotes_select_authenticated
  ON public.public_quotes FOR SELECT TO authenticated
  USING (public.is_intranet_authenticated());
CREATE POLICY public_quotes_update_authenticated
  ON public.public_quotes FOR UPDATE TO authenticated
  USING (public.is_intranet_authenticated())
  WITH CHECK (public.is_intranet_authenticated());
CREATE POLICY public_quotes_delete_authenticated
  ON public.public_quotes FOR DELETE TO authenticated
  USING (public.is_intranet_authenticated());

CREATE POLICY public_hotel_requests_insert_anon
  ON public.public_hotel_requests FOR INSERT TO anon, authenticated
  WITH CHECK (true);
CREATE POLICY public_hotel_requests_select_authenticated
  ON public.public_hotel_requests FOR SELECT TO authenticated
  USING (public.is_intranet_authenticated());
CREATE POLICY public_hotel_requests_update_authenticated
  ON public.public_hotel_requests FOR UPDATE TO authenticated
  USING (public.is_intranet_authenticated())
  WITH CHECK (public.is_intranet_authenticated());
CREATE POLICY public_hotel_requests_delete_authenticated
  ON public.public_hotel_requests FOR DELETE TO authenticated
  USING (public.is_intranet_authenticated());

CREATE POLICY public_modification_requests_insert_anon
  ON public.public_modification_requests FOR INSERT TO anon, authenticated
  WITH CHECK (true);
CREATE POLICY public_modification_requests_select_authenticated
  ON public.public_modification_requests FOR SELECT TO authenticated
  USING (public.is_intranet_authenticated());
CREATE POLICY public_modification_requests_update_authenticated
  ON public.public_modification_requests FOR UPDATE TO authenticated
  USING (public.is_intranet_authenticated())
  WITH CHECK (public.is_intranet_authenticated());
CREATE POLICY public_modification_requests_delete_authenticated
  ON public.public_modification_requests FOR DELETE TO authenticated
  USING (public.is_intranet_authenticated());

CREATE POLICY public_event_quotes_insert_anon
  ON public.public_event_quotes FOR INSERT TO anon, authenticated
  WITH CHECK (true);
CREATE POLICY public_event_quotes_select_authenticated
  ON public.public_event_quotes FOR SELECT TO authenticated
  USING (public.is_intranet_authenticated());
CREATE POLICY public_event_quotes_update_authenticated
  ON public.public_event_quotes FOR UPDATE TO authenticated
  USING (public.is_intranet_authenticated())
  WITH CHECK (public.is_intranet_authenticated());
CREATE POLICY public_event_quotes_delete_authenticated
  ON public.public_event_quotes FOR DELETE TO authenticated
  USING (public.is_intranet_authenticated());

CREATE POLICY public_event_requests_insert_anon
  ON public.public_event_requests FOR INSERT TO anon, authenticated
  WITH CHECK (true);
CREATE POLICY public_event_requests_select_authenticated
  ON public.public_event_requests FOR SELECT TO authenticated
  USING (public.is_intranet_authenticated());
CREATE POLICY public_event_requests_update_authenticated
  ON public.public_event_requests FOR UPDATE TO authenticated
  USING (public.is_intranet_authenticated())
  WITH CHECK (public.is_intranet_authenticated());
CREATE POLICY public_event_requests_delete_authenticated
  ON public.public_event_requests FOR DELETE TO authenticated
  USING (public.is_intranet_authenticated());

CREATE POLICY b2b_access_requests_insert_anon
  ON public.b2b_access_requests FOR INSERT TO anon, authenticated
  WITH CHECK (true);
CREATE POLICY b2b_access_requests_select_authenticated
  ON public.b2b_access_requests FOR SELECT TO authenticated
  USING (public.is_intranet_authenticated());
CREATE POLICY b2b_access_requests_update_authenticated
  ON public.b2b_access_requests FOR UPDATE TO authenticated
  USING (public.is_intranet_authenticated())
  WITH CHECK (public.is_intranet_authenticated());
CREATE POLICY b2b_access_requests_delete_authenticated
  ON public.b2b_access_requests FOR DELETE TO authenticated
  USING (public.is_intranet_authenticated());

-- ========================= B2B staff tables =========================
CREATE POLICY b2b_accounts_all_authenticated
  ON public.b2b_accounts FOR ALL TO authenticated
  USING (public.is_intranet_authenticated())
  WITH CHECK (public.is_intranet_authenticated());
CREATE POLICY b2b_quotes_all_authenticated
  ON public.b2b_quotes FOR ALL TO authenticated
  USING (public.is_intranet_authenticated())
  WITH CHECK (public.is_intranet_authenticated());

-- ========================= documents / hotels / interns =========================
CREATE POLICY documents_all_authenticated
  ON public.documents FOR ALL TO authenticated
  USING (public.is_intranet_authenticated())
  WITH CHECK (public.is_intranet_authenticated());

CREATE POLICY hotels_select_public
  ON public.hotels FOR SELECT TO public USING (true);
CREATE POLICY hotels_insert_authenticated
  ON public.hotels FOR INSERT TO authenticated
  WITH CHECK (public.is_intranet_authenticated());
CREATE POLICY hotels_update_authenticated
  ON public.hotels FOR UPDATE TO authenticated
  USING (public.is_intranet_authenticated())
  WITH CHECK (public.is_intranet_authenticated());
CREATE POLICY hotels_delete_authenticated
  ON public.hotels FOR DELETE TO authenticated
  USING (public.is_intranet_authenticated());

CREATE POLICY intern_apartments_all_authenticated
  ON public.intern_apartments FOR ALL TO authenticated
  USING (public.is_intranet_authenticated())
  WITH CHECK (public.is_intranet_authenticated());
CREATE POLICY interns_all_authenticated
  ON public.interns FOR ALL TO authenticated
  USING (public.is_intranet_authenticated())
  WITH CHECK (public.is_intranet_authenticated());

CREATE POLICY message_settings_all_authenticated
  ON public.message_settings FOR ALL TO authenticated
  USING (public.is_intranet_authenticated())
  WITH CHECK (public.is_intranet_authenticated());

-- ========================= client flyers =========================
CREATE POLICY client_flyers_select_public
  ON public.client_flyers FOR SELECT TO public USING (true);
CREATE POLICY client_flyers_insert_authenticated
  ON public.client_flyers FOR INSERT TO authenticated
  WITH CHECK (public.is_intranet_authenticated());
CREATE POLICY client_flyers_update_authenticated
  ON public.client_flyers FOR UPDATE TO authenticated
  USING (public.is_intranet_authenticated())
  WITH CHECK (public.is_intranet_authenticated());
CREATE POLICY client_flyers_delete_authenticated
  ON public.client_flyers FOR DELETE TO authenticated
  USING (public.is_intranet_authenticated());

-- ========================= tickets =========================
CREATE POLICY ticket_allocations_all_authenticated
  ON public.ticket_allocations FOR ALL TO authenticated
  USING (public.is_intranet_authenticated())
  WITH CHECK (public.is_intranet_authenticated());
CREATE POLICY ticket_entry_checks_all_authenticated
  ON public.ticket_entry_checks FOR ALL TO authenticated
  USING (public.is_intranet_authenticated())
  WITH CHECK (public.is_intranet_authenticated());
CREATE POLICY ticket_sequence_select_authenticated
  ON public.ticket_sequence FOR SELECT TO authenticated
  USING (public.is_intranet_authenticated());
CREATE POLICY ticket_sequence_insert_authenticated
  ON public.ticket_sequence FOR INSERT TO authenticated
  WITH CHECK (public.is_intranet_authenticated());
CREATE POLICY ticket_sequence_update_authenticated
  ON public.ticket_sequence FOR UPDATE TO authenticated
  USING (public.is_intranet_authenticated())
  WITH CHECK (public.is_intranet_authenticated());

-- ========================= hotel catalog (public read) =========================
CREATE POLICY public_hotels_catalog_select_public
  ON public.public_hotels_catalog FOR SELECT TO public USING (true);
CREATE POLICY public_hotels_catalog_write_authenticated
  ON public.public_hotels_catalog FOR ALL TO authenticated
  USING (public.is_intranet_authenticated())
  WITH CHECK (public.is_intranet_authenticated());

CREATE POLICY public_hotel_rates_select_public
  ON public.public_hotel_rates FOR SELECT TO public USING (true);
CREATE POLICY public_hotel_rates_write_authenticated
  ON public.public_hotel_rates FOR ALL TO authenticated
  USING (public.is_intranet_authenticated())
  WITH CHECK (public.is_intranet_authenticated());

-- ========================= presence =========================
CREATE POLICY presence_all_authenticated
  ON public.intranet_presence_sessions FOR ALL TO authenticated
  USING (public.is_intranet_authenticated())
  WITH CHECK (public.is_intranet_authenticated());
