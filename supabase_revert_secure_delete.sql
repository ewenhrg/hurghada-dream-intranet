-- =============================================================================
-- Retrait complet du système PIN / RPC pour les suppressions
-- Exécuter UNE FOIS dans Supabase : Dashboard → SQL → New query → Run
--
-- Effet :
--   - supprime les fonctions hd_delete_activity_secure / hd_delete_user_secure
--   - supprime la table hd_delete_secrets (codes PIN)
--   - rétablit les politiques RLS DELETE « ouvertes » sur activities et users
--     (suppression directe via l’API PostgREST + clé anon, comme avant)
-- =============================================================================

-- 1) Fonctions (avant la table, car elles lisent hd_delete_secrets)
DROP FUNCTION IF EXISTS public.hd_delete_activity_secure(bigint, text);
DROP FUNCTION IF EXISTS public.hd_delete_user_secure(bigint, text);

-- 2) Table interne du PIN
DROP TABLE IF EXISTS public.hd_delete_secrets;

-- 3) Politiques DELETE (identiques au schéma d’origine du projet)
DROP POLICY IF EXISTS "Allow delete activities" ON public.activities;
CREATE POLICY "Allow delete activities"
ON public.activities
FOR DELETE
TO public
USING (true);

DROP POLICY IF EXISTS "Allow delete users" ON public.users;
CREATE POLICY "Allow delete users"
ON public.users
FOR DELETE
TO public
USING (true);
