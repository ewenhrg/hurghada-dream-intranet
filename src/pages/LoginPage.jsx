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
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="hd-card hd-border-gradient w-full max-w-md p-8 md:p-10 relative overflow-hidden">
        <div className="text-center mb-8">
          <img 
            src="/logo.png" 
            alt="Hurghada Dream Logo" 
            className="mx-auto mb-6 max-w-[180px] h-auto rounded-lg shadow-md border border-slate-200/60"
            onError={(e) => {
              // Fallback si le logo n'existe pas
              e.target.style.display = 'none';
            }}
          />
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight bg-gradient-to-r from-[#4f46e5] via-[#5b3ffd] to-[#0ea5e9] bg-clip-text text-transparent mb-3">
            Hurghada Dream
          </h1>
          <p className="text-[rgba(71,85,105,0.85)] text-sm md:text-base font-medium leading-relaxed">
            Veuillez entrer votre code d'accès pour continuer
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="code" className="block text-sm font-semibold text-[rgba(71,85,105,0.9)] mb-2.5">
              Code d'accès
            </label>
            <input
              id="code"
              type="password"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setError("");
              }}
              placeholder="Entrez votre code (6 chiffres)"
              className="w-full rounded-xl border border-[rgba(148,163,184,0.25)] bg-[rgba(255,255,255,0.9)] px-4 py-3 text-center text-lg font-semibold tracking-[0.6em] text-slate-900 focus:border-[rgba(79,70,229,0.65)] focus:ring-2 focus:ring-[rgba(79,70,229,0.25)] focus:outline-none transition-all duration-200 shadow-[0_18px_35px_-26px_rgba(15,23,42,0.45)] hover:border-[rgba(79,70,229,0.35)]"
              maxLength={6}
              autoFocus
            />
          </div>

          {error && (
            <div className="rounded-xl border border-red-200/70 bg-red-50/85 text-red-700 px-4 py-3 text-sm font-medium shadow-[0_12px_24px_-20px_rgba(220,38,38,0.4)]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center bg-gradient-to-r from-[#4f46e5] via-[#5b3ffd] to-[#0ea5e9] hover:from-[#4338ca] hover:via-[#4c37ff] hover:to-[#0891b2] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-xl transition-all duration-300 shadow-[0_22px_48px_-20px_rgba(79,70,229,0.8)] hover:-translate-y-[2px] active:translate-y-0"
          >
            {loading ? "Connexion..." : "Accéder"}
          </button>
        </form>

        <div className="mt-7 text-center space-y-1.5">
          <p className="text-xs text-[rgba(71,85,105,0.7)] font-medium">
            Système de gestion interne
          </p>
          <p className="text-[10px] text-[rgba(99,102,241,0.65)] tracking-[0.25em] uppercase font-semibold">
            accéder website by Ewen
          </p>
        </div>
      </div>
    </div>
  );
}

