/** Météo temps réel Hurghada via Open-Meteo (pas de clé API). */
const LAT = 27.2574;
const LON = 33.8129;
const CACHE_KEY = "hd_hurghada_weather";
const CACHE_MS = 10 * 60 * 1000;

const WEATHER_URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
  "&current=temperature_2m,weather_code&timezone=Africa%2FCairo";

export function weatherLabel(code) {
  const c = Number(code);
  if (c === 0) return "Ensoleillé";
  if (c === 1 || c === 2) return "Voilé";
  if (c === 3) return "Nuageux";
  if (c === 45 || c === 48) return "Brume";
  if (c >= 51 && c <= 57) return "Bruine";
  if (c >= 61 && c <= 67) return "Pluie";
  if (c >= 71 && c <= 77) return "Neige";
  if (c >= 80 && c <= 82) return "Averses";
  if (c >= 95 && c <= 99) return "Orage";
  return "Hurghada";
}

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || Date.now() - parsed.at > CACHE_MS) return null;
    if (typeof parsed.celsius !== "number") return null;
    return { celsius: parsed.celsius, code: parsed.code, label: parsed.label };
  } catch {
    return null;
  }
}

function writeCache(weather) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ...weather, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function peekHurghadaWeather() {
  return readCache();
}

export async function fetchHurghadaWeather() {
  const res = await fetch(WEATHER_URL);
  if (!res.ok) throw new Error("Météo indisponible");
  const json = await res.json();
  const temp = json?.current?.temperature_2m;
  const code = json?.current?.weather_code;
  if (typeof temp !== "number") throw new Error("Météo invalide");

  const weather = {
    celsius: Math.round(temp),
    code,
    label: weatherLabel(code),
  };
  writeCache(weather);
  return weather;
}
