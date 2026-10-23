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
import {
  computeModifiedLineTotal,
  getLineAmountPaid,
  settleTicketAfterChange,
} from "../utils/ticketSettlement";
import { toast } from "../utils/toast.js";
import { logger } from "../utils/logger";
import { saveOpsComment } from "../utils/opsComment";

function findTicketLine(quotes, rawNumber) {
  const needle = String(rawNumber || "").trim().toLowerCase();
  if (!needle) return null;

  let modificationHit = null;
  for (const quote of quotes || []) {
    const items = quote.items || [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (item?.isCancelled === true) continue;
      const ticketNumber = String(item?.ticketNumber || "").trim().toLowerCase();
      if (!ticketNumber || ticketNumber !== needle) continue;
      if (item?.ticketKind === "modification") {
        if (!modificationHit) modificationHit = { quote, itemIndex: index, item };
        continue;
      }
      return { quote, itemIndex: index, item };
    }
  }

  if (!modificationHit) return null;

  const originNumber = String(modificationHit.item?.modificationOfTicket || "").trim().toLowerCase();
  if (!originNumber) return null;
  for (const quote of quotes || []) {
    if (String(quote.id) !== String(modificationHit.quote.id)) continue;
    const items = quote.items || [];
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (item?.ticketKind === "modification" || item?.isCancelled === true) continue;
      const ticketNumber = String(item?.ticketNumber || "").trim().toLowerCase();
      if (ticketNumber && ticketNumber === originNumber) {
        return { quote, itemIndex: index, item, viaModificationTicket: modificationHit.item };
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

function snapshotLabel(item) {
  const name = String(item?.activityName || "Activité").trim();
  const date = String(item?.date || "").slice(0, 10);
  const counts = [
    Number(item?.adults) ? `${item.adults} ad.` : "",
    Number(item?.children) ? `${item.children} enf.` : "",
    Number(item?.babies) ? `${item.babies} bébé` : "",
  ].filter(Boolean);
  return [name, date, counts.join(" ")].filter(Boolean).join(" · ");
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
  const [noteDrafts, setNoteDrafts] = useState({});

  const createdLines = useMemo(() => {
    const list = [];
    for (const quote of quotes || []) {
      (quote.items || []).forEach((item, index) => {
        if (item?.ticketKind !== "modification") return;
        const cancelled = item.cancellation === true || String(item.newActivityName || "").startsWith("Annulée");
        list.push({
          key: `${quote.id || quote.supabase_id}-${item.ticketNumber}-${index}`,
          quote,
          item,
          ticketNumber: String(item.ticketNumber || "").trim(),
          before: String(item.previousActivityName || "—").trim(),
          after: String(item.newActivityName || "—").trim(),
          client: String(quote.client?.name || "").trim(),
          hotel: String(quote.client?.hotel || "").trim(),
          date: String(item.date || "").slice(0, 10),
          cancelled,
          quoteId: quote.id,
          itemIndex: index,
          opsComment: String(item.opsComment || "").trim(),
        });
      });
    }
    list.sort((a, b) => b.ticketNumber.localeCompare(a.ticketNumber, "fr", { numeric: true }));
    return list;
  }, [quotes]);

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
      opsComment: String(item.opsComment || "").trim(),
      newPrice: "",
      balanceDue: false,
      balanceAmount: "",
    });
  };

  const openFoundTicket = (found, { announce = false } = {}) => {
    if (!found) return;
    fillForm(found);
    setQuery(String(found.item?.ticketNumber || "").trim());
    if (announce && found.viaModificationTicket) {
      toast.success(
        `Ticket d’origine ${found.item.ticketNumber} ouvert. Tu peux le modifier à nouveau.`
      );
    }
  };

  const search = async () => {
    const found = findTicketLine(quotes, query);
    setSearched(true);
    setDeadNote("");
    if (found) {
      openFoundTicket(found, { announce: Boolean(found.viaModificationTicket) });
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

  const reopenOriginalFromLine = (line) => {
    if (!line || line.cancelled) {
      toast.warning("Une ligne d’annulation ne peut plus être modifiée.");
      return;
    }
    const originNumber = String(line.item?.modificationOfTicket || "").trim();
    if (!originNumber) {
      toast.error("Impossible de retrouver le ticket d’origine.");
      return;
    }
    const found = findTicketLine(quotes, originNumber);
    if (!found || found.item?.ticketKind === "modification") {
      toast.error("Le ticket d’origine n’est plus modifiable.");
      return;
    }
    setSearched(true);
    setDeadNote("");
    openFoundTicket({ ...found, viaModificationTicket: line.item }, { announce: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    const duplicateInQuote = (quote.items || []).some((item, index) => {
      if (index === itemIndex) return false;
      const number = String(item.ticketNumber || "").trim();
      if (!number || number.toLowerCase() !== nextTicket.toLowerCase()) return false;
      const source = String(item.modificationOfTicket || "").trim();
      return !(item.ticketKind === "modification" && source.toLowerCase() === number.toLowerCase());
    });
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
    patched.opsComment = String(form.opsComment || "").trim();

    if (original.ticketKind === "modification") {
      const origin = findTicketLine(quotes, original.modificationOfTicket || "");
      if (origin && origin.item?.ticketKind !== "modification") {
        openFoundTicket({ ...origin, viaModificationTicket: original }, { announce: true });
        return;
      }
      toast.warning("Ouvre le ticket d’origine pour le modifier à nouveau.");
      return;
    }

    const previousActivityName = snapshotLabel(original);
    const nextActivityName = snapshotLabel(patched);
    const createsLine =
      activityChanged ||
      String(original.date || "").slice(0, 10) !== patched.date ||
      toCount(original.adults) !== patched.adults ||
      toCount(original.children) !== patched.children ||
      toCount(original.babies) !== patched.babies ||
      String(visiblePickupTime(original) || "") !== String(visiblePickupTime(patched) || "").trim() ||
      Boolean(original.meetAtHotelMarina) !== Boolean(patched.meetAtHotelMarina) ||
      newPrice != null ||
      balanceDue;
    const popup = createsLine ? window.open("about:blank", "_blank") : null;
    if (createsLine && !popup) {
      toast.error("Autorisez les fenêtres pop-up pour imprimer le ticket de modification.");
      return;
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
    if (newPrice != null) {
      const billable = items.filter((item) => item?.ticketKind !== "modification");
      const nextTotal = billable.reduce((sum, item) => sum + Math.round(Number(item.lineTotal) || 0), 0);
      updatedQuote.total = nextTotal;
      updatedQuote.totalCash = nextTotal;
      updatedQuote.totalCard = calculateCardPrice(nextTotal);
    }

    const previous = quotes;
    setSaving(true);
    const prevTicket = String(original.ticketNumber || "").trim();
    const ticketChanged = prevTicket.toLowerCase() !== nextTicket.toLowerCase();
    const quoteDbId = quote.supabase_id != null ? Number(quote.supabase_id) : null;

    try {
      if (createsLine && !supabase) {
        popup?.close();
        toast.error("Connexion indispensable pour créer le ticket de modification.");
        return;
      }
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
      if (createsLine) {
        modNumber = nextTicket;
        const amountPaid = getLineAmountPaid(original);
        const selectedActivity =
          activityOptions.find((activity) => activityOptionId(activity) === String(form.activityId)) || null;
        const computedPrice =
          newPrice != null
            ? newPrice
            : activityChanged ||
                toCount(original.adults) !== patched.adults ||
                toCount(original.children) !== patched.children ||
                toCount(original.babies) !== patched.babies
              ? computeModifiedLineTotal({
                  activity: selectedActivity,
                  adults: patched.adults,
                  children: patched.children,
                  babies: patched.babies,
                  neighborhood: quote.client?.neighborhood,
                  privateTransferTier: original.privateTransferTier,
                  originalItem: original,
                })
              : Math.round(Number(original.lineTotal) || 0);
        const settlement = settleTicketAfterChange({
          previousItem: original,
          nextLineTotal: computedPrice,
          activityName: patched.activityName || original.activityName,
          activityDate: patched.date,
          alreadyModified: Array.isArray(original.modifications) && original.modifications.length > 0,
        });
        if (newPrice != null || settlement.restAmount > 0 || settlement.refundAmount > 0) {
          patched.lineTotal = settlement.lineTotal;
          patched.amountPaid = settlement.amountPaid;
          patched.restAmount = balanceDue ? balanceAmount : settlement.restAmount;
          patched.refundAmount = settlement.refundAmount;
          patched.refundGross = settlement.refundGross;
          patched.refundLabel = settlement.refundLabel;
          patched.refundReason = settlement.refundReason;
          updatedQuote.items = items.map((item, index) => (index === itemIndex ? { ...patched } : item));
        }
        updatedQuote.items = [
          ...updatedQuote.items,
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
            lineTotal: settlement.lineTotal,
            amountPaid,
            restAmount: balanceDue ? balanceAmount : settlement.restAmount,
            refundAmount: settlement.refundAmount,
            refundGross: settlement.refundGross,
            refundLabel: settlement.refundLabel || "",
            refundReason: settlement.refundReason || "",
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
          popup?.close();
          toast.error("La modification n’a pas été enregistrée.");
          return;
        }
        if (ticketChanged && prevTicket) await releaseTicketAllocations(supabase, [prevTicket]);
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
        toast.success(`Ticket ${nextTicket} modifié. Le numéro reste le même.`);
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
    if (original.ticketKind === "modification") {
      const origin = findTicketLine(quotes, original.modificationOfTicket || "");
      if (origin && origin.item?.ticketKind !== "modification") {
        openFoundTicket({ ...origin, viaModificationTicket: original }, { announce: true });
        return;
      }
      toast.warning("Ouvre le ticket d’origine pour l’annuler.");
      return;
    }
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      toast.error("Autorisez les fenêtres pop-up pour imprimer le ticket d’annulation.");
      return;
    }
    const activity = String(original.activityName || "cette activité").trim();
    const confirmed = window.confirm(
      `Annuler le ticket ${ticket} (${activity}) ?\n\nL’activité disparaît de Situation, Transferts et Mon séjour. Une ligne d’annulation est créée. Le numéro ${ticket} est mort : il ne sera plus jamais redonné.`
    );
    if (!confirmed) {
      popup.close();
      return;
    }

    const previous = quotes;
    const quoteDbId = quote.supabase_id != null ? Number(quote.supabase_id) : null;
    setSaving(true);
    let reservation = null;
    try {
      if (!supabase) {
        popup.close();
        toast.error("Connexion indispensable pour créer la ligne d’annulation.");
        return;
      }
      const reserved = await commitTicketSequenceAfterPayment(supabase, [], { autoCount: 1, quotes });
      if (!reserved.ok || !reserved.reservedNumbers?.[0]) {
        popup.close();
        toast.error("Aucun numéro libre pour la ligne d’annulation.");
        return;
      }
      reservation = reserved.reservation;
      const kept = quote.items.filter((_, index) => index !== match.itemIndex);
      const special = {
        ticketKind: "modification",
        cancellation: true,
        ticketNumber: reserved.reservedNumbers[0],
        date: String(original.date || "").slice(0, 10),
        activityName: `Annulation · ${activity}`,
        previousActivityName: snapshotLabel(original),
        newActivityName: "Annulée",
        adults: 0,
        children: 0,
        babies: 0,
        lineTotal: 0,
        restAmount: 0,
        modificationOfTicket: ticket,
      };
      const nextItems = [...kept, special];
      const billable = nextItems.filter((item) => item?.ticketKind !== "modification");
      const nextTotal = billable.reduce((sum, item) => sum + Math.round(Number(item.lineTotal) || 0), 0);
      const { paidCash, paidStripe } = computePaidColumnsFromItems(billable);
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
        await rollbackTicketReservation(supabase, reservation);
        popup.close();
        toast.error("L’annulation n’a pas été enregistrée.");
        return;
      }
      const burned = await voidTicketAllocations(supabase, [ticket]);
      await confirmTicketAllocations(supabase, [special.ticketNumber], quoteDbId);
      setQuotes(nextQuotes);
      saveQuotesCache(nextQuotes);
      setMatch(null);
      setForm(null);
      setQuery("");
      setSearched(true);
      setDeadNote(
        burned.ok
          ? `Le ticket ${ticket} est annulé. Ligne ${special.ticketNumber} créée. Le numéro ${ticket} ne sera plus jamais redonné.`
          : `La ligne ${special.ticketNumber} est créée, mais le numéro ${ticket} n’a pas pu être annulé.`
      );
      showModificationTicket(popup, updatedQuote, special);
      toast.success(`Annulation enregistrée. Ligne ${special.ticketNumber} créée.`);
    } catch (err) {
      logger.error("Annulation ticket:", err);
      if (reservation) await rollbackTicketReservation(supabase, reservation);
      popup.close();
      setQuotes(previous);
      saveQuotesCache(previous);
      toast.error("L’annulation n’a pas abouti.");
    } finally {
      setSaving(false);
    }
  };

  const printCreatedLine = (line) => {
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      toast.error("Autorisez les fenêtres pop-up pour imprimer cette ligne.");
      return;
    }
    showModificationTicket(popup, line.quote, line.item);
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
            <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
              Commentaire
              <textarea
                value={form.opsComment}
                onChange={(event) => setField("opsComment", event.target.value)}
                onBlur={(event) => {
                  if (!match) return;
                  void saveOpsComment(quotes, setQuotes, match.quote.id, match.itemIndex, event.target.value).then((saved) => {
                    if (!saved.ok) toast.error("Le commentaire n’a pas été enregistré.");
                  });
                }}
                rows={2}
                placeholder="Visible dans Situation, non copié"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500"
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
            L’annulation retire l’activité de Situation, Transferts et Mon séjour, et crée une ligne d’annulation. Le numéro d’origine reste mort : il n’est plus jamais redonné.
          </p>
        </form>
      ) : null}

      <section className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-amber-700">Lignes créées</p>
        <h2 className="mt-1 text-lg font-bold text-slate-900">Activités modifiées ou annulées</h2>
        {createdLines.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Aucune ligne de modification ou d’annulation pour le moment.</p>
        ) : (
          <ul className="mt-3 max-h-[28rem] space-y-2 overflow-auto">
            {createdLines.map((line) => (
              <li key={line.key} className={`rounded-xl px-3 py-3 ring-1 ${line.cancelled ? "bg-rose-50 ring-rose-200" : "bg-amber-50 ring-amber-200"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-slate-900">
                      {line.cancelled ? "Annulation" : "Modification"} · {line.ticketNumber}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">{line.before}</p>
                    <p className="text-sm font-semibold text-slate-900">→ {line.after}</p>
                    <p className="mt-1 text-xs text-slate-500">{[line.client, line.hotel, line.date].filter(Boolean).join(" · ")}</p>
                    <input
                      type="text"
                      value={noteDrafts[line.key] ?? line.opsComment}
                      onChange={(event) => setNoteDrafts((prev) => ({ ...prev, [line.key]: event.target.value }))}
                      onBlur={(event) => {
                        void saveOpsComment(quotes, setQuotes, line.quoteId, line.itemIndex, event.target.value).then((saved) => {
                          if (!saved.ok) toast.error("Le commentaire n’a pas été enregistré.");
                          else {
                            setNoteDrafts((prev) => {
                              if (!(line.key in prev)) return prev;
                              const copy = { ...prev };
                              delete copy[line.key];
                              return copy;
                            });
                          }
                        });
                      }}
                      placeholder="Commentaire, visible dans Situation"
                      aria-label={`Commentaire de la ligne ${line.ticketNumber}`}
                      className="mt-2 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex shrink-0 flex-col gap-2">
                    {!line.cancelled ? (
                      <button
                        type="button"
                        onClick={() => reopenOriginalFromLine(line)}
                        className="h-10 rounded-xl bg-indigo-600 px-3 text-xs font-bold text-white hover:bg-indigo-700"
                      >
                        Modifier à nouveau
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => printCreatedLine(line)}
                      className="h-10 rounded-xl bg-slate-900 px-3 text-xs font-bold text-white"
                    >
                      Imprimer
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
