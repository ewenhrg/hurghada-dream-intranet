-- Récupération manuelle après perte de lignes dans public.users
-- À exécuter dans Supabase → SQL Editor (adapter les codes / noms réels).
-- Les INSERT utilisent ON CONFLICT (code) pour ne pas dupliquer si la ligne existe déjà.

INSERT INTO public.users (
  name,
  code,
  can_delete_quote,
  can_add_activity,
  can_edit_activity,
  can_delete_activity,
  can_reset_data,
  can_access_activities,
  can_access_history,
  can_access_tickets,
  can_access_modifications,
  can_access_situation,
  can_access_users
)
VALUES
  (
    'Rayan',
    '180203',
    false,
    false,
    false,
    false,
    false,
    true,
    true,
    true,
    false,
    false,
    false
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  can_delete_quote = EXCLUDED.can_delete_quote,
  can_add_activity = EXCLUDED.can_add_activity,
  can_edit_activity = EXCLUDED.can_edit_activity,
  can_delete_activity = EXCLUDED.can_delete_activity,
  can_reset_data = EXCLUDED.can_reset_data,
  can_access_activities = EXCLUDED.can_access_activities,
  can_access_history = EXCLUDED.can_access_history,
  can_access_tickets = EXCLUDED.can_access_tickets,
  can_access_modifications = EXCLUDED.can_access_modifications,
  can_access_situation = EXCLUDED.can_access_situation,
  can_access_users = EXCLUDED.can_access_users;
