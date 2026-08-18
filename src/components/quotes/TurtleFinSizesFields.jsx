import { Footprints } from "lucide-react";
import { TextInput } from "../ui";
import { getTurtleFinSizeSlots, normalizeFinSizes } from "../../utils/activityHelpers";

/**
 * Saisie des pointures palmes (une case par participant) — devis intranet et catalogue public.
 */
export function TurtleFinSizesFields({
  adults = 0,
  children = 0,
  babies = 0,
  childLabel = "Enfant",
  babyLabel = "Bébé",
  sizes = [],
  onChange,
  variant = "intranet",
  idPrefix = "fin-size",
}) {
  const slots = getTurtleFinSizeSlots({ adults, children, babies, childLabel, babyLabel });
  if (slots.length === 0) return null;

  const values = normalizeFinSizes(sizes, slots.length);

  const handleChange = (idx, value) => {
    const next = [...values];
    next[idx] = value;
    onChange(next);
  };

  if (variant === "catalog") {
    return (
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-800">Pointures palmes</p>
        <p className="text-xs font-medium leading-relaxed text-slate-700">
          Indiquez la pointure européenne de chaque participant (ex. 42) — nécessaire pour les palmes.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {slots.map((slot, idx) => (
            <label key={slot.key} className="block" htmlFor={`${idPrefix}-${idx}`}>
              <span className="mb-1 block text-[11px] font-bold text-slate-700">{slot.label}</span>
              <input
                id={`${idPrefix}-${idx}`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={values[idx]}
                onChange={(e) => handleChange(idx, e.target.value)}
                placeholder="ex. 42"
                aria-label={`Pointure ${slot.label}`}
                className="w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-950 placeholder:text-slate-400 transition-colors hover:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                style={{ fontSize: "16px" }}
              />
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 border-teal-200/70 bg-gradient-to-br from-teal-50/70 to-cyan-50/40 p-4 md:p-5">
      <div className="mb-2 flex items-center gap-2">
        <Footprints className="size-4 shrink-0 text-teal-700" aria-hidden />
        <p className="text-xs font-bold text-slate-700 md:text-sm">Pointures palmes</p>
      </div>
      <p className="mb-3 text-xs text-slate-600">
        Une pointure (EU) par participant, pour les palmes.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {slots.map((slot, idx) => (
          <div key={slot.key}>
            <label htmlFor={`${idPrefix}-${idx}`} className="mb-1 block text-xs font-semibold text-slate-600">
              {slot.label}
            </label>
            <TextInput
              id={`${idPrefix}-${idx}`}
              value={values[idx]}
              onChange={(e) => handleChange(idx, e.target.value)}
              placeholder="ex. 42"
              inputMode="decimal"
              autoComplete="off"
              className="!py-2"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
