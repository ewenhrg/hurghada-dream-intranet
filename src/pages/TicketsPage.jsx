import { useState, useMemo, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";
import { currencyNoCents, saveLS, loadLS } from "../utils";
import { LS_KEYS } from "../constants";
import { formatQuoteItemParticipantsSummary } from "../utils/quoteItemDisplay.js";
import { TextInput } from "../components/ui";
import { toast } from "../utils/toast.js";

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

const paymentText = (method) =>
  method === "cash" ? "Cash" : method === "stripe" ? "Stripe" : "";

const EXPORT_HEADERS = [
  "N° Ticket",
  "Activité",
  "Date",
  "Pick-up",
  "Client",
  "Téléphone",
  "Hôtel",
  "Chambre",
  "Personnes",
  "Prix",
  "Paiement",
  "Créé par",
];

/**
 * Registre des tickets : liste toutes les activités (de tous les devis) qui ont
 * un numéro de ticket généré/renseigné.
 * Système anti-doublon : chaque ligne copiée/exportée est mémorisée (localStorage)
 * pour éviter de re-copier deux fois la même ligne dans Excel.
 */
export function TicketsPage({ quotes = [] }) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // "all" | "new" | "copied"

  // Ensemble des n° de tickets déjà copiés (persisté localement)
  const [copied, setCopied] = useState(() => {
    const stored = loadLS(LS_KEYS.copiedTickets, []);
    return new Set(Array.isArray(stored) ? stored : []);
  });

  useEffect(() => {
    saveLS(LS_KEYS.copiedTickets, Array.from(copied));
  }, [copied]);

  const markCopied = useCallback((ticketNumbers) => {
    setCopied((prev) => {
      const next = new Set(prev);
      ticketNumbers.forEach((tn) => next.add(tn));
      return next;
    });
  }, []);

  const toggleCopied = useCallback((ticketNumber) => {
    setCopied((prev) => {
      const next = new Set(prev);
      if (next.has(ticketNumber)) next.delete(ticketNumber);
      else next.add(ticketNumber);
      return next;
    });
  }, []);

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
          priceValue: Math.round(item.lineTotal || 0),
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

  // Nombre de lignes jamais copiées (sur l'ensemble, pas seulement le filtre)
  const newCount = useMemo(() => rows.filter((r) => !copied.has(r.ticketNumber)).length, [rows, copied]);
  const copiedCount = rows.length - newCount;

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter === "new" && copied.has(r.ticketNumber)) return false;
      if (statusFilter === "copied" && !copied.has(r.ticketNumber)) return false;
      if (!term) return true;
      return [r.ticketNumber, r.activityName, r.clientName, r.phone, r.hotel]
        .some((v) => String(v || "").toLowerCase().includes(term));
    });
  }, [rows, q, statusFilter, copied]);

  const formatDate = (d) =>
    d ? new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }) : "—";

  const dateForExport = (d) =>
    d ? new Date(d + "T12:00:00").toLocaleDateString("fr-FR") : "";

  const matrixFromRows = useCallback(
    (list, withHeaders) => {
      const body = list.map((r) => [
        r.ticketNumber,
        r.activityName,
        dateForExport(r.date),
        r.pickup || "",
        r.clientName === "—" ? "" : r.clientName,
        r.phone === "—" ? "" : r.phone,
        r.hotel || "",
        r.room || "",
        r.pax,
        r.priceValue,
        paymentText(r.paymentMethod),
        r.createdByName || "",
      ]);
      return withHeaders ? [EXPORT_HEADERS, ...body] : body;
    },
    []
  );

  const copyRowsToClipboard = useCallback(async (list, withHeaders) => {
    const matrix = matrixFromRows(list, withHeaders);
    const tsv = matrix
      .map((row) => row.map((cell) => String(cell ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ")).join("\t"))
      .join("\r\n");
    try {
      await navigator.clipboard.writeText(tsv);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = tsv;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      document.body.removeChild(ta);
      return ok;
    }
  }, [matrixFromRows]);

  // Bouton principal : copie UNIQUEMENT les lignes nouvelles (non copiées) du filtre courant
  const handleCopyNew = useCallback(async () => {
    const list = filtered.filter((r) => !copied.has(r.ticketNumber));
    if (list.length === 0) {
      toast.warning("Aucune nouvelle ligne à copier (tout est déjà copié).");
      return;
    }
    const ok = await copyRowsToClipboard(list, true);
    if (ok) {
      markCopied(list.map((r) => r.ticketNumber));
      toast.success(`${list.length} nouvelle(s) ligne(s) copiée(s). Collez avec Ctrl+V dans votre Excel.`);
    } else {
      toast.error("Impossible de copier automatiquement. Utilisez l'export .xlsx.");
    }
  }, [filtered, copied, copyRowsToClipboard, markCopied]);

  // Recopier toutes les lignes du filtre (même déjà copiées), sans changer les marques
  const handleCopyAll = useCallback(async () => {
    if (filtered.length === 0) {
      toast.warning("Aucune ligne à copier.");
      return;
    }
    const ok = await copyRowsToClipboard(filtered, true);
    if (ok) {
      markCopied(filtered.map((r) => r.ticketNumber));
      toast.success(`${filtered.length} ligne(s) copiée(s).`);
    } else {
      toast.error("Impossible de copier automatiquement. Utilisez l'export .xlsx.");
    }
  }, [filtered, copyRowsToClipboard, markCopied]);

  const handleExportXlsx = useCallback(() => {
    if (filtered.length === 0) {
      toast.warning("Aucun ticket à exporter.");
      return;
    }
    const matrix = matrixFromRows(filtered, true);
    const ws = XLSX.utils.aoa_to_sheet(matrix);
    ws["!cols"] = [
      { wch: 16 }, { wch: 26 }, { wch: 12 }, { wch: 10 }, { wch: 20 },
      { wch: 15 }, { wch: 22 }, { wch: 10 }, { wch: 22 }, { wch: 10 },
      { wch: 10 }, { wch: 14 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tickets");
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `tickets-${stamp}.xlsx`);
    toast.success("Fichier Excel téléchargé.");
  }, [filtered, matrixFromRows]);

  const handleResetCopied = useCallback(() => {
    if (copied.size === 0) {
      toast.info("Aucune marque « copié » à réinitialiser.");
      return;
    }
    if (!window.confirm("Réinitialiser toutes les marques « copié » ? Toutes les lignes redeviendront « nouvelles ».")) {
      return;
    }
    setCopied(new Set());
    toast.success("Marques réinitialisées.");
  }, [copied]);

  const filterPill = (value, label) => (
    <button
      type="button"
      onClick={() => setStatusFilter(value)}
      className={`rounded-lg px-3 py-1.5 text-xs font-bold border-2 transition-colors ${
        statusFilter === value
          ? "border-indigo-500 bg-indigo-600 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="w-full md:max-w-md">
            <TextInput
              placeholder="Rechercher : n° ticket, client, téléphone, activité, hôtel…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopyNew()}
              disabled={filtered.filter((r) => !copied.has(r.ticketNumber)).length === 0}
              className="rounded-xl px-3 py-2 text-sm font-bold text-white border-2 border-emerald-500 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-md transition-opacity disabled:opacity-50"
              title="Copie uniquement les lignes pas encore copiées, puis les marque comme copiées"
            >
              📋 Copier les nouvelles
            </button>
            <button
              type="button"
              onClick={() => void handleCopyAll()}
              disabled={filtered.length === 0}
              className="rounded-xl px-3 py-2 text-sm font-bold text-slate-700 border-2 border-slate-300 bg-white hover:bg-slate-50 shadow-sm transition-colors disabled:opacity-50"
              title="Recopie toutes les lignes affichées (même déjà copiées)"
            >
              📋 Tout copier
            </button>
            <button
              type="button"
              onClick={handleExportXlsx}
              disabled={filtered.length === 0}
              className="rounded-xl px-3 py-2 text-sm font-bold text-white border-2 border-indigo-500 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 shadow-md transition-opacity disabled:opacity-50"
              title="Télécharger un fichier Excel (.xlsx)"
            >
              ⬇️ Exporter .xlsx
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {filterPill("all", `Toutes (${rows.length})`)}
          {filterPill("new", `🆕 Nouvelles (${newCount})`)}
          {filterPill("copied", `✅ Copiées (${copiedCount})`)}
          <button
            type="button"
            onClick={handleResetCopied}
            className="rounded-lg px-3 py-1.5 text-xs font-bold border-2 border-rose-200 bg-white text-rose-600 hover:bg-rose-50 transition-colors"
            title="Efface toutes les marques « copié »"
          >
            ♻️ Réinitialiser les marques
          </button>
          <span className="ml-auto text-xs text-slate-500 font-medium">
            Affichées : {filtered.length}
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-10 text-center">
          <p className="text-3xl mb-2">🎟️</p>
          <p className="text-slate-600 font-semibold">
            {rows.length === 0
              ? "Aucun ticket pour le moment. Générez des tickets depuis l'Historique (bouton « Ticket »)."
              : statusFilter === "new"
                ? "Aucune nouvelle ligne : tout a déjà été copié 🎉"
                : "Aucun ticket ne correspond à votre recherche."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
                <th className="px-3 py-3 text-center font-semibold whitespace-nowrap">État</th>
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
              {filtered.map((r) => {
                const isCopied = copied.has(r.ticketNumber);
                return (
                  <tr
                    key={r.key}
                    className={`border-t border-slate-200 transition-colors ${
                      isCopied
                        ? "bg-slate-100/80 text-slate-400"
                        : "bg-amber-50/60 hover:bg-amber-100/60"
                    }`}
                  >
                    <td className="px-3 py-2.5 text-center">
                      <button
                        type="button"
                        onClick={() => toggleCopied(r.ticketNumber)}
                        className={`rounded-full px-2.5 py-1 text-xs font-bold border-2 transition-colors ${
                          isCopied
                            ? "border-emerald-300 bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                            : "border-amber-400 bg-amber-100 text-amber-800 hover:bg-amber-200"
                        }`}
                        title={isCopied ? "Marquée comme copiée — cliquer pour annuler" : "Nouvelle — cliquer pour marquer comme copiée"}
                      >
                        {isCopied ? "✅ Copié" : "🆕 Nouveau"}
                      </button>
                    </td>
                    <td className={`px-3 py-2.5 font-bold whitespace-nowrap ${isCopied ? "text-slate-400" : "text-indigo-700"}`}>{r.ticketNumber}</td>
                    <td className={`px-3 py-2.5 font-semibold ${isCopied ? "text-slate-400" : "text-slate-800"}`}>{r.activityName}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(r.date)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{r.pickup || "—"}</td>
                    <td className={`px-3 py-2.5 font-medium ${isCopied ? "text-slate-400" : "text-slate-800"}`}>{r.clientName}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{r.phone}</td>
                    <td className="px-3 py-2.5">
                      {r.hotel || "—"}
                      {r.room ? <span className={isCopied ? "text-slate-400" : "text-slate-500"}> · Ch. {r.room}</span> : null}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{r.pax}</td>
                    <td className={`px-3 py-2.5 text-right font-bold whitespace-nowrap ${isCopied ? "text-slate-400" : "text-emerald-700"}`}>{r.price}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{paymentLabel(r.paymentMethod)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
