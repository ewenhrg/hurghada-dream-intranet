import { useState, useMemo, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Search,
  X,
  Copy,
  CopyCheck,
  Download,
  RotateCcw,
  Ticket,
  Sparkles,
  ListChecks,
  CheckCircle2,
} from "lucide-react";
import { currencyNoCents, saveLS, loadLS } from "../utils";
import { LS_KEYS } from "../constants";
import {
  formatActivityWithExtras,
  formatClientShortWithPhone,
  getQuoteItemParticipantCells,
} from "../utils/quoteItemDisplay.js";
import {
  calculateTransferSurchargeFromItem,
} from "../utils/transferPricing.js";
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

const paymentText = (method) =>
  method === "cash" ? "Cash" : method === "stripe" ? "Stripe" : "";

/** En-têtes Excel = ordre exact demandé (15 colonnes). */
const EXPORT_HEADERS = [
  "N° Ticket",
  "Date",
  "Client (3 lettres + tél)",
  "Hôtel",
  "Chambre",
  "Adultes",
  "Enfants",
  "Bébés",
  "Activité + extras",
  "Prise en charge",
  "Note",
  "Prix",
  "Supp. transfert",
  "Paiement",
  "Vendeur",
];

const TH =
  "border border-slate-300 px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-wide text-slate-700 whitespace-nowrap bg-slate-100";
const TD = "border border-slate-200 px-2 py-1.5 align-middle text-[12px] whitespace-nowrap";

/**
 * Registre des tickets — colonnes alignées Excel pour copier/coller direct.
 */
export function TicketsPage({ quotes = [] }) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
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
      const note = String(quote.notes || "").trim();
      (quote.items || []).forEach((item, idx) => {
        const ticketNumber = item.ticketNumber ? String(item.ticketNumber).trim() : "";
        if (!ticketNumber) return;

        const pax = getQuoteItemParticipantCells(item);
        const transferValue = Math.round(calculateTransferSurchargeFromItem(item) || 0);
        const lineTotal = Math.round(Number(item.lineTotal) || 0);
        // Prix activité hors supp. transfert (évite le double-compte dans Excel)
        const priceValue = Math.max(0, lineTotal - transferValue);
        const pickup =
          item.pickupTime && String(item.pickupTime).trim()
            ? String(item.pickupTime).trim()
            : slotLabel(item.slot);

        list.push({
          key: `${quote.id || "q"}-${idx}-${ticketNumber}`,
          ticketNumber,
          date: item.date || "",
          clientCell: formatClientShortWithPhone(client.name, client.phone),
          clientName: client.name || "",
          phone: client.phone || "",
          hotel: client.hotel || "",
          room: client.room || "",
          adults: pax.adults,
          children: pax.children,
          babies: pax.babies,
          activity: formatActivityWithExtras(item),
          pickup: pickup || "",
          note,
          priceValue,
          priceLabel: currencyNoCents(priceValue, quote.currency || "EUR"),
          transferValue,
          transferLabel:
            transferValue > 0
              ? currencyNoCents(transferValue, quote.currency || "EUR")
              : "",
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

  const newCount = useMemo(
    () => rows.filter((r) => !copied.has(r.ticketNumber)).length,
    [rows, copied]
  );
  const copiedCount = rows.length - newCount;

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter === "new" && copied.has(r.ticketNumber)) return false;
      if (statusFilter === "copied" && !copied.has(r.ticketNumber)) return false;
      if (!term) return true;
      return [
        r.ticketNumber,
        r.activity,
        r.clientCell,
        r.clientName,
        r.phone,
        r.hotel,
        r.room,
        r.note,
        r.createdByName,
      ].some((v) => String(v || "").toLowerCase().includes(term));
    });
  }, [rows, q, statusFilter, copied]);

  const dateForExport = (d) =>
    d ? new Date(d + "T12:00:00").toLocaleDateString("fr-FR") : "";

  const formatDateDisplay = (d) =>
    d
      ? new Date(d + "T12:00:00").toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : "—";

  const matrixFromRows = useCallback((list, withHeaders) => {
    const body = list.map((r) => [
      r.ticketNumber,
      dateForExport(r.date),
      r.clientCell,
      r.hotel || "",
      r.room || "",
      r.adults || "",
      r.children || "",
      r.babies || "",
      r.activity,
      r.pickup || "",
      r.note || "",
      r.priceValue || "",
      r.transferValue > 0 ? r.transferValue : "",
      paymentText(r.paymentMethod),
      r.createdByName || "",
    ]);
    return withHeaders ? [EXPORT_HEADERS, ...body] : body;
  }, []);

  const copyRowsToClipboard = useCallback(
    async (list, withHeaders) => {
      const matrix = matrixFromRows(list, withHeaders);
      const tsv = matrix
        .map((row) =>
          row
            .map((cell) => String(cell ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " "))
            .join("\t")
        )
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
    },
    [matrixFromRows]
  );

  const handleCopyNew = useCallback(async () => {
    const list = filtered.filter((r) => !copied.has(r.ticketNumber));
    if (list.length === 0) {
      toast.warning("Aucune nouvelle ligne à copier (tout est déjà copié).");
      return;
    }
    const ok = await copyRowsToClipboard(list, true);
    if (ok) {
      markCopied(list.map((r) => r.ticketNumber));
      toast.success(
        `${list.length} nouvelle(s) ligne(s) copiée(s). Collez avec Ctrl+V dans Excel.`
      );
    } else {
      toast.error("Impossible de copier. Utilisez l'export .xlsx.");
    }
  }, [filtered, copied, copyRowsToClipboard, markCopied]);

  const handleCopyRow = useCallback(
    async (row) => {
      const ok = await copyRowsToClipboard([row], false);
      if (ok) {
        markCopied([row.ticketNumber]);
        toast.success(`Ligne ${row.ticketNumber} copiée.`);
      } else {
        toast.error("Impossible de copier. Utilisez l'export .xlsx.");
      }
    },
    [copyRowsToClipboard, markCopied]
  );

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
      toast.error("Impossible de copier. Utilisez l'export .xlsx.");
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
      { wch: 16 },
      { wch: 12 },
      { wch: 20 },
      { wch: 22 },
      { wch: 10 },
      { wch: 8 },
      { wch: 8 },
      { wch: 8 },
      { wch: 36 },
      { wch: 12 },
      { wch: 24 },
      { wch: 10 },
      { wch: 12 },
      { wch: 10 },
      { wch: 14 },
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
    if (
      !window.confirm(
        "Réinitialiser toutes les marques « copié » ? Toutes les lignes redeviendront « nouvelles »."
      )
    ) {
      return;
    }
    setCopied(new Set());
    toast.success("Marques réinitialisées.");
  }, [copied]);

  const newInFilteredCount = useMemo(
    () => filtered.filter((r) => !copied.has(r.ticketNumber)).length,
    [filtered, copied]
  );

  const reduceMotion = useReducedMotion();
  const fade = {
    initial: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 },
    transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] },
  };

  const FILTERS = [
    { value: "all", label: "Toutes", icon: ListChecks, count: rows.length },
    { value: "new", label: "Nouvelles", icon: Sparkles, count: newCount },
    { value: "copied", label: "Copiées", icon: CheckCircle2, count: copiedCount },
  ];

  return (
    <motion.div
      className="space-y-5"
      initial={fade.initial}
      animate={fade.animate}
      transition={fade.transition}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <TextInput
              type="search"
              placeholder="Rechercher : ticket, client, tél, hôtel, activité, vendeur…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Rechercher un ticket"
              className="w-full !pl-11 !pr-10"
            />
            {q ? (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label="Effacer la recherche"
                className="absolute right-2.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-600"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopyNew()}
              disabled={newInFilteredCount === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 px-3.5 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(16,185,129,0.7)] transition-all hover:from-emerald-600 hover:to-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 disabled:opacity-50 disabled:shadow-none"
              title="Copie les 15 colonnes Excel des lignes non encore copiées"
            >
              <Copy className="size-4" aria-hidden="true" />
              Copier les nouvelles
              {newInFilteredCount > 0 ? (
                <span className="ml-0.5 rounded-full bg-white/25 px-1.5 py-0.5 text-xs font-bold tabular-nums">
                  {newInFilteredCount}
                </span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => void handleCopyAll()}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white/70 px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-400 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50 focus-visible:ring-offset-2 disabled:opacity-50"
            >
              <CopyCheck className="size-4" aria-hidden="true" />
              Tout copier
            </button>
            <button
              type="button"
              onClick={handleExportXlsx}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-3.5 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(99,102,241,0.7)] transition-all hover:from-indigo-600 hover:to-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 disabled:opacity-50 disabled:shadow-none"
            >
              <Download className="size-4" aria-hidden="true" />
              Exporter .xlsx
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Filtrer les tickets par état"
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1"
          >
            {FILTERS.map(({ value, label, icon: Icon, count }) => {
              const active = statusFilter === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    active
                      ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[0.65rem] font-bold tabular-nums ${
                      active ? "bg-indigo-100 text-indigo-700" : "bg-slate-200/80 text-slate-500"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleResetCopied}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-rose-600 transition-all hover:border-rose-300 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40 focus-visible:ring-offset-2"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Réinitialiser les marques
          </button>

          <span className="ml-auto text-xs font-medium tabular-nums text-slate-500">
            Affichées : {filtered.length} · 15 colonnes Excel
          </span>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {filtered.length === 0 ? (
          <motion.div
            key="empty"
            initial={fade.initial}
            animate={fade.animate}
            exit={fade.exit}
            transition={fade.transition}
            className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/70 p-10 text-center"
          >
            <span className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 text-indigo-500">
              <Ticket className="size-7" aria-hidden="true" />
            </span>
            <p className="font-semibold text-slate-600">
              {rows.length === 0
                ? "Aucun ticket pour le moment. Générez des tickets depuis l'Historique (bouton « Ticket »)."
                : statusFilter === "new"
                  ? "Aucune nouvelle ligne : tout a déjà été copié."
                  : "Aucun ticket ne correspond à votre recherche."}
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="table"
            initial={fade.initial}
            animate={fade.animate}
            exit={fade.exit}
            transition={fade.transition}
            className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-lg shadow-indigo-950/5"
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1280px] border-collapse border border-slate-300 text-left font-sans">
                <caption className="sr-only">
                  Tableau tickets Excel : 15 colonnes (n° ticket à vendeur).
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className={`${TH} sticky left-0 z-20 bg-slate-200`}>
                      Copier
                    </th>
                    <th scope="col" className={`${TH} bg-orange-100 text-orange-900`}>
                      N° Ticket
                    </th>
                    <th scope="col" className={TH}>
                      Date
                    </th>
                    <th scope="col" className={TH}>
                      Client
                    </th>
                    <th scope="col" className={TH}>
                      Hôtel
                    </th>
                    <th scope="col" className={TH}>
                      Ch.
                    </th>
                    <th scope="col" className={`${TH} text-center`}>
                      Adt
                    </th>
                    <th scope="col" className={`${TH} text-center`}>
                      Enf
                    </th>
                    <th scope="col" className={`${TH} text-center`}>
                      Bébé
                    </th>
                    <th scope="col" className={TH}>
                      Activité + extras
                    </th>
                    <th scope="col" className={TH}>
                      Prise en charge
                    </th>
                    <th scope="col" className={TH}>
                      Note
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      Prix
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      Supp. transfert
                    </th>
                    <th scope="col" className={TH}>
                      Paiement
                    </th>
                    <th scope="col" className={TH}>
                      Vendeur
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => {
                    const isCopied = copied.has(r.ticketNumber);
                    const zebra = i % 2 === 0;
                    const rowBg = isCopied
                      ? "bg-slate-100/90 text-slate-400"
                      : zebra
                        ? "bg-white"
                        : "bg-orange-50/30";
                    return (
                      <tr key={r.key} className={`transition-colors hover:bg-amber-50/80 ${rowBg}`}>
                        <td
                          className={`${TD} sticky left-0 z-10 ${
                            isCopied ? "bg-slate-100" : zebra ? "bg-white" : "bg-orange-50/40"
                          }`}
                        >
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void handleCopyRow(r)}
                              aria-label={`Copier ${r.ticketNumber}`}
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                              title="Copier cette ligne (15 colonnes) pour Excel"
                            >
                              <Copy className="size-3" aria-hidden="true" />
                              Copier
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleCopied(r.ticketNumber)}
                              aria-pressed={isCopied}
                              className={`grid size-6 place-items-center rounded-full border transition-colors ${
                                isCopied
                                  ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                                  : "border-amber-400 bg-amber-100 text-amber-800"
                              }`}
                              title={isCopied ? "Déjà copiée" : "Nouvelle"}
                            >
                              {isCopied ? (
                                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                              ) : (
                                <Sparkles className="size-3.5" aria-hidden="true" />
                              )}
                            </button>
                          </div>
                        </td>
                        <th
                          scope="row"
                          className={`${TD} bg-orange-200/80 font-bold text-orange-950 ${
                            isCopied ? "!bg-slate-200 text-slate-400" : ""
                          }`}
                        >
                          {r.ticketNumber}
                        </th>
                        <td className={TD}>{formatDateDisplay(r.date)}</td>
                        <td className={`${TD} font-medium ${isCopied ? "" : "text-slate-900"}`}>
                          {r.clientCell || ""}
                        </td>
                        <td className={`${TD} max-w-[10rem] truncate`} title={r.hotel}>
                          {r.hotel || ""}
                        </td>
                        <td className={TD}>{r.room || ""}</td>
                        <td className={`${TD} text-center tabular-nums`}>
                          {r.adults || ""}
                        </td>
                        <td className={`${TD} text-center tabular-nums`}>{r.children || ""}</td>
                        <td className={`${TD} text-center tabular-nums`}>{r.babies || ""}</td>
                        <td
                          className={`${TD} max-w-[16rem] whitespace-normal leading-snug ${
                            isCopied ? "" : "font-medium text-slate-800"
                          }`}
                          title={r.activity}
                        >
                          {r.activity}
                        </td>
                        <td className={TD}>{r.pickup || ""}</td>
                        <td className={`${TD} max-w-[12rem] truncate`} title={r.note}>
                          {r.note || ""}
                        </td>
                        <td className={`${TD} text-right tabular-nums font-semibold`}>
                          {r.priceValue || ""}
                        </td>
                        <td className={`${TD} text-right tabular-nums`}>
                          {r.transferValue > 0 ? r.transferValue : ""}
                        </td>
                        <td className={TD}>{paymentText(r.paymentMethod)}</td>
                        <td className={TD}>{r.createdByName || ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
