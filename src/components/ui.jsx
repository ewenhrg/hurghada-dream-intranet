export const Pill = ({ active, children, ...props }) => (
  <button
    {...props}
    className={
      "px-4 py-1.5 rounded-full text-sm font-medium border transition " +
      (active ? "bg-black text-white border-black" : "bg-white/70 text-gray-700 border-gray-200 hover:bg-white")
    }
  >
    {children}
  </button>
);

export const TextInput = ({ className = "", ...props }) => (
  <input
    {...props}
    className={
      "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 focus:border-black " +
      className
    }
  />
);

export const NumberInput = ({ className = "", ...props }) => (
  <input
    type="number"
    {...props}
    className={
      "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10 focus:border-black " +
      className
    }
  />
);

export const PrimaryBtn = ({ className = "", ...props }) => (
  <button
    {...props}
    className={
      "inline-flex items-center justify-center gap-2 rounded-xl bg-black px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 " +
      className
    }
  />
);

export const GhostBtn = ({ className = "", ...props }) => (
  <button
    {...props}
    className={
      "inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 " +
      className
    }
  />
);

export const Section = ({ title, subtitle, right, children }) => (
  <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
      </div>
      {right}
    </div>
    <div className="rounded-2xl bg-white shadow-sm border border-white/40">{children}</div>
  </section>
);

