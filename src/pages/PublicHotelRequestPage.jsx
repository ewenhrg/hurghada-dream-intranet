import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { PublicAppShell } from "../components/public/PublicAppShell";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import { SITE_KEY } from "../constants";
import { logger } from "../utils/logger";
import { toast } from "../utils/toast.js";
import { formatPhoneWithPlus } from "../utils";
import { boardFieldsToPayload } from "../constants/hotelRequestBoardOptions";

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
  notes: "",
};

const inputClass = "hdc-input mt-1.5 disabled:cursor-not-allowed disabled:opacity-50";

function FormSection({ step, title, description, children }) {
  return (
    <section data-reveal="item" className="hdc-card p-5 sm:p-6">
      <div className="mb-5 flex gap-4">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-catalog-raised font-catalog-display text-base text-catalog-sand"
          aria-hidden
        >
          {step}
        </span>
        <div className="min-w-0 pt-0.5">
          <h2 className="font-catalog-display text-[1.375rem] font-medium leading-tight text-catalog-ink">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-relaxed text-catalog-muted">{description}</p>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function FieldLabel({ children, required, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-bold text-catalog-ink">
      {children}
      {required ? <span className="ml-0.5 text-catalog-coral">*</span> : null}
    </label>
  );
}

export function PublicHotelRequestPage() {
  const [searchParams] = useSearchParams();
  const wantsProposition = useMemo(() => {
    const raw = String(searchParams.get("proposition") || searchParams.get("offre") || "")
      .trim()
      .toLowerCase();
    return raw === "1" || raw === "true" || raw === "oui" || raw === "yes";
  }, [searchParams]);

  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    wantsCustomOffer: wantsProposition,
  }));
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

    if (!form.budget.trim()) {
      toast.error("Veuillez indiquer votre budget maximum pour le séjour.");
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
        client_phone: formatPhoneWithPlus(form.phone),
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
      <PublicAppShell title="Demande hôtel" revealKey="sent">
        <div data-reveal="item" className="mx-auto max-w-md px-4 py-14 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-catalog-lagoonSoft text-catalog-lagoon">
            <CheckCircle2 className="h-8 w-8" aria-hidden />
          </div>
          <h1 className="mt-6 font-catalog-display text-[1.75rem] text-catalog-ink">Demande envoyée</h1>
          <p className="mt-3 text-sm leading-relaxed text-catalog-muted">
            Merci ! L&apos;équipe Hurghada Dream a bien reçu votre demande d&apos;hébergement et vous
            recontactera rapidement.
          </p>
          <button
            type="button"
            data-press
            className="hdc-btn hdc-btn-ink mt-8"
            onClick={() => setSubmitted(false)}
          >
            Nouvelle demande
          </button>
        </div>
      </PublicAppShell>
    );
  }

  return (
    <PublicAppShell title="Demande hôtel" wide revealKey="form">
      <div className="mx-auto max-w-3xl px-4 pb-14 pt-7 sm:pt-12">
        <p data-reveal="item" className="hdc-eyebrow">Hébergement sur mesure</p>
        <h1 data-split className="mt-2 font-catalog-display text-[2rem] leading-[1.1] text-catalog-ink">
          Trouvons votre hôtel
          <span className="hdc-serif text-catalog-lagoon"> à Hurghada.</span>
        </h1>
        <p data-reveal="item" className="mb-7 mt-4 text-sm leading-relaxed text-catalog-muted">
          Trouvez l&apos;hôtel idéal pour votre séjour à Hurghada. Les champs marqués d&apos;un{" "}
          <span className="font-semibold text-catalog-coral">*</span> sont obligatoires.
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
                  value={formatPhoneWithPlus(form.phone)}
                  onChange={(e) => updateField("phone", formatPhoneWithPlus(e.target.value))}
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
            <label className="flex min-h-[3.5rem] cursor-pointer items-center gap-3 rounded-2xl bg-catalog-brassSoft px-4 py-3.5 transition-colors">
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
                className="h-5 w-5 shrink-0 rounded accent-catalog-coral"
              />
              <span className="text-sm font-bold leading-snug text-catalog-ink">
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

            <div className="mt-5 border-t border-catalog-line pt-5">
              <FieldLabel htmlFor="hd-budget" required>
                Budget maximum
              </FieldLabel>
              <input
                id="hd-budget"
                type="text"
                required
                value={form.budget}
                onChange={(e) => updateField("budget", e.target.value)}
                placeholder="Ex. 1 500 € maximum pour le séjour"
                className={inputClass}
                aria-required="true"
              />
              <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-catalog-lagoonSoft px-3.5 py-2 text-sm font-bold text-catalog-lagoon">
                Formule : All inclusive
              </p>
            </div>
          </FormSection>

          <FormSection step="4" title="Notes" description="Dates flexibles, type de chambre, enfants…">
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
            data-press
            className="hdc-btn hdc-btn-primary w-full min-h-[3.5rem] text-base"
          >
            {submitting ? "Envoi en cours…" : "Envoyer ma demande"}
            {!submitting ? <ArrowRight className="h-4 w-4" aria-hidden /> : null}
          </button>

          <p className="pb-6 text-center text-xs font-medium text-catalog-muted">
            Vos informations sont transmises de façon sécurisée à Hurghada Dream.
          </p>
        </form>
      </div>
    </PublicAppShell>
  );
}
