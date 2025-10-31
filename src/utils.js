import { NEIGHBORHOODS } from "./constants";

export function uuid() {
  return "hd-" + Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
}

export function currency(n, curr = "EUR") {
  if (n === undefined || n === null) n = 0;
  const num = Number(n) || 0;
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: curr }).format(num);
  } catch {
    return `${num.toFixed(2)} ${curr}`;
  }
}

export function emptyTransfers() {
  const obj = {};
  NEIGHBORHOODS.forEach((n) => {
    obj[n.key] = {
      morningEnabled: false,
      morningTime: "",
      afternoonEnabled: false,
      afternoonTime: "",
      surcharge: 0,
    };
  });
  return obj;
}

export function saveLS(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function loadLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

