/**
 * Double hôtel : séjour secondaire (dates + quartier) sur un même devis.
 */

export function createEmptySecondHotel() {
  return {
    hasSecondHotel: false,
    secondHotel: "",
    secondRoom: "",
    secondNeighborhood: "",
    secondArrivalDate: "",
    secondDepartureDate: "",
  };
}

/** Merge les champs double hôtel depuis un objet client (draft / Supabase). */
export function pickSecondHotelFields(client = {}) {
  return {
    hasSecondHotel: Boolean(client.hasSecondHotel),
    secondHotel: String(client.secondHotel || "").trim(),
    secondRoom: String(client.secondRoom || "").trim(),
    secondNeighborhood: String(client.secondNeighborhood || "").trim(),
    secondArrivalDate: String(client.secondArrivalDate || "").trim(),
    secondDepartureDate: String(client.secondDepartureDate || "").trim(),
  };
}

export function isSecondHotelConfigured(client = {}) {
  const s = pickSecondHotelFields(client);
  return Boolean(
    s.hasSecondHotel &&
      s.secondNeighborhood &&
      s.secondArrivalDate &&
      s.secondDepartureDate
  );
}

/** true si date YYYY-MM-DD est dans [start, end] inclus. */
export function isDateInInclusiveRange(dateYmd, startYmd, endYmd) {
  if (!dateYmd || !startYmd || !endYmd) return false;
  return dateYmd >= startYmd && dateYmd <= endYmd;
}

/**
 * Quartier effectif pour une date d’activité :
 * 2e hôtel si la date tombe dans sa plage, sinon quartier principal.
 */
export function getEffectiveNeighborhoodForDate(client, dateYmd) {
  const primary = String(client?.neighborhood || "").trim();
  if (!isSecondHotelConfigured(client)) return primary;
  const s = pickSecondHotelFields(client);
  if (isDateInInclusiveRange(dateYmd, s.secondArrivalDate, s.secondDepartureDate)) {
    return s.secondNeighborhood;
  }
  return primary;
}

export function formatSecondHotelSummary(client, neighborhoods = []) {
  if (!isSecondHotelConfigured(client)) return "";
  const s = pickSecondHotelFields(client);
  const label =
    neighborhoods.find((n) => n.key === s.secondNeighborhood)?.label ||
    s.secondNeighborhood;
  const hotel = s.secondHotel || "2e hôtel";
  const fmt = (d) => {
    if (!d) return "";
    try {
      return new Date(d + "T12:00:00").toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return d;
    }
  };
  return `${hotel} · ${fmt(s.secondArrivalDate)} → ${fmt(s.secondDepartureDate)} · ${label}`;
}

/** Ligne note interne (optionnelle) pour lisibilité historique / PDF. */
export function formatSecondHotelNotesLine(client, neighborhoods = []) {
  const summary = formatSecondHotelSummary(client, neighborhoods);
  if (!summary) return "";
  return `Double hôtel : ${summary}`;
}

/** Colonnes ajoutées par supabase_quotes_add_second_hotel.sql. */
export const SECOND_HOTEL_DB_COLUMNS = [
  "client_has_second_hotel",
  "client_second_hotel",
  "client_second_room",
  "client_second_neighborhood",
  "client_second_arrival_date",
  "client_second_departure_date",
];

/** Champs Supabase du 2e hôtel depuis un client local. */
export function buildSecondHotelDbFields(client = {}) {
  const s = pickSecondHotelFields(client);
  return {
    client_has_second_hotel: s.hasSecondHotel,
    client_second_hotel: s.secondHotel,
    client_second_room: s.secondRoom,
    client_second_neighborhood: s.secondNeighborhood,
    client_second_arrival_date: s.secondArrivalDate || null,
    client_second_departure_date: s.secondDepartureDate || null,
  };
}

/**
 * Migration SQL pas encore appliquée : PostgREST renvoie 400 (colonne inconnue).
 */
export function isMissingSecondHotelColumnError(error) {
  if (!error) return false;
  const msg = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`;
  return /client_second_|client_has_second_hotel/i.test(msg);
}

/** Retire les colonnes double hôtel d’un payload Supabase. */
export function stripSecondHotelColumns(payload = {}) {
  const next = { ...payload };
  SECOND_HOTEL_DB_COLUMNS.forEach((col) => {
    delete next[col];
  });
  return next;
}
