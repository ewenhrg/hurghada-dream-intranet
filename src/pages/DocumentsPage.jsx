import { useState, useEffect, useCallback } from "react";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import { SITE_KEY } from "../constants";
import { TextInput, PrimaryBtn, GhostBtn } from "../components/ui";
import { toast } from "../utils/toast.js";
import { logger } from "../utils/logger";

const BUCKET = "documents";
// Limite côté app (doit correspondre au file_size_limit du bucket Supabase, ex. 50 Mo)
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_FILE_SIZE_MB = 50;

export function DocumentsPage({ user }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    link: "",
    note: "",
    file: null,
  });

  const loadDocuments = useCallback(async () => {
    if (!supabase) return;
    try {
      const base = () =>
        supabase
          .from("documents")
          .select("id, title, link, file_url, note, created_at, created_by_name")
          .order("created_at", { ascending: false });

      let { data, error } = await base().eq("site_key", SITE_KEY);

      if (error) throw error;

      /** Ancienne config : VITE_SITE_KEY = URL du projet → lignes enregistrées avec cette valeur. */
      const legacyKey = __SUPABASE_DEBUG__?.supabaseUrl;
      if ((!data || data.length === 0) && legacyKey && legacyKey !== SITE_KEY) {
        const retry = await base().eq("site_key", legacyKey);
        if (!retry.error && retry.data?.length) {
          data = retry.data;
          toast.warning(
            "Documents trouvés avec l’ancienne clé site. Exécutez le script SQL de migration (voir dépôt) pour corriger site_key en base.",
            8000
          );
        }
      }

      setList(data || []);
    } catch (err) {
      logger.error("Erreur chargement documents:", err);
      toast.error("Impossible de charger les documents.");
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.warning("Le titre est obligatoire.");
      return;
    }
    if (!supabase) {
      toast.error("Connexion Supabase indisponible.");
      return;
    }

    if (form.file && form.file.size > MAX_FILE_SIZE_BYTES) {
      toast.error(`Fichier trop volumineux. Taille max : ${MAX_FILE_SIZE_MB} Mo.`);
      return;
    }

    setSubmitting(true);
    try {
      let fileUrl = "";
      if (form.file && form.file.size > 0) {
        const path = `${SITE_KEY}/${Date.now()}_${form.file.name}`;
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, form.file, { upsert: false });

        if (uploadError) {
          logger.error("Erreur upload:", uploadError);
          const msg = uploadError.message?.includes("maximum allowed size")
            ? `Fichier trop volumineux (max ${MAX_FILE_SIZE_MB} Mo). Augmente la limite dans Supabase Storage si besoin.`
            : "Erreur lors de l'upload du fichier.";
          toast.error(msg);
          setSubmitting(false);
          return;
        }
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
        fileUrl = urlData?.publicUrl || "";
      }

      const { error } = await supabase.from("documents").insert({
        site_key: SITE_KEY,
        title: form.title.trim(),
        link: (form.link || "").trim() || null,
        file_url: fileUrl || null,
        note: (form.note || "").trim() || null,
        created_by_name: user?.name || "",
      });

      if (error) throw error;
      toast.success("Document ajouté.");
      setForm({ title: "", link: "", note: "", file: null });
      setShowForm(false);
      loadDocuments();
    } catch (err) {
      logger.error("Erreur ajout document:", err);
      toast.error(err.message || "Erreur lors de l'ajout.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Supprimer ce document ?")) return;
    try {
      const { error } = await supabase.from("documents").delete().eq("id", id);
      if (error) throw error;
      toast.success("Document supprimé.");
      loadDocuments();
    } catch {
      toast.error("Erreur lors de la suppression.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-slate-500">Chargement des documents...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-end gap-4">
        <PrimaryBtn
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="whitespace-nowrap"
        >
          {showForm ? "Annuler" : "+ Ajouter un document"}
        </PrimaryBtn>
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border-2 border-indigo-200 p-6 shadow-lg space-y-4 bg-[var(--hd-surface)]"
        >
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Titre *</label>
            <TextInput
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Ex: Notice d'utilisation"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Lien</label>
            <TextInput
              type="url"
              value={form.link}
              onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))}
              placeholder="https://..."
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Fichier</label>
            <input
              type="file"
              onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] || null }))}
              className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-indigo-50 file:text-indigo-700 file:font-semibold hover:file:bg-indigo-100"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Note</label>
            <textarea
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="Commentaire ou description..."
              rows={3}
              className="w-full rounded-xl border border-[rgba(148,163,184,0.35)] bg-[var(--hd-surface-input)] px-4 py-3 text-base text-slate-800 placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 min-h-[44px]"
            />
          </div>
          <div className="flex gap-3">
            <PrimaryBtn type="submit" disabled={submitting}>
              {submitting ? "Enregistrement..." : "Valider"}
            </PrimaryBtn>
            <GhostBtn type="button" onClick={() => setShowForm(false)}>
              Annuler
            </GhostBtn>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {list.length === 0 ? (
          <p className="text-slate-500 py-8 text-center">Aucun document pour l'instant. Cliquez sur « Ajouter un document ».</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 shadow-sm overflow-hidden bg-[var(--hd-surface)]">
            {list.map((doc) => (
              <li key={doc.id} className="p-4 md:p-5 hover:bg-slate-50/50 transition-colors">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900">{doc.title}</h3>
                    {doc.link && (
                      <a
                        href={doc.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:underline text-sm break-all"
                      >
                        {doc.link}
                      </a>
                    )}
                    {doc.file_url && (
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-indigo-600 hover:underline text-sm mt-1"
                      >
                        📎 Ouvrir le fichier
                      </a>
                    )}
                    {doc.note && (
                      <p className="text-slate-600 text-sm mt-2 whitespace-pre-wrap">{doc.note}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-2">
                      {doc.created_at ? new Date(doc.created_at).toLocaleString("fr-FR") : ""}
                      {doc.created_by_name && ` · ${doc.created_by_name}`}
                    </p>
                  </div>
                  <GhostBtn
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(doc.id)}
                    className="flex-shrink-0"
                  >
                    Supprimer
                  </GhostBtn>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
