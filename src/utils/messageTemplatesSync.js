export const MESSAGE_TEMPLATES_SETTINGS_TYPE = "message_templates";

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
