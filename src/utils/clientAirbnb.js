/**
 * Client en Airbnb : lien Google Maps à la place / en complément de l’hôtel classique.
 */

export function createEmptyAirbnb() {
  return {
    isAirbnb: false,
    airbnbMapsUrl: "",
  };
}

export function pickAirbnbFields(client = {}) {
  return {
    isAirbnb: Boolean(client.isAirbnb),
    airbnbMapsUrl: String(client.airbnbMapsUrl || "").trim(),
  };
}

export function buildAirbnbDbFields(client = {}) {
  const a = pickAirbnbFields(client);
  return {
    client_is_airbnb: a.isAirbnb,
    client_airbnb_maps_url: a.isAirbnb ? a.airbnbMapsUrl : "",
  };
}

export function stripAirbnbColumns(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const next = { ...payload };
  delete next.client_is_airbnb;
  delete next.client_airbnb_maps_url;
  return next;
}

export function isMissingAirbnbColumnError(error) {
  const msg = String(error?.message || error?.details || "");
  return /client_is_airbnb|client_airbnb_maps_url/i.test(msg);
}

export function airbnbFieldsFromRow(row = {}) {
  return {
    isAirbnb: Boolean(row.client_is_airbnb),
    airbnbMapsUrl: String(row.client_airbnb_maps_url || "").trim(),
  };
}
