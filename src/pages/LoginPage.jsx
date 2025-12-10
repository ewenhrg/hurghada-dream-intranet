import { useState } from "react";
import { supabase } from "../lib/supabase";
import { logger } from "../utils/logger";

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
        
        // Donner tous les accès à Léa et Laly sauf canResetData
        if (data.name === "Léa" || data.name === "Laly") {
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
      logger.error("Erreur lors de la connexion:", err);
      setError("Une erreur s'est produite. Veuillez réessayer.");
      setCode("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070d1f] text-white animate-fade-in">
      <div className="absolute inset-0 opacity-90 bg-[radial-gradient(circle_at_top,_rgba(76,29,149,0.35),transparent_55%)]" />
      <div className="pointer-events-none absolute -top-48 -right-40 h-[420px] w-[420px] rounded-full bg-gradient-to-br from-[#4f46e5]/45 via-[#0ea5e9]/35 to-transparent blur-3xl opacity-70 animate-pulse" style={{ animationDuration: '4s' }} />
      <div className="pointer-events-none absolute bottom-[-20%] left-[-15%] h-[480px] w-[480px] rounded-full bg-gradient-to-tr from-[#0ea5e9]/35 via-[#22d3ee]/25 to-transparent blur-[140px] animate-pulse" style={{ animationDuration: '5s', animationDelay: '1s' }} />

      <div className="relative z-10 flex flex-col-reverse lg:flex-row items-center lg:items-stretch justify-between w-full max-w-6xl mx-auto px-6 md:px-10 py-12 md:py-16 gap-12">
        <section className="flex-1 space-y-8 text-center lg:text-left animate-slide-up">
          <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-cyan-500/20 backdrop-blur-md px-4 py-2.5 text-xs font-bold uppercase tracking-[0.3em] text-white/90 border border-emerald-400/30 shadow-lg">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
            Accès sécurisé
          </div>
          <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tight text-white animate-fade-in" style={{ animationDelay: '100ms' }}>
            Le cockpit digital de <span className="text-transparent bg-gradient-to-r from-[#38bdf8] via-[#7c3aed] to-[#f472b6] bg-clip-text animate-pulse" style={{ animationDuration: '3s' }}>Hurghada Dream</span> pour orchestrer devis, activités et équipes.
          </h1>
          <p className="text-base md:text-lg text-white/80 max-w-2xl mx-auto lg:ml-0 leading-relaxed animate-fade-in" style={{ animationDelay: '200ms' }}>
            Connectez-vous avec votre code exclusif et retrouvez vos flux en temps réel : synchronisation Supabase, sauvegardes locales, historique complet. Une plateforme façonnée pour la performance sur le terrain.
          </p>

          <div className="grid sm:grid-cols-3 gap-4 md:gap-5 text-left">
            {[
              { title: "1 seul code", desc: "Profils et autorisations gérés automatiquement.", icon: "🔐", color: "from-blue-500/20 to-indigo-500/20", borderColor: "border-blue-400/30" },
              { title: "Vision globale", desc: "Devis, activités, tickets et utilisateurs centralisés.", icon: "👁️", color: "from-purple-500/20 to-pink-500/20", borderColor: "border-purple-400/30" },
              { title: "Pense à te déconnecter", desc: "Merci de quitter l'intranet en fin de session.", icon: "🚪", color: "from-emerald-500/20 to-teal-500/20", borderColor: "border-emerald-400/30" },
            ].map((feature, idx) => (
              <div 
                key={feature.title} 
                className={`rounded-2xl border-2 ${feature.borderColor} bg-gradient-to-br ${feature.color} backdrop-blur-md p-5 shadow-xl hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 animate-fade-in`}
                style={{ animationDelay: `${300 + idx * 100}ms` }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">{feature.icon}</span>
                  <p className="text-sm font-bold text-white">{feature.title}</p>
                </div>
                <p className="text-xs text-white/75 leading-relaxed ml-9">{feature.desc}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 text-sm text-white/70 animate-fade-in" style={{ animationDelay: '600ms' }}>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10">
              <span className="text-lg">📞</span>
              <span className="font-semibold text-white">Support 24/7 :</span>
              <span className="font-mono">+33 6 19 92 14 49</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
              <span>Monitoring & sauvegardes automatiques</span>
            </div>
          </div>
        </section>

        <aside className="w-full max-w-md animate-scale-in" style={{ animationDelay: '200ms' }}>
          <div className="relative overflow-hidden rounded-3xl border-2 border-white/30 bg-white/98 text-slate-900 shadow-[0_40px_100px_-30px_rgba(15,23,42,0.7)] backdrop-blur-xl p-8 md:p-10 hover:shadow-[0_50px_120px_-35px_rgba(15,23,42,0.8)] transition-all duration-300">
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#38bdf8] via-[#7c3aed] to-[#f472b6] shadow-lg" />
            <div className="text-center mb-8">
              <div className="relative inline-block mb-5">
                <div className="absolute inset-0 bg-gradient-to-r from-[#38bdf8] via-[#7c3aed] to-[#f472b6] rounded-2xl blur-lg opacity-50 animate-pulse" style={{ animationDuration: '3s' }} />
                <img
                  src="/logo.png"
                  alt="Hurghada Dream Logo"
                  className="relative mx-auto w-28 h-28 object-contain rounded-2xl border-2 border-slate-200/80 shadow-xl"
                  onError={(e) => {
                    e.target.style.display = "none";
                    const parent = e.target.parentElement;
                    if (parent && !parent.querySelector('.fallback-logo')) {
                      const fallback = document.createElement('div');
                      fallback.className = 'fallback-logo relative mx-auto w-28 h-28 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 text-white grid place-items-center font-bold text-2xl shadow-xl';
                      fallback.textContent = 'HD';
                      parent.appendChild(fallback);
                    }
                  }}
                />
              </div>
              <h2 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-700 bg-clip-text text-transparent mb-2">
                Portail interne
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed font-medium">
                Saisissez votre code de six chiffres pour rejoindre la plateforme.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-3">
                <label htmlFor="code" className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.25em] text-slate-600">
                  <span className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                    Code d'accès
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium bg-slate-100 px-2 py-1 rounded-full">confidentiel</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-indigo-500/20 to-purple-500/20 rounded-2xl blur-md opacity-0 transition-opacity duration-300 focus-within:opacity-100" />
                  <input
                    id="code"
                    type="password"
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setError("");
                    }}
                    placeholder="000000"
                    className="relative w-full rounded-2xl border-2 border-slate-200 bg-white px-5 py-4 text-center text-lg font-bold tracking-[0.6em] text-slate-900 shadow-lg outline-none transition-all duration-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 focus:shadow-xl hover:border-indigo-300"
                    maxLength={6}
                    autoFocus
                  />
                  <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-xs font-bold uppercase tracking-[0.35em] text-indigo-400">
                    HD
                  </span>
                  {code.length > 0 && (
                    <div className="absolute inset-y-0 right-4 flex items-center">
                      <div className="flex gap-1">
                        {Array.from({ length: code.length }).map((_, i) => (
                          <span key={i} className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <div className="rounded-2xl border-2 border-red-300/70 bg-gradient-to-r from-red-50 to-rose-50 px-5 py-4 text-sm font-bold text-red-700 shadow-xl animate-slide-up flex items-center gap-3">
                  <span className="text-xl">⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-[#2563eb] via-[#7c3aed] to-[#f472b6] px-6 py-4 text-base font-bold text-white shadow-[0_22px_48px_-20px_rgba(79,70,229,0.8)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_30px_70px_-25px_rgba(79,70,229,0.9)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#6366f1]/50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                {loading ? (
                  <>
                    <span className="h-5 w-5 border-2 border-white/80 border-t-transparent rounded-full animate-spin relative z-10" />
                    <span className="relative z-10">Connexion...</span>
                  </>
                ) : (
                  <>
                    <span className="relative z-10">Accéder</span>
                    <span className="text-white/80 text-lg leading-none relative z-10">↵</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t-2 border-slate-200/60 space-y-3 text-center">
              <div className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-50 rounded-xl border border-slate-200/60">
                <span className="text-xs">🔒</span>
                <p className="text-xs font-semibold text-slate-600">Accès réservé à l'équipe Hurghada Dream</p>
              </div>
              <p className="text-[11px] uppercase tracking-[0.35em] text-slate-400 font-bold">
                Intranet développé par Ewen
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

