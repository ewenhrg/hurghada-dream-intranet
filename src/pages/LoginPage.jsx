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
        sessionStorage.setItem("hd_ok", "1");
        sessionStorage.setItem("hd_user", JSON.stringify({
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
        }));

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
    <div className="min-h-screen bg-gradient-to-br from-[#f5efe4] via-[#e9dccb] to-[#f5efe4] flex items-center justify-center p-4">
      <div className="bg-white/95 rounded-3xl shadow-2xl border border-blue-100/50 backdrop-blur-sm p-8 md:p-12 w-full max-w-md">
        <div className="text-center mb-8">
          <img 
            src="/logo.png" 
            alt="Hurghada Dream Logo" 
            className="mx-auto mb-6 max-w-[200px] h-auto"
            onError={(e) => {
              // Fallback si le logo n'existe pas
              e.target.style.display = 'none';
            }}
          />
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            Hurghada Dream
          </h1>
          <p className="text-gray-600 text-sm md:text-base">
            Veuillez entrer votre code d'accès pour continuer
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-2">
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
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-center text-lg font-semibold tracking-widest focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
              maxLength={6}
              autoFocus
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200 shadow-lg hover:shadow-xl"
          >
            {loading ? "Connexion..." : "Accéder"}
          </button>
        </form>

        <div className="mt-6 text-center space-y-1">
          <p className="text-xs text-gray-500">
            Système de gestion interne
          </p>
          <p className="text-[10px] text-gray-400">
            accéder website by Ewen
          </p>
        </div>
      </div>
    </div>
  );
}

