import { SITE_KEY } from "../constants";
import { logger } from "./logger";

export const PLANNING_VISIBLE_SETTINGS_TYPE = "planning_visible_activities";

/**
 * @param {unknown} payload
 * @returns {string[]|null} null = pas de sélection enregistrée
 */
export function normalizePlanningVisibleIds(payload) {
  if (payload == null) return null;
  if (Array.isArray(payload)) {
    return payload.map((id) => String(id || "").trim()).filter(Boolean);
  }
  if (typeof payload === "object" && Array.isArray(payload.activityIds)) {
    return payload.activityIds.map((id) => String(id || "").trim()).filter(Boolean);
  }
  return null;
}

/**
 * Charge les IDs d’activités du planning depuis Supabase (partagé entre tous les postes).
 * @returns {Promise<string[]|null>}
 */
export async function fetchPlanningVisibleActivityIds(supabase) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("message_settings")
      .select("payload")
      .eq("site_key", SITE_KEY)
      .eq("settings_type", PLANNING_VISIBLE_SETTINGS_TYPE)
      .maybeSingle();

    if (error) {
      logger.warn("Impossible de charger la sélection Planning:", error);
      return null;
    }
    return normalizePlanningVisibleIds(data?.payload);
  } catch (err) {
    logger.warn("Exception chargement sélection Planning:", err);
    return null;
  }
}

/**
 * Enregistre la sélection Planning (visible sur tous les PC).
 * @param {string[]} activityIds
 */
export async function savePlanningVisibleActivityIds(supabase, activityIds) {
  if (!supabase) {
    return { error: new Error("Supabase non configuré") };
  }
  const payload = {
    activityIds: (activityIds || []).map((id) => String(id || "").trim()).filter(Boolean),
  };
  const { error } = await supabase.from("message_settings").upsert(
    {
      site_key: SITE_KEY,
      settings_type: PLANNING_VISIBLE_SETTINGS_TYPE,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "site_key,settings_type" }
  );
  return { error };
}
