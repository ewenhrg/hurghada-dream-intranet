import { memo } from "react";

export const Pill = memo(({ active, children, ...props }) => (
  <button
    {...props}
    className={
      "px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 ease-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#8b5cf6]/50 " +
      (active
        ? "bg-gradient-to-r from-[#4f46e5] via-[#5b3ffd] to-[#0ea5e9] text-white shadow-[0_18px_38px_-18px_rgba(79,70,229,0.65)] hover:shadow-[0_22px_45px_-20px_rgba(79,70,229,0.75)] hover:-translate-y-[2px]"
        : "bg-white/80 text-slate-600 border border-[rgba(148,163,184,0.28)] hover:border-[rgba(79,70,229,0.45)] hover:text-[#4338ca] hover:bg-white hover:shadow-[0_18px_30px_-24px_rgba(79,70,229,0.55)] hover:-translate-y-[2px]")
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
      "w-full rounded-xl border border-[rgba(148,163,184,0.25)] bg-[rgba(255,255,255,0.9)] px-4 py-2.75 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[rgba(79,70,229,0.25)] focus:border-[rgba(79,70,229,0.65)] transition-all duration-200 shadow-[0_16px_35px_-28px_rgba(15,23,42,0.45)] hover:border-[rgba(79,70,229,0.35)] " +
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
      "w-full rounded-xl border border-[rgba(148,163,184,0.25)] bg-[rgba(255,255,255,0.9)] px-4 py-2.75 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[rgba(79,70,229,0.25)] focus:border-[rgba(79,70,229,0.65)] transition-all duration-200 shadow-[0_16px_35px_-28px_rgba(15,23,42,0.45)] hover:border-[rgba(79,70,229,0.35)] " +
      className
    }
  />
));

NumberInput.displayName = "NumberInput";

export const PrimaryBtn = memo(({ className = "", disabled, ...props }) => (
  <button
    {...props}
    disabled={disabled}
    className={
      "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#4f46e5] via-[#5b3ffd] to-[#0ea5e9] px-6 py-3 text-sm font-semibold text-white shadow-[0_20px_45px_-22px_rgba(79,70,229,0.75)] transition-all duration-300 ease-out hover:-translate-y-[2px] hover:shadow-[0_26px_55px_-24px_rgba(79,70,229,0.82)] active:translate-y-0 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#7c3aed]/50 " +
      (disabled ? "opacity-50 cursor-not-allowed hover:translate-y-0 " : "") +
      className
    }
  />
));

PrimaryBtn.displayName = "PrimaryBtn";

export const GhostBtn = memo(({ className = "", size, ...props }) => {
  const sizeClasses = size === "sm" ? "px-3.5 py-1.75 text-xs" : "px-5.5 py-2.75 text-sm";
  return (
    <button
      {...props}
      className={
        "inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(148,163,184,0.28)] bg-white/85 font-semibold text-slate-600 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.4)] transition-all duration-300 ease-out hover:bg-white hover:border-[rgba(79,70,229,0.42)] hover:text-[#4338ca] hover:-translate-y-[2px] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0ea5e9]/40 " +
        sizeClasses +
        " " +
        className
      }
    />
  );
});

GhostBtn.displayName = "GhostBtn";

export const Section = memo(({ title, subtitle, right, children }) => (
  <section className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <h2 className="text-[1.75rem] font-semibold tracking-[-0.03em] text-slate-900 mb-1.5 bg-gradient-to-r from-[#4f46e5] via-[#5b3ffd] to-[#0ea5e9] bg-clip-text text-transparent">
          {title}
        </h2>
        {subtitle && <p className="text-sm font-medium text-[rgba(71,85,105,0.85)] leading-relaxed">{subtitle}</p>}
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </div>
    <div className="hd-card hd-border-gradient p-6 md:p-8">
      {children}
    </div>
  </section>
));

Section.displayName = "Section";

