import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Upload } from "lucide-react";
import { GhostBtn } from "../ui";
import { toast } from "../../utils/toast.js";
import { hotelClientDocTypeLabel, normalizeClientDocuments } from "../../utils/hotelRequestDocuments";
import {
  getQuoteLastActivityDate,
  isQuoteLastActivityPastRetention,
} from "../../utils/cleanupExpiredQuoteDocuments";

const CLIENT_DOC_MAX_BYTES = 15 * 1024 * 1024;

function isAcceptedFile(file) {
  if (!file) return false;
  if (file.size > CLIENT_DOC_MAX_BYTES) return false;
  return true;
}

function fileDisplayName(doc) {
  const fromLabel = String(doc?.label || "").trim();
  if (fromLabel) return fromLabel;
  const fromType = hotelClientDocTypeLabel(doc?.type, doc?.label);
  if (fromType && fromType !== "Document" && fromType !== "Autre") return fromType;
  return String(doc?.fileName || "Fichier").trim() || "Fichier";
}

/**
 * Modal pour ajouter / retirer des fichiers sur un devis activités
 * (glisser-déposer, sans liste de types).
 */
export function QuoteDocumentsModal({ quote, onClose, onAdd, onRemove, saving }) {
  const docs = normalizeClientDocuments(quote?.clientDocuments);
  const [dragOver, setDragOver] = useState(false);
  const [busyCount, setBusyCount] = useState(0);
  const inputRef = useRef(null);
  const dragDepthRef = useRef(0);
  const expired = isQuoteLastActivityPastRetention(quote);
  const lastActivityDate = getQuoteLastActivityDate(quote);
  const uploading = saving || busyCount > 0;

  useEffect(() => {
    setDragOver(false);
    dragDepthRef.current = 0;
    setBusyCount(0);
  }, [quote?.id]);

  const processFiles = useCallback(
    async (fileList) => {
      if (expired || uploading) return;
      const files = Array.from(fileList || []).filter(Boolean);
      if (files.length === 0) return;

      const accepted = [];
      for (const file of files) {
        if (file.size > CLIENT_DOC_MAX_BYTES) {
          toast.warning(`« ${file.name} » trop lourd (max 15 Mo).`);
          continue;
        }
        if (!isAcceptedFile(file)) continue;
        accepted.push(file);
      }
      if (accepted.length === 0) return;

      setBusyCount(accepted.length);
      try {
        for (const file of accepted) {
          await onAdd?.({
            type: "other",
            label: String(file.name || "").trim(),
            file,
          });
        }
      } finally {
        setBusyCount(0);
      }
    },
    [expired, uploading, onAdd]
  );

  if (!quote) return null;

  const clientLabel =
    [quote.client?.name, quote.client?.phone].filter(Boolean).join(" · ") || "Client";

  const zoneDisabled = expired || uploading;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quote-documents-title"
      onClick={() => !uploading && onClose?.()}
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
          <GhostBtn type="button" onClick={onClose} disabled={uploading}>
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
              passée — les documents sont purgés automatiquement et ne peuvent plus être ajoutés.
            </p>
          ) : null}

          <div
            role="button"
            tabIndex={zoneDisabled ? -1 : 0}
            aria-disabled={zoneDisabled}
            onKeyDown={(e) => {
              if (zoneDisabled) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            onClick={() => {
              if (!zoneDisabled) inputRef.current?.click();
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (zoneDisabled) return;
              dragDepthRef.current += 1;
              setDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (zoneDisabled) return;
              e.dataTransfer.dropEffect = "copy";
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
              if (dragDepthRef.current === 0) setDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              dragDepthRef.current = 0;
              setDragOver(false);
              if (zoneDisabled) return;
              void processFiles(e.dataTransfer?.files);
            }}
            className={[
              "flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition",
              zoneDisabled
                ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60"
                : dragOver
                  ? "cursor-copy border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/30"
                  : "cursor-pointer border-slate-300 bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50/40",
            ].join(" ")}
          >
            <Upload
              className={`h-7 w-7 ${dragOver ? "text-indigo-600" : "text-slate-500"}`}
              aria-hidden
            />
            <span className="text-sm font-bold text-slate-900">
              {uploading
                ? "Envoi en cours…"
                : dragOver
                  ? "Déposez les fichiers ici"
                  : "Glissez-déposez vos documents"}
            </span>
            <span className="text-xs font-medium text-slate-500">
              ou cliquez pour parcourir · tous formats · max 15 Mo chacun
            </span>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="sr-only"
              disabled={zoneDisabled}
              onChange={(e) => {
                const list = e.target.files;
                e.target.value = "";
                void processFiles(list);
              }}
            />
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
                      <p className="font-bold text-slate-900 truncate">{fileDisplayName(doc)}</p>
                      {doc.uploadedAt ? (
                        <p className="text-xs font-medium text-slate-500">
                          {new Date(doc.uploadedAt).toLocaleDateString("fr-FR")}
                        </p>
                      ) : null}
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
                      disabled={uploading}
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
