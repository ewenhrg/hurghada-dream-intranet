import { useMemo, useState } from "react";
import { SITE_KEY } from "../constants";
import { supabase } from "../lib/supabase";
import { calculateCardPrice, currencyNoCents, formatPhoneWithPlus, saveQuotesCache } from "../utils";
import { generateTicketsHTML } from "../utils/printTemplates";
import { computePaidColumnsFromItems, findTicketNumberConflict } from "../utils/ticketCollections";
import {
  claimTicketNumbersForQuote,
  commitTicketSequenceAfterPayment,
  confirmTicketAllocations,
  releaseTicketAllocations,
  rollbackTicketReservation,
  voidTicketAllocations,
} from "../utils/ticketSequence";
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

function parseMoney(value) {
  const raw = String(value ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!raw) return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount);
}

function showModificationTicket(popup, quote, item) {
  const html = generateTicketsHTML({ ...quote, items: [item] });
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  popup.location.href = url;
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function TicketModificationPage({ quotes = [], setQuotes, activities = [] }) {
  const [query, setQuery] = useState("");
  const [match, setMatch] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [searched, setSearched] = useState(false);
  const [deadNote, setDeadNote] = useState("");

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
      newPrice: "",
      balanceDue: false,
      balanceAmount: "",
    });
  };

  const search = async () => {
    const found = findTicketLine(quotes, query);
    setSearched(true);
    setDeadNote("");
    if (found) {
      fillForm(found);
      return;
    }
    setMatch(null);
    setForm(null);
    const needle = String(query || "").trim();
    if (!needle || !supabase) return;
    const { data } = await supabase
      .from("ticket_allocations")
      .select("status, ticket_number")
      .eq("site_key", SITE_KEY)
      .ilike("ticket_number", needle)
      .maybeSingle();
    if (data?.status === "void") {
      setDeadNote(`Le ticket ${data.ticket_number} a été annulé. Ce numéro est mort et ne sera plus jamais redonné.`);
    }
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

    const typedPrice = String(form.newPrice || "").trim();
    const newPrice = parseMoney(form.newPrice);
    if (typedPrice && newPrice == null) {
      toast.warning("Le nouveau prix n’est pas valide.");
      return;
    }
    const balanceDue = form.balanceDue === true;
    const balanceAmount = parseMoney(form.balanceAmount);
    if (balanceDue && (balanceAmount == null || balanceAmount <= 0)) {
      toast.warning("Indiquez le montant du reste à payer.");
      return;
    }

    const popup = balanceDue ? window.open("about:blank", "_blank") : null;
    if (balanceDue && !popup) {
      toast.error("Autorisez les fenêtres pop-up pour imprimer le ticket de modification.");
      return;
    }

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
    if (newPrice != null) patched.lineTotal = newPrice;

    const previousActivityName = String(original.activityName || "").trim();
    const nextActivityName = String(patched.activityName || previousActivityName).trim();
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
    if (newPrice != null) {
      const billable = items.filter((item) => item?.ticketKind !== "modification");
      const nextTotal = billable.reduce((sum, item) => sum + Math.round(Number(item.lineTotal) || 0), 0);
      updatedQuote.total = nextTotal;
      updatedQuote.totalCash = nextTotal;
      updatedQuote.totalCard = calculateCardPrice(nextTotal);
    }

    if (balanceDue && original.ticketKind === "modification") {
      popup?.close();
      toast.warning("Ce ticket est déjà un ticket de modification.");
      return;
    }

    const previous = quotes;
    setSaving(true);
    const prevTicket = String(original.ticketNumber || "").trim();
    const ticketChanged = prevTicket.toLowerCase() !== nextTicket.toLowerCase();
    const quoteDbId = quote.supabase_id != null ? Number(quote.supabase_id) : null;
    let reservation = null;

    try {
      if (supabase && ticketChanged) {
        const claim = await claimTicketNumbersForQuote(supabase, quoteDbId, [nextTicket]);
        if (!claim.ok) {
          popup?.close();
          toast.error(
            claim.conflicts?.length
              ? `Numéro déjà utilisé : ${claim.conflicts.join(", ")}`
              : "Impossible de verrouiller ce numéro de ticket."
          );
          return;
        }
      }

      let modNumber = "";
      if (balanceDue) {
        if (!supabase) {
          popup?.close();
          toast.error("Connexion indispensable pour créer le ticket de modification.");
          return;
        }
        const reserved = await commitTicketSequenceAfterPayment(supabase, [], {
          autoCount: 1,
          quotes,
        });
        if (!reserved.ok || !reserved.reservedNumbers?.[0]) {
          popup?.close();
          if (ticketChanged) await releaseTicketAllocations(supabase, [nextTicket]);
          toast.error("Aucun numéro libre pour le ticket de modification.");
          return;
        }
        reservation = reserved.reservation;
        modNumber = reserved.reservedNumbers[0];
        updatedQuote.items = [
          ...items,
          {
            ticketKind: "modification",
            ticketNumber: modNumber,
            date: patched.date,
            activityName: `Modification · ${previousActivityName || "—"} → ${nextActivityName || "—"}`,
            previousActivityName: previousActivityName || "—",
            newActivityName: nextActivityName || "—",
            adults: patched.adults,
            children: patched.children,
            babies: patched.babies,
            lineTotal: 0,
            restAmount: balanceAmount,
            pickupTime: patched.pickupTime,
            pickupPublished: patched.pickupPublished,
            meetAtHotelMarina: patched.meetAtHotelMarina === true,
            modificationOfTicket: nextTicket,
          },
        ];
      }

      const nextQuotes = quotes.map((item) => (String(item.id) === String(quote.id) ? updatedQuote : item));
      setQuotes(nextQuotes);
      saveQuotesCache(nextQuotes);

      if (supabase) {
        const payload = {
          client_name: updatedQuote.client.name || "",
          client_phone: updatedQuote.client.phone || "",
          client_room: updatedQuote.client.room || "",
          items: updatedQuote.items,
          updated_at: updatedQuote.updated_at,
        };
        if (newPrice != null) payload.total = updatedQuote.total;
        let updateQuery = supabase.from("quotes").update(payload).eq("site_key", SITE_KEY);
        if (quote.supabase_id) updateQuery = updateQuery.eq("id", quote.supabase_id);
        else updateQuery = updateQuery.eq("client_phone", quote.client?.phone || "").eq("created_at", quote.createdAt);

        const { error } = await updateQuery;
        if (error) {
          logger.error("Modification ticket:", error);
          setQuotes(previous);
          saveQuotesCache(previous);
          if (ticketChanged) await releaseTicketAllocations(supabase, [nextTicket]);
          if (reservation) await rollbackTicketReservation(supabase, reservation);
          popup?.close();
          toast.error("La modification n’a pas été enregistrée.");
          return;
        }
        if (ticketChanged && prevTicket) await releaseTicketAllocations(supabase, [prevTicket]);
        if (modNumber) await confirmTicketAllocations(supabase, [modNumber], quoteDbId);
      }

      setMatch({ quote: updatedQuote, itemIndex, item: patched });
      setForm((current) =>
        current
          ? { ...current, ticketNumber: nextTicket, newPrice: "", balanceDue: false, balanceAmount: "" }
          : current
      );
      setQuery(nextTicket);
      if (modNumber) {
        const special = updatedQuote.items[updatedQuote.items.length - 1];
        showModificationTicket(popup, updatedQuote, special);
        toast.success(`Ticket ${nextTicket} modifié. Ticket spécial ${modNumber} créé.`);
      } else {
        toast.success(`Ticket ${nextTicket} modifié. Situation et Transferts sont à jour.`);
      }
    } finally {
      setSaving(false);
    }
  };

  const cancelActivity = async () => {
    if (!match || saving || typeof setQuotes !== "function") return;
    const quote = (quotes || []).find((item) => String(item.id) === String(match.quote.id)) || match.quote;
    const original = quote.items?.[match.itemIndex];
    const ticket = String(original?.ticketNumber || "").trim();
    if (!original || !ticket) {
      toast.error("Ce ticket n’est plus dans le devis.");
      return;
    }
    const activity = String(original.activityName || "cette activité").trim();
    const confirmed = window.confirm(
      `Annuler le ticket ${ticket} (${activity}) ?\n\nL’activité disparaît de Situation, Transferts et Mon séjour. Le numéro ${ticket} est mort : il ne sera plus jamais redonné.`
    );
    if (!confirmed) return;

    const previous = quotes;
    const nextItems = quote.items.filter((_, index) => index !== match.itemIndex);
    const nextTotal = nextItems.reduce((sum, item) => sum + (Math.round(Number(item.lineTotal) || 0)), 0);
    const { paidCash, paidStripe } = computePaidColumnsFromItems(nextItems);
    const updatedQuote = {
      ...quote,
      items: nextItems,
      total: nextTotal,
      totalCash: nextTotal,
      totalCard: calculateCardPrice(nextTotal),
      paidCash,
      paidStripe,
      updated_at: new Date().toISOString(),
    };
    const nextQuotes = quotes.map((item) => (String(item.id) === String(quote.id) ? updatedQuote : item));
    const quoteDbId = quote.supabase_id != null ? Number(quote.supabase_id) : null;
    setSaving(true);
    try {
      if (supabase) {
        const burned = await voidTicketAllocations(supabase, [ticket]);
        if (!burned.ok) {
          toast.error("Impossible de brûler ce numéro. L’activité n’a pas été annulée.");
          return;
        }
      }

      setQuotes(nextQuotes);
      saveQuotesCache(nextQuotes);

      if (supabase) {
        const payload = {
          total: updatedQuote.total,
          paid_cash: paidCash,
          paid_stripe: paidStripe,
          items: nextItems,
          updated_at: updatedQuote.updated_at,
        };
        let updateQuery = supabase.from("quotes").update(payload).eq("site_key", SITE_KEY);
        if (quote.supabase_id) updateQuery = updateQuery.eq("id", quote.supabase_id);
        else updateQuery = updateQuery.eq("client_phone", quote.client?.phone || "").eq("created_at", quote.createdAt);
        const { error } = await updateQuery;
        if (error) {
          logger.error("Annulation ticket:", error);
          setQuotes(previous);
          saveQuotesCache(previous);
          await supabase
            .from("ticket_allocations")
            .update({
              status: "assigned",
              quote_id: quoteDbId,
              released_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq("site_key", SITE_KEY)
            .eq("ticket_number", ticket);
          toast.error("L’annulation n’a pas été enregistrée.");
          return;
        }
      }

      setMatch(null);
      setForm(null);
      setQuery("");
      setSearched(true);
      setDeadNote(`Le ticket ${ticket} est annulé. Ce numéro est mort et ne sera plus jamais redonné.`);
      toast.success(`Ticket ${ticket} annulé. Le numéro ne sera plus réutilisé.`);
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
          {deadNote || "Aucun ticket ne correspond à ce numéro."}
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
            L’hôtel reste inchangé. Le nom, le téléphone et la chambre sont ceux du client : ils se mettent à jour sur tous ses tickets.
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
              Nouveau prix
              <input
                inputMode="decimal"
                value={form.newPrice}
                onChange={(event) => setField("newPrice", event.target.value)}
                placeholder={String(price)}
                className="mt-1 h-11 w-full rounded-xl border border-slate-300 px-3 outline-none focus:border-indigo-500"
              />
            </label>
            <div className="rounded-xl bg-amber-50 px-3 py-3 ring-1 ring-amber-200">
              <label className="flex items-center gap-2 text-sm font-bold text-amber-950">
                <input
                  type="checkbox"
                  checked={form.balanceDue}
                  onChange={(event) => setField("balanceDue", event.target.checked)}
                  className="size-5 accent-amber-700"
                />
                Reste à payer
              </label>
              {form.balanceDue ? (
                <label className="mt-3 block text-sm font-semibold text-amber-950">
                  Montant
                  <input
                    inputMode="decimal"
                    value={form.balanceAmount}
                    onChange={(event) => setField("balanceAmount", event.target.value)}
                    placeholder="30"
                    className="mt-1 h-11 w-full rounded-xl border border-amber-300 bg-white px-3 outline-none focus:border-amber-600"
                  />
                </label>
              ) : (
                <p className="mt-2 text-xs leading-relaxed text-amber-900">
                  Cochez pour créer un ticket spécial, d’une autre couleur, avec l’ancienne activité et la nouvelle.
                </p>
              )}
            </div>
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

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="h-12 rounded-xl bg-indigo-600 px-5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? "Enregistrement…" : "Enregistrer la modification"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                void cancelActivity();
              }}
              className="h-12 rounded-xl bg-rose-600 px-5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60"
            >
              Annuler cette activité
            </button>
          </div>
          <p className="text-xs leading-relaxed text-rose-700">
            L’annulation retire l’activité de Situation, Transferts et Mon séjour. Le numéro de ticket reste mort : il n’est plus jamais redonné.
          </p>
        </form>
      ) : null}
    </div>
  );
}
