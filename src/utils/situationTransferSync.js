/** Données partagées équipe : import Excel transferts + statuts WhatsApp */

export const SITUATION_TRANSFER_SETTINGS_TYPE = "situation_transfer_rows";

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} siteKey
 */
export async function loadSituationTransferRows(supabase, siteKey) {
  const { data, error } = await supabase
    .from("message_settings")
    .select("payload, updated_at")
    .eq("site_key", siteKey)
    .eq("settings_type", SITUATION_TRANSFER_SETTINGS_TYPE)
    .maybeSingle();

  if (error || !data?.payload || typeof data.payload !== "object") {
    return null;
  }

  const p = data.payload;
  return {
    rows: Array.isArray(p.rows) ? p.rows : [],
    detectedColumns: Array.isArray(p.detectedColumns) ? p.detectedColumns : [],
    rowsWithMarina: Array.isArray(p.rowsWithMarina) ? p.rowsWithMarina : [],
    rowsWithExterior: Array.isArray(p.rowsWithExterior) ? p.rowsWithExterior : [],
    fileName: p.fileName != null ? String(p.fileName) : "",
    importedBy: p.importedBy != null ? String(p.importedBy) : "",
    updatedAt: data.updated_at || p.updated_at || null,
  };
}

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} siteKey
 * @param {object} payload
 */
export async function saveSituationTransferRows(supabase, siteKey, payload) {
  const { error } = await supabase.from("message_settings").upsert(
    {
      site_key: siteKey,
      settings_type: SITUATION_TRANSFER_SETTINGS_TYPE,
      payload: {
        ...payload,
        updated_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "site_key,settings_type" }
  );
  return { error };
}
