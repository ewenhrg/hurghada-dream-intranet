import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { SITE_KEY } from "../constants";
import { canAccessInternsPage } from "../constants/permissions";
import { TextInput, NumberInput, PrimaryBtn, GhostBtn } from "../components/ui";
import { toast } from "../utils/toast.js";
import { logger } from "../utils/logger";

const CV_BUCKET = "documents";
const MAX_CV_BYTES = 20 * 1024 * 1024;

function emptyInternForm() {
  return {
    first_name: "",
    last_name: "",
    age: "",
    stage_start: "",
    stage_end: "",
    notes: "",
    apartment_id: "",
    cvFile: null,
  };
}

function emptyApartmentForm() {
  return {
    name: "",
    address: "",
    capacity: "2",
    notes: "",
  };
}

function formatDateFr(iso) {
  if (!iso) return "—";
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function daysBetween(start, end) {
  const a = new Date(`${start}T12:00:00`).getTime();
  const b = new Date(`${end}T12:00:00`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

function fullName(intern) {
  return `${String(intern.first_name || "").trim()} ${String(intern.last_name || "").trim()}`.trim();
}

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Page Stagiaires — planning + appartements colloc + CV.
 * Visible uniquement pour Ewen et Karim.
 */
export function InternsPage({ user }) {
  const canAccess = canAccessInternsPage(user);
  const [interns, setInterns] = useState([]);
  const [apartments, setApartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInternModal, setShowInternModal] = useState(false);
  const [showApartmentModal, setShowApartmentModal] = useState(false);
  const [editingIntern, setEditingIntern] = useState(null);
  const [internForm, setInternForm] = useState(emptyInternForm);
  const [apartmentForm, setApartmentForm] = useState(emptyApartmentForm);
  const [saving, setSaving] = useState(false);
  const [planningMonth, setPlanningMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const loadAll = useCallback(async () => {
    if (!supabase || !canAccess) return;
    setLoading(true);
    try {
      const [apRes, inRes] = await Promise.all([
        supabase
          .from("intern_apartments")
          .select("*")
          .eq("site_key", SITE_KEY)
          .order("name", { ascending: true }),
        supabase
          .from("interns")
          .select("*")
          .eq("site_key", SITE_KEY)
          .order("stage_start", { ascending: true }),
      ]);
      if (apRes.error) throw apRes.error;
      if (inRes.error) throw inRes.error;
      setApartments(apRes.data || []);
      setInterns(inRes.data || []);
    } catch (err) {
      logger.error("Chargement stagiaires:", err);
      toast.error(
        err?.message?.includes("does not exist") || err?.code === "42P01"
          ? "Tables stagiaires absentes. Exécutez supabase_interns_tables.sql."
          : "Impossible de charger les stagiaires."
      );
      setApartments([]);
      setInterns([]);
    } finally {
      setLoading(false);
    }
  }, [canAccess]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const apartmentsById = useMemo(() => {
    const map = new Map();
    apartments.forEach((a) => map.set(a.id, a));
    return map;
  }, [apartments]);

  const occupancyByApartment = useMemo(() => {
    const map = new Map();
    apartments.forEach((a) => map.set(a.id, []));
    interns.forEach((intern) => {
      if (intern.apartment_id == null) return;
      const list = map.get(intern.apartment_id) || [];
      list.push(intern);
      map.set(intern.apartment_id, list);
    });
    return map;
  }, [apartments, interns]);

  const unassigned = useMemo(
    () => interns.filter((i) => i.apartment_id == null),
    [interns]
  );

  const today = todayKey();
  const presentNow = useMemo(
    () => interns.filter((i) => i.stage_start <= today && i.stage_end >= today),
    [interns, today]
  );

  const planningRange = useMemo(() => {
    const [y, m] = planningMonth.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    const startKey = `${y}-${String(m).padStart(2, "0")}-01`;
    const endKey = `${y}-${String(m).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
    const daysInMonth = end.getDate();
    return { start, end, startKey, endKey, daysInMonth, year: y, month: m };
  }, [planningMonth]);

  const planningRows = useMemo(() => {
    return interns
      .filter(
        (i) => i.stage_start <= planningRange.endKey && i.stage_end >= planningRange.startKey
      )
      .map((intern) => {
        const clipStart = intern.stage_start < planningRange.startKey ? planningRange.startKey : intern.stage_start;
        const clipEnd = intern.stage_end > planningRange.endKey ? planningRange.endKey : intern.stage_end;
        const startDay = Number(clipStart.slice(8, 10));
        const endDay = Number(clipEnd.slice(8, 10));
        const leftPct = ((startDay - 1) / planningRange.daysInMonth) * 100;
        const widthPct = ((endDay - startDay + 1) / planningRange.daysInMonth) * 100;
        return { intern, leftPct, widthPct };
      });
  }, [interns, planningRange]);

  const openCreateIntern = () => {
    setEditingIntern(null);
    setInternForm(emptyInternForm());
    setShowInternModal(true);
  };

  const openEditIntern = (intern) => {
    setEditingIntern(intern);
    setInternForm({
      first_name: intern.first_name || "",
      last_name: intern.last_name || "",
      age: intern.age != null ? String(intern.age) : "",
      stage_start: intern.stage_start || "",
      stage_end: intern.stage_end || "",
      notes: intern.notes || "",
      apartment_id: intern.apartment_id != null ? String(intern.apartment_id) : "",
      cvFile: null,
    });
    setShowInternModal(true);
  };

  const uploadCv = async (file) => {
    if (!file) return { url: "", fileName: "" };
    if (file.size > MAX_CV_BYTES) {
      throw new Error("CV trop volumineux (max 20 Mo).");
    }
    const safeName = String(file.name || "cv.pdf").replace(/[^\w.\-() ]+/g, "_");
    const path = `${SITE_KEY}/interns/${Date.now()}_${safeName}`;
    const { error } = await supabase.storage.from(CV_BUCKET).upload(path, file, {
      upsert: false,
      contentType: file.type || undefined,
    });
    if (error) throw error;
    const { data: pub } = supabase.storage.from(CV_BUCKET).getPublicUrl(path);
    return { url: pub?.publicUrl || "", fileName: safeName };
  };

  const handleSaveIntern = async (e) => {
    e.preventDefault();
    if (!supabase) {
      toast.error("Connexion Supabase indisponible.");
      return;
    }
    const first = String(internForm.first_name || "").trim();
    const last = String(internForm.last_name || "").trim();
    const start = String(internForm.stage_start || "").trim();
    const end = String(internForm.stage_end || "").trim();
    if (!first || !last) {
      toast.warning("Nom et prénom obligatoires.");
      return;
    }
    if (!start || !end) {
      toast.warning("Indiquez les dates de stage.");
      return;
    }
    if (end < start) {
      toast.warning("La date de fin doit être après le début.");
      return;
    }
    const ageRaw = String(internForm.age || "").trim();
    const age = ageRaw === "" ? null : Math.round(Number(ageRaw));
    if (age != null && (!Number.isFinite(age) || age < 14 || age > 80)) {
      toast.warning("Âge invalide.");
      return;
    }

    setSaving(true);
    try {
      let cvUrl = editingIntern?.cv_url || "";
      let cvFileName = editingIntern?.cv_file_name || "";
      if (internForm.cvFile) {
        const uploaded = await uploadCv(internForm.cvFile);
        cvUrl = uploaded.url;
        cvFileName = uploaded.fileName;
      }

      const apartmentId =
        internForm.apartment_id === "" ? null : Number(internForm.apartment_id);

      const payload = {
        site_key: SITE_KEY,
        first_name: first,
        last_name: last,
        age,
        stage_start: start,
        stage_end: end,
        notes: String(internForm.notes || "").trim(),
        apartment_id: Number.isFinite(apartmentId) ? apartmentId : null,
        cv_url: cvUrl || "",
        cv_file_name: cvFileName || "",
        updated_at: new Date().toISOString(),
      };

      if (editingIntern?.id) {
        const { error } = await supabase.from("interns").update(payload).eq("id", editingIntern.id);
        if (error) throw error;
        toast.success("Stagiaire mis à jour.");
      } else {
        const { error } = await supabase.from("interns").insert({
          ...payload,
          created_by_name: user?.name || "",
        });
        if (error) throw error;
        toast.success("Stagiaire ajouté.");
      }
      setShowInternModal(false);
      setEditingIntern(null);
      setInternForm(emptyInternForm());
      await loadAll();
    } catch (err) {
      logger.error("Save intern:", err);
      toast.error(err.message || "Impossible d’enregistrer le stagiaire.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteIntern = async (intern) => {
    if (!supabase) return;
    const ok = window.confirm(`Supprimer ${fullName(intern)} ?`);
    if (!ok) return;
    try {
      const { error } = await supabase.from("interns").delete().eq("id", intern.id);
      if (error) throw error;
      toast.success("Stagiaire supprimé.");
      await loadAll();
    } catch (err) {
      logger.error("Delete intern:", err);
      toast.error("Suppression impossible.");
    }
  };

  const handleSaveApartment = async (e) => {
    e.preventDefault();
    if (!supabase) {
      toast.error("Connexion Supabase indisponible.");
      return;
    }
    const name = String(apartmentForm.name || "").trim();
    if (!name) {
      toast.warning("Le nom de l’appartement est obligatoire.");
      return;
    }
    const capacity = Math.max(1, Math.round(Number(apartmentForm.capacity) || 2));
    setSaving(true);
    try {
      const { error } = await supabase.from("intern_apartments").insert({
        site_key: SITE_KEY,
        name,
        address: String(apartmentForm.address || "").trim(),
        capacity,
        notes: String(apartmentForm.notes || "").trim(),
        created_by_name: user?.name || "",
      });
      if (error) throw error;
      toast.success("Appartement créé.");
      setShowApartmentModal(false);
      setApartmentForm(emptyApartmentForm());
      await loadAll();
    } catch (err) {
      logger.error("Save apartment:", err);
      toast.error(err.message || "Impossible de créer l’appartement.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteApartment = async (apartment) => {
    if (!supabase) return;
    const assigned = occupancyByApartment.get(apartment.id) || [];
    const ok = window.confirm(
      assigned.length
        ? `Supprimer « ${apartment.name} » ? Les ${assigned.length} stagiaire(s) seront désassignés.`
        : `Supprimer « ${apartment.name} » ?`
    );
    if (!ok) return;
    try {
      const { error } = await supabase.from("intern_apartments").delete().eq("id", apartment.id);
      if (error) throw error;
      toast.success("Appartement supprimé.");
      await loadAll();
    } catch (err) {
      logger.error("Delete apartment:", err);
      toast.error("Suppression impossible.");
    }
  };

  const assignIntern = async (internId, apartmentId) => {
    if (!supabase) return;
    try {
      const { error } = await supabase
        .from("interns")
        .update({
          apartment_id: apartmentId === "" || apartmentId == null ? null : Number(apartmentId),
          updated_at: new Date().toISOString(),
        })
        .eq("id", internId);
      if (error) throw error;
      toast.success("Attribution mise à jour.");
      await loadAll();
    } catch (err) {
      logger.error("Assign intern:", err);
      toast.error("Impossible d’attribuer l’appartement.");
    }
  };

  const shiftMonth = (delta) => {
    const [y, m] = planningMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setPlanningMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  if (!canAccess) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        Accès réservé à Ewen et Karim.
      </div>
    );
  }

  if (loading) {
    return <div className="py-10 text-center text-sm text-slate-500">Chargement…</div>;
  }

  const monthLabel = planningRange.start.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <PrimaryBtn type="button" onClick={openCreateIntern}>
          + Ajouter une personne
        </PrimaryBtn>
        <GhostBtn type="button" onClick={() => setShowApartmentModal(true)}>
          + Créer un appartement
        </GhostBtn>
        <GhostBtn type="button" onClick={loadAll}>
          Actualiser
        </GhostBtn>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stagiaires</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{interns.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Présents aujourd’hui</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{presentNow.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Appartements</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{apartments.length}</p>
        </div>
      </div>

      {/* Planning */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Planning des venues</h3>
            <p className="text-xs text-slate-500">Qui est là, mois par mois</p>
          </div>
          <div className="flex items-center gap-2">
            <GhostBtn type="button" onClick={() => shiftMonth(-1)}>
              ←
            </GhostBtn>
            <span className="min-w-[9rem] text-center text-sm font-semibold capitalize text-slate-800">
              {monthLabel}
            </span>
            <GhostBtn type="button" onClick={() => shiftMonth(1)}>
              →
            </GhostBtn>
          </div>
        </div>

        {planningRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Aucun stage sur ce mois.</p>
        ) : (
          <div className="space-y-2">
            <div
              className="mb-1 grid gap-2 text-[10px] font-medium uppercase tracking-wide text-slate-400"
              style={{ gridTemplateColumns: "10rem 1fr" }}
            >
              <span>Stagiaire</span>
              <div className="relative h-4">
                {[1, Math.ceil(planningRange.daysInMonth / 2), planningRange.daysInMonth].map((d) => (
                  <span
                    key={d}
                    className="absolute -translate-x-1/2"
                    style={{ left: `${((d - 0.5) / planningRange.daysInMonth) * 100}%` }}
                  >
                    {d}
                  </span>
                ))}
              </div>
            </div>
            {planningRows.map(({ intern, leftPct, widthPct }) => {
              const apt = intern.apartment_id != null ? apartmentsById.get(intern.apartment_id) : null;
              const isNow = intern.stage_start <= today && intern.stage_end >= today;
              return (
                <div
                  key={intern.id}
                  className="grid items-center gap-2"
                  style={{ gridTemplateColumns: "10rem 1fr" }}
                >
                  <button
                    type="button"
                    onClick={() => openEditIntern(intern)}
                    className="truncate text-left text-sm font-medium text-slate-800 hover:text-indigo-700"
                    title={fullName(intern)}
                  >
                    {fullName(intern)}
                  </button>
                  <div className="relative h-8 rounded-md bg-slate-100">
                    <div
                      className={`absolute top-1 bottom-1 rounded-md px-2 text-[11px] font-semibold leading-6 text-white ${
                        isNow ? "bg-emerald-600" : "bg-indigo-500"
                      }`}
                      style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 2)}%` }}
                      title={`${formatDateFr(intern.stage_start)} → ${formatDateFr(intern.stage_end)}${
                        apt ? ` · ${apt.name}` : ""
                      }`}
                    >
                      <span className="block truncate">
                        {daysBetween(intern.stage_start, intern.stage_end)} j
                        {apt ? ` · ${apt.name}` : ""}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Appartements */}
      <section className="space-y-3">
        <h3 className="text-base font-semibold text-slate-900">Appartements (colloc)</h3>
        {apartments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            Aucun appartement. Créez-en un pour y placer les stagiaires.
          </p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {apartments.map((apt) => {
              const assigned = occupancyByApartment.get(apt.id) || [];
              const full = assigned.length >= apt.capacity;
              return (
                <div key={apt.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-semibold text-slate-900">{apt.name}</h4>
                      {apt.address ? (
                        <p className="text-xs text-slate-500">{apt.address}</p>
                      ) : null}
                      <p className={`mt-1 text-xs font-medium ${full ? "text-amber-700" : "text-slate-600"}`}>
                        {assigned.length} / {apt.capacity} place{apt.capacity > 1 ? "s" : ""}
                      </p>
                    </div>
                    <GhostBtn type="button" onClick={() => handleDeleteApartment(apt)}>
                      Supprimer
                    </GhostBtn>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {assigned.length === 0 ? (
                      <li className="text-xs text-slate-400">Aucun stagiaire assigné</li>
                    ) : (
                      assigned.map((intern) => (
                        <li
                          key={intern.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                        >
                          <span>
                            <button
                              type="button"
                              className="font-medium text-slate-800 hover:text-indigo-700"
                              onClick={() => openEditIntern(intern)}
                            >
                              {fullName(intern)}
                            </button>
                            <span className="ml-2 text-xs text-slate-500">
                              {formatDateFr(intern.stage_start)} → {formatDateFr(intern.stage_end)}
                            </span>
                          </span>
                          <select
                            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                            value={String(intern.apartment_id ?? "")}
                            onChange={(e) => assignIntern(intern.id, e.target.value)}
                          >
                            <option value="">Non assigné</option>
                            {apartments.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                        </li>
                      ))
                    )}
                  </ul>
                  {unassigned.length > 0 && !full ? (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <p className="mb-1 text-xs font-medium text-slate-500">Assigner un stagiaire</p>
                      <select
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
                        defaultValue=""
                        onChange={(e) => {
                          if (!e.target.value) return;
                          assignIntern(Number(e.target.value), apt.id);
                          e.target.value = "";
                        }}
                      >
                        <option value="">Choisir…</option>
                        {unassigned.map((intern) => (
                          <option key={intern.id} value={intern.id}>
                            {fullName(intern)}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Liste stagiaires */}
      <section className="space-y-3">
        <h3 className="text-base font-semibold text-slate-900">Tous les stagiaires</h3>
        {interns.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            Aucun stagiaire pour le moment.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2.5 font-semibold">Nom</th>
                  <th className="px-3 py-2.5 font-semibold">Âge</th>
                  <th className="px-3 py-2.5 font-semibold">Stage</th>
                  <th className="px-3 py-2.5 font-semibold">Appartement</th>
                  <th className="px-3 py-2.5 font-semibold">CV</th>
                  <th className="px-3 py-2.5 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {interns.map((intern) => {
                  const apt = intern.apartment_id != null ? apartmentsById.get(intern.apartment_id) : null;
                  return (
                    <tr key={intern.id} className="border-t border-slate-100">
                      <td className="px-3 py-2.5 font-medium text-slate-900">{fullName(intern)}</td>
                      <td className="px-3 py-2.5 text-slate-600">{intern.age ?? "—"}</td>
                      <td className="px-3 py-2.5 text-slate-600">
                        {formatDateFr(intern.stage_start)} → {formatDateFr(intern.stage_end)}
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          className="max-w-[12rem] rounded-md border border-slate-200 bg-white px-2 py-1 text-xs"
                          value={String(intern.apartment_id ?? "")}
                          onChange={(e) => assignIntern(intern.id, e.target.value)}
                        >
                          <option value="">Non assigné</option>
                          {apartments.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                        {apt ? null : (
                          <span className="ml-1 text-[10px] text-slate-400">{/* spacer */}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {intern.cv_url ? (
                          <a
                            href={intern.cv_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-indigo-600 hover:underline"
                          >
                            {intern.cv_file_name || "Voir CV"}
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          <GhostBtn type="button" onClick={() => openEditIntern(intern)}>
                            Modifier
                          </GhostBtn>
                          <GhostBtn type="button" onClick={() => handleDeleteIntern(intern)}>
                            Supprimer
                          </GhostBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal stagiaire */}
      {showInternModal ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-3">
          <form
            onSubmit={handleSaveIntern}
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <h3 className="text-lg font-semibold text-slate-900">
              {editingIntern ? "Modifier le stagiaire" : "Ajouter une personne"}
            </h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-slate-600">
                Prénom *
                <TextInput
                  className="mt-1"
                  value={internForm.first_name}
                  onChange={(e) => setInternForm((f) => ({ ...f, first_name: e.target.value }))}
                  required
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Nom *
                <TextInput
                  className="mt-1"
                  value={internForm.last_name}
                  onChange={(e) => setInternForm((f) => ({ ...f, last_name: e.target.value }))}
                  required
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Âge
                <NumberInput
                  className="mt-1"
                  min={14}
                  max={80}
                  value={internForm.age}
                  onChange={(e) => setInternForm((f) => ({ ...f, age: e.target.value }))}
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Appartement
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={internForm.apartment_id}
                  onChange={(e) => setInternForm((f) => ({ ...f, apartment_id: e.target.value }))}
                >
                  <option value="">Non assigné</option>
                  {apartments.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Début de stage *
                <TextInput
                  type="date"
                  className="mt-1"
                  value={internForm.stage_start}
                  onChange={(e) => setInternForm((f) => ({ ...f, stage_start: e.target.value }))}
                  required
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Fin de stage *
                <TextInput
                  type="date"
                  className="mt-1"
                  value={internForm.stage_end}
                  onChange={(e) => setInternForm((f) => ({ ...f, stage_end: e.target.value }))}
                  required
                />
              </label>
            </div>
            <label className="mt-3 block text-xs font-medium text-slate-600">
              CV (PDF / Word)
              <input
                type="file"
                accept=".pdf,.doc,.docx,application/pdf"
                className="mt-1 block w-full text-sm"
                onChange={(e) =>
                  setInternForm((f) => ({ ...f, cvFile: e.target.files?.[0] || null }))
                }
              />
              {editingIntern?.cv_url && !internForm.cvFile ? (
                <a
                  href={editingIntern.cv_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-xs text-indigo-600 hover:underline"
                >
                  CV actuel : {editingIntern.cv_file_name || "ouvrir"}
                </a>
              ) : null}
            </label>
            <label className="mt-3 block text-xs font-medium text-slate-600">
              Notes
              <textarea
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                rows={3}
                value={internForm.notes}
                onChange={(e) => setInternForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <GhostBtn
                type="button"
                disabled={saving}
                onClick={() => {
                  setShowInternModal(false);
                  setEditingIntern(null);
                }}
              >
                Annuler
              </GhostBtn>
              <PrimaryBtn type="submit" disabled={saving}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </PrimaryBtn>
            </div>
          </form>
        </div>
      ) : null}

      {/* Modal appartement */}
      {showApartmentModal ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-3">
          <form
            onSubmit={handleSaveApartment}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <h3 className="text-lg font-semibold text-slate-900">Créer un appartement</h3>
            <label className="mt-4 block text-xs font-medium text-slate-600">
              Nom *
              <TextInput
                className="mt-1"
                placeholder="Ex. Appart Kawther A"
                value={apartmentForm.name}
                onChange={(e) => setApartmentForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </label>
            <label className="mt-3 block text-xs font-medium text-slate-600">
              Adresse
              <TextInput
                className="mt-1"
                value={apartmentForm.address}
                onChange={(e) => setApartmentForm((f) => ({ ...f, address: e.target.value }))}
              />
            </label>
            <label className="mt-3 block text-xs font-medium text-slate-600">
              Capacité (places)
              <NumberInput
                className="mt-1"
                min={1}
                max={20}
                value={apartmentForm.capacity}
                onChange={(e) => setApartmentForm((f) => ({ ...f, capacity: e.target.value }))}
              />
            </label>
            <label className="mt-3 block text-xs font-medium text-slate-600">
              Notes
              <textarea
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                rows={2}
                value={apartmentForm.notes}
                onChange={(e) => setApartmentForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <GhostBtn type="button" disabled={saving} onClick={() => setShowApartmentModal(false)}>
                Annuler
              </GhostBtn>
              <PrimaryBtn type="submit" disabled={saving}>
                {saving ? "Création…" : "Créer"}
              </PrimaryBtn>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
