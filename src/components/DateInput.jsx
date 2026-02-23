import { useRef, useCallback, useState, useEffect } from "react";
import { TextInput } from "./ui";

// Afficher en JJ/MM/AAAA
export function formatDateForDisplay(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return dateStr;
  return `${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`;
}

// Accepter JJ/MM/AAAA, JJ-MM-AAAA ou AAAA-MM-JJ, renvoyer toujours AAAA-MM-JJ
export function parseDateInput(input) {
  if (!input || typeof input !== "string") return "";
  const cleaned = input.trim().replace(/\s+/g, "");
  const parts = cleaned.split(/[\/\-.]/).filter(Boolean);
  if (parts.length !== 3) return "";
  const a = parts[0];
  const b = parts[1].padStart(2, "0");
  const c = parts[2].padStart(2, "0");
  // Premier groupe = 4 chiffres → AAAA-MM-JJ
  if (a.length === 4 && /^\d+$/.test(a)) {
    const y = parseInt(a, 10);
    const m = parseInt(b, 10);
    const d = parseInt(c, 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${a}-${b}-${c}`;
    }
    return "";
  }
  // Sinon JJ/MM/AAAA (année en 3e position, 4 chiffres)
  if (a.length <= 2 && b.length <= 2 && parts[2].length === 4) {
    const d = parseInt(a.padStart(2, "0"), 10);
    const m = parseInt(b, 10);
    const y = parseInt(parts[2], 10);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      return `${y}-${b}-${a.padStart(2, "0")}`;
    }
  }
  return "";
}

export function DateInput({ value = "", onChange, className = "", min, max, id, "aria-label": ariaLabel, showCalendarButton = true }) {
  const nativeInputRef = useRef(null);
  const [text, setText] = useState(() => (value ? formatDateForDisplay(value) : ""));

  useEffect(() => {
    if (!value) {
      setText("");
      return;
    }
    const formatted = formatDateForDisplay(value);
    setText(formatted);
  }, [value]);

  const handleTextChange = useCallback(
    (e) => {
      const raw = e.target.value;
      setText(raw);
      if (!raw.trim()) {
        onChange("");
        return;
      }
      const parsed = parseDateInput(raw);
      if (parsed) onChange(parsed);
    },
    [onChange]
  );

  const handleBlur = useCallback(
    (e) => {
      const raw = e.target.value.trim();
      if (!raw) {
        onChange("");
        return;
      }
      const parsed = parseDateInput(raw);
      if (parsed) {
        onChange(parsed);
        setText(formatDateForDisplay(parsed));
      } else {
        setText(value ? formatDateForDisplay(value) : "");
      }
    },
    [onChange, value]
  );

  const handleNativeChange = useCallback(
    (e) => {
      const v = e.target.value;
      if (v) {
        onChange(v);
        setText(formatDateForDisplay(v));
      }
    },
    [onChange]
  );

  const openCalendar = useCallback(() => {
    nativeInputRef.current?.click();
  }, []);

  return (
    <div className="flex gap-2 flex-1 min-w-0">
      <div className="flex-1 min-w-0">
        <TextInput
          type="text"
          id={id}
          aria-label={ariaLabel}
          value={text}
          onChange={handleTextChange}
          onBlur={handleBlur}
          placeholder="JJ/MM/AAAA"
          className={className}
          inputMode="numeric"
          autoComplete="off"
        />
      </div>
      <input
        ref={nativeInputRef}
        type="date"
        value={value || ""}
        onChange={handleNativeChange}
        min={min}
        max={max}
        className="absolute w-0 h-0 opacity-0 pointer-events-none"
        tabIndex={-1}
        aria-hidden="true"
      />
      {showCalendarButton && (
        <button
          type="button"
          onClick={openCalendar}
          title="Ouvrir le calendrier"
          className="flex-shrink-0 px-3 py-2 rounded-xl border border-[rgba(148,163,184,0.35)] bg-[rgba(255,255,255,0.98)] hover:border-[rgba(79,70,229,0.5)] hover:shadow-md transition-all min-h-[44px] min-w-[44px] touch-manipulation text-xl"
        >
          📅
        </button>
      )}
    </div>
  );
}
