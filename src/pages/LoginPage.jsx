import { useState, useRef } from "react";
import { supabase } from "../lib/supabase";
import { logger } from "../utils/logger";
import { dbUserToSessionUser } from "../constants/permissions";

export function LoginPage({ onSuccess }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const inputRef = useRef(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      setError("Le code doit contenir 6 chiffres.");
      setCode("");
      return;
    }

    setLoading(true);

    try {
      if (supabase) {
        const { data, error: fetchError } = await supabase
          .from("users")
          .select("*")
          .eq("code", code)
          .single();

        if (fetchError || !data) {
          setError("Code incorrect. Réessayez.");
          setCode("");
          setLoading(false);
          return;
        }

        const userPermissions = dbUserToSessionUser(data);
        if (!userPermissions) {
          setError("Données utilisateur invalides.");
          setLoading(false);
          return;
        }
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
          setError("Code incorrect. Réessayez.");
          setCode("");
        }
      }
    } catch (err) {
      logger.error("Erreur lors de la connexion:", err);
      setError("Une erreur s'est produite. Réessayez.");
      setCode("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#060b18] text-white">
      {/* Fond : dégradé principal */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 120% 80% at 20% 0%, rgba(79, 70, 229, 0.25) 0%, transparent 50%), radial-gradient(ellipse 100% 60% at 85% 60%, rgba(6, 182, 212, 0.2) 0%, transparent 45%), radial-gradient(ellipse 80% 50% at 50% 100%, rgba(124, 58, 237, 0.15) 0%, transparent 50%), #060b18",
        }}
      />

      {/* Orbes douces */}
      <div
        className="pointer-events-none absolute -top-32 -right-32 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-indigo-500/30 via-violet-500/20 to-transparent blur-[100px] opacity-80"
        style={{ animation: "login-glow 8s ease-in-out infinite" }}
      />
      <div
        className="pointer-events-none absolute bottom-0 left-0 h-[400px] w-[400px] rounded-full bg-gradient-to-tr from-cyan-500/25 via-blue-500/15 to-transparent blur-[80px] opacity-70"
        style={{ animation: "login-glow 10s ease-in-out infinite 1s" }}
      />
      <div
        className="pointer-events-none absolute top-1/2 left-1/3 h-[300px] w-[300px] rounded-full bg-gradient-to-r from-violet-500/20 to-transparent blur-[90px] opacity-60"
        style={{ animation: "login-float 12s ease-in-out infinite 2s" }}
      />

      {/* Grille très subtile */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Contenu */}
      <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between min-h-screen w-full max-w-6xl mx-auto px-4 sm:px-6 md:px-10 py-10 md:py-16 gap-10 lg:gap-16">
        {/* Bloc gauche : message */}
        <section className="flex-1 text-center lg:text-left space-y-8 lg:space-y-10 max-w-xl lg:max-w-none">
          <div
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 backdrop-blur-sm px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white/90"
            style={{ animation: "fadeIn 0.6s ease-out" }}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Accès sécurisé
          </div>

          <h1
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight text-white"
            style={{ animation: "fadeIn 0.6s ease-out 0.1s both" }}
          >
            Hurghada Dream
            <span className="block mt-2 bg-gradient-to-r from-indigo-300 via-cyan-300 to-violet-300 bg-clip-text text-transparent">
              Portail interne
            </span>
          </h1>

          <p
            className="text-base md:text-lg text-white/75 leading-relaxed max-w-lg mx-auto lg:mx-0"
            style={{ animation: "fadeIn 0.6s ease-out 0.2s both" }}
          >
            Devis, activités, tickets et équipes en un seul endroit. Connectez-vous avec votre code à 6 chiffres.
          </p>

          <ul
            className="flex flex-wrap justify-center lg:justify-start gap-3 text-sm text-white/70"
            style={{ animation: "fadeIn 0.6s ease-out 0.3s both" }}
          >
            {["Sync temps réel", "Historique complet", "Multi-postes"].map((item, i) => (
              <li
                key={item}
                className="flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-4 py-2"
              >
                <span className="text-indigo-400">✓</span>
                {item}
              </li>
            ))}
          </ul>

          <div
            className="flex flex-wrap items-center justify-center lg:justify-start gap-4 text-sm text-white/60"
            style={{ animation: "fadeIn 0.6s ease-out 0.4s both" }}
          >
            <span className="flex items-center gap-2">
              <span className="text-lg">📞</span>
              Support : +33 6 19 92 14 49
            </span>
          </div>
        </section>

        {/* Carte formulaire */}
        <aside
          className="w-full max-w-[420px] flex-shrink-0"
          style={{ animation: "fadeIn 0.7s ease-out 0.2s both" }}
        >
          <div
            className="login-panel relative overflow-hidden rounded-3xl border border-white/10 p-8 md:p-10 transition-all duration-500 hover:shadow-[0_0_100px_-20px_rgba(99,102,241,0.4)]"
            style={{ animation: "login-float 20s ease-in-out infinite" }}
          >
            {/* Bandeau gradient en haut */}
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-cyan-500 to-violet-500" />

            <div className="relative">
              {/* Logo + titre */}
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30 mb-5">
                  <img
                    src="/logo.png"
                    alt=""
                    className="w-14 h-14 object-contain"
                    onError={(e) => {
                      e.target.style.display = "none";
                      const parent = e.target.parentElement;
                      if (parent && !parent.querySelector(".login-fallback-logo")) {
                        const el = document.createElement("span");
                        el.className = "login-fallback-logo text-2xl font-bold text-white";
                        el.textContent = "HD";
                        parent.appendChild(el);
                      }
                    }}
                  />
                </div>
                <h2 className="text-xl md:text-2xl font-bold text-slate-800">Connexion</h2>
                <p className="text-sm text-slate-500 mt-1">Code personnel à 6 chiffres</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label
                    htmlFor="login-code"
                    className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2"
                  >
                    Code d'accès
                  </label>
                  <div className="relative group">
                    <input
                      ref={inputRef}
                      id="login-code"
                      type={showCode ? "text" : "password"}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={code}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                        setCode(v);
                        setError("");
                      }}
                      placeholder="••••••"
                      maxLength={6}
                      autoComplete="one-time-code"
                      autoFocus
                      disabled={loading}
                      className="w-full rounded-2xl border-2 bg-white/80 text-slate-900 placeholder:text-slate-400 px-5 py-4 pl-12 pr-14 text-center text-xl font-bold tracking-[0.5em] outline-none transition-all duration-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 focus:bg-white disabled:opacity-70"
                      style={{
                        WebkitTextSecurity: showCode ? "none" : "disc",
                      }}
                      aria-invalid={!!error}
                      aria-describedby={error ? "login-error" : undefined}
                    />
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-indigo-500/80 group-focus-within:text-indigo-600">
                      HD
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowCode(!showCode)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                      aria-label={showCode ? "Masquer le code" : "Afficher le code"}
                    >
                      {showCode ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                    {/* Indicateur 6 chiffres */}
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <span
                          key={i}
                          className={`w-1.5 h-1.5 rounded-full transition-colors ${
                            i < code.length ? "bg-indigo-500" : "bg-slate-200"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-400 text-center">Appuyez sur Entrée pour valider</p>
                </div>

                {error && (
                  <div
                    id="login-error"
                    role="alert"
                    className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
                  >
                    <span className="text-lg" aria-hidden>⚠️</span>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 py-4 text-base font-bold text-white shadow-lg shadow-indigo-500/30 transition-all duration-200 hover:from-indigo-500 hover:to-violet-500 hover:shadow-xl hover:shadow-indigo-500/40 hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-indigo-500/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                >
                  {loading ? (
                    <>
                      <span className="h-5 w-5 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                      Connexion…
                    </>
                  ) : (
                    <>
                      Accéder
                      <span className="text-white/80">↵</span>
                    </>
                  )}
                </button>
              </form>

              <div className="mt-8 pt-6 border-t border-slate-200/80 text-center">
                <p className="text-xs text-slate-500 font-medium">Réservé à l'équipe Hurghada Dream</p>
                <p className="text-[11px] text-slate-400 mt-1 uppercase tracking-wider">Intranet · Ewen</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
