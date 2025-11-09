export default function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-[rgba(71,85,105,0.85)]">
        <div className="h-14 w-14 rounded-full border-[3px] border-[rgba(79,70,229,0.18)] border-t-[rgba(79,70,229,0.85)] border-l-[rgba(14,165,233,0.65)] animate-spin shadow-[0_12px_28px_-18px_rgba(79,70,229,0.5)]" />
        <div className="flex flex-col items-center gap-1">
          <p className="text-sm font-semibold tracking-wide uppercase text-[rgba(79,70,229,0.75)]">Chargement</p>
          <p className="text-xs font-medium text-[rgba(71,85,105,0.7)]">Préparation de l’espace de travail…</p>
        </div>
      </div>
    </div>
  );
}

