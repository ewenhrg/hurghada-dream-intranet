-- Ajouter l'utilisateur Situation avec accès limité aux pages Devis et Tickets
-- Cet utilisateur ne peut pas supprimer les devis
-- Ne peut pas accéder aux pages Activités et Historique
INSERT INTO public.users (name, code, can_delete_quote, can_add_activity, can_edit_activity, can_delete_activity, can_reset_data, can_access_activities, can_access_history)
VALUES ('Situation', '015301', false, false, false, false, false, false, false)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  can_delete_quote = EXCLUDED.can_delete_quote,
  can_add_activity = EXCLUDED.can_add_activity,
  can_edit_activity = EXCLUDED.can_edit_activity,
  can_delete_activity = EXCLUDED.can_delete_activity,
  can_reset_data = EXCLUDED.can_reset_data,
  can_access_activities = EXCLUDED.can_access_activities,
  can_access_history = EXCLUDED.can_access_history;

