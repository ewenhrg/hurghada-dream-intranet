import { useMemo } from "react";
import { Printer } from "lucide-react";
import { getLocalDateKey } from "../utils/pushSaleExpiry.js";
import { buildDayReceipt } from "../utils/dayReceipt.js";
import { generateDayReceiptHTML } from "../utils/printTemplates.js";
import { toast } from "../utils/toast.js";

function formatDay(dateKey) {
  if (!dateKey) return "";
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function TotalLine({ label, value, strong = false }) {
  return (
    <div className={`flex items-center justify-between gap-4 border-b border-slate-200 py-2 ${strong ? "text-base font-extrabold text-slate-950" : "text-sm font-semibold text-slate-800"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export function ReceiptPage({ quotes = [], activities = [] }) {
  const dateKey = getLocalDateKey();
  const receipt = useMemo(
    () => buildDayReceipt(quotes, dateKey, activities),
    [quotes, dateKey, activities]
  );
  const { rows, totals } = receipt;
  const dayLabel = formatDay(dateKey);

  const printReceipt = () => {
    const html = generateDayReceiptHTML(receipt, { dateLabel: `Validated on ${dayLabel}` });
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const popup = window.open(url);
    if (!popup) {
      URL.revokeObjectURL(url);
      toast.error("Allow pop-ups to print the receipt.");
      return;
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-indigo-300 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-bold text-indigo-950">Validated today</p>
            <p className="mt-0.5 text-xs font-medium text-slate-600">
              {dayLabel} — {totals.ticketCount} ticket{totals.ticketCount > 1 ? "s" : ""}, whatever the activity date
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={printReceipt}
              disabled={rows.length === 0}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-900 px-3.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              <Printer className="size-4" aria-hidden="true" />
              Print
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[920px] border-collapse text-left text-sm">
          <thead className="bg-slate-900 text-[11px] uppercase tracking-wide text-white">
            <tr>
              <th className="px-2 py-2">Ticket no.</th>
              <th className="px-2 py-2">Hotel</th>
              <th className="px-2 py-2">Activity</th>
              <th className="px-2 py-2">Guests</th>
              <th className="px-2 py-2 text-right">Price</th>
              <th className="px-2 py-2">Payment</th>
              <th className="px-2 py-2 text-right">Collected</th>
              <th className="px-2 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-500">
                  No tickets validated today.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.key} className="border-t border-slate-200 text-slate-900">
                  <td className="px-2 py-2 font-bold tabular-nums">{row.ticketNumber}</td>
                  <td className="px-2 py-2">
                    <div>{row.hotel}</div>
                    {row.room ? <div className="text-xs text-slate-500">Room {row.room}</div> : null}
                  </td>
                  <td className="px-2 py-2">
                    <div>{row.activity}</div>
                    {row.activityDate ? <div className="text-xs text-slate-500">{row.activityDate}</div> : null}
                  </td>
                  <td className="px-2 py-2 text-xs">{row.pax}</td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">{row.tariffLabel}</td>
                  <td className="px-2 py-2">{row.paymentLabel}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{row.collectedLabel}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{row.restLabel}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="ml-auto w-full max-w-sm rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <TotalLine label="Total" value={totals.tariffLabel} strong />
        {totals.cashEur > 0 ? <TotalLine label="Cash" value={totals.cashEurLabel} /> : null}
        {totals.cashEgp > 0 ? <TotalLine label="Cash" value={totals.cashEgpLabel} /> : null}
        {totals.stripe > 0 ? <TotalLine label="Stripe" value={totals.stripeLabel} /> : null}
        {totals.rest > 0 ? <TotalLine label="Balance due" value={totals.restLabel} /> : null}
        <p className="pt-2 text-[11px] leading-relaxed text-slate-500">
          The total is the sum of the ticket prices. Stripe is that card share, without the 3% fee.
          Egyptian cash is the amount entered in pounds.
        </p>
      </div>
    </div>
  );
}
