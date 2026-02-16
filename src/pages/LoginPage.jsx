import { useState } from "react";
import { supabase } from "../lib/supabase";
import { logger } from "../utils/logger";
import { dbUserToSessionUser } from "../constants/permissions";

export function LoginPage({ onSuccess }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCode, setShowCode] = useState(false);

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

        // Construire la session à partir de la base (source unique des permissions)
        const userPermissions = dbUserToSessionUser(data);
        if (!userPermissions) {
          setError("Données utilisateur invalides.");
          setLoading(false);
          return;
        }
        // Override pour Léa : tous les accès sauf reset
        if (data.name === "Léa") {
          userPermissions.canDeleteQuote = true;
          userPermissions.canAddActivity = true;
          userPermissions.canEditActivity = true;
          userPermissions.canDeleteActivity = true;
          userPermissions.canAccessActivities = true;
          userPermissions.canAccessHistory = true;
          userPermissions.canAccessTickets = true;
          userPermissions.canAccessModifications = true;
          userPermissions.canAccessSituation = true;
          userPermissions.canAccessUsers = true;
          userPermissions.canResetData = false;
        }
        sessionStorage.setItem("hd_ok", "1");
        sessionStorage.setItem("hd_user", JSON.stringify(userPermissions));

        onSuccess();
      } else {
        // Fallback si Supabase n'est pas configuré (pour le développement)
        // Code par défaut : Ewen
        if (code === "040203") {
          sessionStorage.setItem("hd_ok", "1");
          sessionStorage.setItem(
            "hd_user",
            JSON.stringify({
              id: 1,
              name: "Ewen",
              code: "040203",
              canDeleteQuote: true,
              canAddActivity: true,
              canEditActivity: true,
              canDeleteActivity: true,
              canResetData: true,
              canAccessActivities: true,
              canAccessHistory: true,
              canAccessTickets: true,
              canAccessModifications: true,
              canAccessSituation: true,
              canAccessUsers: true,
            })
          );
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
      {/* Arrière-plan avec gradients animés */}
      <div className="absolute inset-0 opacity-90 bg-[radial-gradient(circle_at_top,_rgba(76,29,149,0.35),transparent_55%)]" />
      
      {/* Orbes animés avec mouvement fluide */}
      <div className="pointer-events-none absolute -top-48 -right-40 h-[420px] w-[420px] rounded-full bg-gradient-to-br from-[#4f46e5]/45 via-[#0ea5e9]/35 to-transparent blur-3xl opacity-70 animate-pulse" style={{ animationDuration: '4s' }} />
      <div className="pointer-events-none absolute bottom-[-20%] left-[-15%] h-[480px] w-[480px] rounded-full bg-gradient-to-tr from-[#0ea5e9]/35 via-[#22d3ee]/25 to-transparent blur-[140px] animate-pulse" style={{ animationDuration: '5s', animationDelay: '1s' }} />
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-gradient-to-r from-[#7c3aed]/20 via-[#f472b6]/15 to-transparent blur-[160px] animate-pulse" style={{ animationDuration: '6s', animationDelay: '2s' }} />
      
      {/* Grille de fond subtile */}
      <div className="absolute inset-0 opacity-[0.03] bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:50px_50px]" />
      
      {/* Particules flottantes */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white/10 blur-sm"
            style={{
              width: `${Math.random() * 4 + 2}px`,
              height: `${Math.random() * 4 + 2}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animation: `float ${Math.random() * 10 + 10}s infinite ease-in-out`,
              animationDelay: `${Math.random() * 5}s`,
            }}
          />
        ))}
      </div>

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
                className={`rounded-2xl border-2 ${feature.borderColor} bg-gradient-to-br ${feature.color} backdrop-blur-md p-5 shadow-xl hover:shadow-2xl transition-all duration-700 ease-out hover:-translate-y-1 hover:scale-[1.02] animate-fade-in`}
                style={{ animationDelay: `${300 + idx * 100}ms` }}
              >
                <div className="flex items-center gap-3 mb-2 transition-transform duration-500 ease-out group-hover:translate-x-1">
                  <span className="text-2xl transition-transform duration-500 ease-out group-hover:scale-110">{feature.icon}</span>
                  <p className="text-sm font-bold text-white transition-colors duration-500 ease-out">{feature.title}</p>
                </div>
                <p className="text-xs text-white/75 leading-relaxed ml-9 transition-opacity duration-500 ease-out group-hover:text-white/90">{feature.desc}</p>
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
          <div className="relative overflow-hidden rounded-3xl border-2 border-white/30 bg-white/98 text-slate-900 shadow-[0_40px_100px_-30px_rgba(15,23,42,0.7)] backdrop-blur-xl p-8 md:p-10 hover:shadow-[0_50px_120px_-35px_rgba(15,23,42,0.8)] transition-all duration-500 hover:scale-[1.02]">
            {/* Barre de gradient animée en haut */}
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#38bdf8] via-[#7c3aed] to-[#f472b6] shadow-lg">
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent animate-shimmer" style={{ width: '200%', transform: 'translateX(-100%)' }} />
            </div>
            
            {/* Effet de lumière qui suit la souris */}
            <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none">
              <div className="absolute inset-0 bg-gradient-radial from-white/10 via-transparent to-transparent" style={{ background: 'radial-gradient(circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(255,255,255,0.1) 0%, transparent 50%)' }} />
            </div>
            <div className="text-center mb-8 relative z-10">
              <div className="relative inline-block mb-5 group">
                {/* Halo animé autour du logo */}
                <div className="absolute inset-0 bg-gradient-to-r from-[#38bdf8] via-[#7c3aed] to-[#f472b6] rounded-2xl blur-lg opacity-50 animate-pulse group-hover:opacity-70 transition-opacity duration-700 ease-out" style={{ animationDuration: '3s' }} />
                <div className="absolute inset-0 bg-gradient-to-r from-[#38bdf8] via-[#7c3aed] to-[#f472b6] rounded-2xl blur-xl opacity-30 group-hover:opacity-50 transition-opacity duration-700 ease-out" style={{ animationDuration: '3s', animationDelay: '1.5s' }} />
                
                {/* Logo avec effet de rotation au hover */}
                <div className="relative transform transition-all duration-700 ease-out group-hover:scale-110 group-hover:rotate-3">
                  <img
                    src="/logo.png"
                    alt="Hurghada Dream Logo"
                    className="relative mx-auto w-28 h-28 object-contain rounded-2xl border-2 border-slate-200/80 shadow-xl transition-all duration-700 ease-out group-hover:border-indigo-300 group-hover:shadow-2xl"
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
              </div>
              <h2 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-700 bg-clip-text text-transparent mb-2 relative">
                <span className="relative inline-block">
                  Portail interne
                  <span className="absolute -bottom-1 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-700 opacity-50" />
                </span>
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
                <div className="relative group">
                  {/* Halo de focus amélioré */}
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-indigo-500/20 to-purple-500/20 rounded-2xl blur-md opacity-0 transition-opacity duration-700 ease-out group-focus-within:opacity-100 group-focus-within:animate-pulse" />
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 rounded-2xl blur-xl opacity-0 transition-opacity duration-700 ease-out group-focus-within:opacity-100" />
                  
                  <input
                    id="code"
                    type={showCode ? "text" : "password"}
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setError("");
                    }}
                    placeholder="000000"
                    className="relative w-full rounded-2xl border-2 border-slate-200 bg-white px-5 py-4 pl-14 pr-20 text-center text-lg font-bold tracking-[0.6em] text-slate-900 shadow-lg outline-none transition-all duration-700 ease-out focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 focus:shadow-2xl hover:border-indigo-300 hover:shadow-xl backdrop-blur-sm"
                    maxLength={6}
                    autoFocus
                    style={{ 
                      fontFamily: showCode ? 'inherit' : 'text-security-disc',
                      WebkitTextSecurity: showCode ? 'none' : 'disc'
                    }}
                  />
                  
                  {/* Préfixe HD avec animation */}
                  <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-xs font-bold uppercase tracking-[0.35em] text-indigo-400 transition-all duration-500 ease-out group-focus-within:text-indigo-600 group-focus-within:scale-110">
                    <span className="relative">
                      HD
                      <span className="absolute inset-0 text-indigo-600 blur-sm opacity-0 group-focus-within:opacity-50 transition-opacity duration-500 ease-out">HD</span>
                    </span>
                  </span>
                  
                  {/* Bouton afficher/masquer le code */}
                  <button
                    type="button"
                    onClick={() => setShowCode(!showCode)}
                    className="absolute inset-y-0 right-4 flex items-center justify-center w-10 h-10 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all duration-500 ease-out focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:ring-offset-2 active:scale-95 z-10"
                    aria-label={showCode ? "Masquer le code" : "Afficher le code"}
                    tabIndex={0}
                  >
                    {showCode ? (
                      <svg className="w-5 h-5 transition-transform duration-500 ease-out" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0L9.88 9.88m-3.59-3.59l3.29 3.29M12 12l.879.879m-6.5 6.5L12 12m0 0l6.5 6.5M12 12l6.5-6.5M12 12l-6.5-6.5" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 transition-transform duration-500 ease-out" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                  
                  {/* Indicateurs de saisie personnalisés - seulement quand le code est visible (pour éviter la duplication avec les points du navigateur) */}
                  {code.length > 0 && showCode && (
                    <div className="absolute inset-y-0 right-16 flex items-center pointer-events-none">
                      <div className="flex gap-1.5">
                        {Array.from({ length: code.length }).map((_, i) => (
                          <span 
                            key={i} 
                            className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/50" 
                          />
                        ))}
                        {code.length < 6 && (
                          <span className="w-2.5 h-2.5 rounded-full bg-slate-300 opacity-30" />
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Barre de progression */}
                  <div className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-indigo-500/0 via-indigo-500/50 to-purple-500/0 rounded-full transition-all duration-700 ease-out" style={{ width: `${(code.length / 6) * 100}%` }} />
                </div>
              </div>

              {error && (
                <div className="rounded-2xl border-2 border-red-300/70 bg-gradient-to-r from-red-50 to-rose-50 px-5 py-4 text-sm font-bold text-red-700 shadow-xl animate-slide-up flex items-center gap-3 relative overflow-hidden transition-all duration-700 ease-out">
                  {/* Effet de brillance animé */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full animate-shimmer" style={{ animationDuration: '2s' }} />
                  <span className="text-xl relative z-10 animate-bounce transition-transform duration-500 ease-out" style={{ animationDuration: '1s' }}>⚠️</span>
                  <span className="relative z-10 transition-opacity duration-500 ease-out">{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-[#2563eb] via-[#7c3aed] to-[#f472b6] px-6 py-4 text-base font-bold text-white shadow-[0_22px_48px_-20px_rgba(79,70,229,0.8)] transition-all duration-700 ease-out hover:-translate-y-1 hover:shadow-[0_30px_70px_-25px_rgba(79,70,229,0.9)] hover:scale-[1.02] focus:outline-none focus:ring-4 focus:ring-offset-2 focus:ring-[#6366f1]/50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:scale-100 relative overflow-hidden group"
              >
                {/* Effet de brillance animé */}
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/30 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-in-out" />
                
                {/* Particules animées au hover */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 ease-out">
                  {[...Array(6)].map((_, i) => (
                    <div
                      key={i}
                      className="absolute w-1 h-1 bg-white/60 rounded-full"
                      style={{
                        left: `${20 + i * 15}%`,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        animation: `sparkle ${1.5}s infinite`,
                        animationDelay: `${i * 0.1}s`,
                      }}
                    />
                  ))}
                </div>
                
                {loading ? (
                  <>
                    <span className="h-5 w-5 border-2 border-white/80 border-t-transparent rounded-full animate-spin relative z-10 transition-opacity duration-500 ease-out" />
                    <span className="relative z-10 animate-pulse transition-opacity duration-500 ease-out">Connexion...</span>
                  </>
                ) : (
                  <>
                    <span className="relative z-10 transition-all duration-500 ease-out group-hover:scale-110 group-hover:tracking-wide">Accéder</span>
                    <span className="text-white/80 text-lg leading-none relative z-10 transition-all duration-500 ease-out group-hover:translate-x-1 group-hover:scale-110 group-hover:text-white">↵</span>
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

