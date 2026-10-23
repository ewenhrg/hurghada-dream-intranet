import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { SITE_KEY } from "../constants";
import { currencyNoCents, normalizeQuoteItemsFromDb, saveQuotesCache } from "../utils";
import { generateTicketsHTML } from "../utils/printTemplates";
import { normalizeReservationCode } from "../utils/clientStay";
import { persistQuoteItemsToSupabase } from "../utils/persistQuoteItems";
import { computeActivityTransferSurcharge } from "../utils/transferPricing";
import { itemWithPickupSchedule } from "../utils/pickupSchedule";
import {
  commitTicketSequenceAfterPayment,
  confirmTicketAllocations,
  rollbackTicketReservation,
  voidTicketAllocations,
} from "../utils/ticketSequence";
import { formatStayDay, modificationTooLate, paxLabel } from "../utils/modificationRequest";
import { toast } from "../utils/toast";
import { logger } from "../utils/logger";

function describeRequest(row) {
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  if (row.kind === "cancel") return `Annulation · ${row.refund_percent ?? 0} %`;
  if (row.change_type === "pickup") return `Heure de prise en charge → ${payload.pickup || "—"}`;
  if (row.change_type === "pax") return `Personnes → ${paxLabel(payload.adults, payload.children, payload.babies)}`;
  if (row.change_type === "date") return `Date → ${formatStayDay(payload.date)}`;
  if (row.change_type === "activity") return `Activité → ${payload.activityName || "—"} · ${formatStayDay(payload.date)}`;
  return "Modification";
}

function estimateLineTotal(activity, counts, neighborhood) {
  if (!activity) return null;
  const adults = Math.max(0, Math.round(Number(counts.adults) || 0));
  const children = Math.max(0, Math.round(Number(counts.children) || 0));
  const babies = Math.max(0, Math.round(Number(counts.babies) || 0));
  const base =
    adults * Number(activity.priceAdult || activity.price_adult || 0) +
    children * Number(activity.priceChild || activity.price_child || 0) +
    babies * Number(activity.priceBaby || activity.price_baby || 0);
  const transferInfo = neighborhood ? activity.transfers?.[neighborhood] : null;
  const transfer = computeActivityTransferSurcharge(transferInfo, activity, { adults, children, babies });
  const total = Math.round(base + (Number(transfer) || 0));
  return total > 0 ? total : null;
}

function findLocalQuote(quotes, row) {
  const code = normalizeReservationCode(row.reservation_code);
  const ticket = String(row.ticket_number || "").trim().toLowerCase();
  for (const quote of quotes || []) {
    if (normalizeReservationCode(quote.reservationCode) !== code) continue;
    const items = quote.items || [];
    const byTicket = ticket
      ? items.findIndex(
          (item) =>
            item?.ticketKind !== "modification" &&
            String(item.ticketNumber || "").trim().toLowerCase() === ticket
        )
      : -1;
    if (byTicket >= 0) return { quote, index: byTicket };
    const byActivity = items.findIndex(
      (item) =>
        item?.ticketKind !== "modification" &&
        String(item.activityName || "").trim() === String(row.activity_name || "").trim() &&
        String(item.date || "").slice(0, 10) === String(row.activity_date || "").slice(0, 10)
    );
    if (byActivity >= 0) return { quote, index: byActivity };
  }
  return null;
}

function quoteFromRow(row) {
  return {
    id: String(row.id),
    supabase_id: row.id,
    reservationCode: row.reservation_code || "",
    currency: row.currency || "EUR",
    total: Number(row.total) || 0,
    client: {
      name: row.client_name || "",
      phone: row.client_phone || "",
      hotel: row.client_hotel || "",
      room: row.client_room || "",
      neighborhood: row.client_neighborhood || "",
    },
    items: normalizeQuoteItemsFromDb(row.items),
  };
}

export function ModificationRequestsPage({ quotes = [], setQuotes, activities = [] }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const reload = useCallback(async () => {
    if (!supabase) return;
    const { data, error: loadError } = await supabase
      .from("public_modification_requests")
      .select("id, reservation_code, ticket_number, client_name, client_phone, hotel, activity_name, activity_date, kind, change_type, payload, refund_percent, status, created_at")
      .eq("site_key", SITE_KEY)
      .order("created_at", { ascending: false });
    if (loadError) {
      setError("Les demandes n’ont pas pu être chargées.");
      return;
    }
    setError("");
    setRows(data || []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    reload().catch(() => {
      if (!cancelled) setError("Les demandes n’ont pas pu être chargées.");
    });
    if (!supabase) return undefined;
    const channel = supabase
      .channel("public-modification-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "public_modification_requests" }, () => {
        if (!cancelled) reload();
      })
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [reload]);

  const pending = rows.filter((row) => row.status === "pending");

  const setStatus = async (id, status) => {
    const { error: updateError } = await supabase
      .from("public_modification_requests")
      .update({ status })
      .eq("id", id)
      .eq("site_key", SITE_KEY);
    if (updateError) {
      setError("Le statut n’a pas été enregistré.");
      return false;
    }
    setRows((current) => current.map((row) => (row.id === id ? { ...row, status } : row)));
    return true;
  };

  const accept = async (row) => {
    if (!supabase || busyId) return;
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      toast.error("Autorisez les fenêtres pop-up pour imprimer la ligne créée.");
      return;
    }
    setBusyId(row.id);
    setError("");
    try {
      let found = findLocalQuote(quotes, row);
      if (!found) {
        const { data, error: quoteError } = await supabase
          .from("quotes")
          .select("id, items, client_name, client_phone, client_hotel, client_room, client_neighborhood, reservation_code, total, currency")
          .eq("site_key", SITE_KEY)
          .eq("reservation_code", normalizeReservationCode(row.reservation_code))
          .limit(10);
        if (quoteError) throw quoteError;
        for (const remote of data || []) {
          const local = quoteFromRow(remote);
          found = findLocalQuote([local], row);
          if (found) break;
        }
      }
      if (!found) {
        popup?.close();
        setError("Le devis de cette réservation est introuvable. La demande n’a pas été validée.");
        return;
      }

      const quote = found.quote;
      const original = quote.items[found.index];
      const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
      const sameActivity = (item, id, name) => {
        const wantedId = String(id || "").trim();
        if (wantedId && (String(item?.supabase_id ?? "") === wantedId || String(item?.id ?? "") === wantedId)) return true;
        const wantedName = String(name || "").trim();
        return wantedName.length > 0 && String(item?.name || "").trim() === wantedName;
      };
      const activity = (activities || []).find((item) => sameActivity(item, payload.activityId, payload.activityName));
      const currentActivity = (activities || []).find((item) => sameActivity(item, original.activityId, original.activityName));
      let nextItem = { ...original };
      let previousLabel = String(original.activityName || row.activity_name || "Activité");
      let nextLabel = previousLabel;

      if (row.kind === "cancel") {
        nextItem = null;
        previousLabel = String(original.activityName || row.activity_name || "Activité");
        nextLabel = `Annulée · ${row.refund_percent ?? 0} %`;
      } else if (row.change_type === "pickup") {
        const patch = itemWithPickupSchedule(original, payload.pickup);
        nextItem = patch || { ...original, pickupTime: payload.pickup, pickupPublished: true };
        previousLabel = `${previousLabel} · ${original.pickupTime || "heure actuelle"}`;
        nextLabel = `${original.activityName || previousLabel} · ${payload.pickup || "—"}`;
      } else if (row.change_type === "pax") {
        nextItem = {
          ...original,
          adults: Math.round(Number(payload.adults) || 0),
          children: Math.round(Number(payload.children) || 0),
          babies: Math.round(Number(payload.babies) || 0),
        };
        const priced = estimateLineTotal(currentActivity, nextItem, quote.client?.neighborhood);
        if (priced != null) nextItem.lineTotal = priced;
        previousLabel = `${original.activityName} · ${paxLabel(original.adults, original.children, original.babies)}`;
        nextLabel = `${original.activityName} · ${paxLabel(nextItem.adults, nextItem.children, nextItem.babies)}`;
      } else if (row.change_type === "date") {
        nextItem = { ...original, date: String(payload.date || "").slice(0, 10) };
        previousLabel = `${original.activityName} · ${formatStayDay(original.date)}`;
        nextLabel = `${original.activityName} · ${formatStayDay(nextItem.date)}`;
      } else if (row.change_type === "activity") {
        nextItem = {
          ...original,
          activityId: activity?.id ?? payload.activityId,
          activityName: activity?.name || payload.activityName || original.activityName,
          activityNameEn: "",
          date: String(payload.date || original.date || "").slice(0, 10),
        };
        const priced = estimateLineTotal(activity, nextItem, quote.client?.neighborhood);
        if (priced != null) nextItem.lineTotal = priced;
        nextLabel = nextItem.activityName;
      }

      let items = quote.items.filter((_, index) => index !== found.index);
      if (nextItem) items = [...quote.items.slice(0, found.index), nextItem, ...quote.items.slice(found.index + 1)];
      const billable = items.filter((item) => item?.ticketKind !== "modification");
      let special = null;
      let reservation = null;
      if (nextItem || row.kind === "cancel") {
        const originalNumber = String(original.ticketNumber || "").trim();
        let ticketNumber = originalNumber;
        if (row.kind === "cancel" || !ticketNumber) {
          const reserved = await commitTicketSequenceAfterPayment(supabase, [], { autoCount: 1, quotes });
          if (!reserved.ok || !reserved.reservedNumbers?.[0]) {
            popup?.close();
            setError(row.kind === "cancel" ? "Aucun numéro libre pour la ligne d’annulation." : "Ce ticket n’a pas de numéro.");
            return;
          }
          reservation = reserved.reservation;
          ticketNumber = reserved.reservedNumbers[0];
        }
        const source = nextItem || original;
        const difference = nextItem
          ? Math.max(0, Math.round(Number(nextItem.lineTotal) || 0) - Math.round(Number(original.lineTotal) || 0))
          : 0;
        special = {
          ticketKind: "modification",
          cancellation: row.kind === "cancel",
          ticketNumber,
          date: String(source.date || row.activity_date || "").slice(0, 10),
          activityName: row.kind === "cancel"
            ? `Annulation · ${previousLabel}`
            : `Modification · ${previousLabel} → ${nextLabel}`,
          previousActivityName: previousLabel,
          newActivityName: nextLabel,
          adults: row.kind === "cancel" ? 0 : source.adults,
          children: row.kind === "cancel" ? 0 : source.children,
          babies: row.kind === "cancel" ? 0 : source.babies,
          lineTotal: 0,
          restAmount: difference,
          pickupTime: source.pickupTime,
          pickupPublished: source.pickupPublished,
          meetAtHotelMarina: source.meetAtHotelMarina === true,
          modificationOfTicket: String(original.ticketNumber || ""),
        };
        items = [...items, special];
      }

      const nextTotal = billable.reduce((sum, item) => sum + Math.round(Number(item.lineTotal) || 0), 0);
      const updatedAt = new Date().toISOString();
      const updatedQuote = { ...quote, items, total: nextTotal, totalCash: nextTotal, updated_at: updatedAt };
      const saved = await persistQuoteItemsToSupabase(updatedQuote, items, { updatedAt, notifyStay: true });
      if (!saved.ok) {
        if (reservation) await rollbackTicketReservation(supabase, reservation);
        popup?.close();
        setError("La modification n’a pas été enregistrée dans le devis.");
        return;
      }
      if (updatedQuote.supabase_id) {
        await supabase.from("quotes").update({ total: nextTotal }).eq("id", updatedQuote.supabase_id).eq("site_key", SITE_KEY);
      }
      if (!nextItem) {
        const ticket = String(original.ticketNumber || "").trim();
        if (ticket) {
          const burned = await voidTicketAllocations(supabase, [ticket]);
          if (!burned.ok) setError("L’activité est retirée, mais le numéro de ticket n’a pas pu être annulé.");
        }
      }
      const quoteDbId = updatedQuote.supabase_id != null ? Number(updatedQuote.supabase_id) : null;
      if (special && reservation) {
        await confirmTicketAllocations(supabase, [special.ticketNumber], Number.isFinite(quoteDbId) ? quoteDbId : null);
      }
      const key = String(updatedQuote.supabase_id || updatedQuote.id);
      const base = Array.isArray(quotes) ? quotes : [];
      const exists = base.some((item) => String(item.supabase_id || item.id) === key);
      const nextQuotes = exists
        ? base.map((item) => (String(item.supabase_id || item.id) === key ? { ...item, ...updatedQuote } : item))
        : [updatedQuote, ...base];
      if (typeof setQuotes === "function") setQuotes(nextQuotes);
      saveQuotesCache(nextQuotes);
      const marked = await setStatus(row.id, "accepted");
      if (!marked) return;
      if (special && popup) {
        popup.location.href = URL.createObjectURL(new Blob([generateTicketsHTML({ ...updatedQuote, items: [special], paymentRestAmount: 0 })], { type: "text/html;charset=utf-8" }));
        toast.success(
          reservation
            ? `Demande validée. Ticket spécial ${special.ticketNumber} créé.`
            : `Demande validée. Le ticket ${special.ticketNumber} garde son numéro.`
        );
      } else {
        toast.success("Annulation validée. La ligne d’annulation est créée, et Situation, les transferts et Mon séjour sont à jour.");
      }
    } catch (err) {
      logger.error("Validation demande modification:", err);
      popup?.close();
      setError("La validation n’a pas abouti.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {error ? <p className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">{error}</p> : null}
      <div className="rounded-2xl bg-white p-4 ring-1 ring-indigo-100">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-indigo-600">Demandes modif</p>
        <p className="text-sm font-semibold text-slate-700">{pending.length} en attente</p>
      </div>
      {pending.length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-slate-500 ring-1 ring-slate-200">Aucune demande en attente.</p>
      ) : (
        <ul className="space-y-3">
          {pending.map((row) => (
            <li key={row.id} className="rounded-2xl bg-white p-4 text-slate-900 ring-1 ring-slate-200">
              <p className="text-base font-extrabold">{row.client_name || "Client"}</p>
              <p className="mt-1 text-sm font-semibold text-indigo-700">{row.activity_name} · {formatStayDay(row.activity_date)}</p>
              <p className="mt-1 text-sm text-slate-600">{row.reservation_code}{row.ticket_number ? ` · ticket ${row.ticket_number}` : ""}</p>
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">{describeRequest(row)}</p>
              {row.kind === "modify" && modificationTooLate(row.activity_date) ? (
                <p className="mt-2 text-sm font-semibold text-rose-700">Activité demain ou aujourd’hui : la modification n’est en principe plus possible.</p>
              ) : null}
              {row.hotel ? <p className="mt-2 text-sm text-slate-600">{row.hotel}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" disabled={busyId === row.id} onClick={() => void accept(row)} className="min-h-10 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white disabled:opacity-60">
                  {busyId === row.id ? "Validation…" : "Valider"}
                </button>
                <button type="button" disabled={busyId === row.id} onClick={() => void setStatus(row.id, "refused")} className="min-h-10 rounded-xl bg-slate-200 px-3 text-xs font-bold text-slate-800">
                  Refuser
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
