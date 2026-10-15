import { useMemo, useState } from "react";
import { SITE_KEY } from "../constants";
import { supabase } from "../lib/supabase";
import { currencyNoCents, formatPhoneWithPlus, saveQuotesCache } from "../utils";
import { findTicketNumberConflict } from "../utils/ticketCollections";
import { claimTicketNumbersForQuote, releaseTicketAllocations } from "../utils/ticketSequence";
import { itemWithPickupSchedule, visiblePickupTime } from "../utils/pickupSchedule";
import { toast } from "../utils/toast.js";
import { logger } from "../utils/logger";

function findTicketLine(quotes, rawNumber) {
  const needle = String(rawNumber || "").trim().toLowerCase();
  if (!needle) return null;
  for (const quote of quotes || []) {
    const items = quote.items || [];
    for (let index = 0; index < items.length; index += 1) {
      const ticketNumber = String(items[index]?.ticketNumber || "").trim().toLowerCase();
      if (ticketNumber && ticketNumber === needle) {
        return { quote, itemIndex: index, item: items[index] };
      }
    }
  }
  return null;
}

function toCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.round(number);
}

function activityOptionId(activity) {
  return String(activity?.id ?? activity?.supabase_id ?? "");
}

export function TicketModificationPage({ quotes = [], setQuotes, activities = [] }) {
  const [query, setQuery] = useState("");
  const [match, setMatch] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [searched, setSearched] = useState(false);

  const activityOptions = useMemo(() => {
    const list = [...(activities || [])].filter((activity) => activity?.name);
    list.sort((a, b) => String(a.name).localeCompare(String(b.name), "fr", { sensitivity: "base" }));
    return list;
  }, [activities]);

  const fillForm = (found) => {
    const item = found.item;
    const client = found.quote.client || {};
    const activityId = String(item.activityId ?? item.activity_id ?? "");
    setMatch(found);
    setForm({
      ticketNumber: String(item.ticketNumber || "").trim(),
      date: String(item.date || "").slice(0, 10),
      activityId,
      adults: toCount(item.adults),
      children: toCount(item.children),
      babies: toCount(item.babies),
      clientName: String(client.name || "").trim(),
      phone: formatPhoneWithPlus(client.phone),
      room: String(client.room || "").trim(),
      pickup: visiblePickupTime(item),
      meetAtHotelMarina: item.meetAtHotelMarina === true,
    });
  };

  const search = () => {
    const found = findTicketLine(quotes, query);
    setSearched(true);
    if (!found) {
      setMatch(null);
      setForm(null);
      return;
    }
    fillForm(found);
  };

  const setField = (key, value) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const save = async () => {
    if (!match || !form || typeof setQuotes !== "function") return;
    const quote = (quotes || []).find((item) => String(item.id) === String(match.quote.id)) || match.quote;
    const itemIndex = match.itemIndex;
    const original = quote.items?.[itemIndex];
    if (!original) {
      toast.error("Ce ticket n’est plus dans le devis.");
      return;
    }

    const nextTicket = String(form.ticketNumber || "").trim();
    if (!nextTicket) {
      toast.warning("Le numéro de ticket est obligatoire.");
      return;
    }

    const duplicate = findTicketNumberConflict(quotes, nextTicket, {
      excludeQuoteId: quote.id,
      excludeItemIndex: itemIndex,
    });
    if (duplicate) {
      toast.warning(`Numéro déjà utilisé : ${nextTicket}`);
      return;
    }
    const duplicateInQuote = (quote.items || []).some(
      (item, index) =>
        index !== itemIndex && String(item.ticketNumber || "").trim().toLowerCase() === nextTicket.toLowerCase()
    );
    if (duplicateInQuote) {
      toast.warning(`Numéro en double dans le devis : ${nextTicket}`);
      return;
    }

    const selected = activityOptions.find((activity) => activityOptionId(activity) === String(form.activityId));
    const currentActivityId = String(original.activityId ?? original.activity_id ?? "");
    const activityChanged = selected && activityOptionId(selected) !== currentActivityId;

    const pickupPatch = itemWithPickupSchedule(original, form.pickup);
    const patched = {
      ...original,
      ...(pickupPatch || {}),
      ticketNumber: nextTicket,
      date: String(form.date || "").slice(0, 10),
      adults: toCount(form.adults),
      children: toCount(form.children),
      babies: toCount(form.babies),
      meetAtHotelMarina: Boolean(form.meetAtHotelMarina),
    };
    if (activityChanged) {
      patched.activityId = selected.id ?? selected.supabase_id;
      patched.activityName = selected.name;
      patched.activityNameEn = String(selected.nameEn ?? selected.name_en ?? "").trim();
    }

    const items = quote.items.map((item, index) => (index === itemIndex ? patched : item));
    const updatedQuote = {
      ...quote,
      client: {
        ...(quote.client || {}),
        name: String(form.clientName || "").trim(),
        phone: formatPhoneWithPlus(form.phone),
        room: String(form.room || "").trim(),
      },
      items,
      updated_at: new Date().toISOString(),
    };

    const previous = quotes;
    const nextQuotes = quotes.map((item) => (String(item.id) === String(quote.id) ? updatedQuote : item));
    setSaving(true);
    const prevTicket = String(original.ticketNumber || "").trim();
    const ticketChanged = prevTicket.toLowerCase() !== nextTicket.toLowerCase();
    const quoteDbId = quote.supabase_id != null ? Number(quote.supabase_id) : null;

    try {
      if (supabase && ticketChanged) {
        const claim = await claimTicketNumbersForQuote(supabase, quoteDbId, [nextTicket]);
        if (!claim.ok) {
          toast.error(
            claim.conflicts?.length
              ? `Numéro déjà utilisé : ${claim.conflicts.join(", ")}`
              : "Impossible de verrouiller ce numéro de ticket."
          );
          return;
        }
      }

      setQuotes(nextQuotes);
      saveQuotesCache(nextQuotes);

      if (supabase) {
        const payload = {
          client_name: updatedQuote.client.name || "",
          client_phone: updatedQuote.client.phone || "",
          client_room: updatedQuote.client.room || "",
          items,
          updated_at: updatedQuote.updated_at,
        };
        let updateQuery = supabase.from("quotes").update(payload).eq("site_key", SITE_KEY);
        if (quote.supabase_id) updateQuery = updateQuery.eq("id", quote.supabase_id);
        else updateQuery = updateQuery.eq("client_phone", quote.client?.phone || "").eq("created_at", quote.createdAt);

        const { error } = await updateQuery;
        if (error) {
          logger.error("Modification ticket:", error);
          setQuotes(previous);
          saveQuotesCache(previous);
          if (ticketChanged) await releaseTicketAllocations(supabase, [nextTicket]);
          toast.error("La modification n’a pas été enregistrée.");
          return;
        }
        if (ticketChanged && prevTicket) await releaseTicketAllocations(supabase, [prevTicket]);
      }

      setMatch({ quote: updatedQuote, itemIndex, item: patched });
      setQuery(nextTicket);
      toast.success(`Ticket ${nextTicket} modifié. Situation et Transferts sont à jour.`);
    } finally {
      setSaving(false);
    }
  };

  const hotel = String(match?.quote?.client?.hotel || "").trim();
  const price = Math.round(Number(match?.item?.lineTotal) || 0);
  const currency = match?.quote?.currency || "EUR";
  const knownActivity = form && activityOptions.some((activity) => activityOptionId(activity) === String(form.activityId));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <form
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm"
        onSubmit={(event) => {
          event.preventDefault();
          search();
        }}
      >
        <label className="min-w-[16rem] flex-1 text-sm font-semibold text-slate-700">
          Numéro de ticket
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="186703"
            className="mt-1 h-12 w-full rounded-xl border border-slate-300 px-3 text-base font-bold text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
        </label>
        <button
          type="submit"
          className="h-12 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white hover:bg-indigo-700"
        >
          Chercher
        </button>
      </form>

      {searched && !form ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-600">
          Aucun ticket ne correspond à ce numéro.
        </p>
      ) : null}

      {form ? (
        <form
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Hôtel
              <span className="mt-1 block font-bold text-slate-900">{hotel || "—"}</span>
            </p>
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Prix
              <span className="mt-1 block font-bold text-slate-900">{currencyNoCents(price, currency)}</span>
            </p>
          </div>
          <p className="text-xs leading-relaxed text-slate-500">
            L’hôtel et le prix restent inchangés. Le nom, le téléphone et la chambre sont ceux du client : ils se mettent à jour sur tous ses tickets.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">
              N° ticket
              <input
                value={form.ticketNumber}
                onChange={(event) => setField("ticketNumber", event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 font-bold outline-none focus:border-indigo-500"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Date
              <input
                type="date"
                value={form.date}
                onChange={(event) => setField("date", event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 outline-none focus:border-indigo-500"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
              Activité
              <select
                value={form.activityId}
                onChange={(event) => setField("activityId", event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 outline-none focus:border-indigo-500"
              >
                {!knownActivity && match?.item?.activityName ? (
                  <option value={form.activityId}>{match.item.activityName}</option>
                ) : null}
                {activityOptions.map((activity) => (
                  <option key={activityOptionId(activity)} value={activityOptionId(activity)}>
                    {activity.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Adultes
              <input
                type="number"
                min="0"
                value={form.adults}
                onChange={(event) => setField("adults", event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 outline-none focus:border-indigo-500"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Enfants
              <input
                type="number"
                min="0"
                value={form.children}
                onChange={(event) => setField("children", event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 outline-none focus:border-indigo-500"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Bébés
              <input
                type="number"
                min="0"
                value={form.babies}
                onChange={(event) => setField("babies", event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 outline-none focus:border-indigo-500"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Heure de prise en charge
              <input
                type="time"
                value={form.pickup}
                onChange={(event) => setField("pickup", event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 outline-none focus:border-indigo-500"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Nom du client
              <input
                value={form.clientName}
                onChange={(event) => setField("clientName", event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 outline-none focus:border-indigo-500"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Téléphone
              <input
                value={form.phone}
                onChange={(event) => setField("phone", event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 outline-none focus:border-indigo-500"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Chambre
              <input
                value={form.room}
                onChange={(event) => setField("room", event.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 outline-none focus:border-indigo-500"
              />
            </label>
            <label className="flex items-center gap-2 self-end rounded-xl bg-teal-50 px-3 py-3 text-sm font-bold text-teal-900 ring-1 ring-teal-200">
              <input
                type="checkbox"
                checked={form.meetAtHotelMarina}
                onChange={(event) => setField("meetAtHotelMarina", event.target.checked)}
                className="size-5 accent-teal-700"
              />
              Marina de l’hôtel, sans transfert
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="h-12 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? "Enregistrement…" : "Enregistrer la modification"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
