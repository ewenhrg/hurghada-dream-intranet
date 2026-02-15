export default function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        {/* Spinner dégradé indigo → cyan */}
        <div
          className="relative h-16 w-16 rounded-full animate-spin"
          style={{
            background: `conic-gradient(from 0deg, transparent 0deg, rgba(79, 70, 229, 0.2) 90deg, #4f46e5 180deg, #06b6d4 270deg, rgba(6, 182, 212, 0.3) 360deg)`,
            boxShadow: "0 0 32px -8px rgba(79, 70, 229, 0.5), 0 0 24px -8px rgba(6, 182, 212, 0.35)",
          }}
        >
          <div className="absolute inset-[3px] rounded-full bg-[#0d1629]" />
        </div>
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm font-bold tracking-wide uppercase" style={{ color: "#6366f1" }}>
            Chargement
          </p>
          <p className="text-xs font-medium animate-pulse" style={{ color: "rgba(226, 232, 240, 0.8)" }}>
            Préparation de l’espace de travail…
          </p>
        </div>
      </div>
    </div>
  );
}

