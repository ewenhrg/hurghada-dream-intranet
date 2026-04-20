/**
 * Colonne `activities.babies_forbidden` : après le script SQL
 * `supabase/supabase_add_babies_forbidden_activities.sql`, activer la persistance côté API :
 * `.env` ou hôte (Vercel, etc.) : `VITE_SUPABASE_ACTIVITIES_BABIES_FORBIDDEN=true` puis rebuild.
 * Sans cela, l’app n’envoie pas ce champ (évite PGRST204 si la colonne n’existe pas encore).
 */
export function activitiesTableHasBabiesForbiddenColumn() {
  return import.meta.env.VITE_SUPABASE_ACTIVITIES_BABIES_FORBIDDEN === "true";
}
