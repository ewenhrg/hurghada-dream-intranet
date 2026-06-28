import { memo } from "react";
import {
  PRIVATE_TRANSFER_OVER_4_PAX,
  PRIVATE_TRANSFER_UP_TO_4_PAX,
} from "../../utils/transferPricing";

export const PrivateTransferButtons = memo(function PrivateTransferButtons({
  tier = "",
  onChange,
  className = "",
  compact = false,
}) {
  const toggle = (value) => {
    onChange(tier === value ? "" : value);
  };

  const btnClass = (active) =>
    `rounded-lg border px-3 font-semibold transition-all ${
      compact ? "py-1.5 text-xs" : "py-2 text-xs md:text-sm"
    } ${
      active
        ? "border-violet-500 bg-violet-50 text-violet-900 ring-2 ring-violet-300"
        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
    }`;

  return (
    <div className={className}>
      <p className={`font-bold text-slate-700 mb-2 ${compact ? "text-xs" : "text-xs md:text-sm"}`}>
        🚐 Transfert privé <span className="font-normal text-slate-500">(s&apos;ajoute au supplément transfert)</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => toggle("upTo4")} className={btnClass(tier === "upTo4")}>
          ≤4 pax · {PRIVATE_TRANSFER_UP_TO_4_PAX}€
        </button>
        <button type="button" onClick={() => toggle("over4")} className={btnClass(tier === "over4")}>
          +4 pax · {PRIVATE_TRANSFER_OVER_4_PAX}€
        </button>
      </div>
    </div>
  );
});
