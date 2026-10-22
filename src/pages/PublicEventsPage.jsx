import { useRef, useState } from "react";
import { PublicAppShell } from "../components/public/PublicAppShell";
import { supabase } from "../lib/supabase";
import { SITE_KEY } from "../constants";

const OFFERS = [
  {
    title: "Demandes en mariage",
    text: "Une mise en scène romantique et exceptionnelle, sur la plage, dans le désert ou dans un lieu privatisé.",
  },
  {
    title: "Mariages & cérémonies",
    text: "Célébrez votre union dans un cadre idyllique avec une organisation adaptée à vos souhaits.",
  },
  {
    title: "Baby showers & Gender Reveals",
    text: "Des décorations personnalisées et une ambiance magique pour célébrer l’arrivée de votre bébé.",
  },
  {
    title: "Dîners romantiques",
    text: "Profitez d’un dîner privé aux chandelles, face à la mer ou dans un décor spécialement imaginé pour vous.",
  },
  {
    title: "Anniversaires & fêtes privées",
    text: "Surprenez vos proches avec une célébration entièrement personnalisée.",
  },
  {
    title: "Séminaires & événements professionnels",
    text: "Réunions d’entreprise, team building, soirées professionnelles et événements de groupe.",
  },
];

const EXTRAS = [
  "Photographe et/ou vidéaste professionnel",
  "Décoration personnalisée, fleurs et ballons",
  "Gâteau et prestations de restauration",
  "Musique, DJ et animations",
  "Transport privé",
  "Privatisation d’un espace ou d’un lieu exceptionnel",
];

const EMPTY_FORM = {
  lastName: "",
  firstName: "",
  phone: "",
  email: "",
  hotel: "",
  arrival: "",
  departure: "",
  message: "",
};

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-catalog-label">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "mt-1.5 h-12 w-full rounded-2xl border border-catalog-border bg-white px-4 text-base text-catalog-ink outline-none focus:border-catalog-lagoon";

export function PublicEventsPage() {
  const formRef = useRef(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const setField = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setError("");
  };

  const openForm = () => {
    setShowForm(true);
    window.setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  };

  const submit = async (event) => {
    event.preventDefault();
    const lastName = form.lastName.trim();
    const firstName = form.firstName.trim();
    const phone = form.phone.trim();
    const email = form.email.trim();
    const hotel = form.hotel.trim();
    const message = form.message.trim();
    if (!lastName || !firstName) {
      setError("Indiquez votre nom et votre prénom.");
      return;
    }
    if (phone.replace(/\D/g, "").length < 6) {
      setError("Indiquez un numéro de téléphone.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Indiquez une adresse email valide.");
      return;
    }
    if (!hotel) {
      setError("Indiquez votre hôtel.");
      return;
    }
    if (!form.arrival || !form.departure) {
      setError("Indiquez les dates de votre séjour.");
      return;
    }
    if (form.departure < form.arrival) {
      setError("La fin du séjour est après le début.");
      return;
    }
    if (message.length < 8) {
      setError("Décrivez la demande que vous souhaitez.");
      return;
    }
    if (!supabase) {
      setError("L’envoi est indisponible pour le moment. Réessayez dans un instant.");
      return;
    }
    setSending(true);
    setError("");
    const { error: insertError } = await supabase.from("public_event_requests").insert({
      site_key: SITE_KEY,
      last_name: lastName,
      first_name: firstName,
      phone,
      email,
      hotel,
      arrival_date: form.arrival,
      departure_date: form.departure,
      message,
      status: "pending",
    });
    setSending(false);
    if (insertError) {
      setError("La demande n’a pas pu être envoyée. Réessayez.");
      return;
    }
    setSent(true);
    setForm(EMPTY_FORM);
  };

  return (
    <PublicAppShell title="Événements" wide>
      <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
        <p data-reveal="item" className="hdc-eyebrow">Hurghada Dream</p>
        <h1 data-split className="mt-1.5 font-catalog-display text-[2rem] leading-[1.08] text-catalog-ink lg:text-5xl">
          Organisation d’événements à Hurghada
        </h1>
        <p data-reveal="item" className="mt-4 font-catalog-display text-xl leading-snug text-catalog-lagoon">
          Vos plus beaux moments méritent un cadre exceptionnel !
        </p>
        <div data-reveal="item" className="mt-4 space-y-4 text-[0.975rem] leading-relaxed text-catalog-body">
          <p>
            Vous rêvez d’un événement inoubliable sous le soleil d’Égypte ? Hurghada Dream vous accompagne dans
            l’organisation de vos événements privés et professionnels à Hurghada, avec des prestations personnalisées
            selon vos envies et votre budget.
          </p>
          <p>
            Que ce soit pour une surprise romantique, une célébration en famille ou un événement d’entreprise, notre
            équipe sur place s’occupe de l’organisation pour vous faire vivre une expérience unique.
          </p>
        </div>

        <section className="mt-8">
          <h2 data-heading className="font-catalog-display text-2xl text-catalog-ink">Nos événements sur mesure</h2>
          <ul className="mt-4 space-y-3">
            {OFFERS.map((offer) => (
              <li key={offer.title} data-reveal="item" className="hdc-card p-4">
                <p className="font-semibold text-catalog-ink">{offer.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-catalog-muted">{offer.text}</p>
              </li>
            ))}
            <li data-reveal="item" className="hdc-card p-4">
              <p className="font-semibold text-catalog-ink">Et bien plus encore !</p>
              <p className="mt-1 text-sm leading-relaxed text-catalog-muted">
                Nous organisons tout type d’événement selon vos idées, même les plus originales.
              </p>
            </li>
          </ul>
        </section>

        <section className="mt-8">
          <h2 data-heading className="font-catalog-display text-2xl text-catalog-ink">Personnalisez votre événement</h2>
          <p data-reveal="item" className="mt-3 text-[0.975rem] leading-relaxed text-catalog-body">
            Selon vos envies, nous pouvons prévoir différentes prestations complémentaires :
          </p>
          <ul className="mt-3 space-y-2">
            {EXTRAS.map((item) => (
              <li key={item} data-reveal="item" className="text-sm leading-relaxed text-catalog-ink">
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8">
          <h2 data-heading className="font-catalog-display text-2xl text-catalog-ink">Demandez votre devis personnalisé</h2>
          <div data-reveal="item" className="mt-3 space-y-3 text-[0.975rem] leading-relaxed text-catalog-body">
            <p>Chaque événement est unique, chaque devis l’est aussi !</p>
            <p>
              Décrivez-nous votre projet en remplissant notre formulaire de demande de devis. Précisez la date souhaitée,
              le nombre de participants, le type d’événement et vos éventuelles demandes particulières.
            </p>
            <p>Notre équipe étudiera votre projet et vous proposera une offre sur mesure, adaptée à vos attentes et à votre budget.</p>
            <p className="font-semibold text-catalog-ink">
              Avec Hurghada Dream, imaginez votre événement, nous nous chargeons de lui donner vie !
            </p>
          </div>
          <button
            type="button"
            data-press
            onClick={openForm}
            className="hdc-btn hdc-btn-ink mt-5 w-full tracking-[0.08em] lg:w-auto"
          >
            DEMANDER MON DEVIS GRATUIT
          </button>
        </section>

        {showForm ? (
          <section ref={formRef} id="demande" className="mt-8 scroll-mt-24">
            <div className="hdc-card p-4 sm:p-6">
              <h2 className="font-catalog-display text-2xl text-catalog-ink">Votre demande</h2>
              {sent ? (
                <p className="mt-4 text-sm leading-relaxed text-catalog-ink">
                  Votre demande est bien envoyée. Notre équipe étudie votre projet et vous répond avec un devis personnalisé.
                </p>
              ) : (
                <form className="mt-4 space-y-3" onSubmit={submit}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Nom">
                      <input className={inputClass} value={form.lastName} onChange={setField("lastName")} autoComplete="family-name" required />
                    </Field>
                    <Field label="Prénom">
                      <input className={inputClass} value={form.firstName} onChange={setField("firstName")} autoComplete="given-name" required />
                    </Field>
                  </div>
                  <Field label="Numéro de téléphone">
                    <input className={inputClass} type="tel" value={form.phone} onChange={setField("phone")} autoComplete="tel" required />
                  </Field>
                  <Field label="Email">
                    <input className={inputClass} type="email" value={form.email} onChange={setField("email")} autoComplete="email" required />
                  </Field>
                  <Field label="Hôtel">
                    <input className={inputClass} value={form.hotel} onChange={setField("hotel")} autoComplete="off" required />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Début du séjour">
                      <input className={inputClass} type="date" value={form.arrival} onChange={setField("arrival")} required />
                    </Field>
                    <Field label="Fin du séjour">
                      <input className={inputClass} type="date" value={form.departure} onChange={setField("departure")} required />
                    </Field>
                  </div>
                  <Field label="La demande que vous souhaitez">
                    <textarea
                      className={`${inputClass} h-36 py-3`}
                      value={form.message}
                      onChange={setField("message")}
                      placeholder="Type d’événement, date souhaitée, nombre de participants, idées…"
                      required
                    />
                  </Field>
                  {error ? <p className="text-sm font-semibold text-catalog-coral" role="alert">{error}</p> : null}
                  <button type="submit" data-press disabled={sending} className="hdc-btn hdc-btn-ink w-full disabled:opacity-50">
                    {sending ? "Envoi…" : "Envoyer ma demande"}
                  </button>
                </form>
              )}
            </div>
          </section>
        ) : null}
      </main>
    </PublicAppShell>
  );
}
