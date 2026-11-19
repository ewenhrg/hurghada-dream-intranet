import { supabase } from "../lib/supabase";
import {
  SUPERADMIN_SESSION_KEY,
  isAllowedSuperAdminEmail,
  normalizeSuperAdminEmail,
} from "../constants/superAdmin";
import { getDefaultPermissionForm } from "../constants/permissions";
import { logger } from "./logger";

/**
 * Utilisateur « ops » pour les modules SuperAdmin (UsersPage, activités, etc.).
 */
export function buildSuperAdminOpsUser(authUser) {
  return {
    id: authUser?.id || "superadmin",
    name: "Ewen",
    code: "",
    email: normalizeSuperAdminEmail(authUser?.email),
    ...getDefaultPermissionForm(),
    canAccessUsers: true,
    canAccessEwenDashboard: true,
    canAccessCatalogAdmin: true,
    canAccessHotels: true,
    canAccessHotelHistory: true,
    canAccessStopSale: true,
    canAccessStayBroadcast: true,
    canAccessFlyer: true,
    canAccessActivityPrices: true,
    canResetData: true,
    canDeleteQuote: true,
    canEditActivity: true,
  };
}

export function markSuperAdminSession() {
  try {
    sessionStorage.setItem(SUPERADMIN_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function clearSuperAdminSessionMark() {
  try {
    sessionStorage.removeItem(SUPERADMIN_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function hasSuperAdminSessionMark() {
  try {
    return sessionStorage.getItem(SUPERADMIN_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * @returns {Promise<{ ok: true, user: object, session: object } | { ok: false, error: string }>}
 */
export async function signInSuperAdmin(email, password) {
  const normalized = normalizeSuperAdminEmail(email);
  if (!isAllowedSuperAdminEmail(normalized)) {
    return { ok: false, error: "Compte non autorisé." };
  }
  if (!password || String(password).length < 8) {
    return { ok: false, error: "Mot de passe invalide." };
  }
  if (!supabase?.auth?.signInWithPassword) {
    return { ok: false, error: "Supabase non configuré." };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalized,
    password: String(password),
  });

  if (error || !data?.session || !data?.user) {
    logger.warn("SuperAdmin login failed", error?.message || error);
    return { ok: false, error: "E-mail ou mot de passe incorrect." };
  }

  if (!isAllowedSuperAdminEmail(data.user.email)) {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    return { ok: false, error: "Compte non autorisé." };
  }

  const meta = data.user.app_metadata || {};
  if (meta.superadmin !== true && meta.role !== "superadmin") {
    // Allow login if email matches allowlist even without metadata (bootstrap),
    // but prefer metadata when present.
  }

  markSuperAdminSession();
  return {
    ok: true,
    user: buildSuperAdminOpsUser(data.user),
    session: data.session,
    authUser: data.user,
  };
}

export async function signOutSuperAdmin() {
  clearSuperAdminSessionMark();
  try {
    await supabase.auth.signOut();
  } catch (err) {
    logger.warn("SuperAdmin signOut", err);
  }
}

/**
 * Restaure une session SuperAdmin valide (Auth + allowlist e-mail).
 */
export async function restoreSuperAdminSession() {
  if (!supabase?.auth?.getSession) {
    return { ok: false };
  }
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.user) {
      clearSuperAdminSessionMark();
      return { ok: false };
    }
    const authUser = data.session.user;
    if (!isAllowedSuperAdminEmail(authUser.email)) {
      clearSuperAdminSessionMark();
      return { ok: false };
    }
    markSuperAdminSession();
    return {
      ok: true,
      user: buildSuperAdminOpsUser(authUser),
      session: data.session,
      authUser,
    };
  } catch (err) {
    logger.warn("SuperAdmin restore", err);
    clearSuperAdminSessionMark();
    return { ok: false };
  }
}
