import { memo } from "react";

export const Pill = memo(({ active, children, ...props }) => (
  <button
    {...props}
    className={
      "px-4 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 " +
      (active ? "bg-gradient-to-r from-cyan-500 to-teal-600 text-white border-cyan-500 shadow-lg hover:from-cyan-600 hover:to-teal-700 hover:shadow-xl" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm")
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
      "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all shadow-sm hover:border-slate-300 " +
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
      "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all shadow-sm hover:border-slate-300 " +
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
      "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-600 px-4 py-2 text-sm font-medium text-white shadow-lg hover:from-cyan-600 hover:to-teal-700 hover:shadow-xl transition-all duration-200 " +
      (disabled ? "opacity-50 cursor-not-allowed" : "") +
      className
    }
  />
));

PrimaryBtn.displayName = "PrimaryBtn";

export const GhostBtn = memo(({ className = "", size, ...props }) => {
  const sizeClasses = size === "sm" ? "px-2 py-1 text-xs" : "px-4 py-2 text-sm";
  return (
    <button
      {...props}
      className={
        "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:shadow-md transition-all duration-200 shadow-sm " +
        sizeClasses +
        " " +
        className
      }
    />
  );
});

GhostBtn.displayName = "GhostBtn";

export const Section = memo(({ title, subtitle, right, children }) => (
  <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-600 mt-1">{subtitle}</p>}
      </div>
      {right}
    </div>
    <div className="rounded-2xl bg-white shadow-lg border border-slate-100 p-6">{children}</div>
  </section>
));

Section.displayName = "Section";

