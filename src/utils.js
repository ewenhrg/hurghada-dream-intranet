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

// Calculer le prix carte (prix espèces + 3% arrondi à l'euro supérieur)
export function calculateCardPrice(cashPrice) {
  const priceWithFees = cashPrice * 1.03;
  // Arrondir à l'euro supérieur
  return Math.ceil(priceWithFees);
}

// Formater le prix sans centimes
export function currencyNoCents(n, curr = "EUR") {
  if (n === undefined || n === null) n = 0;
  const num = Math.round(Number(n) || 0);
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: curr, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);
  } catch {
    return `${num} ${curr}`;
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
      eveningEnabled: false,
      eveningTime: "",
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

