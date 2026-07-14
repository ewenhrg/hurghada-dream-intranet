-- =============================================================================
-- Sessions de connexion intranet (durée + jours connectés — tableau de bord Ewen)
--
-- À exécuter une fois dans Supabase → SQL Editor.
-- Sans cette table, l’app bascule sur un cache localStorage (moins fiable entre postes).
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

COMMENT ON TABLE public.intranet_presence_sessions IS
  'Historique des connexions intranet (join/leave) pour le tableau de bord Ewen.';

ALTER TABLE public.intranet_presence_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select presence sessions" ON public.intranet_presence_sessions;
DROP POLICY IF EXISTS "Allow insert presence sessions" ON public.intranet_presence_sessions;
DROP POLICY IF EXISTS "Allow update presence sessions" ON public.intranet_presence_sessions;

CREATE POLICY "Allow select presence sessions"
  ON public.intranet_presence_sessions FOR SELECT TO public USING (true);

CREATE POLICY "Allow insert presence sessions"
  ON public.intranet_presence_sessions FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Allow update presence sessions"
  ON public.intranet_presence_sessions FOR UPDATE TO public USING (true) WITH CHECK (true);
