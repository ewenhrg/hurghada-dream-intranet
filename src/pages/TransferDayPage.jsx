import { Fragment, useCallback, useMemo, useState } from "react";
import { BellRing, Clock3 } from "lucide-react";
import { saveQuotesCache, buildActivitiesByIdMap, resolveTicketActivityName, formatPhoneWithPlus, cleanPhoneNumber } from "../utils";
import { getQuoteItemParticipantCells } from "../utils/quoteItemDisplay";
import { getLocalDateKey } from "../utils/pushSaleExpiry";
import { persistQuoteItemsToSupabase } from "../utils/persistQuoteItems";
import { itemWithPickupSchedule, pickupAwaitingNotify, visiblePickupTime } from "../utils/pickupSchedule";
import { chosenPickupTime, resolveActivityFromList, showsChosenPickupOnSituation } from "../utils/transferPricing";
import { requestClientStayPush } from "../utils/clientStayPush";
import { supabase } from "../lib/supabase";
import { toast } from "../utils/toast.js";

function shiftDateKey(ymd, days) {
  const [year, month, day] = String(ymd).split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return getLocalDateKey(date);
}

function tomorrowKey() {
  return shiftDateKey(getLocalDateKey(), 1);
}

function formatLongDate(ymd) {
  const [year, month, day] = String(ymd).split("-").map(Number);
  if (!year || !month || !day) return ymd;
  return new Date(year, month - 1, day).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function clockValue(raw) {
  const match = String(raw || "").trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function paxLabel(item) {
  const pax = getQuoteItemParticipantCells(item);
  const parts = [];
  if (pax.adults) parts.push(`${pax.adults} ad.`);
  if (pax.children) parts.push(`${pax.children} enf.`);
  if (pax.babies) parts.push(`${pax.babies} bébé${pax.babies > 1 ? "s" : ""}`);
  return parts.join(" · ");
}

async function mapPool(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index], index);
    }
  };
  const workers = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return results;
}

export function TransferDayPage({ quotes = [], setQuotes, activities = [] }) {
  const [day, setDay] = useState(tomorrowKey);
  const [drafts, setDrafts] = useState({});
  const [savingKey, setSavingKey] = useState("");
  const [savingMarinaKey, setSavingMarinaKey] = useState("");
  const [sending, setSending] = useState(false);
  const isTomorrow = day === tomorrowKey();

  const rows = useMemo(() => {
    const activitiesById = buildActivitiesByIdMap(activities);
    const list = [];
    (quotes || []).forEach((quote) => {
      const client = quote.client || {};
      (quote.items || []).forEach((item, idx) => {
        if (item?.isCancelled === true) return;
        const ticketNumber = String(item.ticketNumber || "").trim();
        if (!ticketNumber || item.ticketKind === "modification") return;
        if (String(item.date || "").trim() !== day) return;
        const activityName = resolveTicketActivityName(item, activitiesById) || String(item.activityName || "").trim();
        const phone = formatPhoneWithPlus(client.phone);
        const phoneKey = cleanPhoneNumber(phone);
        const publishedPickup = visiblePickupTime(item);
        const knownPickup =
          publishedPickup || !showsChosenPickupOnSituation(activityName)
            ? ""
            : chosenPickupTime(
                {
                  ...item,
                  neighborhood: item.neighborhood || client.neighborhood || "",
                },
                resolveActivityFromList({ ...item, activityName }, activities)
              );
        list.push({
          key: `${quote.id || "q"}-${idx}-${ticketNumber}`,
          quoteId: quote.id,
          itemIndex: idx,
          ticketNumber,
          clientName: String(client.name || "").trim(),
          phone,
          phoneKey: phoneKey.length >= 10 ? phoneKey : "",
          hotel: String(client.hotel || "").trim(),
          room: String(client.room || "").trim(),
          reservationCode: String(quote.reservationCode || "").trim(),
          activityName: activityName || "Activité",
          pax: paxLabel(item),
          pickup: publishedPickup,
          knownPickup,
          meetAtHotelMarina: item.meetAtHotelMarina === true,
          notifyPending: pickupAwaitingNotify(item),
        });
      });
    });
    list.sort((a, b) => {
      const activity = a.activityName.localeCompare(b.activityName, "fr", { sensitivity: "base" });
      if (activity !== 0) return activity;
      const hotel = a.hotel.localeCompare(b.hotel, "fr", { sensitivity: "base" });
      if (hotel !== 0) return hotel;
      return a.clientName.localeCompare(b.clientName, "fr", { sensitivity: "base" });
    });
    return list;
  }, [quotes, activities, day]);

  const groups = useMemo(() => {
    const next = [];
    for (const row of rows) {
      const last = next[next.length - 1];
      if (!last || last.activityName !== row.activityName) {
        next.push({ activityName: row.activityName, rows: [row] });
      } else {
        last.rows.push(row);
      }
    }
    return next;
  }, [rows]);

  const pendingRows = useMemo(() => rows.filter((row) => row.notifyPending), [rows]);
  const pendingClientCount = useMemo(() => {
    const keys = new Set(pendingRows.map((row) => row.phoneKey || `quote:${row.quoteId}`));
    return keys.size;
  }, [pendingRows]);

  const commitPickup = useCallback(async (row, rawValue) => {
    if (typeof setQuotes !== "function") return;
    const quote = (quotes || []).find((item) => String(item.id) === String(row.quoteId));
    const currentItem = quote?.items?.[row.itemIndex];
    if (!quote || !currentItem) return;
    const patched = itemWithPickupSchedule(currentItem, rawValue);
    if (!patched) {
      setDrafts((prev) => {
        if (!(row.key in prev)) return prev;
        const copy = { ...prev };
        delete copy[row.key];
        return copy;
      });
      return;
    }
    const items = quote.items.map((item, idx) => (idx === row.itemIndex ? patched : item));
    const updatedQuote = { ...quote, items, updated_at: new Date().toISOString() };
    const previous = quotes;
    const nextQuotes = quotes.map((item) => (String(item.id) === String(quote.id) ? updatedQuote : item));
    setQuotes(nextQuotes);
    saveQuotesCache(nextQuotes);
    setSavingKey(row.key);
    try {
      if (supabase) {
        const { ok, error } = await persistQuoteItemsToSupabase(quote, items, {
          updatedAt: updatedQuote.updated_at,
          notifyStay: false,
        });
        if (!ok) {
          setQuotes(previous);
          saveQuotesCache(previous);
          toast.error(error?.message || "Heure non enregistrée.");
          return;
        }
      }
      setDrafts((prev) => {
        if (!(row.key in prev)) return prev;
        const copy = { ...prev };
        delete copy[row.key];
        return copy;
      });
    } finally {
      setSavingKey("");
    }
  }, [quotes, setQuotes]);

  const commitMarina = useCallback(async (row, checked) => {
    if (typeof setQuotes !== "function") return;
    const quote = (quotes || []).find((item) => String(item.id) === String(row.quoteId));
    const currentItem = quote?.items?.[row.itemIndex];
    if (!quote || !currentItem) return;
    if (Boolean(currentItem.meetAtHotelMarina) === checked) return;
    const items = quote.items.map((item, idx) =>
      idx === row.itemIndex ? { ...item, meetAtHotelMarina: checked } : item
    );
    const updatedQuote = { ...quote, items, updated_at: new Date().toISOString() };
    const previous = quotes;
    const nextQuotes = quotes.map((item) => (String(item.id) === String(quote.id) ? updatedQuote : item));
    setQuotes(nextQuotes);
    saveQuotesCache(nextQuotes);
    setSavingMarinaKey(row.key);
    try {
      if (supabase) {
        const { ok, error } = await persistQuoteItemsToSupabase(quote, items, {
          updatedAt: updatedQuote.updated_at,
          notifyStay: false,
        });
        if (!ok) {
          setQuotes(previous);
          saveQuotesCache(previous);
          toast.error(error?.message || "Case marina non enregistrée.");
        }
      }
    } finally {
      setSavingMarinaKey("");
    }
  }, [quotes, setQuotes]);

  const sendNotifications = useCallback(async () => {
    if (sending || pendingRows.length === 0 || typeof setQuotes !== "function") return;
    setSending(true);
    try {
      const targets = [];
      const seen = new Set();
      for (const row of pendingRows) {
        const key = row.phoneKey || `quote:${row.quoteId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        targets.push({ key, phone: row.phone });
      }
      const results = await mapPool(targets, 4, async (target) => {
        const result = await requestClientStayPush(target.phone);
        return { key: target.key, ok: result?.ok === true };
      });
      const okKeys = new Set(results.filter((result) => result.ok).map((result) => result.key));
      const failed = results.length - okKeys.size;
      if (okKeys.size === 0) {
        toast.error("Les notifications n’ont pas pu partir. Réessayez.");
        return;
      }

      const indexesByQuote = new Map();
      for (const row of pendingRows) {
        const key = row.phoneKey || `quote:${row.quoteId}`;
        if (!okKeys.has(key)) continue;
        if (!indexesByQuote.has(String(row.quoteId))) indexesByQuote.set(String(row.quoteId), new Set());
        indexesByQuote.get(String(row.quoteId)).add(row.itemIndex);
      }

      let nextQuotes = quotes;
      const persisted = [];
      for (const [quoteId, indexes] of indexesByQuote) {
        const quote = nextQuotes.find((item) => String(item.id) === quoteId);
        if (!quote) continue;
        const items = (quote.items || []).map((item, idx) =>
          indexes.has(idx) ? { ...item, pickupNotifyPending: false } : item
        );
        const updated = { ...quote, items, updated_at: new Date().toISOString() };
        nextQuotes = nextQuotes.map((item) => (String(item.id) === quoteId ? updated : item));
        persisted.push({ quote, items, updatedAt: updated.updated_at });
      }
      setQuotes(nextQuotes);
      saveQuotesCache(nextQuotes);

      for (const entry of persisted) {
        if (!supabase) continue;
        const { ok } = await persistQuoteItemsToSupabase(entry.quote, entry.items, {
          updatedAt: entry.updatedAt,
          notifyStay: false,
        });
        if (!ok) {
          toast.error("Notifications envoyées, mais la page n’a pas pu les marquer. Évitez de renvoyer tout de suite.");
          return;
        }
      }

      const count = okKeys.size;
      toast.success(
        failed > 0
          ? `${count} client${count > 1 ? "s" : ""} prévenu${count > 1 ? "s" : ""}. ${failed} encore en attente.`
          : `Notifications envoyées à ${count} client${count > 1 ? "s" : ""}.`
      );
    } finally {
      setSending(false);
    }
  }, [pendingRows, quotes, sending, setQuotes]);

  const focusNextPickup = (input) => {
    const inputs = [...input.closest("table").querySelectorAll("input[data-pickup]")];
    const index = inputs.indexOf(input);
    const next = inputs[index + 1];
    if (next) next.focus();
    else input.blur();
  };

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-20 flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-indigo-200/80 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-600">Transferts</p>
          <h1 className="mt-0.5 text-xl font-black text-slate-900">
            Situation {isTomorrow ? "du lendemain" : "du jour"}
          </h1>
          <p className="mt-1 text-sm capitalize text-slate-600">
            {formatLongDate(day)} · {rows.length} sortie{rows.length > 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 rounded-xl border-2 border-indigo-400 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-950">
            Date
            <input
              type="date"
              value={day}
              onChange={(event) => setDay(event.target.value || tomorrowKey())}
              className="bg-transparent text-sm font-bold text-indigo-950 outline-none"
            />
          </label>
          {pendingClientCount > 0 ? (
            <button
              type="button"
              onClick={() => void sendNotifications()}
              disabled={sending}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
            >
              <BellRing className="h-4 w-4" aria-hidden />
              {sending
                ? "Envoi…"
                : `Envoyer les notifications · ${pendingClientCount}`}
            </button>
          ) : null}
        </div>
      </div>

      <p className="px-1 text-sm text-slate-600">
        Modifiez les heures sans prévenir les clients. Le bouton en haut apparaît dès qu’une heure est enregistrée, et envoie la notification à tous les clients concernés d’un coup.
      </p>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <Clock3 className="mx-auto h-8 w-8 text-slate-400" aria-hidden />
          <p className="mt-3 text-base font-bold text-slate-800">Aucune sortie ce jour-là</p>
          <p className="mt-1 text-sm text-slate-500">Les tickets de la date choisie apparaîtront ici.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-indigo-200/70 bg-white shadow-sm">
          <div className="max-h-[min(75vh,920px)] overflow-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-slate-900 text-[11px] uppercase tracking-wide text-white">
                <tr>
                  <th className="px-3 py-2 font-bold">Ticket</th>
                  <th className="px-3 py-2 font-bold">Client</th>
                  <th className="px-3 py-2 font-bold">Hôtel</th>
                  <th className="px-3 py-2 font-bold">Ch.</th>
                  <th className="px-3 py-2 font-bold">Pax</th>
                  <th className="px-3 py-2 font-bold">Prise en charge</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <Fragment key={group.activityName}>
                    <tr className="bg-amber-100">
                      <th colSpan={6} className="px-3 py-2 text-left text-sm font-black text-amber-950">
                        {group.activityName}
                        <span className="ml-2 text-xs font-bold text-amber-800">{group.rows.length}</span>
                      </th>
                    </tr>
                    {group.rows.map((row) => {
                      const shownPickup = row.pickup || row.knownPickup || "";
                      const value = drafts[row.key] ?? shownPickup;
                      return (
                        <tr key={row.key} className="border-t border-slate-100">
                          <td className="px-3 py-2 align-middle text-sm font-bold text-orange-950">{row.ticketNumber}</td>
                          <td className="px-3 py-2 align-middle">
                            <span className="block text-sm font-semibold text-slate-900">{row.clientName || "—"}</span>
                            <span className="block text-xs text-slate-500">
                              {[row.phone, row.reservationCode].filter(Boolean).join(" · ")}
                            </span>
                          </td>
                          <td className="px-3 py-2 align-middle text-sm text-slate-800">{row.hotel || "—"}</td>
                          <td className="px-3 py-2 align-middle text-sm text-slate-700">{row.room || "—"}</td>
                          <td className="px-3 py-2 align-middle text-xs font-semibold text-slate-700">{row.pax || "—"}</td>
                          <td className="px-3 py-2 align-middle">
                            <div className="flex items-center gap-2">
                              <input
                                data-pickup
                                type="time"
                                value={clockValue(value)}
                                disabled={sending || savingKey === row.key || typeof setQuotes !== "function"}
                                aria-label={`Heure de prise en charge ${row.clientName || row.ticketNumber}`}
                                onChange={(event) =>
                                  setDrafts((prev) => ({ ...prev, [row.key]: event.target.value }))
                                }
                                onBlur={(event) => {
                                  if (event.target.value === clockValue(shownPickup) && !(row.key in drafts)) return;
                                  void commitPickup(row, event.target.value);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    focusNextPickup(event.currentTarget);
                                  }
                                }}
                                className="h-11 w-[8.5rem] rounded-xl border border-violet-300 bg-white px-2 text-center text-base font-bold text-violet-950 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-300 disabled:opacity-60"
                              />
                              <label className="inline-flex items-center gap-1.5 rounded-xl bg-teal-50 px-2 py-1 text-xs font-bold text-teal-900 ring-1 ring-teal-200">
                                <input
                                  type="checkbox"
                                  checked={row.meetAtHotelMarina}
                                  disabled={sending || savingMarinaKey === row.key || typeof setQuotes !== "function"}
                                  aria-label={`Sans transfert, marina de l’hôtel, ${row.clientName || row.ticketNumber}`}
                                  onChange={(event) => void commitMarina(row, event.target.checked)}
                                  className="size-5 accent-teal-700 disabled:opacity-60"
                                />
                                Marina
                              </label>
                              {row.notifyPending ? (
                                <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                                  À envoyer
                                </span>
                              ) : row.pickup ? (
                                <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                                  Envoyée
                                </span>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
