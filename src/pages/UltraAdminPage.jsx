import { Settings2, Users, Hotel, LayoutGrid, FileText, Shield } from "lucide-react";

const ACTIONS = [
  {
    id: "users",
    title: "Utilisateurs & droits",
    desc: "Créer des comptes, codes d’accès et permissions intranet.",
    tab: "users",
    icon: Users,
  },
  {
    id: "activities",
    title: "Activités & prix",
    desc: "Modifier le catalogue interne (jours, transferts, tarifs).",
    tab: "activities",
    icon: LayoutGrid,
  },
  {
    id: "catalog-admin",
    title: "Catalogue public",
    desc: "Textes et photos affichés sur le site client.",
    tab: "catalog-admin",
    icon: FileText,
  },
  {
    id: "hotels-catalog",
    title: "Hôtels public",
    desc: "Catalogue hôtels du site et demandes associées.",
    tab: "hotels-catalog",
    icon: Hotel,
  },
  {
    id: "ewen-dashboard",
    title: "Tableau de bord",
    desc: "Indicateurs et présence en temps réel.",
    tab: "ewen-dashboard",
    icon: Shield,
  },
];

/**
 * Tableau de bord ultra admin — raccourcis GM pour piloter le site.
 */
export function UltraAdminPage({ onNavigate }) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm md:px-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex size-10 items-center justify-center rounded-xl bg-slate-900 text-white">
            <Settings2 className="size-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-extrabold text-slate-950">Ultra admin</p>
            <p className="mt-1 text-sm font-medium text-slate-600">
              Espace general manager : ouvrez rapidement les pages sensibles pour ajuster le site
              et l’intranet.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => onNavigate?.(action.tab)}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-slate-400 hover:bg-slate-50"
            >
              <div className="flex items-start gap-3">
                <span className="inline-flex size-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-800">
                  <Icon className="size-4.5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-950">{action.title}</p>
                  <p className="mt-1 text-xs font-medium leading-relaxed text-slate-600">
                    {action.desc}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
