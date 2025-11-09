import { createContext, useContext, useState, useEffect } from "react";
import { loadLS, saveLS } from "../utils";

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  // Charger la langue depuis localStorage, défaut: français
  const [language, setLanguage] = useState(() => {
    return loadLS("hd_language", "fr");
  });

  // Sauvegarder la langue dans localStorage quand elle change
  useEffect(() => {
    saveLS("hd_language", language);
  }, [language]);

  const value = {
    language,
    setLanguage,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}

