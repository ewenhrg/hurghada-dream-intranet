import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import * as XLSX from "xlsx-js-style";
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
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Pencil,
  Printer,
} from "lucide-react";
import { currencyNoCents, saveLS, loadLS, generateTicketsHTML } from "../utils";
import { LS_KEYS } from "../constants";
import {
  formatActivityWithExtras,
  formatClientShortWithPhone,
  getQuoteItemParticipantCells,
} from "../utils/quoteItemDisplay.js";
import {
  calculateTransferSurchargeFromItem,
} from "../utils/transferPricing.js";
import { isBoatPartyActivity } from "../utils/activityHelpers";
import { TextInput } from "../components/ui";
import { EditTicketLineModal } from "../components/tickets/EditTicketLineModal.jsx";
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

const COL_COUNT = 16;

/** Pagination : évite de monter des milliers de lignes d’un coup. */
const PAGE_SIZE_OPTIONS = [50, 100, 200, 500];
const DEFAULT_PAGE_SIZE = 100;

/**
 * Numéros de pages compacts avec ellipses (1 … 4 5 6 … 20).
 * @returns {(number|'gap-left'|'gap-right')[]}
 */
function buildPageItems(current, total) {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const items = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) items.push("gap-left");
  for (let p = start; p <= end; p++) items.push(p);
  if (end < total - 1) items.push("gap-right");
  items.push(total);
  return items;
}

/** Teintes intranet + Excel (rgb sans #) par bloc d’activité. */
const ACTIVITY_PALETTE = [
  { row: "bg-sky-50", accent: "border-l-sky-400", excel: "E0F2FE", excelStrong: "7DD3FC" },
  { row: "bg-emerald-50", accent: "border-l-emerald-400", excel: "D1FAE5", excelStrong: "6EE7B7" },
  { row: "bg-amber-50", accent: "border-l-amber-400", excel: "FEF3C7", excelStrong: "FCD34D" },
  { row: "bg-violet-50", accent: "border-l-violet-400", excel: "EDE9FE", excelStrong: "C4B5FD" },
  { row: "bg-rose-50", accent: "border-l-rose-400", excel: "FFE4E6", excelStrong: "FDA4AF" },
  { row: "bg-teal-50", accent: "border-l-teal-400", excel: "CCFBF1", excelStrong: "5EEAD4" },
  { row: "bg-orange-50", accent: "border-l-orange-400", excel: "FFEDD5", excelStrong: "FDBA74" },
  { row: "bg-indigo-50", accent: "border-l-indigo-400", excel: "E0E7FF", excelStrong: "A5B4FC" },
];

const TH_BASE =
  "border border-slate-300/90 px-0.5 py-1.5 text-center text-[9px] font-bold uppercase tracking-wide leading-tight text-white";
const TD =
  "border border-slate-200/90 px-0.5 py-1 align-middle text-[10px] leading-tight overflow-hidden text-ellipsis";

const PAGER_ICON_BTN =
  "grid size-8 place-items-center rounded-lg border border-slate-300 bg-white text-slate-600 transition-all hover:border-slate-400 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-300 disabled:hover:text-slate-600";

const paymentShort = (method) =>
  method === "cash" ? "Cash" : method === "stripe" ? "Stripe" : "";

function activitySortKeyFromItem(item) {
  return String(item?.activityName || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function excelBorder(color = "CBD5E1") {
  const edge = { style: "thin", color: { rgb: color } };
  return { top: edge, bottom: edge, left: edge, right: edge };
}

function excelFill(rgb) {
  return { patternType: "solid", fgColor: { rgb } };
}

function colLetter(n) {
  let s = "";
  let x = n;
  while (x >= 0) {
    s = String.fromCharCode((x % 26) + 65) + s;
    x = Math.floor(x / 26) - 1;
  }
  return s;
}

/**
 * Registre des tickets — colonnes alignées Excel pour copier/coller direct.
 */
export function TicketsPage({ quotes = [], setQuotes }) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [editingRow, setEditingRow] = useState(null);
  const scrollRef = useRef(null);
  const [copied, setCopied] = useState(() => {
    const stored = loadLS(LS_KEYS.copiedTickets, []);
    return new Set(Array.isArray(stored) ? stored : []);
  });
  const canEdit = typeof setQuotes === "function";

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

        const boatParty = isBoatPartyActivity(item.activityName);
        list.push({
          key: `${quote.id || "q"}-${idx}-${ticketNumber}`,
          quoteId: quote.id,
          itemIndex: idx,
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
          boatPartyMen: boatParty ? Number(item.boatPartyMen || 0) : 0,
          boatPartyWomen: boatParty ? Number(item.boatPartyWomen || 0) : 0,
          activity: formatActivityWithExtras(item),
          activitySortKey: activitySortKeyFromItem(item),
          activityBaseName: String(item.activityName || "").trim() || "—",
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
    // Date croissante → activités regroupées → n° ticket
    list.sort((a, b) => {
      const da = a.date || "";
      const db = b.date || "";
      if (da !== db) return da.localeCompare(db);
      const act = String(a.activitySortKey || "").localeCompare(String(b.activitySortKey || ""), "fr", {
        sensitivity: "base",
      });
      if (act !== 0) return act;
      return String(a.ticketNumber).localeCompare(String(b.ticketNumber), "fr", { numeric: true });
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
        r.activityBaseName,
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  // Clamp au rendu : la liste peut raccourcir avant que l’effet ne recale `page`
  const currentPage = Math.min(page, totalPages);

  // Nouvelle recherche / nouveau filtre / autre taille de page : on repart de la page 1
  useEffect(() => {
    setPage(1);
  }, [q, statusFilter, pageSize]);

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = useMemo(
    () => filtered.slice(pageStart, pageStart + pageSize),
    [filtered, pageStart, pageSize]
  );

  const goToPage = useCallback(
    (next) => {
      setPage((prev) => {
        const target = Math.min(Math.max(1, next), totalPages);
        if (target !== prev && scrollRef.current) scrollRef.current.scrollTop = 0;
        return target;
      });
    },
    [totalPages]
  );

  const pageItems = useMemo(
    () => buildPageItems(currentPage, totalPages),
    [currentPage, totalPages]
  );

  /** Blocs date + en-tête activité + lignes (page courante uniquement). */
  const displayBlocks = useMemo(() => {
    const blocks = [];
    let lastDate = null;
    let lastAct = null;
    let toneIdx = 0;

    for (const r of pageRows) {
      const dateKey = r.date || "";
      if (dateKey !== lastDate) {
        blocks.push({
          type: "date",
          key: `date-${dateKey || "none"}-${blocks.length}`,
          date: dateKey,
        });
        lastDate = dateKey;
        lastAct = null;
        toneIdx = 0;
      }

      const actKey = r.activitySortKey || r.activity || "";
      if (actKey !== lastAct) {
        if (lastAct !== null) toneIdx += 1;
        const palette = ACTIVITY_PALETTE[toneIdx % ACTIVITY_PALETTE.length];
        blocks.push({
          type: "activity",
          key: `act-${dateKey}-${actKey}-${blocks.length}`,
          name: r.activityBaseName || r.activity || "Activité",
          toneClass: palette.row,
          accentClass: palette.accent,
        });
        lastAct = actKey;
      }

      const palette = ACTIVITY_PALETTE[toneIdx % ACTIVITY_PALETTE.length];
      blocks.push({
        type: "row",
        key: r.key,
        row: r,
        toneClass: palette.row,
        accentClass: palette.accent,
        toneIdx,
      });
    }
    return blocks;
  }, [pageRows]);

  const dateForExport = (d) =>
    d ? new Date(d + "T12:00:00").toLocaleDateString("fr-FR") : "";

  const formatDateDisplay = (d) =>
    d
      ? new Date(d + "T12:00:00").toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
        })
      : "";

  const formatDateBanner = (d) =>
    d
      ? new Date(d + "T12:00:00").toLocaleDateString("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "Date non renseignée";

  const matrixFromRows = useCallback((list, withHeaders) => {
    const body = [];
    let lastDate = null;
    let lastAct = null;
    for (const r of list) {
      // Ligne vide entre chaque date (saut de ligne Excel)
      if (lastDate !== null && r.date !== lastDate) {
        body.push(Array(EXPORT_HEADERS.length).fill(""));
        lastAct = null;
      }
      // Ligne vide légère entre blocs d’activité (même date)
      else if (lastAct !== null && (r.activitySortKey || r.activity) !== lastAct) {
        body.push(Array(EXPORT_HEADERS.length).fill(""));
      }
      lastDate = r.date;
      lastAct = r.activitySortKey || r.activity;
      body.push([
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
    }
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

  const handlePrintTicket = useCallback(
    (row) => {
      const quote = (quotes || []).find((q) => q.id === row.quoteId);
      if (!quote) {
        toast.error("Devis introuvable pour ce ticket.");
        return;
      }
      const items = Array.isArray(quote.items) ? quote.items : [];
      let item = items[row.itemIndex];
      const wanted = String(row.ticketNumber || "").trim().toLowerCase();
      if (
        !item ||
        String(item.ticketNumber || "").trim().toLowerCase() !== wanted
      ) {
        item = items.find(
          (it) => String(it.ticketNumber || "").trim().toLowerCase() === wanted
        );
      }
      if (!item) {
        toast.error("Ligne ticket introuvable sur le devis.");
        return;
      }

      const htmlContent = generateTicketsHTML({
        ...quote,
        items: [item],
      });
      const fileName = `Ticket - ${row.ticketNumber}`;
      const newWindow = window.open();
      if (!newWindow) {
        toast.error("Impossible d’ouvrir la fenêtre d’impression (popup bloquée).");
        return;
      }
      newWindow.document.write(htmlContent);
      newWindow.document.title = fileName;
      newWindow.document.close();
    },
    [quotes]
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

    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
      fill: excelFill("4F46E5"),
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: excelBorder("312E81"),
    };
    const dateBannerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
      fill: excelFill("0F172A"),
      alignment: { horizontal: "left", vertical: "center" },
      border: excelBorder("020617"),
    };
    /** Titre de paragraphe activité — seule couleur hors en-tête / jour. */
    const activityBannerStyle = {
      font: { bold: true, color: { rgb: "1E293B" }, sz: 10 },
      fill: excelFill("E2E8F0"),
      alignment: { horizontal: "left", vertical: "center" },
      border: excelBorder("94A3B8"),
    };
    /** Lignes clients : pas de fond coloré. */
    const dataStyle = (opts = {}) => ({
      font: { color: { rgb: "1E293B" }, sz: 10, ...(opts.bold ? { bold: true } : {}) },
      fill: excelFill("FFFFFF"),
      alignment: {
        horizontal: opts.center ? "center" : "left",
        vertical: "center",
      },
      border: excelBorder("E2E8F0"),
    });

    const aoa = [EXPORT_HEADERS];
    const meta = [{ kind: "header" }];
    let lastDate = null;
    let lastAct = null;

    for (const r of filtered) {
      if (r.date !== lastDate) {
        aoa.push([
          `📅 ${dateForExport(r.date)} — ${formatDateBanner(r.date)}`,
          ...Array(EXPORT_HEADERS.length - 1).fill(""),
        ]);
        meta.push({ kind: "date" });
        lastAct = null;
        lastDate = r.date;
      }

      const actKey = r.activitySortKey || r.activity || "";
      if (actKey !== lastAct) {
        aoa.push([
          `▶ ${r.activityBaseName || r.activity || "Activité"}`,
          ...Array(EXPORT_HEADERS.length - 1).fill(""),
        ]);
        meta.push({ kind: "activity" });
        lastAct = actKey;
      }

      aoa.push([
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
      meta.push({ kind: "data" });
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const merges = [];
    const lastCol = EXPORT_HEADERS.length - 1;

    meta.forEach((m, rowIdx) => {
      for (let c = 0; c <= lastCol; c++) {
        const addr = `${colLetter(c)}${rowIdx + 1}`;
        if (!ws[addr]) ws[addr] = { t: "s", v: "" };
        if (m.kind === "header") {
          ws[addr].s = headerStyle;
        } else if (m.kind === "date") {
          ws[addr].s = dateBannerStyle;
        } else if (m.kind === "activity") {
          ws[addr].s = activityBannerStyle;
        } else if (m.kind === "data") {
          if (c === 5 || c === 6 || c === 7 || c === 11 || c === 12)
            ws[addr].s = dataStyle({ center: true, bold: c === 11 });
          else if (c === 0 || c === 1 || c === 9 || c === 13 || c === 14)
            ws[addr].s = dataStyle({ center: true });
          else ws[addr].s = dataStyle();
        }
      }
      if (m.kind === "date" || m.kind === "activity") {
        merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: lastCol } });
      }
    });

    ws["!merges"] = merges;
    ws["!cols"] = [
      { wch: 14 },
      { wch: 12 },
      { wch: 18 },
      { wch: 22 },
      { wch: 10 },
      { wch: 8 },
      { wch: 8 },
      { wch: 8 },
      { wch: 34 },
      { wch: 12 },
      { wch: 28 },
      { wch: 10 },
      { wch: 12 },
      { wch: 10 },
      { wch: 14 },
    ];
    ws["!rows"] = meta.map((m) =>
      m.kind === "date" ? { hpt: 22 } : m.kind === "activity" ? { hpt: 18 } : { hpt: 16 }
    );

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tickets");
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `tickets-${stamp}.xlsx`);
    toast.success("Excel téléchargé (couleurs sur titres et jours uniquement).");
  }, [filtered]);

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

          <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            Lignes par page
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>

          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
            <CalendarDays className="size-3.5" aria-hidden />
            {filtered.length > 0 ? (
              <>
                {pageStart + 1}–{Math.min(pageStart + pageSize, filtered.length)} sur{" "}
                {filtered.length}
              </>
            ) : (
              "0 ligne"
            )}{" "}
            · date → activité
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
            className="overflow-hidden rounded-2xl border border-indigo-200/70 bg-white shadow-[0_16px_40px_-24px_rgba(79,70,229,0.35)] ring-1 ring-slate-200/80"
          >
            <div ref={scrollRef} className="max-h-[min(70vh,900px)] overflow-auto">
            <table className="w-full table-fixed border-collapse text-left font-sans">
              <caption className="sr-only">
                Tableau tickets : trié par date puis par activité, avec séparateurs colorés.
              </caption>
              <colgroup>
                <col style={{ width: "4.5%" }} />
                <col style={{ width: "8.5%" }} />
                <col style={{ width: "5.5%" }} />
                <col style={{ width: "11%" }} />
                <col style={{ width: "9%" }} />
                <col style={{ width: "4%" }} />
                <col style={{ width: "2.5%" }} />
                <col style={{ width: "2.5%" }} />
                <col style={{ width: "2.5%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "5%" }} />
                <col style={{ width: "7%" }} />
                <col style={{ width: "4%" }} />
                <col style={{ width: "4%" }} />
                <col style={{ width: "5%" }} />
                <col style={{ width: "6.5%" }} />
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600">
                  <th scope="col" className={TH_BASE} title="Copier">
                    ✓
                  </th>
                  <th scope="col" className={`${TH_BASE} !bg-orange-500`} title="N° Ticket">
                    N°
                  </th>
                  <th scope="col" className={TH_BASE} title="Date">
                    Date
                  </th>
                  <th scope="col" className={TH_BASE} title="3 lettres + téléphone">
                    Client
                  </th>
                  <th scope="col" className={TH_BASE} title="Hôtel">
                    Hôtel
                  </th>
                  <th scope="col" className={TH_BASE} title="Chambre">
                    Ch
                  </th>
                  <th scope="col" className={`${TH_BASE} !bg-emerald-600`} title="Adultes">
                    A
                  </th>
                  <th scope="col" className={`${TH_BASE} !bg-sky-600`} title="Enfants">
                    E
                  </th>
                  <th scope="col" className={`${TH_BASE} !bg-pink-600`} title="Bébés">
                    B
                  </th>
                  <th scope="col" className={TH_BASE} title="Activité + extras">
                    Activité
                  </th>
                  <th scope="col" className={TH_BASE} title="Prise en charge">
                    Heure
                  </th>
                  <th scope="col" className={TH_BASE} title="Note">
                    Note
                  </th>
                  <th scope="col" className={`${TH_BASE} !bg-teal-600`} title="Prix">
                    Prix
                  </th>
                  <th scope="col" className={`${TH_BASE} !bg-cyan-700`} title="Supplément transfert">
                    Tr
                  </th>
                  <th scope="col" className={TH_BASE} title="Paiement">
                    Pay
                  </th>
                  <th scope="col" className={TH_BASE} title="Vendeur">
                    Vend.
                  </th>
                </tr>
              </thead>
              <tbody>
                {displayBlocks.map((block) => {
                  if (block.type === "date") {
                    return (
                      <tr key={block.key}>
                        <td
                          colSpan={COL_COUNT}
                          className="border-y-2 border-slate-900 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-800 px-3 py-2 text-[11px] font-bold capitalize tracking-wide text-white shadow-inner"
                        >
                          <span className="inline-flex items-center gap-2">
                            <CalendarDays className="size-3.5 text-amber-300" aria-hidden />
                            <span>{formatDateBanner(block.date)}</span>
                          </span>
                        </td>
                      </tr>
                    );
                  }

                  if (block.type === "activity") {
                    return (
                      <tr key={block.key}>
                        <td
                          colSpan={COL_COUNT}
                          className={`border-y border-slate-300/80 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-800 ${block.toneClass} border-l-4 ${block.accentClass}`}
                        >
                          {block.name}
                        </td>
                      </tr>
                    );
                  }

                  const r = block.row;
                  const isCopied = copied.has(r.ticketNumber);
                  const rowBg = isCopied
                    ? "bg-slate-100 text-slate-400"
                    : block.toneClass;
                  const pay = paymentShort(r.paymentMethod);

                  return (
                    <tr
                      key={block.key}
                      className={`transition-colors hover:brightness-[0.97] ${rowBg} border-l-4 ${
                        isCopied ? "border-l-slate-300" : block.accentClass
                      }`}
                    >
                      <td className={`${TD} text-center`}>
                        <div className="flex items-center justify-center gap-0.5">
                          {canEdit ? (
                            <button
                              type="button"
                              onClick={() => setEditingRow(r)}
                              aria-label={`Modifier ${r.ticketNumber}`}
                              className="grid size-5 place-items-center rounded bg-indigo-600 text-white hover:bg-indigo-700"
                              title="Modifier la ligne"
                            >
                              <Pencil className="size-2.5" aria-hidden="true" />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void handleCopyRow(r)}
                            aria-label={`Copier ${r.ticketNumber}`}
                            className="grid size-5 place-items-center rounded bg-emerald-600 text-white hover:bg-emerald-700"
                            title="Copier la ligne"
                          >
                            <Copy className="size-2.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePrintTicket(r)}
                            aria-label={`Imprimer ${r.ticketNumber}`}
                            className="grid size-5 place-items-center rounded bg-violet-600 text-white hover:bg-violet-700"
                            title="Imprimer ce ticket"
                          >
                            <Printer className="size-2.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleCopied(r.ticketNumber)}
                            aria-pressed={isCopied}
                            className={`grid size-5 place-items-center rounded border ${
                              isCopied
                                ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                                : "border-amber-400 bg-amber-100 text-amber-800"
                            }`}
                            title={isCopied ? "Copiée" : "Nouvelle"}
                          >
                            {isCopied ? (
                              <CheckCircle2 className="size-2.5" aria-hidden="true" />
                            ) : (
                              <Sparkles className="size-2.5" aria-hidden="true" />
                            )}
                          </button>
                        </div>
                      </td>
                      <th
                        scope="row"
                        className={`${TD} bg-orange-300/90 text-center font-bold text-orange-950 ${
                          isCopied ? "!bg-slate-200 text-slate-400" : ""
                        }`}
                        title={r.ticketNumber}
                      >
                        <span className="block truncate">{r.ticketNumber}</span>
                      </th>
                      <td className={`${TD} text-center tabular-nums font-semibold text-indigo-900`} title={formatDateDisplay(r.date)}>
                        {formatDateDisplay(r.date)}
                      </td>
                      <td className={`${TD} truncate font-medium`} title={r.clientCell}>
                        {r.clientCell || ""}
                      </td>
                      <td className={`${TD} truncate`} title={r.hotel}>
                        {r.hotel || ""}
                      </td>
                      <td className={`${TD} truncate text-center font-semibold`} title={r.room}>
                        {r.room || ""}
                      </td>
                      <td className={`${TD} text-center tabular-nums font-bold text-emerald-800`}>{r.adults || ""}</td>
                      <td className={`${TD} text-center tabular-nums font-bold text-sky-800`}>{r.children || ""}</td>
                      <td className={`${TD} text-center tabular-nums font-bold text-pink-800`}>{r.babies || ""}</td>
                      <td className={`${TD} truncate font-semibold text-slate-800`} title={r.activity}>
                        {r.activity}
                      </td>
                      <td className={`${TD} truncate text-center font-semibold text-violet-800`} title={r.pickup}>
                        {r.pickup || ""}
                      </td>
                      <td className={`${TD} truncate`} title={r.note}>
                        {r.note || ""}
                      </td>
                      <td className={`${TD} text-center tabular-nums font-bold text-teal-800`}>
                        {r.priceValue || ""}
                      </td>
                      <td className={`${TD} text-center tabular-nums font-semibold text-cyan-900`}>
                        {r.transferValue > 0 ? r.transferValue : ""}
                      </td>
                      <td className={`${TD} text-center`} title={paymentText(r.paymentMethod)}>
                        {pay ? (
                          <span
                            className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                              r.paymentMethod === "cash"
                                ? "bg-emerald-200 text-emerald-900"
                                : r.paymentMethod === "stripe"
                                  ? "bg-violet-200 text-violet-900"
                                  : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {pay}
                          </span>
                        ) : null}
                      </td>
                      <td className={`${TD} truncate text-center`} title={r.createdByName}>
                        {r.createdByName || ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>

            {totalPages > 1 ? (
              <nav
                aria-label="Pagination des tickets"
                className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/80 px-3 py-2.5"
              >
                <p className="text-xs font-semibold text-slate-500" aria-live="polite">
                  Page <span className="tabular-nums text-slate-800">{currentPage}</span> sur{" "}
                  <span className="tabular-nums text-slate-800">{totalPages}</span>
                </p>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => goToPage(1)}
                    disabled={currentPage === 1}
                    aria-label="Première page"
                    className={PAGER_ICON_BTN}
                  >
                    <ChevronsLeft className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    aria-label="Page précédente"
                    className={PAGER_ICON_BTN}
                  >
                    <ChevronLeft className="size-4" aria-hidden="true" />
                  </button>

                  {pageItems.map((item) =>
                    typeof item === "number" ? (
                      <button
                        key={item}
                        type="button"
                        onClick={() => goToPage(item)}
                        aria-current={item === currentPage ? "page" : undefined}
                        aria-label={`Page ${item}`}
                        className={`grid size-8 place-items-center rounded-lg text-xs font-bold tabular-nums transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50 focus-visible:ring-offset-1 ${
                          item === currentPage
                            ? "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-[0_8px_18px_-10px_rgba(79,70,229,0.9)]"
                            : "border border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900"
                        }`}
                      >
                        {item}
                      </button>
                    ) : (
                      <span
                        key={item}
                        aria-hidden="true"
                        className="grid size-8 place-items-center text-xs font-bold text-slate-400"
                      >
                        …
                      </span>
                    )
                  )}

                  <button
                    type="button"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    aria-label="Page suivante"
                    className={PAGER_ICON_BTN}
                  >
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => goToPage(totalPages)}
                    disabled={currentPage === totalPages}
                    aria-label="Dernière page"
                    className={PAGER_ICON_BTN}
                  >
                    <ChevronsRight className="size-4" aria-hidden="true" />
                  </button>
                </div>

                <p className="text-xs text-slate-400">
                  Copie et export .xlsx portent sur les {filtered.length} lignes filtrées.
                </p>
              </nav>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>

      <EditTicketLineModal
        open={Boolean(editingRow)}
        row={editingRow}
        quotes={quotes}
        setQuotes={setQuotes}
        onClose={() => setEditingRow(null)}
      />
    </motion.div>
  );
}
