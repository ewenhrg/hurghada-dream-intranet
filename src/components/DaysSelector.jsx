import { memo } from "react";
import { WEEKDAYS } from "../constants";

export const DaysSelector = memo(({ value = [], onChange }) => {
  const safe = Array.isArray(value) && value.length === 7 ? value : [false, false, false, false, false, false, false];
  return (
    <div className="flex flex-wrap gap-2">
      {WEEKDAYS.map((d, idx) => (
        <label key={d.key} className="inline-flex items-center gap-2 text-sm bg-gray-50 border rounded-xl px-3 py-1">
          <input
            type="checkbox"
            checked={!!safe[idx]}
            onChange={(e) => {
              const next = [...safe];
              next[idx] = e.target.checked;
              onChange(next);
            }}
          />
          {d.label}
        </label>
      ))}
    </div>
  );
});

DaysSelector.displayName = "DaysSelector";

