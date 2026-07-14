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
  Clock,
  Phone,
  MapPin,
  Banknote,
  CreditCard,
} from "lucide-react";
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

const paymentText = (method) =>
  method === "cash" ? "Cash" : method === "stripe" ? "Stripe" : "";

// Badge de paiement : icône Lucide + libellé, couleurs alignées sur le thème.
function PaymentBadge({ method }) {
  if (method === "cash") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/70 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        <Banknote className="size-3.5" aria-hidden="true" />
        Cash
      </span>
    );
  }
  if (method === "stripe") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-300/70 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
        <CreditCard className="size-3.5" aria-hidden="true" />
        Stripe
      </span>
    );
  }
  return <span className="text-slate-400">—</span>;
}

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

  // Copier UNE seule ligne (sans en-têtes), puis la marquer comme copiée
  const handleCopyRow = useCallback(async (row) => {
    const ok = await copyRowsToClipboard([row], false);
    if (ok) {
      markCopied([row.ticketNumber]);
      toast.success(`Ligne ${row.ticketNumber} copiée. Collez avec Ctrl+V dans votre Excel.`);
    } else {
      toast.error("Impossible de copier automatiquement. Utilisez l'export .xlsx.");
    }
  }, [copyRowsToClipboard, markCopied]);

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
      {/* Barre d'outils : recherche + actions principales */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <TextInput
              type="search"
              placeholder="Rechercher : n° ticket, client, téléphone, activité, hôtel…"
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
                className="absolute right-2.5 top-1/2 -translate-y-1/2 grid size-7 place-items-center rounded-full text-slate-400 hover:bg-slate-200/70 hover:text-slate-600 transition-colors"
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
              className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-600 shadow-[0_10px_24px_-12px_rgba(16,185,129,0.7)] hover:from-emerald-600 hover:to-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 disabled:opacity-50 disabled:shadow-none transition-all"
              title="Copie uniquement les lignes pas encore copiées, puis les marque comme copiées"
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
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white/70 px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-white hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50 focus-visible:ring-offset-2 disabled:opacity-50 transition-all"
              title="Recopie toutes les lignes affichées (même déjà copiées)"
            >
              <CopyCheck className="size-4" aria-hidden="true" />
              Tout copier
            </button>
            <button
              type="button"
              onClick={handleExportXlsx}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-600 shadow-[0_10px_24px_-12px_rgba(99,102,241,0.7)] hover:from-indigo-600 hover:to-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 disabled:opacity-50 disabled:shadow-none transition-all"
              title="Télécharger un fichier Excel (.xlsx)"
            >
              <Download className="size-4" aria-hidden="true" />
              Exporter .xlsx
            </button>
          </div>
        </div>

        {/* Filtres (segmented control) + réinitialisation */}
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
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:border-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40 focus-visible:ring-offset-2 transition-all"
            title="Efface toutes les marques « copié »"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Réinitialiser les marques
          </button>

          <span className="ml-auto text-xs font-medium text-slate-500 tabular-nums">
            Affichées : {filtered.length}
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
            className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm"
          >
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Liste des tickets générés, avec leur état de copie, activité, date, client et prix.
              </caption>
              <thead className="sticky top-0 z-10">
                <tr className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
                  <th scope="col" className="px-3 py-3 text-center font-semibold whitespace-nowrap">État</th>
                  <th scope="col" className="px-3 py-3 text-left font-semibold whitespace-nowrap">N° Ticket</th>
                  <th scope="col" className="px-3 py-3 text-left font-semibold whitespace-nowrap">Activité</th>
                  <th scope="col" className="px-3 py-3 text-left font-semibold whitespace-nowrap">Date</th>
                  <th scope="col" className="px-3 py-3 text-left font-semibold whitespace-nowrap">Pick-up</th>
                  <th scope="col" className="px-3 py-3 text-left font-semibold whitespace-nowrap">Client</th>
                  <th scope="col" className="px-3 py-3 text-left font-semibold whitespace-nowrap">Téléphone</th>
                  <th scope="col" className="px-3 py-3 text-left font-semibold whitespace-nowrap">Hôtel / Chambre</th>
                  <th scope="col" className="px-3 py-3 text-left font-semibold whitespace-nowrap">Personnes</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold whitespace-nowrap">Prix</th>
                  <th scope="col" className="px-3 py-3 text-left font-semibold whitespace-nowrap">Paiement</th>
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
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5 justify-center">
                          <button
                            type="button"
                            onClick={() => void handleCopyRow(r)}
                            aria-label={`Copier la ligne du ticket ${r.ticketNumber}`}
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-600 shadow-sm hover:from-emerald-600 hover:to-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-1 transition-colors whitespace-nowrap"
                            title="Copier cette ligne dans le presse-papiers (Ctrl+V dans Excel)"
                          >
                            <Copy className="size-3.5" aria-hidden="true" />
                            <span className="hidden sm:inline">Copier</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleCopied(r.ticketNumber)}
                            aria-pressed={isCopied}
                            aria-label={
                              isCopied
                                ? `Ticket ${r.ticketNumber} marqué comme copié — annuler`
                                : `Marquer le ticket ${r.ticketNumber} comme copié`
                            }
                            className={`grid size-7 place-items-center rounded-full border transition-colors ${
                              isCopied
                                ? "border-emerald-300 bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                : "border-amber-400 bg-amber-100 text-amber-800 hover:bg-amber-200"
                            }`}
                            title={isCopied ? "Marquée comme copiée — cliquer pour annuler" : "Nouvelle — cliquer pour marquer comme copiée sans copier"}
                          >
                            {isCopied ? (
                              <CheckCircle2 className="size-4" aria-hidden="true" />
                            ) : (
                              <Sparkles className="size-4" aria-hidden="true" />
                            )}
                          </button>
                        </div>
                      </td>
                      <th
                        scope="row"
                        className={`px-3 py-2.5 text-left font-bold whitespace-nowrap ${isCopied ? "text-slate-400" : "text-indigo-700"}`}
                      >
                        {r.ticketNumber}
                      </th>
                      <td className={`px-3 py-2.5 font-semibold ${isCopied ? "text-slate-400" : "text-slate-800"}`}>{r.activityName}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(r.date)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {r.pickup ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Clock className={`size-3.5 ${isCopied ? "text-slate-300" : "text-slate-400"}`} aria-hidden="true" />
                            {r.pickup}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className={`px-3 py-2.5 font-medium ${isCopied ? "text-slate-400" : "text-slate-800"}`}>{r.clientName}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {r.phone && r.phone !== "—" ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Phone className={`size-3.5 ${isCopied ? "text-slate-300" : "text-slate-400"}`} aria-hidden="true" />
                            {r.phone}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {r.hotel ? (
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className={`size-3.5 shrink-0 ${isCopied ? "text-slate-300" : "text-slate-400"}`} aria-hidden="true" />
                            {r.hotel}
                          </span>
                        ) : (
                          "—"
                        )}
                        {r.room ? <span className={isCopied ? "text-slate-400" : "text-slate-500"}> · Ch. {r.room}</span> : null}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{r.pax}</td>
                      <td className={`px-3 py-2.5 text-right font-bold tabular-nums whitespace-nowrap ${isCopied ? "text-slate-400" : "text-emerald-700"}`}>{r.price}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <PaymentBadge method={r.paymentMethod} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
