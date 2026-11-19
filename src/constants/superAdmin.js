/** E-mail autorisé pour /superadmin (allowlist client — le secret reste le mot de passe Auth). */
export const SUPERADMIN_ALLOWED_EMAIL = String(
  import.meta.env.VITE_SUPERADMIN_EMAIL || "ewenkermorvantpro@gmail.com"
)
  .trim()
  .toLowerCase();

export const SUPERADMIN_SESSION_KEY = "hd_superadmin_ok";

export function normalizeSuperAdminEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

export function isAllowedSuperAdminEmail(email) {
  return normalizeSuperAdminEmail(email) === SUPERADMIN_ALLOWED_EMAIL;
}
