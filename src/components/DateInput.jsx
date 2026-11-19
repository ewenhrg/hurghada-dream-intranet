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

  const openCalendar = useCallback(() => {
    if (disabled) return;
    if (typeof nativeRef.current?.showPicker === "function") {
      nativeRef.current.showPicker();
    } else {
      nativeRef.current?.click();
    }
  }, [disabled]);

  return (
    <div className="flex gap-2 flex-1 min-w-0">
      <div className="flex-1 min-w-0">
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
      <input
        ref={nativeRef}
        type="date"
        lang="fr-FR"
        value={value || ""}
        onChange={handleNativeChange}
        min={min}
        max={max}
        disabled={disabled}
        className="absolute opacity-0 w-0 h-0 overflow-hidden pointer-events-none"
        tabIndex={-1}
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={openCalendar}
        disabled={disabled}
        title="Ouvrir le calendrier"
        className="flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-xl border border-[rgba(148,163,184,0.35)] bg-[var(--hd-surface-input)] hover:border-[rgba(79,70,229,0.5)] hover:shadow-md transition-all text-xl cursor-pointer touch-manipulation disabled:cursor-not-allowed disabled:opacity-50"
      >
        📅
      </button>
    </div>
  );
}
