import { canAccessHotelsPage } from "../constants/permissions.js";
import { logger } from "./logger.js";

/** Comptes autorisés à ouvrir une session Supabase Auth pour les écritures RLS (users / activities). */
export function isIntranetDatabaseWriterName(name) {
  return canAccessHotelsPage({ name });
}

/**
 * Après login par code sur public.users : ouvre une session JWT pour Ewen/Léa/Sophia si intranet_auth_email est défini.
 * Mot de passe Auth = code à 6 chiffres (à synchroniser avec Supabase Dashboard si le code change).
 */
export async function establishSupabaseWriterSession(supabase, dbUserRow, sixDigitCode) {
  if (!supabase?.auth || !dbUserRow || !sixDigitCode) {
    return { ok: true, skipped: true };
  }
  if (!isIntranetDatabaseWriterName(dbUserRow.name)) {
    return { ok: true, skipped: true };
  }
  const email = String(dbUserRow.intranet_auth_email || "").trim();
  if (!email) {
    logger.warn(
      "Intranet : Ewen/Léa/Sophia sans colonne intranet_auth_email — pas de session Auth (écritures users/activities bloquées par RLS)."
    );
    return { ok: true, skipped: true, missingEmail: true };
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: String(sixDigitCode),
  });
  if (error) {
    logger.warn("Intranet : signInWithPassword (rédacteur base) refusé", error);
    return { ok: false, skipped: false, error };
  }
  return { ok: true, skipped: false, session: data?.session ?? null };
}
