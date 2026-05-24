import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import { SITE_KEY } from "../constants";
import { logger } from "../utils/logger";
import { toast } from "../utils/toast.js";
import { useDebounce } from "../hooks/useDebounce";
import { GhostBtn, PrimaryBtn, TextInput } from "../components/ui";
import { printHotelRequest } from "../utils/hotelRequestPrint";

const SELECT_COLUMNS =
  "id, first_name, last_name, client_phone, client_email, hotel_option_1, hotel_option_2, hotel_option_3, budget, notes, created_at, updated_at";

function digitsOnly(s) {
  return String(s ?? "").replace(/\D/g, "");
}

export function rowToHotelRequestViewModel(row) {
  return {
    id: String(row.id),
    supabaseId: row.id,
    firstName: row.first_name || "",
    lastName: row.last_name || "",
    phone: row.client_phone || "",
    email: row.client_email || "",
    hotelOption1: row.hotel_option_1 || "",
    hotelOption2: row.hotel_option_2 || "",
    hotelOption3: row.hotel_option_3 || "",
    budget: row.budget || "",
    notes: row.notes || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

function viewModelToPayload(vm) {
  return {
    first_name: vm.firstName.trim(),
    last_name: vm.lastName.trim(),
    client_phone: vm.phone.trim(),
    client_email: vm.email.trim(),
    hotel_option_1: vm.hotelOption1.trim(),
    hotel_option_2: vm.hotelOption2.trim(),
    hotel_option_3: vm.hotelOption3.trim(),
    budget: vm.budget.trim(),
    notes: vm.notes.trim(),
    updated_at: new Date().toISOString(),
  };
}

function HotelRequestCard({ request, onPrint, onEdit }) {
  const fullName = [request.firstName, request.lastName].filter(Boolean).join(" ").trim() || "Client";
  const hotels = [
    { label: "Choix 1", value: request.hotelOption1 },
    { label: "Choix 2", value: request.hotelOption2 },
    { label: "Choix 3", value: request.hotelOption3 },
  ].filter((h) => String(h.value || "").trim());

  return (
    <article className="overflow-hidden rounded-2xl border-2 border-indigo-200/90 bg-gradient-to-b from-white via-white to-slate-50/90 shadow-[0_12px_40px_-18px_rgba(30,27,75,0.22)] ring-1 ring-slate-200/80">
      <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50/90 to-violet-50/50 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-indigo-600">
              Demande hôtel
            </p>
            <h3 className="mt-1 text-lg font-bold tracking-tight text-slate-950 sm:text-xl">{fullName}</h3>
            <p className="mt-1 text-xs font-medium text-slate-600">
              {request.createdAt
                ? new Date(request.createdAt).toLocaleString("fr-FR")
                : "—"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <GhostBtn type="button" onClick={() => onPrint(request)}>
              Imprimer
            </GhostBtn>
            <PrimaryBtn type="button" className="!min-h-0 !min-w-0 !text-sm !px-4 !py-2" onClick={() => onEdit(request)}>
              Modifier
            </PrimaryBtn>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-200/90 bg-slate-50/95 px-4 py-4 sm:px-6">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Coordonnées</p>
        <div className="grid gap-3 text-sm text-slate-800 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm">
            <span className="text-[11px] font-bold uppercase text-slate-500">Téléphone</span>
            <p className="mt-0.5 font-semibold text-slate-950">{request.phone || "—"}</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm">
            <span className="text-[11px] font-bold uppercase text-slate-500">E-mail</span>
            <p className="mt-0.5 break-all font-semibold text-slate-950">{request.email || "—"}</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-sm">
            <span className="text-[11px] font-bold uppercase text-slate-500">Budget</span>
            <p className="mt-0.5 font-semibold text-slate-950">{request.budget?.trim() ? request.budget : "—"}</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 sm:px-6">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-slate-500">Hôtels souhaités</p>
        {hotels.length === 0 ? (
          <p className="text-sm text-slate-600">—</p>
        ) : (
          <ul className="space-y-2">
            {hotels.map((h) => (
              <li
                key={h.label}
                className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 shadow-sm"
              >
                <span className="text-[11px] font-bold uppercase text-indigo-700">{h.label}</span>
                <p className="mt-0.5">{h.value}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-200/90 bg-white px-4 py-4 sm:px-6">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Notes</p>
        <p className="mt-1 text-sm font-medium leading-relaxed text-slate-800 whitespace-pre-wrap">
          {request.notes?.trim() ? request.notes : "—"}
        </p>
      </div>
    </article>
  );
}

function EditHotelRequestModal({ draft, setDraft, onClose, onSave, saving }) {
  if (!draft) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-hotel-request-title"
    >
      <div className="my-8 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h2 id="edit-hotel-request-title" className="text-lg font-bold text-slate-900">
          Modifier la demande
        </h2>
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-slate-600">
              Prénom
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={draft.firstName}
                onChange={(e) => setDraft((d) => ({ ...d, firstName: e.target.value }))}
              />
            </label>
            <label className="block text-xs font-bold text-slate-600">
              Nom
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={draft.lastName}
                onChange={(e) => setDraft((d) => ({ ...d, lastName: e.target.value }))}
              />
            </label>
          </div>
          <label className="block text-xs font-bold text-slate-600">
            Téléphone
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={draft.phone}
              onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
            />
          </label>
          <label className="block text-xs font-bold text-slate-600">
            E-mail
            <input
              type="email"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={draft.email}
              onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
            />
          </label>
          {[1, 2, 3].map((n) => (
            <label key={n} className="block text-xs font-bold text-slate-600">
              Hôtel — choix {n}
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={draft[`hotelOption${n}`]}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [`hotelOption${n}`]: e.target.value }))
                }
              />
            </label>
          ))}
          <label className="block text-xs font-bold text-slate-600">
            Budget
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={draft.budget}
              onChange={(e) => setDraft((d) => ({ ...d, budget: e.target.value }))}
            />
          </label>
          <label className="block text-xs font-bold text-slate-600">
            Notes
            <textarea
              rows={3}
              className="mt-1 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            />
          </label>
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <GhostBtn type="button" onClick={onClose} disabled={saving}>
            Annuler
          </GhostBtn>
          <PrimaryBtn type="button" onClick={onSave} disabled={saving}>
            {saving ? "Enregistrement…" : "Enregistrer"}
          </PrimaryBtn>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function HotelHistoryPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [editDraft, setEditDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      setError("Supabase non configuré.");
      return;
    }
    setError("");
    try {
      const { data, error: loadError } = await supabase
        .from("public_hotel_requests")
        .select(SELECT_COLUMNS)
        .eq("site_key", SITE_KEY)
        .order("created_at", { ascending: false })
        .limit(500);

      if (loadError) {
        logger.error("HotelHistoryPage load:", loadError);
        if (loadError.code === "42P01" || loadError.message?.includes("public_hotel_requests")) {
          setError(
            "Table public_hotel_requests absente. Exécutez supabase/supabase_public_hotel_requests_table.sql sur Supabase."
          );
        } else {
          setError(loadError.message || "Impossible de charger les demandes.");
        }
        setRows([]);
        return;
      }
      setRows((data || []).map(rowToHotelRequestViewModel));
    } catch (e) {
      logger.error("HotelHistoryPage load:", e);
      setError("Erreur inattendue au chargement.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!supabase) return undefined;

    const channel = supabase
      .channel("public-hotel-requests-intranet")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "public_hotel_requests",
          filter: `site_key=eq.${SITE_KEY}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const filteredRows = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return rows;
    const qDigits = digitsOnly(q);
    return rows.filter((r) => {
      const name = [r.firstName, r.lastName].join(" ").toLowerCase();
      const email = (r.email || "").toLowerCase();
      const phone = digitsOnly(r.phone);
      const hotels = [r.hotelOption1, r.hotelOption2, r.hotelOption3]
        .join(" ")
        .toLowerCase();
      if (name.includes(q) || email.includes(q) || hotels.includes(q)) return true;
      if (qDigits && phone.includes(qDigits)) return true;
      return false;
    });
  }, [rows, debouncedSearch]);

  const handlePrint = useCallback((request) => {
    const ok = printHotelRequest(request);
    if (!ok) toast.error("Autorisez les fenêtres popup pour imprimer.");
  }, []);

  const handleEdit = useCallback((request) => {
    setEditDraft({ ...request });
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editDraft || !supabase) return;
    if (!editDraft.firstName.trim() || !editDraft.lastName.trim()) {
      toast.error("Le prénom et le nom sont obligatoires.");
      return;
    }
    setSaving(true);
    try {
      const payload = viewModelToPayload(editDraft);
      const { error: updateError } = await supabase
        .from("public_hotel_requests")
        .update(payload)
        .eq("id", editDraft.supabaseId)
        .eq("site_key", SITE_KEY);

      if (updateError) {
        logger.error("HotelHistoryPage update:", updateError);
        toast.error(updateError.message || "Échec de l'enregistrement.");
        return;
      }
      toast.success("Demande mise à jour.");
      setEditDraft(null);
      await load();
    } catch (e) {
      logger.error("HotelHistoryPage save:", e);
      toast.error("Erreur inattendue.");
    } finally {
      setSaving(false);
    }
  }, [editDraft, load]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-600">
        Chargement des demandes hôtel…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm font-semibold text-red-900">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3 text-xs font-medium text-slate-700">
        Demandes reçues via le formulaire public{" "}
        <strong className="text-indigo-800">/demande-hotel</strong>. Les données proviennent de
        Supabase et se mettent à jour en temps réel.
      </p>

      <div className="rounded-2xl border border-indigo-200/80 bg-indigo-50/40 px-4 py-3 shadow-sm sm:px-5 sm:py-4">
        <label htmlFor="hotel-history-search" className="block text-xs font-bold uppercase tracking-wide text-indigo-950">
          Rechercher
        </label>
        <TextInput
          id="hotel-history-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nom, e-mail, téléphone ou hôtel"
          className="mt-2"
        />
        <p className="mt-2 text-[11px] font-medium text-indigo-900/80">
          {filteredRows.length} demande{filteredRows.length > 1 ? "s" : ""}
          {debouncedSearch.trim() ? " (filtrées)" : ""}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-700">
          Aucune demande hôtel pour le moment.
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-950">
          Aucune demande ne correspond à la recherche.
        </div>
      ) : (
        <div className="space-y-8">
          {filteredRows.map((request) => (
            <HotelRequestCard
              key={request.id}
              request={request}
              onPrint={handlePrint}
              onEdit={handleEdit}
            />
          ))}
        </div>
      )}

      <EditHotelRequestModal
        draft={editDraft}
        setDraft={setEditDraft}
        onClose={() => !saving && setEditDraft(null)}
        onSave={handleSaveEdit}
        saving={saving}
      />
    </div>
  );
}
