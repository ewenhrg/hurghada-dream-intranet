import { Link } from "react-router-dom";
import { PublicAppShell } from "../components/public/PublicAppShell";

const EXPERIENCES = [
  {
    title: "Excursions en mer",
    text: "Découvrez les îles paradisiaques, les eaux cristallines et les magnifiques fonds marins de la mer Rouge.",
  },
  {
    title: "Activités nautiques",
    text: "Vivez des sensations fortes avec nos activités aquatiques et nos sorties en speedboat.",
  },
  {
    title: "Aventures dans le désert",
    text: "Partez en quad ou en safari pour découvrir les paysages désertiques et vivre une expérience différente.",
  },
  {
    title: "Excursions culturelles",
    text: "Partez à la découverte des trésors de l’Égypte, notamment à Louxor et au Caire.",
  },
  {
    title: "Transferts et services touristiques",
    text: "Profitez d’une organisation simplifiée pour faciliter vos déplacements et vos activités.",
  },
];

const REASONS = [
  {
    title: "Un accompagnement personnalisé",
    text: "Chaque voyageur est différent. Nous prenons le temps de comprendre vos envies afin de vous orienter vers les activités qui vous correspondent.",
  },
  {
    title: "Une réservation simplifiée",
    text: "Nous vous accompagnons dans vos démarches, de votre première demande jusqu’aux informations pratiques nécessaires à votre excursion.",
  },
  {
    title: "Un large choix d’activités",
    text: "Notre sélection vous permet de composer un séjour varié, entre détente, découverte, aventure et moments de partage.",
  },
  {
    title: "Une équipe à votre écoute",
    text: "Nous accordons une grande importance à la communication, à la disponibilité et à la qualité de votre expérience.",
  },
  {
    title: "Une organisation pensée pour vos vacances",
    text: "Nous vous aidons à préparer vos sorties et à obtenir les informations utiles pour profiter au maximum de votre séjour à Hurghada.",
  },
];

export function PublicAboutPage() {
  return (
    <PublicAppShell title="Qui sommes-nous" wide>
      <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-6 lg:max-w-3xl lg:px-0">
        <p data-reveal="item" className="hdc-eyebrow">Hurghada Dream</p>
        <h1 data-split className="mt-1.5 font-catalog-display text-[2rem] leading-[1.1] text-catalog-ink lg:text-5xl">
          Qui <span className="hdc-serif">sommes-nous</span>&nbsp;?
        </h1>
        <p data-reveal="item" className="mt-3 max-w-2xl text-[0.9375rem] leading-relaxed text-catalog-muted lg:text-base">
          Votre partenaire pour découvrir l’Égypte autrement.
        </p>

        <section className="mt-8 space-y-3" data-reveal="item">
          <div className="hdc-card space-y-3 p-5 text-sm leading-relaxed text-catalog-ink lg:text-[0.9375rem]">
            <p>
              Bienvenue chez <span className="font-semibold">Hurghada Dream</span>, votre agence de voyages et
              d’excursions basée à Hurghada, au bord de la mer Rouge, en Égypte.
            </p>
            <p>
              Notre mission est simple : vous faire vivre des vacances inoubliables en vous proposant des expériences
              uniques, des activités variées et un accompagnement personnalisé tout au long de votre séjour.
            </p>
            <p>
              Que vous rêviez de découvrir les eaux turquoise de la mer Rouge, de partir à l’aventure dans le désert,
              d’explorer les trésors historiques de l’Égypte ou simplement de profiter de moments exceptionnels en
              famille ou entre amis, nous sommes là pour vous aider à créer des souvenirs mémorables.
            </p>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="about-story">
          <h2 id="about-story" data-heading className="font-catalog-display text-[1.5rem] leading-tight text-catalog-ink">
            Notre histoire et notre passion
          </h2>
          <div data-reveal="item" className="hdc-card mt-4 space-y-3 p-5 text-sm leading-relaxed text-catalog-ink">
            <p>
              Hurghada Dream est née d’une envie : permettre à chaque voyageur de profiter pleinement de l’Égypte, en
              découvrant ses plus beaux paysages, ses activités incontournables et ses richesses culturelles.
            </p>
            <p>
              Nous savons que les vacances sont des moments précieux. C’est pourquoi nous mettons tout en œuvre pour
              vous proposer une expérience agréable, organisée et adaptée à vos envies.
            </p>
            <p>
              Notre équipe vous accompagne dans le choix de vos activités, répond à vos questions et vous aide à
              organiser votre séjour en toute simplicité.
            </p>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="about-team">
          <h2 id="about-team" data-heading className="font-catalog-display text-[1.5rem] leading-tight text-catalog-ink">
            Notre équipe
          </h2>
          <div data-reveal="item" className="hdc-card mt-4 space-y-3 p-5 text-sm leading-relaxed text-catalog-ink">
            <p>
              Derrière Hurghada Dream, c’est une équipe de près de <span className="font-semibold">100 collaborateurs</span>{" "}
              mobilisés chaque jour pour votre séjour.
            </p>
            <p>
              Transferts, guides, staff des bateaux, vendeurs, équipes qui organisent et gèrent les excursions : chacun
              a son rôle, tous partagent le même objectif — vous accueillir, vous accompagner et vous satisfaire du
              premier message jusqu’à la fin de votre activité.
            </p>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="about-experiences">
          <h2
            id="about-experiences"
            data-heading
            className="font-catalog-display text-[1.5rem] leading-tight text-catalog-ink"
          >
            Des expériences pour toutes vos envies
          </h2>
          <p data-reveal="item" className="mt-3 text-sm leading-relaxed text-catalog-muted">
            Avec Hurghada Dream, profitez d’un large choix d’activités et d’excursions.
          </p>
          <ul className="mt-4 space-y-3">
            {EXPERIENCES.map((item) => (
              <li key={item.title} data-reveal="item" className="hdc-card p-4">
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-catalog-label">
                  {item.title}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-catalog-ink">{item.text}</p>
              </li>
            ))}
          </ul>
          <p data-reveal="item" className="mt-4 text-sm leading-relaxed text-catalog-ink">
            Que vous soyez amateur d’aventure, passionné de culture ou à la recherche de détente, nous vous aidons à
            trouver les expériences qui correspondent à vos attentes.
          </p>
        </section>

        <section className="mt-10" aria-labelledby="about-why">
          <h2 id="about-why" data-heading className="font-catalog-display text-[1.5rem] leading-tight text-catalog-ink">
            Pourquoi choisir Hurghada Dream&nbsp;?
          </h2>
          <ul className="mt-4 space-y-3">
            {REASONS.map((item) => (
              <li key={item.title} data-reveal="item" className="hdc-card p-4">
                <p className="font-semibold text-catalog-ink">{item.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-catalog-muted">{item.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10" aria-labelledby="about-commitment">
          <h2
            id="about-commitment"
            data-heading
            className="font-catalog-display text-[1.5rem] leading-tight text-catalog-ink"
          >
            Notre engagement
          </h2>
          <div data-reveal="item" className="hdc-card mt-4 space-y-3 p-5 text-sm leading-relaxed text-catalog-ink">
            <p>
              Chez Hurghada Dream, nous pensons que les plus belles vacances sont celles dont on se souvient longtemps
              après son retour.
            </p>
            <p>
              Notre engagement est de vous accompagner avec attention, de vous conseiller avec transparence et de vous
              aider à profiter pleinement de chaque instant en Égypte.
            </p>
            <p>
              Votre satisfaction est au cœur de nos priorités. Nous souhaitons que chaque excursion soit l’occasion de
              découvrir, de partager et de vivre de nouvelles émotions.
            </p>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="about-cta">
          <div
            data-reveal="item"
            className="relative overflow-hidden rounded-[1.25rem] bg-catalog-abyss p-6 text-white shadow-catalog-float lg:p-8"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(227,174,85,0.45)_0%,rgba(227,174,85,0)_70%)]"
            />
            <p className="relative text-[0.6875rem] font-semibold uppercase tracking-[0.22em] text-catalog-sand">
              Prêts à vivre l’expérience
            </p>
            <h2
              id="about-cta"
              className="relative mt-2 font-catalog-display text-[1.5rem] leading-snug !text-white lg:text-3xl"
            >
              Votre aventure commence <span className="hdc-serif text-catalog-sand">ici</span>.
            </h2>
            <p className="relative mt-3 max-w-xl text-sm leading-relaxed text-white/80">
              Laissez-vous séduire par la beauté de l’Égypte et partez à la découverte de ses merveilles avec notre
              équipe. Contactez Hurghada Dream pour découvrir nos excursions, obtenir des conseils personnalisés et
              organiser vos prochaines activités à Hurghada.
            </p>
            <p className="relative mt-4 text-sm font-semibold text-catalog-sand">
              Hurghada Dream — Des expériences inoubliables, des souvenirs pour la vie.
            </p>
            <div className="relative mt-6 flex flex-col gap-3 sm:flex-row">
              <Link to="/catalogue" data-press className="hdc-btn hdc-btn-ghost w-full sm:w-auto">
                Voir les excursions
              </Link>
              <Link to="/contacts" data-press className="hdc-btn hdc-btn-ink w-full sm:w-auto">
                Nous contacter
              </Link>
            </div>
          </div>
        </section>
      </main>
    </PublicAppShell>
  );
}
