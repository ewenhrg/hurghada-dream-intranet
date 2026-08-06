import { canAccessHotelsPage } from "../constants/permissions.js";
import { logger } from "./logger.js";

/** Comptes autorisés à ouvrir une session Supabase Auth pour les écritures RLS (users / activities). */
export function isIntranetDatabaseWriterName(name) {
  return canAccessHotelsPage({ name });
}

/**
 * Après login par code sur public.users : ouvre une session JWT pour Ewen/Léa/Sophia/Karim si intranet_auth_email est défini.
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
      "Intranet : Ewen/Léa/Sophia/Karim sans colonne intranet_auth_email — pas de session Auth (écritures users/activities bloquées par RLS)."
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

/**
 * Garantit une session Auth rédacteur avant DELETE/UPDATE sensibles (RLS).
 * Réutilise la session existante si encore valide, sinon reconnecte avec code + intranet_auth_email.
 */
export async function ensureIntranetWriterSession(supabase, sessionUser, { force = false } = {}) {
  if (!supabase?.auth || !sessionUser) {
    return { ok: false, reason: "no_client" };
  }
  if (!isIntranetDatabaseWriterName(sessionUser.name)) {
    return { ok: false, reason: "not_writer" };
  }

  if (!force) {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) {
        return { ok: true, reused: true, session: data.session };
      }
    } catch (err) {
      logger.warn("Intranet : getSession échoué", err);
    }
  }

  const email = String(sessionUser.intranet_auth_email || "").trim();
  const code = sessionUser.code != null ? String(sessionUser.code).trim() : "";
  if (!email) {
    return { ok: false, reason: "missing_email" };
  }
  if (!code) {
    return { ok: false, reason: "missing_code" };
  }

  const result = await establishSupabaseWriterSession(
    supabase,
    { name: sessionUser.name, intranet_auth_email: email },
    code
  );
  if (result.missingEmail) return { ok: false, reason: "missing_email" };
  if (!result.ok) return { ok: false, reason: "auth_failed", error: result.error };
  return { ok: true, reused: false, session: result.session };
}

export function writerSessionFailureToast(reason) {
  switch (reason) {
    case "missing_email":
      return "Suppression impossible : compte sans intranet_auth_email. Configurez l’email Auth Supabase pour Ewen/Léa/Sophia/Karim.";
    case "missing_code":
      return "Suppression impossible : code session manquant. Reconnectez-vous.";
    case "auth_failed":
      return "Session admin base refusée : vérifiez que le mot de passe Auth Supabase = le code à 6 chiffres, puis reconnectez-vous.";
    case "not_writer":
      return "Seuls Ewen, Léa, Sophia et Karim peuvent supprimer les activités.";
    default:
      return "Suppression impossible : session administrateur base indisponible. Reconnectez-vous.";
  }
}
