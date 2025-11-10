import { memo } from "react";

export const Pill = memo(({ active, children, ...props }) => (
  <button
    {...props}
    className={
      "px-4 md:px-6 py-2.5 md:py-2.5 rounded-full text-xs md:text-sm font-semibold transition-all duration-300 ease-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#8b5cf6]/50 min-h-[44px] min-w-[44px] flex items-center justify-center " +
      (active
        ? "bg-gradient-to-r from-[#4f46e5] via-[#5b3ffd] to-[#0ea5e9] text-white shadow-[0_18px_38px_-18px_rgba(79,70,229,0.75)] hover:shadow-[0_24px_46px_-22px_rgba(79,70,229,0.82)] hover:-translate-y-[2px] active:scale-95"
        : "bg-white/85 text-slate-600 border border-[rgba(148,163,184,0.28)] hover:border-[rgba(79,70,229,0.5)] hover:text-[#4338ca] hover:bg-white hover:shadow-[0_18px_30px_-24px_rgba(79,70,229,0.55)] hover:-translate-y-[2px] active:scale-95")
    }
  >
    {children}
  </button>
));

Pill.displayName = "Pill";

export const TextInput = memo(({ className = "", ...props }) => (
  <input
    {...props}
    className={
      "w-full rounded-xl border border-[rgba(148,163,184,0.25)] bg-[rgba(255,255,255,0.9)] px-3 md:px-4 py-3 md:py-2.75 text-base md:text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[rgba(79,70,229,0.25)] focus:border-[rgba(79,70,229,0.65)] transition-all duration-200 shadow-[0_16px_35px_-28px_rgba(15,23,42,0.45)] hover:border-[rgba(79,70,229,0.4)] min-h-[44px] " +
      className
    }
  />
));

TextInput.displayName = "TextInput";

export const NumberInput = memo(({ className = "", ...props }) => (
  <input
    type="number"
    {...props}
    className={
      "w-full rounded-xl border border-[rgba(148,163,184,0.25)] bg-[rgba(255,255,255,0.9)] px-3 md:px-4 py-3 md:py-2.75 text-base md:text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[rgba(79,70,229,0.25)] focus:border-[rgba(79,70,229,0.65)] transition-all duration-200 shadow-[0_16px_35px_-28px_rgba(15,23,42,0.45)] hover:border-[rgba(79,70,229,0.4)] min-h-[44px] " +
      className
    }
  />
));

NumberInput.displayName = "NumberInput";

const PRIMARY_VARIANTS = {
  primary:
    "bg-gradient-to-r from-[#4338ca] via-[#4f46e5] to-[#0ea5e9] shadow-[0_22px_50px_-22px_rgba(79,70,229,0.85)] hover:shadow-[0_26px_60px_-24px_rgba(79,70,229,0.92)]",
  danger:
    "bg-gradient-to-r from-[#dc2626] via-[#ef4444] to-[#f97316] shadow-[0_22px_50px_-22px_rgba(220,38,38,0.75)] hover:shadow-[0_26px_60px_-24px_rgba(220,38,38,0.85)]",
  success:
    "bg-gradient-to-r from-[#059669] via-[#10b981] to-[#22d3ee] shadow-[0_22px_50px_-22px_rgba(16,185,129,0.65)] hover:shadow-[0_26px_60px_-24px_rgba(16,185,129,0.75)]",
  neutral:
    "bg-gradient-to-r from-[#475569] via-[#1e293b] to-[#0f172a] shadow-[0_22px_50px_-22px_rgba(30,41,59,0.72)] hover:shadow-[0_26px_60px_-24px_rgba(30,41,59,0.8)]",
};

export const PrimaryBtn = memo(({ className = "", disabled, variant = "primary", ...props }) => {
  const variantClass = PRIMARY_VARIANTS[variant] ?? PRIMARY_VARIANTS.primary;
  return (
    <button
      {...props}
      disabled={disabled}
      className={
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 md:px-6 py-3 md:py-3 text-sm font-semibold text-white transition-all duration-300 ease-out hover:-translate-y-[2px] active:translate-y-0 active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 min-h-[44px] min-w-[44px] " +
        (disabled ? "opacity-50 cursor-not-allowed hover:translate-y-0 " : "") +
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

export const GhostBtn = memo(({ className = "", size, variant = "neutral", ...props }) => {
  const sizeClasses = size === "sm" ? "px-3 md:px-3.5 py-2 md:py-1.75 text-xs" : "px-4 md:px-5.5 py-2.5 md:py-2.75 text-sm";
  const variantClass = GHOST_VARIANTS[variant] ?? GHOST_VARIANTS.neutral;
  return (
    <button
      {...props}
      className={
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold shadow-[0_14px_30px_-24px_rgba(15,23,42,0.4)] transition-all duration-300 ease-out hover:-translate-y-[2px] active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4f46e5]/20 bg-white/88 min-h-[44px] min-w-[44px] " +
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
        <h2 className="text-xl md:text-[1.75rem] font-semibold tracking-[-0.03em] text-slate-900 mb-1 md:mb-1.5 bg-gradient-to-r from-[#4f46e5] via-[#5b3ffd] to-[#0ea5e9] bg-clip-text text-transparent">
          {title}
        </h2>
        {subtitle && <p className="text-xs md:text-sm font-medium text-white/70 leading-relaxed drop-shadow-[0_6px_12px_rgba(7,13,31,0.55)]">{subtitle}</p>}
      </div>
      {right && <div className="flex-shrink-0 w-full md:w-auto">{right}</div>}
    </div>
    <div className="hd-card hd-border-gradient p-4 md:p-6 lg:p-8">
      {children}
    </div>
  </section>
));

Section.displayName = "Section";

