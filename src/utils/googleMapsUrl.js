/**
 * Parse lat/lng depuis une URL Google Maps (formats courants).
 * Les liens courts (goo.gl / maps.app.goo.gl) sans @lat,lng ne peuvent pas
 * être résolus côté client — demander l’URL complète de la barre d’adresse.
 */
export function parseLatLngFromMapsUrl(rawUrl) {
  const url = String(rawUrl || "").trim();
  if (!url) return null;

  const tryPair = (a, b) => {
    const lat = Number(a);
    const lng = Number(b);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  };

  // …/@27.256743,33.830405,16z ou /@27.256743,33.830405,17z/data=…
  let m = url.match(/@(-?\d+\.?\d*),\s*(-?\d+\.?\d*)(?:,\d+\.?\d*[a-z])?/i);
  if (m) {
    const pair = tryPair(m[1], m[2]);
    if (pair) return pair;
  }

  // Place data : !3d27.256743!4d33.830405
  m = url.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
  if (m) {
    const pair = tryPair(m[1], m[2]);
    if (pair) return pair;
  }

  // ?q=27.25,33.83 ou &query=27.25,33.83 (parfois encodé)
  try {
    const decoded = decodeURIComponent(url);
    m = decoded.match(/[?&](?:q|query)=(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)/i);
    if (m) {
      const pair = tryPair(m[1], m[2]);
      if (pair) return pair;
    }
  } catch {
    /* ignore */
  }

  m = url.match(/[?&](?:q|query)=(-?\d+\.?\d*)%2C(-?\d+\.?\d*)/i);
  if (m) {
    const pair = tryPair(m[1], m[2]);
    if (pair) return pair;
  }

  // ll=27.25,33.83
  m = url.match(/[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/i);
  if (m) {
    const pair = tryPair(m[1], m[2]);
    if (pair) return pair;
  }

  // center=27.25%2C33.83
  m = url.match(/[?&]center=(-?\d+\.?\d*)(?:%2C|,)(-?\d+\.?\d*)/i);
  if (m) {
    const pair = tryPair(m[1], m[2]);
    if (pair) return pair;
  }

  // destination=lat%2Clng (itinéraires)
  m = url.match(/[?&]destination=(-?\d+\.?\d*)(?:%2C|,)(-?\d+\.?\d*)/i);
  if (m) {
    const pair = tryPair(m[1], m[2]);
    if (pair) return pair;
  }

  return null;
}

export function isLikelyGoogleMapsUrl(rawUrl) {
  const url = String(rawUrl || "").trim().toLowerCase();
  if (!url) return false;
  return (
    url.includes("google.") ||
    url.includes("maps.app.goo.gl") ||
    url.includes("goo.gl/maps") ||
    url.includes("maps.google")
  );
}
