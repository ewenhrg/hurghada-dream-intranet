import { useState, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { logger } from "../utils/logger";
import { dbUserToSessionUser } from "../constants/permissions";

const PARTICLES = 48;
const TITLE_LETTERS = "Portail interne".split("");
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
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const inputRef = useRef(null);
  const cardRef = useRef(null);

  const handleMouseMove = useCallback((e) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (e.clientX - cx) / (rect.width / 2);
    const dy = (e.clientY - cy) / (rect.height / 2);
    setTilt({ x: dy * -8, y: dx * 8 });
  }, []);

  const handleMouseLeave = useCallback(() => setTilt({ x: 0, y: 0 }), []);

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
    <div className="relative min-h-screen overflow-hidden bg-[#030712] text-white">
      {/* Fond : dégradés intenses */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 150% 120% at 0% 0%, rgba(6, 182, 212, 0.4) 0%, transparent 45%), radial-gradient(ellipse 120% 100% at 100% 100%, rgba(236, 72, 153, 0.35) 0%, transparent 45%), radial-gradient(ellipse 100% 80% at 50% 50%, rgba(99, 102, 241, 0.25) 0%, transparent 60%), #030712",
        }}
      />

      {/* Blobs très animés */}
      <div
        className="pointer-events-none absolute -top-60 -right-60 h-[700px] w-[700px] rounded-full bg-gradient-to-br from-cyan-500/35 via-indigo-500/30 to-transparent blur-[140px]"
        style={{ animation: "login-gradient-shift 10s ease-in-out infinite" }}
      />
      <div
        className="pointer-events-none absolute bottom-[-20%] left-[-10%] h-[600px] w-[600px] rounded-full bg-gradient-to-tr from-fuchsia-500/30 via-violet-500/25 to-transparent blur-[120px]"
        style={{ animation: "login-gradient-shift 14s ease-in-out infinite 2s" }}
      />
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-gradient-to-r from-indigo-500/25 to-cyan-500/20 blur-[100px]"
        style={{ animation: "login-gradient-shift 18s ease-in-out infinite 4s" }}
      />

      {/* Grille + lignes néon */}
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(6, 182, 212, 0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(6, 182, 212, 0.4) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Particules massives */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: PARTICLES }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-cyan-400/40 blur-[0.5px]"
            style={{
              width: `${(i % 3) + 2}px`,
              height: `${(i % 3) + 2}px`,
              left: `${(i * 13 + 7) % 100}%`,
              top: `${(i * 17 + 3) % 100}%`,
              animation: `login-float-particle ${6 + (i % 6)}s ease-in-out infinite`,
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </div>

      {/* Formes flottantes (hex / orbes) */}
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="pointer-events-none absolute rounded-full border border-cyan-500/20"
          style={{
            width: 60 + i * 25,
            height: 60 + i * 25,
            left: `${15 + i * 15}%`,
            top: `${20 + (i % 3) * 25}%`,
            animation: `login-float-particle ${12 + i * 2}s ease-in-out infinite`,
            animationDelay: `${i * 0.8}s`,
          }}
        />
      ))}

      {/* Bruit / texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between min-h-screen w-full max-w-6xl mx-auto px-4 sm:px-6 md:px-10 py-10 md:py-16 gap-12 lg:gap-20">
        {/* Hero gauche */}
        <section className="flex-1 text-center lg:text-left space-y-8 lg:space-y-10 max-w-xl lg:max-w-none">
          <div className="login-enter-1 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 backdrop-blur-md px-4 py-2.5 text-xs font-bold uppercase tracking-[0.25em] text-cyan-300">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-80 animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-400 shadow-[0_0_10px_#22d3ee]" />
            </span>
            Accès sécurisé
          </div>

          <h1 className="login-enter-2 text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black leading-[1.05] tracking-tight">
            <span className="text-white drop-shadow-[0_0_30px_rgba(6,182,212,0.3)]">Hurghada Dream</span>
            <span className="block mt-3 flex flex-wrap justify-center lg:justify-start">
              {TITLE_LETTERS.map((letter, i) => (
                <span
                  key={i}
                  className="login-letter login-text-gradient-anim"
                  style={{ animationDelay: `${0.4 + i * 0.04}s` }}
                >
                  {letter === " " ? "\u00A0" : letter}
                </span>
              ))}
            </span>
          </h1>

          <p className="login-enter-3 text-lg md:text-xl text-slate-300 leading-relaxed max-w-lg mx-auto lg:mx-0">
            Devis, activités, tickets et équipes. Un seul endroit, synchronisé en temps réel.
          </p>

          <ul className="login-enter-4 flex flex-wrap justify-center lg:justify-start gap-3">
            {FEATURES.map((f, i) => (
              <li
                key={f.label}
                className="flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/5 backdrop-blur-sm px-4 py-2.5 text-sm font-semibold text-cyan-100/90 transition-all duration-300 hover:bg-cyan-500/15 hover:border-cyan-400/40 hover:scale-105 hover:shadow-[0_0_20px_-5px_rgba(6,182,212,0.4)]"
              >
                <span className="text-lg opacity-90">{f.icon}</span>
                {f.label}
              </li>
            ))}
          </ul>

          <div className="login-enter-5 flex flex-wrap justify-center lg:justify-start gap-4 text-sm text-slate-400">
            <span className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-4 py-2">
              <span className="text-xl">📞</span>
              +33 6 19 92 14 49
            </span>
          </div>
        </section>

        {/* Carte 3D néon */}
        <aside className="w-full max-w-[440px] flex-shrink-0 login-enter-7">
          <div
            ref={cardRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            className="login-panel rounded-[1.75rem] p-8 md:p-10 transition-transform duration-300 ease-out"
            style={{
              transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale3d(1, 1, 1)`,
            }}
          >
            <div className="absolute inset-x-0 top-0 h-1 rounded-t-[1.75rem] overflow-hidden">
              <div
                className="h-full w-full bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-cyan-400 bg-[length:200%_100%]"
                style={{ animation: "login-text-gradient 2.5s linear infinite" }}
              />
            </div>

            <div className="relative pt-1">
              {/* Logo néon */}
              <div className="text-center mb-8">
                <div className="relative inline-block mb-5">
                  <div
                    className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-cyan-500/40 to-fuchsia-500/40 blur-3xl opacity-70"
                    style={{ animation: "login-pulse-glow 2.5s ease-in-out infinite" }}
                  />
                  <div className="relative flex items-center justify-center w-24 h-24 rounded-2xl bg-gradient-to-br from-cyan-500 via-indigo-500 to-fuchsia-500 shadow-[0_0_40px_-5px_rgba(6,182,212,0.6)] ring-2 ring-white/30">
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
                <h2 className="text-2xl md:text-3xl font-bold text-white drop-shadow-[0_0_20px_rgba(6,182,212,0.3)]">Connexion</h2>
                <p className="text-sm text-cyan-200/80 mt-1 font-medium">Code personnel à 6 chiffres</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="login-code" className="block text-xs font-bold uppercase tracking-wider text-cyan-200/90 mb-2">
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
                      className="login-input-dark w-full rounded-2xl border-2 px-5 py-4 pl-12 pr-14 text-center text-xl font-bold tracking-[0.5em] outline-none transition-all duration-300 disabled:opacity-70 placeholder:text-slate-400"
                      style={{ WebkitTextSecurity: showCode ? "none" : "disc" }}
                      aria-invalid={!!error}
                      aria-describedby={error ? "login-error" : undefined}
                    />
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-cyan-400 group-focus-within:text-cyan-300 transition-colors">
                      HD
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowCode(!showCode)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-xl text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/20 transition-all duration-200"
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
                            i < code.length ? "bg-cyan-400 shadow-[0_0_6px_#22d3ee]" : "bg-slate-500/50"
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
                    className="login-error-shake flex items-center gap-3 rounded-xl border-2 border-red-500/50 bg-red-950/80 backdrop-blur-sm px-4 py-3 text-sm font-semibold text-red-200"
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

              <div className="mt-8 pt-6 border-t border-white/10 text-center">
                <p className="text-xs font-semibold text-slate-400">Réservé à l'équipe Hurghada Dream</p>
                <p className="text-[11px] text-slate-500 mt-1 uppercase tracking-widest">Intranet · Ewen</p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
