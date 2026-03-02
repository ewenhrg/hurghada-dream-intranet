import { memo } from "react";
import { getTouchHandlers } from "../utils/touchHandler";

export const Pill = memo(({ active, children, onClick, ...props }) => {
  const touchHandlers = getTouchHandlers(onClick);
  
  return (
    <button
      {...props}
      {...touchHandlers}
      className={
        "px-4 md:px-6 py-2.5 md:py-2.5 rounded-full text-xs md:text-sm font-semibold transition-transform duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#8b5cf6]/50 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation " +
        (active
          ? "bg-gradient-to-r from-[#4f46e5] via-[#6366f1] to-[#06b6d4] text-white shadow-[0_16px_32px_-16px_rgba(79,70,229,0.7)] hover:shadow-[0_18px_36px_-18px_rgba(79,70,229,0.75)] hover:-translate-y-[1px] active:scale-[0.98]"
          : "bg-white/95 text-[#000000] border border-[rgba(148,163,184,0.35)] hover:border-[rgba(79,70,229,0.55)] hover:text-[#4338ca] hover:bg-white hover:shadow-[0_14px_24px_-20px_rgba(79,70,229,0.45)] hover:-translate-y-[1px] active:scale-[0.98]")
      }
    >
      {children}
    </button>
  );
});

Pill.displayName = "Pill";

export const TextInput = memo(({ className = "", ...props }) => (
  <input
    {...props}
    className={
      "w-full rounded-xl border border-[rgba(148,163,184,0.35)] bg-[rgba(255,255,255,0.98)] backdrop-blur-sm px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[rgba(79,70,229,0.3)] focus:border-[rgba(79,70,229,0.7)] transition-all duration-200 shadow-[0_16px_35px_-28px_rgba(15,23,42,0.45)] hover:border-[rgba(79,70,229,0.5)] hover:shadow-[0_18px_38px_-28px_rgba(15,23,42,0.5)] focus:shadow-[0_0_0_2px_rgba(79,70,229,0.2),0_18px_36px_-26px_rgba(15,23,42,0.5)] min-h-[44px] touch-manipulation " +
      className
    }
    style={{ fontSize: '16px' }} // Prévenir le zoom automatique sur iOS
  />
));

TextInput.displayName = "TextInput";

export const NumberInput = memo(({ className = "", ...props }) => (
  <input
    type="number"
    {...props}
    className={
      "w-full rounded-xl border border-[rgba(148,163,184,0.35)] bg-[rgba(255,255,255,0.98)] backdrop-blur-sm px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[rgba(79,70,229,0.3)] focus:border-[rgba(79,70,229,0.7)] transition-all duration-200 shadow-[0_16px_35px_-28px_rgba(15,23,42,0.45)] hover:border-[rgba(79,70,229,0.5)] hover:shadow-[0_18px_38px_-28px_rgba(15,23,42,0.5)] focus:shadow-[0_0_0_2px_rgba(79,70,229,0.2),0_18px_36px_-26px_rgba(15,23,42,0.5)] min-h-[44px] touch-manipulation " +
      className
    }
    style={{ fontSize: '16px' }} // Prévenir le zoom automatique sur iOS
  />
));

NumberInput.displayName = "NumberInput";

const PRIMARY_VARIANTS = {
  primary:
    "bg-gradient-to-r from-[#4338ca] via-[#4f46e5] to-[#06b6d4] shadow-[0_18px_42px_-20px_rgba(79,70,229,0.75)] hover:shadow-[0_20px_46px_-20px_rgba(79,70,229,0.8)]",
  danger:
    "bg-gradient-to-r from-[#dc2626] via-[#ef4444] to-[#f87171] shadow-[0_18px_42px_-20px_rgba(220,38,38,0.7)] hover:shadow-[0_20px_46px_-20px_rgba(220,38,38,0.75)]",
  success:
    "bg-gradient-to-r from-[#16a34a] via-[#22c55e] to-[#4ade80] shadow-[0_18px_42px_-20px_rgba(34,197,94,0.6)] hover:shadow-[0_20px_46px_-20px_rgba(34,197,94,0.65)]",
  neutral:
    "bg-gradient-to-r from-[#475569] via-[#1e293b] to-[#0f172a] shadow-[0_18px_42px_-20px_rgba(30,41,59,0.65)] hover:shadow-[0_20px_46px_-20px_rgba(30,41,59,0.7)]",
};

export const PrimaryBtn = memo(({ className = "", disabled, variant = "primary", onClick, ...props }) => {
  const variantClass = PRIMARY_VARIANTS[variant] ?? PRIMARY_VARIANTS.primary;
  const touchHandlers = getTouchHandlers(onClick);
  
  return (
    <button
      {...props}
      {...touchHandlers}
      disabled={disabled}
      className={
        "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-semibold text-white transition-transform duration-200 ease-out hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[rgba(79,70,229,0.4)] min-h-[48px] min-w-[48px] touch-manipulation " +
        (disabled ? "opacity-50 cursor-not-allowed hover:translate-y-0 hover:scale-100 " : "") +
        variantClass +
        " " +
        className
      }
    />
  );
});

PrimaryBtn.displayName = "PrimaryBtn";

const GHOST_VARIANTS = {
  primary:
    "text-[#4338ca] border-[rgba(79,70,229,0.4)] hover:bg-[rgba(79,70,229,0.12)]",
  neutral:
    "text-slate-600 border-[rgba(148,163,184,0.35)] hover:bg-white",
  danger:
    "text-[#dc2626] border-[rgba(239,68,68,0.45)] hover:bg-[rgba(239,68,68,0.12)]",
  success:
    "text-[#047857] border-[rgba(16,185,129,0.45)] hover:bg-[rgba(16,185,129,0.12)]",
  warning:
    "text-[#b45309] border-[rgba(245,158,11,0.45)] hover:bg-[rgba(245,158,11,0.14)]",
};

export const GhostBtn = memo(({ className = "", size, variant = "neutral", onClick, ...props }) => {
  const sizeClasses = size === "sm" ? "px-3 md:px-3.5 py-2 md:py-1.75 text-xs" : "px-4 md:px-5.5 py-2.5 md:py-2.75 text-sm";
  const variantClass = GHOST_VARIANTS[variant] ?? GHOST_VARIANTS.neutral;
  const touchHandlers = getTouchHandlers(onClick);
  
  return (
    <button
      {...props}
      {...touchHandlers}
      className={
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold border shadow-[0_14px_30px_-24px_rgba(15,23,42,0.4)] transition-all duration-200 ease-out hover:-translate-y-[1px] active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4f46e5]/20 bg-white/95 backdrop-blur-sm min-h-[44px] min-w-[44px] touch-manipulation hover:shadow-[0_16px_32px_-24px_rgba(15,23,42,0.45)] " +
        sizeClasses +
        " " +
        variantClass +
        " " +
        className
      }
    />
  );
});

GhostBtn.displayName = "GhostBtn";

export const Section = memo(({ title, subtitle, right, children }) => (
  <section className="space-y-4 md:space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3 md:gap-4">
      <div className="flex-1 min-w-0">
        <h2 className="text-xl md:text-[1.75rem] font-semibold tracking-[-0.03em] text-white mb-1 md:mb-1.5 drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
          {title}
        </h2>
        {subtitle && <p className="text-xs md:text-sm font-medium text-white/90 leading-relaxed drop-shadow-[0_6px_12px_rgba(7,13,31,0.55)]">{subtitle}</p>}
      </div>
      {right && <div className="flex-shrink-0 w-full md:w-auto">{right}</div>}
    </div>
    <div className="hd-card hd-border-gradient p-4 md:p-6 lg:p-8">
      {children}
    </div>
  </section>
));

Section.displayName = "Section";

