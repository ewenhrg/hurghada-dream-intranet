/** Paiements confirmation hôtel (stockés dans response_payload.payment). */

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function parseIsoDateOnly(iso) {
  const s = String(iso || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDateOnly(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatPaymentDueLabel(isoOrDate) {
  const date =
    typeof isoOrDate === "string" ? parseIsoDateOnly(isoOrDate) || new Date(isoOrDate) : isoOrDate;
  if (!date || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Aligné sur le PDF confirmation :
 * - arrivée > 7 j → acompte 30 %, butoir +7 j
 * - arrivée ≤ 7 j → total, butoir +24 h
 */
export function buildPaymentSchedule(arrivalDate, grandTotal, asOf = new Date()) {
  const total = roundMoney(Number(grandTotal) || 0);
  if (!(total > 0)) return null;
  const arrival = parseIsoDateOnly(arrivalDate);
  if (!arrival) return null;
  const today = startOfLocalDay(asOf);
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntilArrival = Math.round((arrival.getTime() - today.getTime()) / msPerDay);
  if (daysUntilArrival < 0) {
    return {
      mode: "full",
      title: "Payment",
      dueDate: toIsoDateOnly(today),
      dueAmount: total,
      grandTotal: total,
    };
  }
  if (daysUntilArrival > 7) {
    const due = new Date(today);
    due.setDate(due.getDate() + 7);
    return {
      mode: "deposit",
      title: "Deposit",
      dueDate: toIsoDateOnly(due),
      dueAmount: roundMoney(total * 0.3),
      grandTotal: total,
    };
  }
  const due = new Date(today);
  due.setDate(due.getDate() + 1);
  return {
    mode: "full",
    title: "Payment",
    dueDate: toIsoDateOnly(due),
    dueAmount: total,
    grandTotal: total,
  };
}

export function normalizePayment(raw) {
  const base = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const entries = Array.isArray(base.entries)
    ? base.entries
        .map((e) => {
          const amount =
            e?.amount != null && Number.isFinite(Number(e.amount))
              ? roundMoney(Number(e.amount))
              : null;
          if (amount == null || amount < 0) return null;
          return {
            id: String(e?.id || `${e?.paidAt || ""}-${amount}`),
            amount,
            paidAt: String(e?.paidAt || "").trim(),
            proofUrl: String(e?.proofUrl || "").trim(),
            proofFileName: String(e?.proofFileName || "").trim(),
          };
        })
        .filter(Boolean)
    : [];

  let schedule = null;
  if (base.schedule && typeof base.schedule === "object") {
    const dueAmount =
      base.schedule.dueAmount != null && Number.isFinite(Number(base.schedule.dueAmount))
        ? roundMoney(Number(base.schedule.dueAmount))
        : null;
    const grandTotal =
      base.schedule.grandTotal != null && Number.isFinite(Number(base.schedule.grandTotal))
        ? roundMoney(Number(base.schedule.grandTotal))
        : null;
    const dueDate = String(base.schedule.dueDate || "").trim();
    if (dueDate && dueAmount != null && grandTotal != null) {
      schedule = {
        mode: base.schedule.mode === "deposit" ? "deposit" : "full",
        title: String(base.schedule.title || "").trim() || (base.schedule.mode === "deposit" ? "Deposit" : "Payment"),
        dueDate,
        dueAmount,
        grandTotal,
      };
    }
  }

  return { entries, schedule };
}

export function sumPayments(payment) {
  const { entries } = normalizePayment(payment);
  return roundMoney(entries.reduce((acc, e) => acc + e.amount, 0));
}

export function computeConfirmedGrandTotal(confirmedHotelsOrOne, zeroTracas) {
  const hotels = Array.isArray(confirmedHotelsOrOne)
    ? confirmedHotelsOrOne
    : confirmedHotelsOrOne
      ? [confirmedHotelsOrOne]
      : [];
  const hotel = roundMoney(
    hotels.reduce((sum, h) => {
      const t = h?.quote?.total;
      return sum + (t != null && Number.isFinite(Number(t)) ? Number(t) : 0);
    }, 0)
  );
  const zt =
    zeroTracas?.enabled === true &&
    zeroTracas?.manualTotal != null &&
    Number.isFinite(Number(zeroTracas.manualTotal))
      ? roundMoney(Number(zeroTracas.manualTotal))
      : 0;
  return roundMoney(hotel + zt);
}

/**
 * Statut paiement pour l’UI : total, payé, reste, date butoir affichée.
 * Après acompte réglé, le solde a pour butoir la date d’arrivée.
 */
export function getPaymentStatus(request, payload) {
  const confirmedList =
    Array.isArray(payload?.confirmedHotels) && payload.confirmedHotels.length > 0
      ? payload.confirmedHotels
      : payload?.confirmedHotel
        ? [payload.confirmedHotel]
        : [];
  if (confirmedList.length === 0) return null;
  const payment = normalizePayment(payload.payment);
  const grandTotal =
    payment.schedule?.grandTotal != null
      ? payment.schedule.grandTotal
      : computeConfirmedGrandTotal(confirmedList, payload.zeroTracas);
  if (!(grandTotal > 0)) return null;

  const paid = sumPayments(payment);
  const remaining = roundMoney(Math.max(0, grandTotal - paid));
  const schedule =
    payment.schedule ||
    buildPaymentSchedule(
      request?.arrivalDate,
      grandTotal,
      payload.confirmedAt ? new Date(payload.confirmedAt) : new Date()
    );

  let dueDate = schedule?.dueDate || "";
  let dueTitle = schedule?.title || "Payment";

  if (remaining > 0 && schedule?.mode === "deposit" && paid + 0.009 >= (schedule.dueAmount || 0)) {
    dueDate = String(request?.arrivalDate || "").trim() || dueDate;
    dueTitle = "Balance";
  }

  return {
    currency: confirmedList[0]?.quote?.currency || "EUR",
    grandTotal,
    paid,
    remaining,
    isFullyPaid: remaining <= 0.009,
    dueDate,
    dueLabel: formatPaymentDueLabel(dueDate),
    dueTitle,
    schedule,
    entries: payment.entries,
  };
}

export function serializePayment(payment) {
  const n = normalizePayment(payment);
  return {
    entries: n.entries,
    schedule: n.schedule || undefined,
  };
}
