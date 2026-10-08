import { cleanPhoneNumber } from "../utils";
import { toast } from "./toast.js";

function formatStayDateFr(iso) {
  const s = String(iso || "").trim();
  if (!s) return "";
  const d = new Date(`${s.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

export function getPublicStayUrl() {
  if (typeof window === "undefined") return "/sejour";
  return `${window.location.origin}/sejour`;
}

export function listPickupChanges(previousItems, nextItems) {
  const prev = Array.isArray(previousItems) ? previousItems : [];
  const next = Array.isArray(nextItems) ? nextItems : [];
  const changes = [];
  const n = Math.max(prev.length, next.length);
  for (let i = 0; i < n; i++) {
    const before = prev[i] || {};
    const after = next[i] || {};
    const oldPickup = String(before.pickupTime || "").trim();
    const newPickup = String(after.pickupTime || "").trim();
    if (oldPickup === newPickup) continue;
    changes.push({
      activityName: String(after.activityName || before.activityName || "Activité").trim(),
      date: String(after.date || before.date || "").trim(),
      oldPickup,
      newPickup,
    });
  }
  return changes;
}

function lineForItem(item) {
  const name = String(item?.activityName || "Activité").trim();
  const date = formatStayDateFr(item?.date);
  const pickup = String(item?.pickupTime || "").trim() || "heure à confirmer";
  if (date) return `• ${name} — ${date} à ${pickup}`;
  return `• ${name} — ${pickup}`;
}

export function buildStayWhatsAppMessage(quote, { previousItems } = {}) {
  const name = String(quote?.client?.name || "").trim() || "Bonjour";
  const url = getPublicStayUrl();
  const items = Array.isArray(quote?.items) ? quote.items : [];
  const changes = previousItems ? listPickupChanges(previousItems, items) : [];

  if (changes.length > 0) {
    const lines = changes.map((c) => {
      const date = formatStayDateFr(c.date);
      const time = c.newPickup || "heure à confirmer";
      const when = date ? `${date} à ${time}` : time;
      return `• ${c.activityName} — ${when}`;
    });
    return [
      `Bonjour ${name},`,
      "",
      "Vos heures de prise en charge ont été mises à jour :",
      "",
      ...lines,
      "",
      `Votre programme : ${url}`,
      "",
      "Hurghada Dream",
    ].join("\n");
  }

  const program = items
    .filter((it) => String(it?.activityName || "").trim())
    .map(lineForItem);

  return [
    `Bonjour ${name},`,
    "",
    "Voici votre programme Hurghada Dream :",
    "",
    ...(program.length ? program : ["• Programme à confirmer"]),
    "",
    `Lien : ${url}`,
    "",
    "Hurghada Dream",
  ].join("\n");
}

export function openClientStayWhatsApp(quote, options = {}) {
  const phone = cleanPhoneNumber(quote?.client?.phone);
  if (phone.length < 10) {
    toast.warning("Pas de numéro WhatsApp sur ce devis.");
    return false;
  }
  const message = buildStayWhatsAppMessage(quote, options);
  const href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  window.open(href, "_blank", "noopener,noreferrer");
  return true;
}

export function offerStayWhatsAppAfterPickupChange(quote, previousItems) {
  const changes = listPickupChanges(previousItems, quote?.items);
  if (!changes.length) return false;
  const send = window.confirm(
    "Heures de prise en charge enregistrées. Prévenir le client sur WhatsApp ?"
  );
  if (!send) return false;
  return openClientStayWhatsApp(quote, { previousItems });
}
