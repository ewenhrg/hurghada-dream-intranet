import { useState } from "react";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import { SITE_KEY } from "../constants";
import { logger } from "../utils/logger";
import { toast } from "../utils/toast.js";
import { HOTEL_BOARD_OPTIONS, boardFieldsToPayload } from "../constants/hotelRequestBoardOptions";

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  wantsCustomOffer: false,
  hotelOption1: "",
  hotelOption2: "",
  hotelOption3: "",
  budget: "",
  boardAllInclusive: false,
  boardFullBoard: false,
  boardBreakfast: false,
  notes: "",
};

export function PublicHotelRequestPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!form.firstName.trim()) {
      toast.error("Veuillez indiquer votre prénom.");
      return;
    }
    if (!form.lastName.trim()) {
      toast.error("Veuillez indiquer votre nom.");
      return;
    }
    if (!form.phone.trim()) {
      toast.error("Veuillez indiquer votre numéro de téléphone.");
      return;
    }
    if (!form.email.trim()) {
      toast.error("Veuillez indiquer votre adresse e-mail.");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email.trim())) {
      toast.error("Veuillez saisir une adresse e-mail valide.");
      return;
    }

    const hasHotel =
      form.hotelOption1.trim() || form.hotelOption2.trim() || form.hotelOption3.trim();
    if (!form.wantsCustomOffer && !hasHotel) {
      toast.error(
        "Indiquez au moins un hôtel, ou cochez la case pour demander une offre personnalisée."
      );
      return;
    }

    if (!supabase || !__SUPABASE_DEBUG__.isConfigured) {
      toast.error("Service temporairement indisponible. Réessayez plus tard.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        site_key: SITE_KEY,
        first_name: form.firstName.trim(),
        last_name: form.lastName.trim(),
        client_phone: form.phone.trim(),
        client_email: form.email.trim(),
        hotel_option_1: form.wantsCustomOffer ? "" : form.hotelOption1.trim(),
        hotel_option_2: form.wantsCustomOffer ? "" : form.hotelOption2.trim(),
        hotel_option_3: form.wantsCustomOffer ? "" : form.hotelOption3.trim(),
        wants_custom_offer: form.wantsCustomOffer,
        budget: form.budget.trim(),
        ...boardFieldsToPayload(form),
        notes: form.notes.trim(),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("public_hotel_requests").insert(payload);

      if (error) {
        logger.error("PublicHotelRequestPage insert:", error);
        if (error.code === "42P01" || error.message?.includes("public_hotel_requests")) {
          toast.error(
            "La base de données n'est pas encore configurée. Contactez Hurghada Dream."
          );
        } else if (
          error.message?.includes("wants_custom_offer") ||
          error.message?.includes("board_")
        ) {
          toast.error(
            "Mise à jour base de données requise sur Supabase. Contactez Hurghada Dream."
          );
        } else {
          toast.error(error.message || "Impossible d'envoyer la demande.");
        }
        return;
      }

      setSubmitted(true);
      setForm(EMPTY_FORM);
    } catch (err) {
      logger.error("PublicHotelRequestPage submit:", err);
      toast.error("Erreur inattendue. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-violet-900 to-slate-900 px-4 py-12 text-white">
        <div className="mx-auto max-w-lg rounded-3xl border border-white/15 bg-white/10 p-8 text-center shadow-2xl backdrop-blur-md">
          <p className="text-4xl" aria-hidden>
            ✓
          </p>
          <h1 className="mt-4 text-2xl font-bold">Demande envoyée</h1>
          <p className="mt-3 text-sm font-medium text-violet-100/95">
            Merci ! Notre équipe a bien reçu votre demande. Nous vous recontacterons rapidement.
          </p>
          <button
            type="button"
            className="mt-8 rounded-xl bg-white px-6 py-3 text-sm font-bold text-indigo-900 shadow-lg transition hover:bg-violet-50"
            onClick={() => setSubmitted(false)}
          >
            Envoyer une autre demande
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-violet-900 to-slate-900 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <header className="mb-8 text-center text-white">
          <p className="text-xs font-extrabold uppercase tracking-[0.28em] text-violet-200/90">
            Hurghada Dream
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Demande d&apos;hébergement
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm font-medium text-violet-100/90">
            Indiquez vos coordonnées, vos hôtels préférés ou demandez une offre sur mesure.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-3xl border border-white/20 bg-white p-6 shadow-2xl sm:p-8"
        >
          <section>
            <h2 className="text-sm font-bold uppercase tracking-wide text-indigo-800">
              Vos coordonnées
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-700">
                Prénom <span className="text-red-500">*</span>
                <input
                  type="text"
                  autoComplete="given-name"
                  value={form.firstName}
                  onChange={(e) => updateField("firstName", e.target.value)}
                  className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  required
                />
              </label>
              <label className="block text-sm font-semibold text-slate-700">
                Nom <span className="text-red-500">*</span>
                <input
                  type="text"
                  autoComplete="family-name"
                  value={form.lastName}
                  onChange={(e) => updateField("lastName", e.target.value)}
                  className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  required
                />
              </label>
              <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">
                Téléphone <span className="text-red-500">*</span>
                <input
                  type="tel"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  required
                />
              </label>
              <label className="block text-sm font-semibold text-slate-700 sm:col-span-2">
                E-mail <span className="text-red-500">*</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  required
                />
              </label>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-bold uppercase tracking-wide text-indigo-800">
              Hôtels souhaités
            </h2>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Saisissez jusqu&apos;à trois hôtels, ou cochez la case ci-dessous si vous souhaitez une
              proposition de notre part.
            </p>

            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border-2 border-amber-200/90 bg-amber-50/90 px-4 py-3.5 transition hover:border-amber-300">
              <input
                type="checkbox"
                checked={form.wantsCustomOffer}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setForm((prev) => ({
                    ...prev,
                    wantsCustomOffer: checked,
                    ...(checked
                      ? { hotelOption1: "", hotelOption2: "", hotelOption3: "" }
                      : {}),
                  }));
                }}
                className="mt-1 h-4 w-4 shrink-0 rounded border-amber-400 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm font-semibold leading-snug text-amber-950">
                Je n&apos;ai pas de choix d&apos;hôtel — faites-moi une offre
              </span>
            </label>

            <div
              className={`mt-4 space-y-3 transition-opacity ${form.wantsCustomOffer ? "pointer-events-none opacity-45" : ""}`}
              aria-disabled={form.wantsCustomOffer}
            >
              {[1, 2, 3].map((n) => (
                <label key={n} className="block text-sm font-semibold text-slate-700">
                  Choix {n}
                  <input
                    type="text"
                    disabled={form.wantsCustomOffer}
                    value={form[`hotelOption${n}`]}
                    onChange={(e) => updateField(`hotelOption${n}`, e.target.value)}
                    placeholder={`Nom de l'hôtel — choix ${n}`}
                    className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:bg-slate-100"
                  />
                </label>
              ))}
            </div>
          </section>

          <section>
            <label className="block text-sm font-semibold text-slate-700">
              Budget
              <input
                type="text"
                value={form.budget}
                onChange={(e) => updateField("budget", e.target.value)}
                placeholder="Ex. 1500 € pour le séjour"
                className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </label>
          </section>

          <section>
            <h2 className="text-sm font-bold uppercase tracking-wide text-indigo-800">
              Formule souhaitée
            </h2>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Cochez une ou plusieurs options (facultatif).
            </p>
            <div className="mt-3 space-y-2">
              {HOTEL_BOARD_OPTIONS.map((opt) => (
                <label
                  key={opt.formKey}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-slate-200/90 bg-slate-50/80 px-4 py-3 transition hover:border-indigo-300 hover:bg-indigo-50/40"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(form[opt.formKey])}
                    onChange={(e) => updateField(opt.formKey, e.target.checked)}
                    className="h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm font-semibold text-slate-800">{opt.label}</span>
                </label>
              ))}
            </div>
          </section>

          <section>
            <label className="block text-sm font-semibold text-slate-700">
              Notes / précisions
              <textarea
                rows={4}
                value={form.notes}
                onChange={(e) => updateField("notes", e.target.value)}
                placeholder="Dates, type de chambre, préférences…"
                className="mt-1 w-full resize-y rounded-xl border-2 border-slate-200 px-3 py-2.5 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            </label>
          </section>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 transition hover:from-indigo-700 hover:to-violet-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Envoi en cours…" : "Envoyer ma demande"}
          </button>
        </form>
      </div>
    </div>
  );
}
