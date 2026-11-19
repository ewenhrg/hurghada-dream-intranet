import { Suspense, useMemo, useState } from "react";
import {
  Building2,
  Image,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Shield,
  ShoppingBag,
  Tags,
  Users,
  Ban,
  Activity,
  Info,
} from "lucide-react";
import { SITE_KEY } from "../constants";
import { __SUPABASE_DEBUG__ } from "../lib/supabase";
import { GhostBtn } from "../components/ui";
import PageLoader from "../components/PageLoader";
import ErrorBoundary from "../components/ErrorBoundary";
import { lazyWithRetry } from "../utils/lazyWithRetry";
import { INTRANET_PATH } from "../config/clientApp";

const UsersPage = lazyWithRetry(() =>
  import("./UsersPage").then((m) => ({ default: m.UsersPage }))
);
const ActivityCatalogAdminPage = lazyWithRetry(() =>
  import("./ActivityCatalogAdminPage").then((m) => ({ default: m.ActivityCatalogAdminPage }))
);
const ActivitiesPage = lazyWithRetry(() =>
  import("./ActivitiesPage").then((m) => ({ default: m.ActivitiesPage }))
);
const PublicHotelsAdminPage = lazyWithRetry(() =>
  import("./PublicHotelsAdminPage").then((m) => ({ default: m.PublicHotelsAdminPage }))
);
const HotelTarifsPage = lazyWithRetry(() =>
  import("./HotelTarifsPage").then((m) => ({ default: m.HotelTarifsPage }))
);
const ClientFlyerPage = lazyWithRetry(() =>
  import("./ClientFlyerPage").then((m) => ({ default: m.ClientFlyerPage }))
);
const StayBroadcastPage = lazyWithRetry(() =>
  import("./StayBroadcastPage").then((m) => ({ default: m.StayBroadcastPage }))
);
const B2BAccessPage = lazyWithRetry(() =>
  import("./B2BAccessPage").then((m) => ({ default: m.B2BAccessPage }))
);
const StopSalePage = lazyWithRetry(() =>
  import("./StopSalePage").then((m) => ({ default: m.StopSalePage }))
);

const MODULES = [
  {
    id: "home",
    label: "Vue d’ensemble",
    description: "État du site et accès rapide.",
    icon: LayoutDashboard,
  },
  {
    id: "users",
    label: "Utilisateurs & droits",
    description: "Codes, permissions intranet, accès pages.",
    icon: Users,
  },
  {
    id: "catalog",
    label: "Catalogue public",
    description: "Contenu activités côté site client.",
    icon: ShoppingBag,
  },
  {
    id: "activities",
    label: "Activités",
    description: "Grille, prix, disponibilités.",
    icon: Activity,
  },
  {
    id: "hotels-catalog",
    label: "Hôtels (site)",
    description: "Catalogue hôtels public.",
    icon: Building2,
  },
  {
    id: "hotel-tarifs",
    label: "Tarifs hôtels",
    description: "Prix de touche / périodes.",
    icon: Tags,
  },
  {
    id: "flyer",
    label: "Flyer appli",
    description: "Publication flyer client.",
    icon: Image,
  },
  {
    id: "stay-broadcast",
    label: "Message séjour",
    description: "Push clients « Mon séjour ».",
    icon: Megaphone,
  },
  {
    id: "b2b",
    label: "Accès B2B",
    description: "Comptes et demandes agences.",
    icon: Shield,
  },
  {
    id: "stopsale",
    label: "Stop / Push sale",
    description: "Fermetures et pushes activités.",
    icon: Ban,
  },
];

function OverviewPanel({ user }) {
  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
  const host = (() => {
    try {
      return supabaseUrl ? new URL(supabaseUrl).host : "—";
    } catch {
      return "—";
    }
  })();

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
            <Info className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-slate-900">Console ultra-admin</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Espace ultra-sécurisé (e-mail + mot de passe). Invisible dans la navigation — uniquement via{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[12px] font-semibold text-slate-800">
                /superadmin
              </code>
              .
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Connecté</p>
          <p className="mt-1 text-base font-extrabold text-slate-900">{user?.name || "—"}</p>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">code {user?.code || "—"}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Site key</p>
          <p className="mt-1 break-all text-sm font-extrabold text-slate-900">{SITE_KEY || "—"}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Supabase</p>
          <p className="mt-1 text-sm font-extrabold text-slate-900">
            {__SUPABASE_DEBUG__?.isConfigured ? "Configuré" : "Non configuré"}
          </p>
          <p className="mt-0.5 truncate text-xs font-medium text-slate-500">{host}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p className="font-semibold">Conseil</p>
        <p className="mt-0.5 leading-relaxed opacity-90">
          Choisissez un module à gauche pour modifier le site. Les changements sensibles (users, catalogue)
          restent limités à Ewen et Karim.
        </p>
      </div>
    </div>
  );
}

/**
 * Dashboard ultra-admin — accessible uniquement via /superadmin (pas de bouton nav).
 */
export function SuperAdminPage({
  user,
  activities,
  setActivities,
  onLogout,
}) {
  const [moduleId, setModuleId] = useState("home");
  const active = useMemo(
    () => MODULES.find((m) => m.id === moduleId) || MODULES[0],
    [moduleId]
  );

  return (
    <div className="min-h-screen bg-[linear-gradient(160deg,#0f172a_0%,#1e1b4b_42%,#0f172a_100%)] text-slate-100">
      <header className="border-b border-white/10 bg-black/20 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-300">Hurghada Dream</p>
            <h1 className="text-xl font-extrabold tracking-tight text-white md:text-2xl">SuperAdmin</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={INTRANET_PATH}
              className="inline-flex min-h-10 items-center rounded-xl border border-white/20 bg-white/5 px-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              Ouvrir l’intranet
            </a>
            <GhostBtn
              type="button"
              onClick={() => {
                if (typeof onLogout === "function") onLogout();
              }}
              className="!border-white/20 !bg-white/5 !text-white hover:!bg-white/10"
            >
              <span className="inline-flex items-center gap-1.5">
                <LogOut className="h-4 w-4" aria-hidden />
                Déconnexion
              </span>
            </GhostBtn>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-5 md:grid-cols-[240px_minmax(0,1fr)] md:px-6 md:py-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav
          aria-label="Modules SuperAdmin"
          className="h-fit rounded-2xl border border-white/10 bg-white/5 p-2 backdrop-blur-sm"
        >
          <ul className="space-y-1">
            {MODULES.map((mod) => {
              const Icon = mod.icon;
              const selected = mod.id === active.id;
              return (
                <li key={mod.id}>
                  <button
                    type="button"
                    onClick={() => setModuleId(mod.id)}
                    className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition ${
                      selected
                        ? "bg-indigo-500 text-white shadow-lg shadow-indigo-900/40"
                        : "text-slate-200 hover:bg-white/10"
                    }`}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 opacity-90" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold leading-tight">{mod.label}</span>
                      <span
                        className={`mt-0.5 block text-[11px] leading-snug ${
                          selected ? "text-indigo-100" : "text-slate-400"
                        }`}
                      >
                        {mod.description}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <main className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-900 shadow-xl md:p-6">
          <div className="mb-4 border-b border-slate-200 pb-3">
            <h2 className="text-lg font-extrabold text-slate-900">{active.label}</h2>
            <p className="mt-0.5 text-sm text-slate-600">{active.description}</p>
          </div>

          <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              {active.id === "home" ? <OverviewPanel user={user} /> : null}
              {active.id === "users" ? <UsersPage user={user} /> : null}
              {active.id === "catalog" ? (
                <ActivityCatalogAdminPage
                  activities={activities}
                  setActivities={setActivities}
                  user={user}
                  readOnly={false}
                />
              ) : null}
              {active.id === "activities" ? (
                <ActivitiesPage
                  activities={activities}
                  setActivities={setActivities}
                  user={user}
                />
              ) : null}
              {active.id === "hotels-catalog" ? <PublicHotelsAdminPage /> : null}
              {active.id === "hotel-tarifs" ? <HotelTarifsPage /> : null}
              {active.id === "flyer" ? <ClientFlyerPage user={user} /> : null}
              {active.id === "stay-broadcast" ? <StayBroadcastPage user={user} /> : null}
              {active.id === "b2b" ? <B2BAccessPage /> : null}
              {active.id === "stopsale" ? (
                <StopSalePage activities={activities} user={user} />
              ) : null}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
