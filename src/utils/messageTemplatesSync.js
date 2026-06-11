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

/** Liste unique : activités intranet > templates > colonnes Excel */
export function buildUniqueActivityNames({
  activityList = [],
  excelTrips = [],
  templateKeys = [],
} = {}) {
  const map = new Map();

  const add = (name, priority) => {
    const label = normalizeActivityLabel(name);
    if (!label) return;
    const key = activityNameKey(label);
    const prev = map.get(key);
    if (!prev || priority < prev.priority) {
      map.set(key, { name: label, priority });
    }
  };

  activityList.forEach((name) => add(name, 0));
  templateKeys.forEach((name) => add(name, 1));
  excelTrips.forEach((name) => add(name, 2));

  return [...map.values()]
    .map((v) => v.name)
    .sort((a, b) => a.localeCompare(b, "fr"));
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
