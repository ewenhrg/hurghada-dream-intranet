export const Pill = ({ active, children, ...props }) => (
  <button
    {...props}
    className={
      "px-4 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 " +
      (active ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white border-blue-600 shadow-md hover:from-blue-700 hover:to-blue-800" : "bg-white/90 text-gray-700 border-blue-200 hover:bg-blue-50 hover:border-blue-300")
    }
  >
    {children}
  </button>
);

export const TextInput = ({ className = "", ...props }) => (
  <input
    {...props}
    className={
      "w-full rounded-xl border border-blue-200/50 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm " +
      className
    }
  />
);

export const NumberInput = ({ className = "", ...props }) => (
  <input
    type="number"
    {...props}
    className={
      "w-full rounded-xl border border-blue-200/50 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm " +
      className
    }
  />
);

export const PrimaryBtn = ({ className = "", disabled, ...props }) => (
  <button
    {...props}
    disabled={disabled}
    className={
      "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-medium text-white shadow-md hover:from-blue-700 hover:to-blue-800 hover:shadow-lg transition-all duration-200 " +
      (disabled ? "opacity-50 cursor-not-allowed" : "") +
      className
    }
  />
);

export const GhostBtn = ({ className = "", ...props }) => (
  <button
    {...props}
    className={
      "inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200/60 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-blue-50 hover:border-blue-300 transition-all duration-200 shadow-sm " +
      className
    }
  />
);

export const Section = ({ title, subtitle, right, children }) => (
  <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold text-gray-800">{title}</h2>
        {subtitle && <p className="text-xs text-gray-600">{subtitle}</p>}
      </div>
      {right}
    </div>
    <div className="rounded-2xl bg-white/95 shadow-lg border border-blue-100/50 backdrop-blur-sm">{children}</div>
  </section>
);

