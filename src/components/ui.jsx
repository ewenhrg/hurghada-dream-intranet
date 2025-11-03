import { memo } from "react";

export const Pill = memo(({ active, children, ...props }) => (
  <button
    {...props}
    className={
      "px-6 py-2.5 rounded-full text-sm font-semibold border transition-all duration-300 ease-out " +
      (active 
        ? "bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white border-transparent shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/35 scale-105" 
        : "bg-white/90 backdrop-blur-md text-slate-700 border-slate-300/60 hover:bg-gradient-to-r hover:from-blue-50/80 hover:to-indigo-50/80 hover:border-blue-400/80 hover:text-blue-700 hover:shadow-md hover:-translate-y-0.5")
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
      "w-full rounded-lg border border-slate-300/80 bg-white/95 backdrop-blur-sm px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 shadow-sm hover:border-slate-400/80 hover:shadow " +
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
      "w-full rounded-lg border border-slate-300/80 bg-white/95 backdrop-blur-sm px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 shadow-sm hover:border-slate-400/80 hover:shadow " +
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
      "inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/35 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 transition-all duration-300 ease-out hover:-translate-y-0.5 active:translate-y-0 " +
      (disabled ? "opacity-50 cursor-not-allowed hover:translate-y-0" : "") +
      className
    }
  />
));

PrimaryBtn.displayName = "PrimaryBtn";

export const GhostBtn = memo(({ className = "", size, ...props }) => {
  const sizeClasses = size === "sm" ? "px-3 py-1.5 text-xs" : "px-5 py-2.5 text-sm";
  return (
    <button
      {...props}
      className={
        "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300/80 bg-white/90 backdrop-blur-sm font-semibold text-slate-700 hover:bg-gradient-to-r hover:from-blue-50/90 hover:to-indigo-50/90 hover:border-blue-400/80 hover:text-blue-700 hover:shadow-md transition-all duration-300 ease-out hover:-translate-y-0.5 active:translate-y-0 shadow-sm " +
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
        <h2 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent mb-1.5">{title}</h2>
        {subtitle && <p className="text-sm text-slate-600 font-medium leading-relaxed">{subtitle}</p>}
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </div>
    <div className="rounded-2xl bg-white/95 backdrop-blur-md shadow-xl border border-slate-200/80 p-6 md:p-8 transition-all duration-300">{children}</div>
  </section>
));

Section.displayName = "Section";

