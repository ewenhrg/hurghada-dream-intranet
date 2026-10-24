import { SITE_KEY } from "../constants";
import { supabase } from "../lib/supabase";
import { logger } from "./logger";

export const CLIENT_FLYER_BUCKET = "client-flyers";
export const CLIENT_FLYER_MAX_DESCRIPTION = 500;
export const CLIENT_FLYER_MAX_BYTES = 8 * 1024 * 1024;

const FLYER_SELECT = "id, image_url, description, starts_at, ends_at, active, created_by_name";

/** Flyer encore affiché dans l’application, le plus récent. */
export async function fetchActiveClientFlyer() {
  if (!supabase) return null;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("client_flyers")
    .select(FLYER_SELECT)
    .eq("site_key", SITE_KEY)
    .eq("active", true)
    .lte("starts_at", now)
    .gt("ends_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logger.warn("Flyer appli:", error);
    return null;
  }
  if (!data?.image_url) return null;
  return data;
}

export async function deactivateClientFlyers() {
  if (!supabase) return { ok: false, error: "Connexion indisponible." };
  const { error } = await supabase
    .from("client_flyers")
    .update({ active: false })
    .eq("site_key", SITE_KEY)
    .eq("active", true);
  if (error) {
    logger.warn("Arrêt flyer:", error);
    return { ok: false, error: "Le flyer n’a pas pu être retiré." };
  }
  return { ok: true };
}

/**
 * @param {{ imageUrl: string, description: string, endsAt: string, createdByName?: string }} flyer
 */
export async function publishClientFlyer(flyer) {
  if (!supabase) return { ok: false, error: "Connexion indisponible." };
  const stopped = await deactivateClientFlyers();
  if (!stopped.ok) return stopped;
  const { error } = await supabase.from("client_flyers").insert({
    site_key: SITE_KEY,
    image_url: flyer.imageUrl,
    description: flyer.description,
    ends_at: flyer.endsAt,
    active: true,
    created_by_name: flyer.createdByName || "",
  });
  if (error) {
    logger.warn("Publication flyer:", error);
    return { ok: false, error: "Le flyer n’a pas pu être envoyé." };
  }
  return { ok: true };
}
