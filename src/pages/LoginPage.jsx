import { useState } from "react";
import { supabase } from "../lib/supabase";

export function LoginPage({ onSuccess }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    
    // Vérifier que le code fait 6 chiffres
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      setError("Le code doit contenir 6 chiffres.");
      setCode("");
      return;
    }

    setLoading(true);

    try {
      // Chercher l'utilisateur dans Supabase
      if (supabase) {
        const { data, error: fetchError } = await supabase
          .from("users")
          .select("*")
          .eq("code", code)
          .single();

        if (fetchError || !data) {
          setError("Code d'accès incorrect. Veuillez réessayer.");
          setCode("");
          setLoading(false);
          return;
        }

        // Sauvegarder les informations utilisateur dans sessionStorage
        const userPermissions = {
          id: data.id,
          name: data.name,
          code: data.code,
          canDeleteQuote: data.can_delete_quote || false,
          canAddActivity: data.can_add_activity || false,
          canEditActivity: data.can_edit_activity || false,
          canDeleteActivity: data.can_delete_activity || false,
          canResetData: data.can_reset_data || false,
          canAccessActivities: data.can_access_activities !== false, // true par défaut si null
          canAccessHistory: data.can_access_history !== false, // true par défaut si null
          canAccessTickets: data.can_access_tickets !== false, // true par défaut si null
          canAccessModifications: data.can_access_modifications || false,
          canAccessSituation: data.can_access_situation || false,
          canAccessUsers: data.can_access_users || false,
        };
        
        // Donner tous les accès à Léa sauf canResetData
        if (data.name === "Léa") {
          userPermissions.canDeleteQuote = true;
          userPermissions.canAddActivity = true;
          userPermissions.canEditActivity = true;
          userPermissions.canDeleteActivity = true;
          userPermissions.canAccessActivities = true;
          userPermissions.canAccessHistory = true;
          userPermissions.canResetData = false; // Ne pas donner l'accès au reset
        }
        
        sessionStorage.setItem("hd_ok", "1");
        sessionStorage.setItem("hd_user", JSON.stringify(userPermissions));

        onSuccess();
      } else {
        // Fallback si Supabase n'est pas configuré (pour le développement)
        // Code par défaut : Ewen
        if (code === "040203") {
          sessionStorage.setItem("hd_ok", "1");
          sessionStorage.setItem("hd_user", JSON.stringify({
            id: 1,
            name: "Ewen",
            code: "040203",
            canDeleteQuote: true,
            canAddActivity: true,
            canEditActivity: true,
            canDeleteActivity: true,
            canResetData: true,
          }));
          onSuccess();
        } else {
          setError("Code d'accès incorrect. Veuillez réessayer.");
          setCode("");
        }
      }
    } catch (err) {
      console.error("Erreur lors de la connexion:", err);
      setError("Une erreur s'est produite. Veuillez réessayer.");
      setCode("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070d1f] text-white">
      <div className="absolute inset-0 opacity-90 bg-[radial-gradient(circle_at_top,_rgba(76,29,149,0.35),transparent_55%)]" />
      <div className="pointer-events-none absolute -top-48 -right-40 h-[420px] w-[420px] rounded-full bg-gradient-to-br from-[#4f46e5]/45 via-[#0ea5e9]/35 to-transparent blur-3xl opacity-70" />
      <div className="pointer-events-none absolute bottom-[-20%] left-[-15%] h-[480px] w-[480px] rounded-full bg-gradient-to-tr from-[#0ea5e9]/35 via-[#22d3ee]/25 to-transparent blur-[140px]" />

      <div className="relative z-10 flex flex-col-reverse lg:flex-row items-center lg:items-stretch justify-between w-full max-w-6xl mx-auto px-6 md:px-10 py-12 md:py-16 gap-12">
        <section className="flex-1 space-y-8 text-center lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white/80">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Accès sécurisé
          </span>
          <h1 className="text-3xl md:text-5xl font-semibold leading-tight tracking-tight">
            Le cockpit digital de <span className="text-transparent bg-gradient-to-r from-[#38bdf8] via-[#7c3aed] to-[#f472b6] bg-clip-text">Hurghada Dream</span> pour orchestrer devis, activités et équipes.
          </h1>
          <p className="text-base md:text-lg text-white/75 max-w-2xl mx-auto lg:ml-0">
            Connectez-vous avec votre code exclusif et retrouvez vos flux en temps réel : synchronisation Supabase, sauvegardes locales, historique complet. Une plateforme façonnée pour la performance sur le terrain.
          </p>

          <div className="grid sm:grid-cols-3 gap-4 text-left">
            {[
              { title: "1 seul code", desc: "Profils et autorisations gérés automatiquement." },
              { title: "Vision globale", desc: "Devis, activités, tickets et utilisateurs centralisés." },
              { title: "Résilience totale", desc: "Mode hors-ligne + réplication cloud instantanée." },
            ].map((feature) => (
              <div key={feature.title} className="rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md p-4 shadow-[0_24px_45px_-30px_rgba(15,23,42,0.65)]">
                <p className="text-sm font-semibold text-white">{feature.title}</p>
                <p className="mt-1.5 text-xs text-white/65 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 text-sm text-white/60">
            <div>
              <span className="font-semibold text-white">Support 24/7 :</span> +20 109 000 000
            </div>
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
              Monitoring & sauvegardes automatiques
            </div>
          </div>
        </section>

        <aside className="w-full max-w-md">
          <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-white/95 text-slate-900 shadow-[0_34px_80px_-28px_rgba(15,23,42,0.55)] backdrop-blur-xl p-8 md:p-10">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#38bdf8] via-[#7c3aed] to-[#f472b6]" />
            <div className="text-center mb-8">
              <img
                src="/logo.png"
                alt="Hurghada Dream Logo"
                className="mx-auto mb-5 w-24 h-24 object-contain rounded-2xl border border-slate-200/70 shadow-[0_18px_40px_-25px_rgba(79,70,229,0.5)]"
                onError={(e) => {
                  e.target.style.display = "none";
                }}
              />
              <h2 className="text-2xl font-semibold text-slate-900 mb-2">Portail interne</h2>
              <p className="text-sm text-slate-500 leading-relaxed">Saisissez votre code de six chiffres pour rejoindre la plateforme.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label htmlFor="code" className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                  Code d'accès
                  <span className="text-[10px] text-slate-400 font-medium">confidentiel</span>
                </label>
                <div className="relative">
                  <input
                    id="code"
                    type="password"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setError("");
                    }}
                    placeholder="000000"
                    className="w-full rounded-2xl border border-slate-200 bg-white/95 px-5 py-3.5 text-center text-lg font-semibold tracking-[0.6em] text-slate-900 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.4)] outline-none transition-all duration-200 focus:border-[#6366f1] focus:ring-2 focus:ring-[#6366f1]/25"
                    maxLength={6}
                    autoFocus
                  />
                  <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-300">
                    HD
                  </span>
                </div>
              </div>

              {error && (
                <div className="rounded-2xl border border-red-200/70 bg-red-50/90 px-4 py-3 text-sm font-semibold text-red-600 shadow-[0_18px_35px_-24px_rgba(220,38,38,0.45)]">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#2563eb] via-[#7c3aed] to-[#f472b6] px-6 py-3.5 text-base font-semibold text-white shadow-[0_22px_48px_-20px_rgba(79,70,229,0.8)] transition-all duration-300 hover:-translate-y-[2px] hover:shadow-[0_28px_60px_-24px_rgba(79,70,229,0.82)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#6366f1]/50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 border-2 border-white/70 border-t-transparent rounded-full animate-spin" />
                    Connexion...
                  </>
                ) : (
                  <>
                    Accéder
                    <span className="text-white/70 text-lg leading-none">↵</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 space-y-3 text-center">
              <p className="text-xs font-medium text-slate-500">Accès réservé à l’équipe Hurghada Dream. Toute tentative non autorisée est traçée.</p>
              <p className="text-[11px] uppercase tracking-[0.35em] text-slate-400 font-semibold">
                Intranet développé par Ewen
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

