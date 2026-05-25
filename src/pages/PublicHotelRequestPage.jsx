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
  arrivalDate: "",
  departureDate: "",
  adultsCount: "2",
  childrenCount: "0",
  childAges: "",
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

const inputClass =
  "mt-1.5 w-full rounded-xl border-2 border-indigo-200/80 bg-white px-3.5 py-2.5 text-[15px] text-indigo-950 shadow-sm placeholder:text-indigo-300 transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-400/40 disabled:cursor-not-allowed disabled:border-indigo-100 disabled:bg-indigo-50/50 disabled:text-indigo-400";

function FormSection({ step, title, description, children }) {
  return (
    <section className="rounded-2xl border-2 border-white/40 bg-white/95 p-5 shadow-xl shadow-indigo-950/20 ring-1 ring-indigo-200/60 backdrop-blur-sm sm:p-6">
      <div className="mb-5 flex gap-4">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 via-violet-600 to-orange-500 text-sm font-bold text-white shadow-lg shadow-violet-600/40"
          aria-hidden
        >
          {step}
        </span>
        <div className="min-w-0 pt-0.5">
          <h2 className="text-base font-bold tracking-tight text-indigo-950">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-relaxed text-violet-800/85">{description}</p>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function FieldLabel({ children, required, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-semibold text-indigo-900">
      {children}
      {required ? <span className="ml-0.5 text-orange-500">*</span> : null}
    </label>
  );
}

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
    if (!form.arrivalDate) {
      toast.error("Veuillez indiquer votre date d'arrivée.");
      return;
    }
    if (!form.departureDate) {
      toast.error("Veuillez indiquer votre date de départ.");
      return;
    }
    if (form.departureDate < form.arrivalDate) {
      toast.error("La date de départ doit être après la date d'arrivée.");
      return;
    }

    const adults = parseInt(String(form.adultsCount).trim(), 10);
    if (!Number.isFinite(adults) || adults < 1) {
      toast.error("Indiquez le nombre d'adultes (au moins 1).");
      return;
    }

    const children = parseInt(String(form.childrenCount).trim(), 10);
    if (!Number.isFinite(children) || children < 0) {
      toast.error("Indiquez le nombre d'enfants (0 si aucun).");
      return;
    }
    if (children > 0 && !form.childAges.trim()) {
      toast.error("Indiquez l'âge de chaque enfant.");
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
        arrival_date: form.arrivalDate,
        departure_date: form.departureDate,
        adults_count: adults,
        children_count: children,
        child_ages: form.childAges.trim(),
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
          error.message?.includes("board_") ||
          error.message?.includes("arrival_date") ||
          error.message?.includes("departure_date") ||
          error.message?.includes("adults_count") ||
          error.message?.includes("child_ages") ||
          error.message?.includes("children_count")
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
      <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-violet-900 to-indigo-900 px-4 py-16">
        <div className="mx-auto max-w-md rounded-3xl border border-white/20 bg-white/10 p-8 text-center shadow-2xl backdrop-blur-md">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-3xl text-white shadow-lg">
            ✓
          </div>
          <h1 className="mt-6 text-2xl font-bold text-white">Demande envoyée</h1>
          <p className="mt-3 text-sm leading-relaxed text-violet-100">
            Merci ! L&apos;équipe Hurghada Dream a bien reçu votre demande d&apos;hébergement et vous
            recontactera rapidement.
          </p>
          <button
            type="button"
            className="mt-8 rounded-xl bg-white px-6 py-3 text-sm font-bold text-indigo-900 shadow-lg transition hover:bg-violet-50"
            onClick={() => setSubmitted(false)}
          >
            Nouvelle demande
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-violet-900 to-indigo-900">
      <header className="border-b border-white/10 bg-gradient-to-r from-indigo-900/90 via-violet-800/90 to-indigo-900/90 px-4 py-8 text-center shadow-lg">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.28em] text-violet-200">
          Hurghada Dream
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Demande d&apos;hébergement
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm font-medium text-violet-100/95">
          Trouvez l&apos;hôtel idéal pour votre séjour à Hurghada.
        </p>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
        <p className="mb-8 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-center text-sm leading-relaxed text-violet-50 backdrop-blur-sm">
          Complétez ce formulaire en quelques minutes. Les champs marqués d&apos;un{" "}
          <span className="font-bold text-orange-300">*</span> sont obligatoires.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <FormSection
            step="1"
            title="Vos coordonnées"
            description="Pour que nous puissions vous répondre."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="hd-first-name" required>
                  Prénom
                </FieldLabel>
                <input
                  id="hd-first-name"
                  type="text"
                  autoComplete="given-name"
                  value={form.firstName}
                  onChange={(e) => updateField("firstName", e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <FieldLabel htmlFor="hd-last-name" required>
                  Nom
                </FieldLabel>
                <input
                  id="hd-last-name"
                  type="text"
                  autoComplete="family-name"
                  value={form.lastName}
                  onChange={(e) => updateField("lastName", e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <FieldLabel htmlFor="hd-phone" required>
                  Téléphone
                </FieldLabel>
                <input
                  id="hd-phone"
                  type="tel"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <FieldLabel htmlFor="hd-email" required>
                  E-mail
                </FieldLabel>
                <input
                  id="hd-email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(e) => updateField("email", e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
            </div>
          </FormSection>

          <FormSection
            step="2"
            title="Dates & voyageurs"
            description="Dates du séjour et composition du groupe."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="hd-arrival" required>
                  Date d&apos;arrivée
                </FieldLabel>
                <input
                  id="hd-arrival"
                  type="date"
                  value={form.arrivalDate}
                  onChange={(e) => updateField("arrivalDate", e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <FieldLabel htmlFor="hd-departure" required>
                  Date de départ
                </FieldLabel>
                <input
                  id="hd-departure"
                  type="date"
                  value={form.departureDate}
                  min={form.arrivalDate || undefined}
                  onChange={(e) => updateField("departureDate", e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <FieldLabel htmlFor="hd-adults" required>
                  Nombre d&apos;adultes
                </FieldLabel>
                <input
                  id="hd-adults"
                  type="number"
                  min={1}
                  max={99}
                  inputMode="numeric"
                  value={form.adultsCount}
                  onChange={(e) => updateField("adultsCount", e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <FieldLabel htmlFor="hd-children">Nombre d&apos;enfants</FieldLabel>
                <input
                  id="hd-children"
                  type="number"
                  min={0}
                  max={20}
                  inputMode="numeric"
                  value={form.childrenCount}
                  onChange={(e) => updateField("childrenCount", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <FieldLabel
                  htmlFor="hd-child-ages"
                  required={parseInt(String(form.childrenCount).trim(), 10) > 0}
                >
                  Âge(s) des enfants
                </FieldLabel>
                <input
                  id="hd-child-ages"
                  type="text"
                  value={form.childAges}
                  onChange={(e) => updateField("childAges", e.target.value)}
                  placeholder="Ex. 5 ans et 8 ans (obligatoire si enfants > 0)"
                  className={inputClass}
                  disabled={!parseInt(String(form.childrenCount).trim(), 10)}
                />
              </div>
            </div>
          </FormSection>

          <FormSection
            step="3"
            title="Hôtels & budget"
            description="Jusqu'à trois hôtels qui vous intéressent, ou demandez une proposition sur mesure."
          >
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-amber-300/90 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3.5 shadow-sm transition hover:border-amber-400 hover:shadow-md">
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
              className={`mt-4 grid gap-3 sm:grid-cols-1 ${form.wantsCustomOffer ? "pointer-events-none opacity-40" : ""}`}
              aria-disabled={form.wantsCustomOffer}
            >
              {[1, 2, 3].map((n) => (
                <div key={n}>
                  <FieldLabel htmlFor={`hd-hotel-${n}`}>Hôtel — choix {n}</FieldLabel>
                  <input
                    id={`hd-hotel-${n}`}
                    type="text"
                    disabled={form.wantsCustomOffer}
                    value={form[`hotelOption${n}`]}
                    onChange={(e) => updateField(`hotelOption${n}`, e.target.value)}
                    placeholder="Nom de l'hôtel"
                    className={inputClass}
                  />
                </div>
              ))}
            </div>

            <div className="mt-5 border-t border-indigo-100 pt-5">
              <FieldLabel htmlFor="hd-budget">Budget estimé</FieldLabel>
              <input
                id="hd-budget"
                type="text"
                value={form.budget}
                onChange={(e) => updateField("budget", e.target.value)}
                placeholder="Ex. 1 500 € pour le séjour"
                className={inputClass}
              />
            </div>
          </FormSection>

          <FormSection
            step="4"
            title="Formule souhaitée"
            description="Facultatif — vous pouvez en sélectionner plusieurs."
          >
            <div className="grid gap-2 sm:grid-cols-1">
              {HOTEL_BOARD_OPTIONS.map((opt) => {
                const checked = Boolean(form[opt.formKey]);
                return (
                  <label
                    key={opt.formKey}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 transition ${
                      checked
                        ? "border-violet-500 bg-gradient-to-r from-indigo-50 to-violet-100 ring-2 ring-violet-400/40 shadow-sm"
                        : "border-indigo-200/70 bg-indigo-50/40 hover:border-violet-400 hover:bg-violet-50/60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => updateField(opt.formKey, e.target.checked)}
                      className="h-4 w-4 shrink-0 rounded border-violet-300 text-violet-600 focus:ring-violet-500"
                    />
                    <span className="text-sm font-semibold text-indigo-950">{opt.label}</span>
                  </label>
                );
              })}
            </div>
          </FormSection>

          <FormSection step="5" title="Notes" description="Dates flexibles, type de chambre, enfants…">
            <textarea
              id="hd-notes"
              rows={4}
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              placeholder="Précisions utiles pour votre demande…"
              className={`${inputClass} resize-y`}
            />
          </FormSection>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-orange-500 py-4 text-base font-bold text-white shadow-xl shadow-violet-900/40 transition hover:from-indigo-700 hover:via-violet-700 hover:to-orange-600 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Envoi en cours…" : "Envoyer ma demande"}
          </button>

          <p className="pb-6 text-center text-xs font-medium text-violet-200/90">
            Vos informations sont transmises de façon sécurisée à Hurghada Dream.
          </p>
        </form>
      </div>
    </div>
  );
}
