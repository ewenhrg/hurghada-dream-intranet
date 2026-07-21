-- =============================================================================
-- RÉPARATION : sessions de présence visibles pour TOUTE l'équipe
--
-- À exécuter dans Supabase → SQL Editor (une fois).
-- Corrige le cas où seuls les comptes authentifiés (ex. Ewen) écrivent/lisent
-- les sessions, alors que le reste de l'équipe se connecte en anon (code PIN).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.intranet_presence_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_key TEXT NOT NULL DEFAULT 'hurghada_dream_0606',
  session_key TEXT NOT NULL,
  user_code TEXT DEFAULT '',
  user_name TEXT NOT NULL DEFAULT '',
  user_id TEXT DEFAULT '',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_presence_sessions_site_started
  ON public.intranet_presence_sessions (site_key, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_presence_sessions_user_code
  ON public.intranet_presence_sessions (site_key, user_code);

CREATE INDEX IF NOT EXISTS idx_presence_sessions_session_key
  ON public.intranet_presence_sessions (site_key, session_key);

ALTER TABLE public.intranet_presence_sessions ENABLE ROW LEVEL SECURITY;

-- Supprimer toutes les anciennes politiques (noms historiques)
DROP POLICY IF EXISTS "Allow select presence sessions" ON public.intranet_presence_sessions;
DROP POLICY IF EXISTS "Allow insert presence sessions" ON public.intranet_presence_sessions;
DROP POLICY IF EXISTS "Allow update presence sessions" ON public.intranet_presence_sessions;
DROP POLICY IF EXISTS "presence_select_anon" ON public.intranet_presence_sessions;
DROP POLICY IF EXISTS "presence_select_authenticated" ON public.intranet_presence_sessions;
DROP POLICY IF EXISTS "presence_insert_anon" ON public.intranet_presence_sessions;
DROP POLICY IF EXISTS "presence_insert_authenticated" ON public.intranet_presence_sessions;
DROP POLICY IF EXISTS "presence_update_anon" ON public.intranet_presence_sessions;
DROP POLICY IF EXISTS "presence_update_authenticated" ON public.intranet_presence_sessions;

-- Lecture / écriture ouvertes pour anon (login code PIN) ET authenticated (JWT intranet)
CREATE POLICY "presence_select_anon"
  ON public.intranet_presence_sessions FOR SELECT TO anon USING (true);
CREATE POLICY "presence_select_authenticated"
  ON public.intranet_presence_sessions FOR SELECT TO authenticated USING (true);

CREATE POLICY "presence_insert_anon"
  ON public.intranet_presence_sessions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "presence_insert_authenticated"
  ON public.intranet_presence_sessions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "presence_update_anon"
  ON public.intranet_presence_sessions FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "presence_update_authenticated"
  ON public.intranet_presence_sessions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.intranet_presence_sessions TO anon, authenticated;

COMMENT ON TABLE public.intranet_presence_sessions IS
  'Historique connexions intranet — accessible anon+authenticated pour sync équipe complète.';
