import { useRef, useCallback, useState, useEffect } from "react";
import { TextInput } from "./ui";

function formatForDisplay(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return dateStr;
  return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
}

/** Garde uniquement les chiffres, max 8 (DDMMAAAA), et insère les "/" automatiquement. */
function formatWithSlashes(input) {
  const digits = (input || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseTypedDate(input) {
  if (!input || typeof input !== "string") return "";
  const cleaned = input.trim().replace(/\s+/g, "");
  const parts = cleaned.split(/[/\-.]/).filter(Boolean);
  if (parts.length !== 3) return "";
  const a = parts[0];
  const b = parts[1].padStart(2, "0");
  const c = parts[2].padStart(2, "0");
  if (a.length === 4 && /^\d+$/.test(a)) {
    const m = parseInt(b, 10);
    const d = parseInt(c, 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${a}-${b}-${c}`;
    return "";
  }
  if (a.length <= 2 && b.length <= 2 && parts[2].length === 4) {
    const d = parseInt(a.padStart(2, "0"), 10);
    const m = parseInt(b, 10);
    const y = parseInt(parts[2], 10);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) return `${y}-${b}-${a.padStart(2, "0")}`;
  }
  return "";
}

/** true si YYYY-MM-DD est dans [min, max] (bornes optionnelles). */
function isWithinDateBounds(ymd, min, max) {
  if (!ymd) return false;
  if (min && ymd < min) return false;
  if (max && ymd > max) return false;
  return true;
}

/**
 * Champ date : saisie au clavier (JJ/MM/AAAA ou AAAA-MM-JJ) OU sélection via le calendrier.
 * La valeur est toujours stockée en AAAA-MM-JJ pour que le bouton Auto-dates fonctionne.
 */
export function DateInput({
  value = "",
  onChange,
  className = "",
  min,
  max,
  required = false,
  disabled = false,
  name,
  id,
}) {
  const nativeRef = useRef(null);
  const [text, setText] = useState(() => (value ? formatForDisplay(value) : ""));

  useEffect(() => {
    setText(value ? formatForDisplay(value) : "");
  }, [value]);

  const emit = useCallback(
    (next) => {
      if (typeof onChange === "function") onChange(next);
    },
    [onChange]
  );

  const handleTextChange = useCallback(
    (e) => {
      const raw = e.target.value;
      const formatted = formatWithSlashes(raw);
      setText(formatted);
      if (!formatted) {
        emit("");
        return;
      }
      const parsed = parseTypedDate(formatted);
      if (parsed && isWithinDateBounds(parsed, min, max)) emit(parsed);
    },
    [emit, min, max]
  );

  const handleBlur = useCallback(
    (e) => {
      const raw = e.target.value.trim();
      if (!raw) {
        emit("");
        return;
      }
      const parsed = parseTypedDate(raw);
      if (parsed && isWithinDateBounds(parsed, min, max)) {
        emit(parsed);
        setText(formatForDisplay(parsed));
      } else {
        setText(value ? formatForDisplay(value) : "");
      }
    },
    [emit, value, min, max]
  );

  const handleNativeChange = useCallback(
    (e) => {
      const v = e.target.value;
      if (v && isWithinDateBounds(v, min, max)) {
        emit(v);
        setText(formatForDisplay(v));
      }
    },
    [emit, min, max]
  );

  const openCalendar = useCallback(
    (event) => {
      // Évite que le <label> parent recentre le focus sur le champ texte (mobile).
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (disabled) return;
      const node = nativeRef.current;
      if (!node) return;
      try {
        if (typeof node.showPicker === "function") {
          node.showPicker();
          return;
        }
      } catch {
        /* showPicker peut échouer hors geste / navigateur : fallback click */
      }
      node.click();
    },
    [disabled]
  );

  return (
    <div className="flex min-w-0 flex-1 gap-2">
      <div className="min-w-0 flex-1">
        <TextInput
          type="text"
          value={text}
          onChange={handleTextChange}
          onBlur={handleBlur}
          placeholder="JJ/MM/AAAA"
          className={className}
          inputMode="numeric"
          autoComplete="off"
          required={required}
          disabled={disabled}
          name={name}
          id={id}
        />
      </div>
      {/*
        Sur téléphone, un input date en 0×0 + pointer-events:none n’ouvre pas le picker.
        On pose l’input natif transparent sur l’icône : le tap ouvre le calendrier système,
        tout en gardant la saisie JJ/MM/AAAA à côté.
      */}
      <div
        className={`relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-xl border border-[rgba(148,163,184,0.35)] bg-[var(--hd-surface-input)] transition-all ${
          disabled
            ? "cursor-not-allowed opacity-50"
            : "cursor-pointer touch-manipulation hover:border-[rgba(79,70,229,0.5)] hover:shadow-md"
        }`}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center text-xl"
        >
          📅
        </span>
        <input
          ref={nativeRef}
          type="date"
          lang="fr-FR"
          value={value || ""}
          onChange={handleNativeChange}
          onClick={openCalendar}
          min={min}
          max={max}
          disabled={disabled}
          title="Ouvrir le calendrier"
          aria-label="Ouvrir le calendrier"
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
      </div>
    </div>
  );
}
