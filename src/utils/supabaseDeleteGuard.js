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
