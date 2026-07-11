import { useState, useMemo } from "react";
import { currencyNoCents } from "../utils";
import { formatQuoteItemParticipantsSummary } from "../utils/quoteItemDisplay.js";
import { TextInput } from "../components/ui";

const slotLabel = (slot) =>
  slot === "morning"
    ? "Matin"
    : slot === "afternoon"
      ? "Après-midi"
      : slot === "evening"
        ? "Soir"
        : "";

const paymentLabel = (method) =>
  method === "cash" ? "💵 Cash" : method === "stripe" ? "💳 Stripe" : "—";

/**
 * Registre des tickets : liste toutes les activités (de tous les devis) qui ont
 * un numéro de ticket généré/renseigné.
 */
export function TicketsPage({ quotes = [] }) {
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const list = [];
    (quotes || []).forEach((quote) => {
      const client = quote.client || {};
      (quote.items || []).forEach((item, idx) => {
        const ticketNumber = item.ticketNumber ? String(item.ticketNumber).trim() : "";
        if (!ticketNumber) return;
        list.push({
          key: `${quote.id || "q"}-${idx}-${ticketNumber}`,
          ticketNumber,
          activityName: item.activityName || "—",
          date: item.date || "",
          pickup: item.pickupTime && String(item.pickupTime).trim() ? String(item.pickupTime).trim() : slotLabel(item.slot),
          clientName: client.name || "—",
          phone: client.phone || "—",
          hotel: client.hotel || "",
          room: client.room || "",
          pax: formatQuoteItemParticipantsSummary(item),
          price: currencyNoCents(Math.round(item.lineTotal || 0), quote.currency || "EUR"),
          paymentMethod: item.paymentMethod || "",
          createdByName: quote.createdByName || "",
        });
      });
    });
    list.sort((a, b) => {
      const da = a.date ? new Date(a.date + "T12:00:00").getTime() : 0;
      const db = b.date ? new Date(b.date + "T12:00:00").getTime() : 0;
      return db - da;
    });
    return list;
  }, [quotes]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      [r.ticketNumber, r.activityName, r.clientName, r.phone, r.hotel]
        .some((v) => String(v || "").toLowerCase().includes(term))
    );
  }, [rows, q]);

  const formatDate = (d) =>
    d ? new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }) : "—";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="w-full md:max-w-md">
          <TextInput
            placeholder="Rechercher : n° ticket, client, téléphone, activité, hôtel…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full"
          />
        </div>
        <div className="shrink-0 rounded-xl border-2 border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800">
          🎟️ {filtered.length} ticket{filtered.length > 1 ? "s" : ""}
          {rows.length !== filtered.length ? <span className="font-medium text-emerald-700"> / {rows.length}</span> : null}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-10 text-center">
          <p className="text-3xl mb-2">🎟️</p>
          <p className="text-slate-600 font-semibold">
            {rows.length === 0
              ? "Aucun ticket pour le moment. Générez des tickets depuis l'Historique (bouton « Ticket »)."
              : "Aucun ticket ne correspond à votre recherche."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
                <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">N° Ticket</th>
                <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Activité</th>
                <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Date</th>
                <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Pick-up</th>
                <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Client</th>
                <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Téléphone</th>
                <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Hôtel / Chambre</th>
                <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Personnes</th>
                <th className="px-3 py-3 text-right font-semibold whitespace-nowrap">Prix</th>
                <th className="px-3 py-3 text-left font-semibold whitespace-nowrap">Paiement</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr
                  key={r.key}
                  className={`${i % 2 === 0 ? "bg-white" : "bg-slate-50"} border-t border-slate-200 hover:bg-indigo-50/60 transition-colors`}
                >
                  <td className="px-3 py-2.5 font-bold text-indigo-700 whitespace-nowrap">{r.ticketNumber}</td>
                  <td className="px-3 py-2.5 font-semibold text-slate-800">{r.activityName}</td>
                  <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{formatDate(r.date)}</td>
                  <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{r.pickup || "—"}</td>
                  <td className="px-3 py-2.5 text-slate-800 font-medium">{r.clientName}</td>
                  <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{r.phone}</td>
                  <td className="px-3 py-2.5 text-slate-700">
                    {r.hotel || "—"}
                    {r.room ? <span className="text-slate-500"> · Ch. {r.room}</span> : null}
                  </td>
                  <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{r.pax}</td>
                  <td className="px-3 py-2.5 text-right font-bold text-emerald-700 whitespace-nowrap">{r.price}</td>
                  <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{paymentLabel(r.paymentMethod)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
