export default function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-slate-600">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500/30 border-t-blue-600" />
        <p className="text-sm font-medium">Chargement de la page…</p>
      </div>
    </div>
  );
}

