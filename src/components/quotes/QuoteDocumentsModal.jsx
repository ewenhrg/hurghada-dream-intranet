import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Upload } from "lucide-react";
import { GhostBtn, PrimaryBtn } from "../ui";
import { toast } from "../../utils/toast.js";
import {
  HOTEL_CLIENT_DOC_TYPES,
  hotelClientDocTypeLabel,
  normalizeClientDocuments,
} from "../../utils/hotelRequestDocuments";
import {
  getQuoteLastActivityDate,
  isQuoteLastActivityPastRetention,
} from "../../utils/cleanupExpiredQuoteDocuments";

const CLIENT_DOC_MAX_BYTES = 15 * 1024 * 1024;

/**
 * Modal pour ajouter / retirer des PDF ou images sur un devis activités.
 */
export function QuoteDocumentsModal({ quote, onClose, onAdd, onRemove, saving }) {
  const docs = normalizeClientDocuments(quote?.clientDocuments);
  const [docType, setDocType] = useState("passport");
  const [customLabel, setCustomLabel] = useState("");
  const [file, setFile] = useState(null);
  const expired = isQuoteLastActivityPastRetention(quote);
  const lastActivityDate = getQuoteLastActivityDate(quote);

  useEffect(() => {
    setDocType("passport");
    setCustomLabel("");
    setFile(null);
  }, [quote?.id]);

  if (!quote) return null;

  const clientLabel =
    [quote.client?.name, quote.client?.phone].filter(Boolean).join(" · ") || "Client";

  const canAdd =
    !expired &&
    !saving &&
    file &&
    (docType !== "other" || String(customLabel || "").trim());

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quote-documents-title"
      onClick={() => !saving && onClose?.()}
    >
      <div
        className="my-8 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-indigo-600">
              Documents
            </p>
            <h2 id="quote-documents-title" className="mt-1 text-lg font-bold text-slate-900">
              Documents du devis
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-600">{clientLabel}</p>
          </div>
          <GhostBtn type="button" onClick={onClose} disabled={saving}>
            Fermer
          </GhostBtn>
        </div>

        <div className="mt-5 space-y-3">
          {expired ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-950">
              Dernière activité
              {lastActivityDate
                ? ` (${new Date(lastActivityDate + "T12:00:00").toLocaleDateString("fr-FR")})`
                : ""}{" "}
              passée — les passeports / documents sont purgés automatiquement et ne peuvent plus
              être ajoutés.
            </p>
          ) : null}
          <label className="block">
            <span className="text-[11px] font-bold uppercase text-slate-500">Type de document</span>
            <select
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
              value={docType}
              disabled={saving || expired}
              onChange={(e) => setDocType(e.target.value)}
            >
              {HOTEL_CLIENT_DOC_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          {docType === "other" ? (
            <label className="block">
              <span className="text-[11px] font-bold uppercase text-slate-500">Libellé</span>
              <input
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/25"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                disabled={saving || expired}
                placeholder="ex. Assurance voyage"
              />
            </label>
          ) : null}

          <div>
            <span className="text-[11px] font-bold uppercase text-slate-500">Fichier</span>
            <label className={`mt-1.5 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center transition ${expired ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/40"}`}>
              <Upload className="h-5 w-5 text-slate-500" aria-hidden />
              <span className="text-sm font-semibold text-slate-800">
                {file ? file.name : "Choisir un fichier"}
              </span>
              <span className="text-[11px] font-medium text-slate-500">
                Image ou PDF · max 15 Mo
              </span>
              <input
                type="file"
                accept="image/*,application/pdf"
                className="sr-only"
                disabled={saving || expired}
                onChange={(e) => {
                  const next = e.target.files?.[0] || null;
                  if (!next) {
                    setFile(null);
                    return;
                  }
                  const okType =
                    next.type.startsWith("image/") || next.type === "application/pdf";
                  if (!okType) {
                    toast.warning("Fichier accepté : image ou PDF.");
                    e.target.value = "";
                    return;
                  }
                  if (next.size > CLIENT_DOC_MAX_BYTES) {
                    toast.warning("Fichier trop lourd (max 15 Mo).");
                    e.target.value = "";
                    return;
                  }
                  setFile(next);
                }}
              />
            </label>
          </div>

          <div className="flex justify-end">
            <PrimaryBtn
              type="button"
              disabled={!canAdd}
              onClick={() => {
                onAdd?.({
                  type: docType,
                  label: docType === "other" ? String(customLabel || "").trim() : "",
                  file,
                });
                setFile(null);
                setCustomLabel("");
                setDocType("passport");
              }}
            >
              {saving ? "Upload…" : "Ajouter au devis"}
            </PrimaryBtn>
          </div>
        </div>

        <div className="mt-6 border-t border-slate-200 pt-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Déjà liés ({docs.length})
          </p>
          {docs.length === 0 ? (
            <p className="mt-2 text-sm font-medium text-slate-600">Aucun document pour ce devis.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {docs.map((doc) => (
                <li
                  key={doc.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
                >
                  <div className="min-w-0 flex items-start gap-2">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900">
                        {hotelClientDocTypeLabel(doc.type, doc.label)}
                      </p>
                      <p className="truncate text-xs font-medium text-slate-500">
                        {doc.fileName || "Fichier"}
                        {doc.uploadedAt
                          ? ` · ${new Date(doc.uploadedAt).toLocaleDateString("fr-FR")}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50"
                    >
                      Ouvrir
                    </a>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => onRemove?.(doc.id)}
                      className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    >
                      Retirer
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
