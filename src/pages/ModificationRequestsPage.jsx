import { useCallback, useEffect, useMemo, useState } from "react";
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
import { formatStayDay, modificationTooLate, paxLabel, refundLabel } from "../utils/modificationRequest";
import { getLineAmountPaid, settleTicketAfterChange } from "../utils/ticketSettlement";
import { Pill } from "../components/ui";
import { toast } from "../utils/toast";
import { logger } from "../utils/logger";

const STATUS = {
  pending: "pending",
  refused: "refused",
  toSend: "to_send",
  sent: "sent",
  toRefund: "to_refund",
  done: "done",
  /** Ancien statut (migré vers to_send). */
  accepted: "accepted",
};

const FILTERS = {
  all: "all",
  pending: "pending",
  modifications: "modifications",
  toSend: "to_send",
  toRefund: "to_refund",
  treated: "treated",
};

function describeRequest(row) {
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  if (row.kind === "cancel") return `Annulation · ${row.refund_percent ?? 0} %`;
  if (row.change_type === "pickup") return `Heure de prise en charge → ${payload.pickup || "—"}`;
  if (row.change_type === "pax") return `Personnes → ${paxLabel(payload.adults, payload.children, payload.babies)}`;
  if (row.change_type === "date") return `Date → ${formatStayDay(payload.date)}`;
  if (row.change_type === "activity") return `Activité → ${payload.activityName || "—"} · ${formatStayDay(payload.date)}`;
  return "Modification";
}

function workflowOf(row) {
  const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};
  return payload.workflow && typeof payload.workflow === "object" ? payload.workflow : {};
}

function withWorkflow(row, patch) {
  const payload = row.payload && typeof row.payload === "object" ? { ...row.payload } : {};
  payload.workflow = { ...workflowOf(row), ...patch };
  return payload;
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

function openSpecialTicket(quote, special) {
  const popup = window.open("about:blank", "_blank");
  if (!popup) {
    toast.error("Autorisez les fenêtres pop-up pour ouvrir le ticket.");
    return false;
  }
  const html = generateTicketsHTML({
    ...quote,
    items: [special],
    paymentRestAmount: Math.round(Number(special?.restAmount) || 0),
  });
  popup.location.href = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  return true;
}

function findSpecialTicket(quotes, row) {
  const wf = workflowOf(row);
  const ticket = String(wf.specialTicketNumber || "").trim().toLowerCase();
  const quoteKey = String(wf.quoteId || "").trim();
  for (const quote of quotes || []) {
    if (quoteKey && String(quote.supabase_id || quote.id) !== quoteKey) continue;
    const items = quote.items || [];
    if (ticket) {
      const hit = items.find(
        (item) =>
          item?.ticketKind === "modification" &&
          String(item.ticketNumber || "").trim().toLowerCase() === ticket
      );
      if (hit) return { quote, special: hit };
    }
    const byOrigin = items.find(
      (item) =>
        item?.ticketKind === "modification" &&
        String(item.modificationOfTicket || "").trim().toLowerCase() ===
          String(row.ticket_number || "").trim().toLowerCase()
    );
    if (byOrigin) return { quote, special: byOrigin };
  }
  return null;
}

function statusLabel(status) {
  switch (status) {
    case STATUS.pending:
      return "En attente";
    case STATUS.toSend:
    case STATUS.accepted:
      return "Confirmation à envoyer";
    case STATUS.sent:
      return "Envoyé au client";
    case STATUS.toRefund:
      return "À rembourser";
    case STATUS.done:
      return "Traité";
    case STATUS.refused:
      return "Refusé";
    default:
      return status || "—";
  }
}

export function ModificationRequestsPage({ quotes = [], setQuotes, activities = [] }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [filter, setFilter] = useState(FILTERS.pending);
  const [restDrafts, setRestDrafts] = useState({});

  const reload = useCallback(async () => {
    if (!supabase) return;
    const { data, error: loadError } = await supabase
      .from("public_modification_requests")
      .select(
        "id, reservation_code, ticket_number, client_name, client_phone, hotel, activity_name, activity_date, kind, change_type, payload, refund_percent, status, created_at"
      )
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

  const counts = useMemo(() => {
    const all = rows.length;
    const pending = rows.filter((row) => row.status === STATUS.pending).length;
    const modifications = rows.filter(
      (row) => row.status === STATUS.pending && row.kind === "modify"
    ).length;
    const toSend = rows.filter(
      (row) => row.status === STATUS.toSend || row.status === STATUS.accepted
    ).length;
    const toRefund = rows.filter((row) => row.status === STATUS.toRefund).length;
    const treated = rows.filter((row) => row.status === STATUS.done).length;
    return { all, pending, modifications, toSend, toRefund, treated };
  }, [rows]);

  const visible = useMemo(() => {
    switch (filter) {
      case FILTERS.pending:
        return rows.filter((row) => row.status === STATUS.pending);
      case FILTERS.modifications:
        return rows.filter((row) => row.status === STATUS.pending && row.kind === "modify");
      case FILTERS.toSend:
        return rows.filter((row) => row.status === STATUS.toSend || row.status === STATUS.accepted);
      case FILTERS.toRefund:
        return rows.filter((row) => row.status === STATUS.toRefund);
      case FILTERS.treated:
        return rows.filter((row) => row.status === STATUS.done);
      case FILTERS.all:
      default:
        return rows;
    }
  }, [filter, rows]);

  const patchRow = async (id, fields) => {
    const { error: updateError } = await supabase
      .from("public_modification_requests")
      .update(fields)
      .eq("id", id)
      .eq("site_key", SITE_KEY);
    if (updateError) {
      const msg = String(updateError.message || "");
      if (/status|check/i.test(msg)) {
        setError(
          "Statuts workflow absents en base : exécutez supabase_public_modification_requests_workflow.sql dans Supabase."
        );
      } else {
        setError("Le statut n’a pas été enregistré.");
      }
      return false;
    }
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...fields } : row)));
    return true;
  };

  const setStatus = async (id, status) => patchRow(id, { status });

  const accept = async (row) => {
    if (!supabase || busyId) return;
    setBusyId(row.id);
    setError("");
    try {
      let found = findLocalQuote(quotes, row);
      if (!found) {
        const { data, error: quoteError } = await supabase
          .from("quotes")
          .select(
            "id, items, client_name, client_phone, client_hotel, client_room, client_neighborhood, reservation_code, total, currency"
          )
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
        setError("Le devis de cette réservation est introuvable. La demande n’a pas été validée.");
        return;
      }

      const quote = found.quote;
      const original = quote.items[found.index];
      const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
      const sameActivity = (item, id, name) => {
        const wantedId = String(id || "").trim();
        if (wantedId && (String(item?.supabase_id ?? "") === wantedId || String(item?.id ?? "") === wantedId)) {
          return true;
        }
        const wantedName = String(name || "").trim();
        return wantedName.length > 0 && String(item?.name || "").trim() === wantedName;
      };
      const activity = (activities || []).find((item) => sameActivity(item, payload.activityId, payload.activityName));
      const currentActivity = (activities || []).find((item) =>
        sameActivity(item, original.activityId, original.activityName)
      );
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

      let settlement;
      if (row.kind === "cancel") {
        const amountPaid = getLineAmountPaid(original);
        const percent = Math.max(0, Math.min(100, Math.round(Number(row.refund_percent) || 0)));
        const rate = percent / 100;
        const refundAmount = Math.round(amountPaid * rate);
        settlement = {
          amountPaid,
          lineTotal: 0,
          restAmount: 0,
          refundGross: amountPaid,
          refundAmount,
          refundLabel: refundLabel(percent),
          refundReason: `Demande client · ${percent} %`,
        };
      } else {
        settlement = settleTicketAfterChange({
          previousItem: original,
          nextLineTotal: nextItem
            ? Math.round(Number(nextItem.lineTotal) || 0)
            : Math.round(Number(original.lineTotal) || 0),
          activityName: String(nextItem?.activityName || original.activityName || row.activity_name || ""),
          activityDate: String(nextItem?.date || original.date || row.activity_date || "").slice(0, 10),
          alreadyModified: Array.isArray(original.modifications) && original.modifications.length > 0,
        });
        if (
          nextItem &&
          (settlement.restAmount > 0 ||
            settlement.refundAmount > 0 ||
            settlement.lineTotal !== Math.round(Number(original.lineTotal) || 0))
        ) {
          nextItem = {
            ...nextItem,
            lineTotal: settlement.lineTotal,
            amountPaid: settlement.amountPaid,
            restAmount: settlement.restAmount,
          };
        }
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
            setError(
              row.kind === "cancel"
                ? "Aucun numéro libre pour la ligne d’annulation."
                : "Ce ticket n’a pas de numéro."
            );
            return;
          }
          reservation = reserved.reservation;
          ticketNumber = reserved.reservedNumbers[0];
        }
        const source = nextItem || original;
        const enteredAt = new Date().toISOString();
        special = {
          ticketKind: "modification",
          cancellation: row.kind === "cancel",
          ticketNumber,
          date: String(source.date || row.activity_date || "").slice(0, 10),
          activityName:
            row.kind === "cancel"
              ? `Annulation · ${previousLabel}`
              : `Modification · ${previousLabel} → ${nextLabel}`,
          previousActivityName: previousLabel,
          newActivityName: nextLabel,
          adults: row.kind === "cancel" ? 0 : source.adults,
          children: row.kind === "cancel" ? 0 : source.children,
          babies: row.kind === "cancel" ? 0 : source.babies,
          lineTotal: settlement.lineTotal,
          amountPaid: settlement.amountPaid,
          restAmount: settlement.restAmount,
          refundAmount: settlement.refundAmount,
          refundGross: settlement.refundGross,
          refundLabel: settlement.refundLabel || "",
          refundReason: settlement.refundReason || "",
          pickupTime: source.pickupTime,
          pickupPublished: source.pickupPublished,
          meetAtHotelMarina: source.meetAtHotelMarina === true,
          modificationOfTicket: String(original.ticketNumber || ""),
          ticketsEnteredAt: enteredAt,
          createdAt: enteredAt,
        };
        items = [...items, special];
      }

      const nextTotal = billable.reduce((sum, item) => sum + Math.round(Number(item.lineTotal) || 0), 0);
      const updatedAt = new Date().toISOString();
      const updatedQuote = { ...quote, items, total: nextTotal, totalCash: nextTotal, updated_at: updatedAt };
      const saved = await persistQuoteItemsToSupabase(updatedQuote, items, { updatedAt, notifyStay: true });
      if (!saved.ok) {
        if (reservation) await rollbackTicketReservation(supabase, reservation);
        setError("La modification n’a pas été enregistrée dans le devis.");
        return;
      }
      if (updatedQuote.supabase_id) {
        await supabase
          .from("quotes")
          .update({ total: nextTotal })
          .eq("id", updatedQuote.supabase_id)
          .eq("site_key", SITE_KEY);
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

      const nextPayload = withWorkflow(row, {
        specialTicketNumber: special?.ticketNumber || "",
        quoteId: String(updatedQuote.supabase_id || updatedQuote.id || ""),
        refundAmount: Math.round(Number(settlement.refundAmount) || 0),
        restAmount: Math.round(Number(settlement.restAmount) || 0),
        amountPaid: Math.round(Number(settlement.amountPaid) || 0),
        lineTotal: Math.round(Number(settlement.lineTotal) || 0),
        previousLabel,
        nextLabel,
        validatedAt: new Date().toISOString(),
      });
      const marked = await patchRow(row.id, { status: STATUS.toSend, payload: nextPayload });
      if (!marked) return;
      setFilter(FILTERS.toSend);
      setRestDrafts((current) => ({
        ...current,
        [row.id]: String(Math.round(Number(settlement.restAmount) || 0) || ""),
      }));
      toast.success(
        special
          ? `Demande validée. Confirmation à envoyer (ticket ${special.ticketNumber}).`
          : "Demande validée. Confirmation à envoyer au client."
      );
    } catch (err) {
      logger.error("Validation demande modification:", err);
      setError("La validation n’a pas abouti.");
    } finally {
      setBusyId(null);
    }
  };

  const markSentToClient = async (row) => {
    if (busyId) return;
    setBusyId(row.id);
    setError("");
    try {
      const hit = findSpecialTicket(quotes, row);
      if (hit) {
        openSpecialTicket(hit.quote, {
          ...hit.special,
          restAmount:
            restDrafts[row.id] != null && String(restDrafts[row.id]).trim() !== ""
              ? Math.round(Number(restDrafts[row.id]) || 0)
              : hit.special.restAmount,
        });
      } else {
        toast.warning("Ticket modifié introuvable dans le devis — statut mis à jour quand même.");
      }

      // Depuis « confirmation à envoyer » : impression = fin de parcours (ou file remboursements).
      const fromToSend = row.status === STATUS.toSend || row.status === STATUS.accepted;
      if (!fromToSend) {
        toast.success("Ticket ouvert.");
        return;
      }

      const wf = workflowOf(row);
      const refundAmount = Math.round(Number(wf.refundAmount) || 0);
      if (refundAmount > 0) {
        const nextPayload = withWorkflow(row, {
          sentToClientAt: new Date().toISOString(),
          sentToClient: true,
        });
        const ok = await patchRow(row.id, { status: STATUS.toRefund, payload: nextPayload });
        if (!ok) return;
        setFilter(FILTERS.toRefund);
        toast.success("Ticket ouvert — demande placée dans « À rembourser ».");
        return;
      }

      const nextPayload = withWorkflow(row, {
        sentToClientAt: new Date().toISOString(),
        sentToClient: true,
        treated: true,
        treatedAt: new Date().toISOString(),
      });
      const ok = await patchRow(row.id, { status: STATUS.done, payload: nextPayload });
      if (!ok) return;
      setFilter(FILTERS.treated);
      toast.success("Ticket ouvert — demande placée dans « Demande traité ».");
    } finally {
      setBusyId(null);
    }
  };

  const saveRestAmount = async (row) => {
    if (busyId) return;
    const restAmount = Math.max(0, Math.round(Number(restDrafts[row.id]) || 0));
    setBusyId(row.id);
    setError("");
    try {
      const nextPayload = withWorkflow(row, { restAmount });
      const ok = await patchRow(row.id, { payload: nextPayload });
      if (!ok) return;

      const hit = findSpecialTicket(quotes, row);
      if (hit && typeof setQuotes === "function") {
        const nextItems = (hit.quote.items || []).map((item) =>
          item === hit.special ||
          (item?.ticketKind === "modification" &&
            String(item.ticketNumber || "") === String(hit.special.ticketNumber || ""))
            ? { ...item, restAmount }
            : item
        );
        const updatedQuote = { ...hit.quote, items: nextItems, updated_at: new Date().toISOString() };
        const saved = await persistQuoteItemsToSupabase(updatedQuote, nextItems, {
          updatedAt: updatedQuote.updated_at,
          notifyStay: false,
        });
        if (saved.ok) {
          const key = String(updatedQuote.supabase_id || updatedQuote.id);
          setQuotes((prev) =>
            (prev || []).map((item) =>
              String(item.supabase_id || item.id) === key ? { ...item, ...updatedQuote } : item
            )
          );
          saveQuotesCache(
            (quotes || []).map((item) =>
              String(item.supabase_id || item.id) === key ? { ...item, ...updatedQuote } : item
            )
          );
        }
      }
      toast.success(
        restAmount > 0
          ? `Reste à payer enregistré : ${currencyNoCents(restAmount, "EUR")}.`
          : "Reste à payer effacé."
      );
    } finally {
      setBusyId(null);
    }
  };

  const moveToRefund = async (row) => {
    if (busyId) return;
    setBusyId(row.id);
    try {
      const ok = await setStatus(row.id, STATUS.toRefund);
      if (!ok) return;
      setFilter(FILTERS.toRefund);
      toast.success("Demande déplacée dans « À rembourser ».");
    } finally {
      setBusyId(null);
    }
  };

  const markTreated = async (row) => {
    if (busyId) return;
    setBusyId(row.id);
    try {
      const nextPayload = withWorkflow(row, {
        treated: true,
        treatedAt: new Date().toISOString(),
        refundedAt: new Date().toISOString(),
      });
      const ok = await patchRow(row.id, { status: STATUS.done, payload: nextPayload });
      if (!ok) return;
      setFilter(FILTERS.treated);
      toast.success("Demande déplacée dans « Demande traité ».");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">
          {error}
        </p>
      ) : null}

      <div className="space-y-3 rounded-2xl border border-indigo-200/80 bg-indigo-50/40 px-4 py-3 shadow-sm sm:px-5 sm:py-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill type="button" tone="light" active={filter === FILTERS.all} onClick={() => setFilter(FILTERS.all)} className="!px-3.5 !py-2 !text-xs">
            All ({counts.all})
          </Pill>
          <Pill type="button" tone="light" active={filter === FILTERS.pending} onClick={() => setFilter(FILTERS.pending)} className="!px-3.5 !py-2 !text-xs">
            En attente ({counts.pending})
          </Pill>
          <Pill
            type="button"
            tone="light"
            active={filter === FILTERS.modifications}
            onClick={() => setFilter(FILTERS.modifications)}
            className="!px-3.5 !py-2 !text-xs"
          >
            Modifications ({counts.modifications})
          </Pill>
          <Pill type="button" tone="light" active={filter === FILTERS.toSend} onClick={() => setFilter(FILTERS.toSend)} className="!px-3.5 !py-2 !text-xs">
            Confirmation à envoyer ({counts.toSend})
          </Pill>
          <Pill
            type="button"
            tone="light"
            active={filter === FILTERS.toRefund}
            onClick={() => setFilter(FILTERS.toRefund)}
            className="!px-3.5 !py-2 !text-xs"
          >
            À rembourser ({counts.toRefund})
          </Pill>
          <Pill
            type="button"
            tone="light"
            active={filter === FILTERS.treated}
            onClick={() => setFilter(FILTERS.treated)}
            className="!px-3.5 !py-2 !text-xs"
          >
            Demande traité ({counts.treated})
          </Pill>
        </div>
        <p className="text-[11px] font-medium text-indigo-900/75">
          Valider → confirmation à envoyer → cocher « Envoyé au client » (imprime le ticket) → Demande
          traité. S’il y a un remboursement : À rembourser → case Traité.
        </p>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-8 text-center text-sm text-slate-500 ring-1 ring-slate-200">
          Aucune demande dans ce filtre.
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((row) => {
            const wf = workflowOf(row);
            const refundAmount = Math.round(Number(wf.refundAmount) || 0);
            const restAmount = Math.round(Number(wf.restAmount) || 0);
            const restValue =
              restDrafts[row.id] != null ? restDrafts[row.id] : restAmount > 0 ? String(restAmount) : "";
            const isPending = row.status === STATUS.pending;
            const isToSend = row.status === STATUS.toSend || row.status === STATUS.accepted;
            const isToRefund = row.status === STATUS.toRefund;
            const isTreated = row.status === STATUS.done;
            const busy = busyId === row.id;

            return (
              <li key={row.id} className="rounded-2xl bg-white p-4 text-slate-900 ring-1 ring-slate-200">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-extrabold">{row.client_name || "Client"}</p>
                    <p className="mt-1 text-sm font-semibold text-indigo-700">
                      {row.activity_name} · {formatStayDay(row.activity_date)}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {row.reservation_code}
                      {row.ticket_number ? ` · ticket ${row.ticket_number}` : ""}
                      {wf.specialTicketNumber ? ` · spécial ${wf.specialTicketNumber}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-700">
                    {statusLabel(row.status)}
                    {row.kind === "cancel" ? " · Annulation" : " · Modif"}
                  </span>
                </div>

                <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
                  {describeRequest(row)}
                </p>
                {row.kind === "modify" && modificationTooLate(row.activity_date) ? (
                  <p className="mt-2 text-sm font-semibold text-rose-700">
                    Activité demain ou aujourd’hui : la modification n’est en principe plus possible.
                  </p>
                ) : null}
                {row.hotel ? <p className="mt-2 text-sm text-slate-600">{row.hotel}</p> : null}

                {(refundAmount > 0 || restAmount > 0 || isToSend || isToRefund) && (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                    {refundAmount > 0 ? (
                      <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-rose-800 ring-1 ring-rose-200">
                        À rembourser {currencyNoCents(refundAmount, "EUR")}
                      </span>
                    ) : null}
                    {restAmount > 0 || isToSend ? (
                      <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-amber-900 ring-1 ring-amber-200">
                        Reste {currencyNoCents(Math.round(Number(restValue) || restAmount || 0), "EUR")}
                      </span>
                    ) : null}
                  </div>
                )}

                {isPending ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void accept(row)}
                      className="min-h-10 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white disabled:opacity-60"
                    >
                      {busy ? "Validation…" : "Valider"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void setStatus(row.id, STATUS.refused)}
                      className="min-h-10 rounded-xl bg-slate-200 px-3 text-xs font-bold text-slate-800 disabled:opacity-60"
                    >
                      Refuser
                    </button>
                  </div>
                ) : null}

                {isToSend ? (
                  <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-900">
                      <input
                        type="checkbox"
                        disabled={busy}
                        checked={workflowOf(row).sentToClient === true}
                        onChange={() => void markSentToClient(row)}
                        className="size-5 accent-indigo-600"
                      />
                      Envoyé au client (imprime le ticket → Demande traité)
                    </label>

                    <div className="flex flex-wrap items-end gap-2">
                      <label className="min-w-[8rem] flex-1 text-xs font-bold uppercase tracking-wide text-slate-600">
                        Reste à payer (€)
                        <input
                          inputMode="decimal"
                          value={restValue}
                          disabled={busy}
                          onChange={(event) =>
                            setRestDrafts((current) => ({ ...current, [row.id]: event.target.value }))
                          }
                          className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-indigo-500"
                          placeholder="0"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void saveRestAmount(row)}
                        className="min-h-10 rounded-xl bg-indigo-600 px-3 text-xs font-bold text-white disabled:opacity-60"
                      >
                        Enregistrer le reste
                      </button>
                    </div>

                    {refundAmount > 0 ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void moveToRefund(row)}
                        className="min-h-10 rounded-xl bg-rose-600 px-3 text-xs font-bold text-white disabled:opacity-60"
                      >
                        Rembourser · {currencyNoCents(refundAmount, "EUR")}
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {isToRefund ? (
                  <div className="mt-4 space-y-3 rounded-xl bg-rose-50/70 p-3 ring-1 ring-rose-200">
                    {refundAmount > 0 ? (
                      <p className="text-sm font-semibold text-rose-900">
                        Remboursement : {currencyNoCents(refundAmount, "EUR")}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void markSentToClient(row)}
                      className="min-h-10 rounded-xl bg-indigo-600 px-3 text-xs font-bold text-white disabled:opacity-60"
                    >
                      Revoir le ticket
                    </button>
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-900">
                      <input
                        type="checkbox"
                        disabled={busy}
                        checked={false}
                        onChange={() => void markTreated(row)}
                        className="size-5 accent-emerald-600"
                      />
                      Traité
                      {refundAmount > 0 ? ` · ${currencyNoCents(refundAmount, "EUR")}` : ""}
                    </label>
                  </div>
                ) : null}

                {isTreated ? (
                  <div className="mt-4 space-y-2 rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
                    <label className="flex items-center gap-2 text-sm font-bold text-emerald-950">
                      <input type="checkbox" checked readOnly className="size-5 accent-emerald-600" />
                      Traité
                      {wf.treatedAt
                        ? ` · ${new Date(wf.treatedAt).toLocaleString("fr-FR")}`
                        : ""}
                    </label>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void markSentToClient(row)}
                      className="min-h-10 rounded-xl bg-indigo-600 px-3 text-xs font-bold text-white disabled:opacity-60"
                    >
                      Revoir le ticket
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
