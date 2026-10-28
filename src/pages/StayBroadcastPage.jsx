import { useCallback, useEffect, useState } from "react";
import { SITE_KEY } from "../constants";
import { canSendStayBroadcast } from "../constants/permissions";
import { PrimaryBtn } from "../components/ui";
import { supabase } from "../lib/supabase";
import { logger } from "../utils/logger";
import { toast } from "../utils/toast.js";

const MAX_MESSAGE = 240;

export function StayBroadcastPage({ user }) {
  const allowed = canSendStayBroadcast(user);
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState(null);
  const [audienceError, setAudienceError] = useState("");
  const [loadingCount, setLoadingCount] = useState(true);
  const [sending, setSending] = useState(false);

  const callBroadcast = useCallback(
    async (action, text) => {
      if (!supabase?.functions?.invoke) return { ok: false, error: "Connexion indisponible." };
      const code = String(user?.code || "").trim();
      if (!/^\d{6}$/.test(code)) return { ok: false, error: "Reconnectez-vous pour envoyer un message." };
      const { data, error } = await supabase.functions.invoke("notify-stay-broadcast", {
        body: {
          action,
          message: text,
          site_key: SITE_KEY,
          staff_code: code,
        },
      });
      if (error) {
        logger.warn("notify-stay-broadcast:", error);
        return { ok: false, error: "Envoi impossible. Réessayez." };
      }
      const payload = data && typeof data === "object" ? data : {};
      if (payload.locked) return { ok: false, error: "Trop d'essais. Réessayez dans quelques minutes." };
      if (payload.ok !== true) return { ok: false, error: payload.error || "Envoi refusé." };
      return { ok: true, clients: Number(payload.clients) || 0, sent: Number(payload.sent) || 0 };
    },
    [user]
  );

  const refreshAudience = useCallback(async (silent = false) => {
    if (!allowed) return;
    if (!silent) setLoadingCount(true);
    try {
      const result = await callBroadcast("count", "");
      if (result.ok) {
        setAudience(result.clients);
        setAudienceError("");
      } else if (!silent) {
        setAudienceError(result.error);
      }
    } finally {
      if (!silent) setLoadingCount(false);
    }
  }, [allowed, callBroadcast]);

  useEffect(() => {
    void refreshAudience(false);
    const id = window.setInterval(() => void refreshAudience(true), 15000);
    return () => window.clearInterval(id);
  }, [refreshAudience]);

  async function handleSend() {
    const text = message.trim();
    if (!text) {
      toast.warning("Écrivez le message avant de l'envoyer.");
      return;
    }
    const countLabel = audience == null ? "les clients concernés" : `${audience} client${audience > 1 ? "s" : ""}`;
    if (!window.confirm(`Envoyer ce message à ${countLabel} ?`)) return;
    setSending(true);
    try {
      const result = await callBroadcast("send", text);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setAudience(result.clients);
      if (result.sent === 0) {
        toast.warning("Aucun téléphone n'a encore activé les notifications.");
        return;
      }
      toast.success(
        result.sent > 1
          ? `Message envoyé sur ${result.sent} téléphones.`
          : "Message envoyé sur 1 téléphone."
      );
      setMessage("");
    } finally {
      setSending(false);
    }
  }

  if (!allowed) {
    return <p className="text-sm text-slate-600">Accès réservé à Ewen et Karim.</p>;
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <p className="text-sm leading-relaxed text-slate-600">
        Le message part uniquement aux clients connectés à Mon séjour dont le séjour inclut aujourd’hui
        (date d’arrivée ≤ aujourd’hui ≤ date de départ, fuseau Hurghada). Les clients hors dates ou
        déconnectés ne sont pas comptés.
      </p>
      <p className="text-sm font-semibold text-slate-800">
        {loadingCount
          ? "Comptage des clients…"
          : audienceError
            ? audienceError
            : audience
              ? `${audience} client${audience > 1 ? "s" : ""} actuellement à Hurghada.`
              : "Aucun client actuellement à Hurghada (connecté à Mon séjour avec séjour en cours)."}
      </p>
      <label className="block">
        <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Message</span>
        <textarea
          value={message}
          maxLength={MAX_MESSAGE}
          rows={5}
          placeholder="Exemple : demain, le départ de Paradise Island est avancé à 8h."
          onChange={(e) => setMessage(e.target.value)}
          className="w-full resize-y rounded-xl border border-[rgba(148,163,184,0.35)] bg-[var(--hd-surface-input)] px-4 py-3 text-base text-slate-800 placeholder:text-slate-500 outline-none focus:border-[rgba(79,70,229,0.7)] focus:ring-2 focus:ring-[rgba(79,70,229,0.3)]"
        />
        <span className="mt-1 block text-right text-xs text-slate-500">
          {message.trim().length}/{MAX_MESSAGE}
        </span>
      </label>
      <PrimaryBtn type="button" onClick={() => void handleSend()} disabled={sending || !message.trim()}>
        {sending ? "Envoi…" : "Envoyer la notification"}
      </PrimaryBtn>
    </div>
  );
}
