import { useState } from "react";
import { PIN_CODE } from "../constants";

export function LoginPage({ onSuccess }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (code === PIN_CODE) {
      sessionStorage.setItem("hd_ok", "1");
      onSuccess();
    } else {
      setError("Code d'accès incorrect. Veuillez réessayer.");
      setCode("");
    }
  }

  return (
    <div className="min-h-screen bg-[#e9dccb] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12 w-full max-w-md">
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
              placeholder="Entrez votre code (4 chiffres)"
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-center text-lg font-semibold tracking-widest focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all"
              maxLength={4}
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
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200 shadow-lg hover:shadow-xl"
          >
            Accéder
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            Système de gestion interne
          </p>
        </div>
      </div>
    </div>
  );
}

