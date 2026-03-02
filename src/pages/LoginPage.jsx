import { useState, useRef } from "react";
import { supabase } from "../lib/supabase";
import { logger } from "../utils/logger";
import { dbUserToSessionUser } from "../constants/permissions";

const PARTICLES = 24;
const FEATURES = [
  { label: "Sync temps réel", icon: "⚡" },
  { label: "Historique complet", icon: "📋" },
  { label: "Multi-postes", icon: "🖥️" },
];

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
    <div className="relative min-h-screen overflow-hidden bg-[#050810] text-white">
      {/* Fond animé : dégradés qui bougent */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 140% 100% at 10% 0%, rgba(79, 70, 229, 0.35) 0%, transparent 50%), radial-gradient(ellipse 100% 80% at 90% 80%, rgba(6, 182, 212, 0.25) 0%, transparent 50%), radial-gradient(ellipse 80% 60% at 50% 50%, rgba(124, 58, 237, 0.2) 0%, transparent 55%), #050810",
        }}
      />

      {/* Blobs animés */}
      <div
        className="pointer-events-none absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full bg-gradient-to-br from-indigo-500/40 via-violet-500/30 to-transparent blur-[120px]"
        style={{ animation: "login-gradient-shift 12s ease-in-out infinite" }}
      />
      <div
        className="pointer-events-none absolute bottom-[-10%] left-[-5%] h-[500px] w-[500px] rounded-full bg-gradient-to-tr from-cyan-500/35 via-blue-500/25 to-transparent blur-[100px]"
        style={{ animation: "login-gradient-shift 15s ease-in-out infinite 2s" }}
      />
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[400px] rounded-full bg-gradient-to-r from-violet-500/25 to-fuchsia-500/20 blur-[90px]"
        style={{ animation: "login-gradient-shift 18s ease-in-out infinite 4s" }}
      />

      {/* Grille perspective */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)",
          backgroundSize: "50px 50px",
        }}
      />

      {/* Particules flottantes */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: PARTICLES }).map((_, i) => (
          <div
            key={i}
            className="absolute w-2 h-2 rounded-full bg-white/30 blur-[1px]"
            style={{
              left: `${(i * 7 + 13) % 100}%`,
              top: `${(i * 11 + 7) % 100}%`,
              animation: `login-float-particle ${8 + (i % 5)}s ease-in-out infinite`,
              animationDelay: `${i * 0.4}s`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between min-h-screen w-full max-w-6xl mx-auto px-4 sm:px-6 md:px-10 py-10 md:py-16 gap-12 lg:gap-20">
        {/* Gauche : hero */}
        <section className="flex-1 text-center lg:text-left space-y-8 lg:space-y-10 max-w-xl lg:max-w-none">
          <div className="login-enter-1 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 backdrop-blur-md px-4 py-2.5 text-xs font-bold uppercase tracking-[0.2em] text-white/95">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </span>
            Accès sécurisé
          </div>

          <h1 className="login-enter-2 text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.05] tracking-tight">
            <span className="text-white drop-shadow-lg">Hurghada Dream</span>
            <span className="login-text-gradient-anim block mt-3 text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold drop-shadow-lg">
              Portail interne
            </span>
          </h1>

          <p className="login-enter-3 text-lg md:text-xl text-white/80 leading-relaxed max-w-lg mx-auto lg:mx-0">
            Devis, activités, tickets et équipes. Un seul endroit, synchronisé en temps réel.
          </p>

          <ul className="login-enter-4 flex flex-wrap justify-center lg:justify-start gap-3">
            {FEATURES.map((f, i) => (
              <li
                key={f.label}
                className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 backdrop-blur-sm px-4 py-2.5 text-sm font-medium text-white/90 transition-all duration-300 hover:bg-white/10 hover:border-white/25 hover:scale-105"
                style={{ animationDelay: `${0.5 + i * 0.05}s` }}
              >
                <span className="text-lg opacity-90">{f.icon}</span>
                {f.label}
              </li>
            ))}
          </ul>

          <div className="login-enter-5 flex flex-wrap justify-center lg:justify-start gap-4 text-sm text-white/60">
            <span className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-4 py-2">
              <span className="text-xl">📞</span>
              +33 6 19 92 14 49
            </span>
          </div>
        </section>

        {/* Carte formulaire */}
        <aside className="w-full max-w-[440px] flex-shrink-0 login-enter-7">
          <div className="login-panel rounded-[1.75rem] p-8 md:p-10 transition-all duration-500 hover:shadow-[0_0_80px_-15px_rgba(99,102,241,0.5)]">
            {/* Bandeau gradient animé en haut */}
            <div className="absolute inset-x-0 top-0 h-1 rounded-t-[1.75rem] overflow-hidden">
              <div
                className="h-full w-full bg-gradient-to-r from-indigo-500 via-cyan-500 via-violet-500 to-indigo-500 bg-[length:200%_100%]"
                style={{ animation: "login-text-gradient 3s linear infinite" }}
              />
            </div>

            <div className="relative pt-1">
              {/* Logo */}
              <div className="text-center mb-8">
                <div className="relative inline-block mb-5">
                  <div
                    className="absolute -inset-3 rounded-3xl bg-gradient-to-r from-indigo-500/50 to-violet-500/50 blur-2xl opacity-60"
                    style={{ animation: "login-pulse-glow 3s ease-in-out infinite" }}
                  />
                  <div className="relative flex items-center justify-center w-24 h-24 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-xl shadow-indigo-500/40 ring-2 ring-white/20">
                    <img
                      src="/logo.png"
                      alt=""
                      className="w-16 h-16 object-contain"
                      onError={(e) => {
                        e.target.style.display = "none";
                        const parent = e.target.parentElement;
                        if (parent && !parent.querySelector(".login-fallback-logo")) {
                          const el = document.createElement("span");
                          el.className = "login-fallback-logo text-3xl font-black text-white";
                          el.textContent = "HD";
                          parent.appendChild(el);
                        }
                      }}
                    />
                  </div>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-slate-800">Connexion</h2>
                <p className="text-sm text-slate-500 mt-1 font-medium">Code personnel à 6 chiffres</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="login-code" className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
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
                      className="login-input-glow w-full rounded-2xl border-2 border-slate-200 bg-white/90 text-slate-900 placeholder:text-slate-400 px-5 py-4 pl-12 pr-14 text-center text-xl font-bold tracking-[0.5em] outline-none transition-all duration-300 focus:border-indigo-500 focus:bg-white disabled:opacity-70"
                      style={{ WebkitTextSecurity: showCode ? "none" : "disc" }}
                      aria-invalid={!!error}
                      aria-describedby={error ? "login-error" : undefined}
                    />
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-indigo-500 group-focus-within:text-indigo-600 transition-colors">
                      HD
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowCode(!showCode)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all duration-200"
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
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {[0, 1, 2, 3, 4, 5].map((i) => (
                        <span
                          key={i}
                          className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${
                            i < code.length ? "bg-indigo-500 scale-110" : "bg-slate-200"
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-400 text-center">Entrée pour valider</p>
                </div>

                {error && (
                  <div
                    id="login-error"
                    role="alert"
                    className={`login-error-shake flex items-center gap-3 rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700`}
                  >
                    <span className="text-xl" aria-hidden>⚠️</span>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="login-btn-primary group relative w-full flex items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold text-white overflow-hidden transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none"
                >
                  <span className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-[200%] transition-transform duration-700 ease-out" />
                  {loading ? (
                    <>
                      <span className="h-5 w-5 border-2 border-white/90 border-t-transparent rounded-full animate-spin" />
                      Connexion…
                    </>
                  ) : (
                    <>
                      Accéder
                      <span className="text-white/90 text-lg">↵</span>
                    </>
                  )}
                </button>
              </form>

              <div className="mt-8 pt-6 border-t border-slate-200/80 text-center">
                <p className="text-xs font-semibold text-slate-500">Réservé à l'équipe Hurghada Dream</p>
                <p className="text-[11px] text-slate-400 mt-1 uppercase tracking-widest">Intranet · Ewen</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
