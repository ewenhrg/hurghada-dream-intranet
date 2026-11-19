import { GhostBtn, PrimaryBtn } from "../components/ui";
import { INTRANET_PATH } from "../config/clientApp";

export function SuperAdminForbidden({ user, onLogout }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
      <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-slate-900 p-6 shadow-2xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-rose-300">Accès refusé</p>
        <h1 className="mt-2 text-xl font-extrabold text-white">SuperAdmin réservé</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          {user?.name
            ? `Le compte « ${user.name} » n’a pas les droits ultra-admin.`
            : "Connexion requise avec un compte general manager."}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <PrimaryBtn
            type="button"
            onClick={() => {
              window.location.href = INTRANET_PATH;
            }}
          >
            Aller à l’intranet
          </PrimaryBtn>
          {typeof onLogout === "function" ? (
            <GhostBtn type="button" onClick={onLogout} className="!border-white/20 !text-white">
              Déconnexion
            </GhostBtn>
          ) : null}
        </div>
      </div>
    </div>
  );
}
