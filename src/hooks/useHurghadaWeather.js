import { useEffect, useState } from "react";
import { fetchHurghadaWeather, peekHurghadaWeather } from "../utils/hurghadaWeather";

const REFRESH_MS = 10 * 60 * 1000;

export function useHurghadaWeather() {
  const [weather, setWeather] = useState(() => peekHurghadaWeather());

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const next = await fetchHurghadaWeather();
        if (!cancelled) setWeather(next);
      } catch {
        /* on garde le cache / rien si hors ligne */
      }
    };

    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return weather;
}
