/**
 * Erreur typique lorsque RLS n’a aucune politique FOR DELETE (blocage API anon).
 * @param {import("@supabase/supabase-js").PostgrestError | null | undefined} error
 * @returns {boolean}
 */
export function isApiDeleteBlockedByRls(error) {
  if (!error) return false;
  const code = String(error.code || "");
  const msg = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.toLowerCase();
  if (code === "42501") return true;
  if (msg.includes("row-level security")) return true;
  if (msg.includes("permission denied")) return true;
  return false;
}

export const API_DELETE_BLOCKED_TOAST =
  "Suppression impossible : la base refuse les suppressions depuis l’application (protection). Si une suppression est indispensable, utilisez l’éditeur SQL Supabase (administrateur).";

/**
 * Après un `delete().select()`, aucune ligne renvoyée = rien n’a été supprimé en base (RLS, id, etc.).
 * @param {unknown} data
 * @returns {boolean}
 */
export function isDeleteReturningNoRows(data) {
  return !Array.isArray(data) || data.length === 0;
}

export const DELETE_ZERO_ROWS_TOAST =
  "Aucune ligne supprimée en base : la liste locale n’a pas été modifiée. Cause fréquente : politiques RLS sans DELETE (ex. script « blocage suppressions API ») ou identifiant incorrect. Supprimez depuis l’éditeur SQL Supabase (admin) ou rétablissez une politique DELETE contrôlée.";
