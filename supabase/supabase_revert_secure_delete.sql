-- =============================================================================
-- DANGER — À éviter en production
-- Retrait du système PIN / RPC et réouverture des DELETE via la clé anon.
-- Cela permet à quiconque a la clé publique de supprimer users / activities.
-- Préférez supabase_block_api_delete_users_activities.sql pour sécuriser la base.
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
