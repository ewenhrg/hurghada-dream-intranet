import { memo } from "react";

export const Pill = memo(({ active, children, ...props }) => (
  <button
    {...props}
    className={
      "px-5 py-2 rounded-full text-sm font-semibold border transition-all duration-300 transform hover:scale-105 " +
      (active 
        ? "bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white border-transparent shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40" 
        : "bg-white/80 backdrop-blur-sm text-slate-700 border-slate-300/50 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 hover:border-blue-300/70 hover:shadow-md hover:text-blue-700")
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
      "w-full rounded-xl border-2 border-slate-200/80 bg-white/90 backdrop-blur-sm px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all shadow-sm hover:border-blue-300/60 hover:shadow-md " +
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
      "w-full rounded-xl border-2 border-slate-200/80 bg-white/90 backdrop-blur-sm px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all shadow-sm hover:border-blue-300/60 hover:shadow-md " +
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
      "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 transition-all duration-300 transform hover:scale-105 active:scale-95 " +
      (disabled ? "opacity-50 cursor-not-allowed hover:scale-100" : "") +
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
        "inline-flex items-center justify-center gap-2 rounded-xl border-2 border-slate-300/60 bg-white/80 backdrop-blur-sm font-semibold text-slate-700 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 hover:border-blue-400/70 hover:text-blue-700 hover:shadow-lg transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-sm " +
        sizeClasses +
        " " +
        className
      }
    />
  );
});

GhostBtn.displayName = "GhostBtn";

export const Section = memo(({ title, subtitle, right, children }) => (
  <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">{title}</h2>
        {subtitle && <p className="text-sm text-slate-600 mt-2 font-medium">{subtitle}</p>}
      </div>
      {right}
    </div>
    <div className="rounded-2xl bg-white/90 backdrop-blur-sm shadow-xl border-2 border-slate-200/60 p-6 hover:shadow-2xl transition-all duration-300">{children}</div>
  </section>
));

Section.displayName = "Section";

