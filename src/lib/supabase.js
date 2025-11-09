// src/lib/supabase.js
import { createClient } from "@supabase/supabase-js";

// lire les variables env (vite ou CRA)
function getEnv(key) {
  // Vite
  if (
    typeof import.meta !== "undefined" &&
    import.meta.env &&
    Object.prototype.hasOwnProperty.call(import.meta.env, key)
  ) {
    return import.meta.env[key];
  }
  // CRA
  const globalProcess =
    typeof globalThis !== "undefined" && globalThis.process ? globalThis.process : undefined;
  if (globalProcess && globalProcess.env && Object.prototype.hasOwnProperty.call(globalProcess.env, key)) {
    return globalProcess.env[key];
  }
  // fallback window
  if (typeof window !== "undefined" && window.__ENV__ && window.__ENV__[key]) {
    return window.__ENV__[key];
  }
  return undefined;
}

const SUPABASE_URL =
  getEnv("VITE_SUPABASE_URL") || getEnv("REACT_APP_SUPABASE_URL") || "";
const SUPABASE_ANON_KEY =
  getEnv("VITE_SUPABASE_ANON_KEY") || getEnv("REACT_APP_SUPABASE_ANON_KEY") || "";
export const SITE_KEY =
  getEnv("VITE_SITE_KEY") || getEnv("REACT_APP_SITE_KEY") || "hurghada_dream_0606";

const isConfigured = !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

function showConfigHint() {
  if (typeof document === "undefined") return;
  if (document.getElementById("__sb_hint")) return;
  const el = document.createElement("div");
  el.id = "__sb_hint";
  el.style.position = "fixed";
  el.style.left = "12px";
  el.style.bottom = "12px";
  el.style.zIndex = "999999";
  el.style.maxWidth = "520px";
  el.style.padding = "12px 14px";
  el.style.borderRadius = "12px";
  el.style.border = "1px solid #ffd7b8";
  el.style.background = "#fff7ed";
  el.style.color = "#7c2d12";
  el.style.fontSize = "12px";
  el.innerHTML = `
<b>Supabase non configuré.</b><br/>
Ajoutez dans .env (à la racine) :
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_SITE_KEY=hurghada_dream_0606
`;
  const btn = document.createElement("button");
  btn.textContent = "×";
  btn.style.position = "absolute";
  btn.style.top = "4px";
  btn.style.right = "8px";
  btn.onclick = () => el.remove();
  el.appendChild(btn);
  document.body.appendChild(el);
}

function makeStubClient() {
  const res = { data: null, error: { message: "Supabase non configuré" } };
  const chain = {
    select: () => Promise.resolve(res),
    insert: () => Promise.resolve(res),
    update: () => Promise.resolve(res),
    delete: () => Promise.resolve(res),
    eq: () => Promise.resolve(res),
    order: () => Promise.resolve(res),
    single: () => Promise.resolve(res),
  };
  return {
    from: () => chain,
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    },
  };
}

export const supabase = (() => {
  if (!isConfigured) {
    if (typeof window !== "undefined") showConfigHint();
    return makeStubClient();
  }
  try {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
  } catch (e) {
    console.warn("Erreur createClient → stub", e);
    return makeStubClient();
  }
})();

export const __SUPABASE_DEBUG__ = {
  supabaseUrl: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY ? "(présent)" : "(manquant)",
  siteKey: SITE_KEY,
  isConfigured,
};
