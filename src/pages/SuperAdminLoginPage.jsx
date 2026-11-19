import { useState } from "react";
import { Lock, Mail, Shield } from "lucide-react";
import { PrimaryBtn } from "../components/ui";
import { signInSuperAdmin } from "../utils/superAdminAuth";
import { SUPERADMIN_ALLOWED_EMAIL } from "../constants/superAdmin";

export function SuperAdminLoginPage({ onSuccess }) {
  const [email, setEmail] = useState(SUPERADMIN_ALLOWED_EMAIL);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await signInSuperAdmin(email, password);
      if (!result.ok) {
        setError(result.error || "Connexion impossible.");
        return;
      }
      onSuccess?.(result);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(160deg,#020617_0%,#1e1b4b_45%,#0f172a_100%)] px-4 py-10 text-slate-100">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/80 p-6 shadow-2xl backdrop-blur-md md:p-8">
        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-300">
            <Shield className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-indigo-300">Accès restreint</p>
            <h1 className="mt-1 text-xl font-extrabold text-white">SuperAdmin</h1>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">
              Connexion sécurisée par e-mail et mot de passe. Aucun accès via le code intranet.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">E-mail</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
              <input
                type="email"
                name="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-12 w-full rounded-xl border border-white/15 bg-white/5 py-3 pl-10 pr-3 text-sm font-semibold text-white outline-none ring-indigo-500/40 placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2"
                placeholder="admin@…"
              />
            </div>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Mot de passe</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="min-h-12 w-full rounded-xl border border-white/15 bg-white/5 py-3 pl-10 pr-3 text-sm font-semibold text-white outline-none ring-indigo-500/40 placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2"
                placeholder="••••••••"
              />
            </div>
          </label>

          {error ? (
            <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-200" role="alert">
              {error}
            </p>
          ) : null}

          <PrimaryBtn type="submit" disabled={loading} className="!w-full !min-h-12">
            {loading ? "Vérification…" : "Se connecter"}
          </PrimaryBtn>
        </form>
      </div>
    </div>
  );
}
