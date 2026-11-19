import { memo } from "react";
import { getTouchHandlers } from "../utils/touchHandler";

export const Pill = memo(({ active, children, onClick, tone = "dark", className = "", ...props }) => {
  const touchHandlers = getTouchHandlers(onClick);
  const inactiveClass =
    tone === "light"
      ? "bg-[var(--hd-surface)] text-[#1e293b] border border-[rgba(148,163,184,0.35)] hover:bg-[var(--hd-surface-strong)]"
      : "bg-white/10 text-white/85 border border-white/20 hover:bg-white/15";

  return (
    <button
      {...props}
      {...touchHandlers}
      className={
        "px-4 md:px-6 py-2.5 md:py-2.5 rounded-full text-xs md:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#8b5cf6]/50 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation " +
        (active
          ? "bg-gradient-to-r from-[#a855f7] via-[#6366f1] to-[#06b6d4] text-white"
          : inactiveClass) +
        " " +
        className
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
      "w-full rounded-xl border border-[rgba(148,163,184,0.35)] bg-[var(--hd-surface-input)] px-4 py-3 text-base text-slate-800 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-[rgba(79,70,229,0.3)] focus:border-[rgba(79,70,229,0.7)] min-h-[44px] touch-manipulation " +
      className
    }
    style={{ fontSize: "16px" }} // Prévenir le zoom automatique sur iOS
  />
));

TextInput.displayName = "TextInput";

export const NumberInput = memo(({ className = "", onWheel, ...props }) => {
  return (
    <input
      type="number"
      {...props}
      onWheel={(e) => {
        e.currentTarget.blur();
        onWheel?.(e);
      }}
      className={
        "w-full rounded-xl border border-[rgba(148,163,184,0.35)] bg-[var(--hd-surface-input)] px-4 py-3 text-base text-slate-800 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-[rgba(79,70,229,0.3)] focus:border-[rgba(79,70,229,0.7)] min-h-[44px] touch-manipulation " +
        className
      }
      style={{ fontSize: "16px" }}
    />
  );
});

NumberInput.displayName = "NumberInput";

const PRIMARY_VARIANTS = {
  primary: "bg-gradient-to-r from-[#4338ca] via-[#7c3aed] to-[#06b6d4]",
  danger: "bg-gradient-to-r from-[#dc2626] via-[#ef4444] to-[#f87171]",
  success: "bg-gradient-to-r from-[#16a34a] via-[#22c55e] to-[#4ade80]",
  neutral: "bg-gradient-to-r from-[#475569] via-[#1e293b] to-[#0f172a]",
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
        "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-semibold text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[rgba(124,58,237,0.45)] min-h-[48px] min-w-[48px] touch-manipulation " +
        (disabled ? "opacity-50 cursor-not-allowed " : "") +
        variantClass +
        " " +
        className
      }
    />
  );
});

PrimaryBtn.displayName = "PrimaryBtn";

const GHOST_VARIANTS = {
  primary: "text-[#4338ca] border-[rgba(79,70,229,0.4)] hover:bg-[rgba(79,70,229,0.12)]",
  neutral: "text-slate-600 border-[rgba(148,163,184,0.35)] hover:bg-[var(--hd-surface-strong)]",
  danger: "text-[#dc2626] border-[rgba(239,68,68,0.45)] hover:bg-[rgba(239,68,68,0.12)]",
  success: "text-[#047857] border-[rgba(16,185,129,0.45)] hover:bg-[rgba(16,185,129,0.12)]",
  warning: "text-[#b45309] border-[rgba(245,158,11,0.45)] hover:bg-[rgba(245,158,11,0.14)]",
};

export const GhostBtn = memo(({ className = "", size, variant = "neutral", onClick, ...props }) => {
  const sizeClasses =
    size === "sm" ? "px-3 md:px-3.5 py-2 md:py-1.75 text-xs" : "px-4 md:px-5.5 py-2.5 md:py-2.75 text-sm";
  const variantClass = GHOST_VARIANTS[variant] ?? GHOST_VARIANTS.neutral;
  const touchHandlers = getTouchHandlers(onClick);

  return (
    <button
      {...props}
      {...touchHandlers}
      className={
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold border focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4f46e5]/20 bg-[var(--hd-surface)] min-h-[44px] min-w-[44px] touch-manipulation " +
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

export const Section = memo(({ title, subtitle, right, children, bare = false, onBack }) => (
  <section className="space-y-4 md:space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3 md:gap-4">
      <div className="flex-1 min-w-0">
        <div className="mb-1 flex items-center gap-3 md:mb-1.5">
          {typeof onBack === "function" ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/10 text-white hover:bg-white/20"
              aria-label="Retour"
              title="Retour"
            >
              <span aria-hidden className="text-lg leading-none">
                ←
              </span>
            </button>
          ) : (
            <span
              aria-hidden
              className="hidden h-6 w-1.5 rounded-full bg-gradient-to-b from-[#a855f7] via-[#6366f1] to-[#06b6d4] sm:block md:h-7"
            />
          )}
          <h2 className="hd-text-gradient text-xl font-bold tracking-[-0.03em] md:text-[1.75rem]">{title}</h2>
        </div>
        {subtitle ? (
          <p className="text-xs font-medium leading-relaxed text-white/90 md:text-sm">{subtitle}</p>
        ) : null}
      </div>
      {right ? <div className="w-full flex-shrink-0 md:w-auto">{right}</div> : null}
    </div>
    {bare ? children : <div className="hd-card hd-border-gradient p-4 md:p-6 lg:p-8">{children}</div>}
  </section>
));

Section.displayName = "Section";
