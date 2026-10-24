import { useCallback, useEffect, useState } from "react";
import { PrimaryBtn } from "../components/ui";
import { canManageClientFlyer } from "../constants/permissions";
import { supabase } from "../lib/supabase";
import { toast } from "../utils/toast.js";
import {
  CLIENT_FLYER_BUCKET,
  CLIENT_FLYER_MAX_BYTES,
  CLIENT_FLYER_MAX_DESCRIPTION,
  deactivateClientFlyers,
  fetchActiveClientFlyer,
  publishClientFlyer,
} from "../utils/clientFlyer";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function formatRemaining(endsAt) {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "terminée";
  const hours = Math.ceil(ms / 3600000);
  if (hours < 48) return `${hours} h restante${hours > 1 ? "s" : ""}`;
  const days = Math.ceil(hours / 24);
  return `${days} jours restants`;
}

export function ClientFlyerPage({ user }) {
  const allowed = canManageClientFlyer(user);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("24");
  const [unit, setUnit] = useState("hours");
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    const row = await fetchActiveClientFlyer();
    setCurrent(row);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!allowed) return undefined;
    void refresh();
    return undefined;
  }, [allowed, refresh]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function handleSend() {
    const text = description.trim();
    const count = Math.floor(Number(amount));
    const max = unit === "days" ? 60 : 168;
    if (!file) {
      toast.warning("Ajoutez l’image du flyer.");
      return;
    }
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.warning("Utilisez une image JPG, PNG, WEBP ou GIF.");
      return;
    }
    if (file.size > CLIENT_FLYER_MAX_BYTES) {
      toast.warning("L’image dépasse 8 Mo.");
      return;
    }
    if (!text) {
      toast.warning("Écrivez la description.");
      return;
    }
    if (!Number.isFinite(count) || count < 1 || count > max) {
      toast.warning(unit === "days" ? "Choisissez entre 1 et 60 jours." : "Choisissez entre 1 et 168 heures.");
      return;
    }
    const durationLabel = unit === "days" ? `${count} jour${count > 1 ? "s" : ""}` : `${count} heure${count > 1 ? "s" : ""}`;
    if (!window.confirm(`Afficher ce flyer dans l’application pendant ${durationLabel} ?`)) return;

    setSending(true);
    try {
      const safeName = String(file.name || "flyer")
        .replace(/[^\w.\-]+/g, "_")
        .replace(/_+/g, "_");
      const path = `${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage.from(CLIENT_FLYER_BUCKET).upload(path, file, {
        upsert: false,
        contentType: file.type,
      });
      if (uploadError) {
        toast.error("L’image n’a pas pu être envoyée.");
        return;
      }
      const { data: pub } = supabase.storage.from(CLIENT_FLYER_BUCKET).getPublicUrl(path);
      const imageUrl = pub?.publicUrl || "";
      if (!imageUrl) {
        toast.error("L’image n’a pas d’adresse publique.");
        return;
      }
      const ms = unit === "days" ? count * 86400000 : count * 3600000;
      const result = await publishClientFlyer({
        imageUrl,
        description: text,
        endsAt: new Date(Date.now() + ms).toISOString(),
        createdByName: user?.name || "",
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Flyer envoyé. Il s’affiche à l’ouverture de l’application.");
      setFile(null);
      setDescription("");
      await refresh();
    } finally {
      setSending(false);
    }
  }

  async function handleStop() {
    if (!window.confirm("Retirer le flyer de l’application ?")) return;
    setSending(true);
    try {
      const result = await deactivateClientFlyers();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Flyer retiré.");
      setCurrent(null);
    } finally {
      setSending(false);
    }
  }

  if (!allowed) {
    return <p className="text-sm text-slate-600">Accès réservé à Ewen et Karim.</p>;
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <p className="text-sm leading-relaxed text-slate-600">
        Le flyer s’ouvre comme une annonce dès qu’un client lance l’application Hurghada Dream. Il le ferme avec la croix. Il revient à la prochaine ouverture, jusqu’à la fin de la durée choisie.
      </p>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900">Flyer en cours</h3>
        {loading ? (
          <p className="mt-2 text-sm text-slate-500">Chargement…</p>
        ) : current ? (
          <div className="mt-3 space-y-3">
            <img src={current.image_url} alt="" className="max-h-48 w-full rounded-xl bg-slate-100 object-contain" />
            <p className="text-sm text-slate-700">{current.description}</p>
            <p className="text-xs font-semibold text-indigo-700">{formatRemaining(current.ends_at)}</p>
            <button
              type="button"
              onClick={() => void handleStop()}
              disabled={sending}
              className="rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 disabled:opacity-50"
            >
              Retirer maintenant
            </button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Aucun flyer n’est affiché dans l’application.</p>
        )}
      </section>

      <label className="block">
        <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Image</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(event) => setFile(event.target.files?.[0] || null)}
          className="block w-full text-sm text-slate-700"
        />
        {previewUrl ? (
          <img src={previewUrl} alt="Aperçu du flyer" className="mt-3 max-h-56 w-full rounded-xl bg-slate-100 object-contain" />
        ) : null}
      </label>

      <label className="block">
        <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Description</span>
        <textarea
          value={description}
          maxLength={CLIENT_FLYER_MAX_DESCRIPTION}
          rows={4}
          placeholder="Exemple : ce week-end, -10 € sur Orange Bay."
          onChange={(event) => setDescription(event.target.value)}
          className="w-full resize-y rounded-xl border border-[rgba(148,163,184,0.35)] bg-[var(--hd-surface-input)] px-4 py-3 text-base text-slate-800 outline-none focus:border-[rgba(79,70,229,0.7)] focus:ring-2 focus:ring-[rgba(79,70,229,0.3)]"
        />
        <span className="mt-1 block text-right text-xs text-slate-500">
          {description.trim().length}/{CLIENT_FLYER_MAX_DESCRIPTION}
        </span>
      </label>

      <div>
        <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Durée d’affichage</span>
        <div className="flex gap-2">
          <input
            type="number"
            min="1"
            max={unit === "days" ? 60 : 168}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="w-28 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base font-semibold text-slate-900"
          />
          <select
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800"
          >
            <option value="hours">Heures</option>
            <option value="days">Jours</option>
          </select>
        </div>
      </div>

      <PrimaryBtn type="button" onClick={() => void handleSend()} disabled={sending}>
        {sending ? "Envoi…" : "Envoyer"}
      </PrimaryBtn>
    </div>
  );
}
