export const MESSAGE_TEMPLATES_SETTINGS_TYPE = "message_templates";

export function normalizeActivityLabel(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ");
}

export function activityNameKey(name) {
  return normalizeActivityLabel(name).toLowerCase();
}

/** Fusionne les clés du type "Orange Bay" / "orange bay" en une seule */
export function normalizeMessageTemplates(templates = {}) {
  const out = {};
  for (const [key, value] of Object.entries(templates)) {
    const label = normalizeActivityLabel(key);
    if (!label) continue;
    const existingKey = Object.keys(out).find((k) => activityNameKey(k) === activityNameKey(label));
    if (existingKey) {
      if (!String(out[existingKey] || "").trim() && String(value || "").trim()) {
        out[existingKey] = value;
      }
    } else {
      out[label] = value;
    }
  }
  return out;
}

/** Liste unique des noms d'activités (même source que l'onglet Activités) */
export function buildUniqueActivityNames({ activityList = [] } = {}) {
  const map = new Map();

  for (const name of activityList) {
    const label = normalizeActivityLabel(name);
    if (!label) continue;
    const key = activityNameKey(label);
    if (!map.has(key)) {
      map.set(key, label);
    }
  }

  return [...map.values()].sort((a, b) => a.localeCompare(b, "fr"));
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} siteKey
 * @param {Record<string, string>} payload
 */
export async function saveMessageTemplates(supabase, siteKey, payload) {
  const { error } = await supabase.from("message_settings").upsert(
    {
      site_key: siteKey,
      settings_type: MESSAGE_TEMPLATES_SETTINGS_TYPE,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "site_key,settings_type" }
  );
  return { error };
}
