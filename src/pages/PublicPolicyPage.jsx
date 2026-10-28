import { Link } from "react-router-dom";
import { PublicAppShell } from "../components/public/PublicAppShell";

const REFUND_ROWS = [
  { when: "Plus de 72 h avant l’activité", amount: "Remboursement intégral" },
  { when: "Entre 48 h et 72 h avant", amount: "Remboursement de 50 %" },
  { when: "Moins de 48 h avant", amount: "Aucun remboursement" },
];

const SPECIAL_CASES = [
  {
    title: "Excursions au Caire et à Louxor",
    text: "Ces excursions sont modifiables ou annulables uniquement 72 h à l’avance. Passé ce délai, aucune modification ni aucun remboursement n’est possible, quel que soit le motif (maladie, imprévu de dernière minute…).",
  },
  {
    title: "Le Caire en avion",
    text: "Après la réservation, aucune modification ni aucun remboursement n’est possible, quel que soit le motif (maladie, imprévu de dernière minute…).",
  },
  {
    title: "Louxor en montgolfière",
    text: "L’armée sur place peut ne pas autoriser le décollage des montgolfières. Dans ce cas, 30 € par personne sont remboursés sur le total de l’activité. Le reste de la journée (visites et suite du programme) se déroule comme prévu.",
  },
  {
    title: "Annulation par Hurghada Dream",
    text: "Si une activité est annulée pour intempéries, décision gouvernementale ou une autre cause de notre fait, nous remboursons la totalité ou nous la modifions.",
  },
];

export function PublicPolicyPage() {
  return (
    <PublicAppShell title="Remboursement" headerTitle="" wide>
      <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-6 lg:max-w-3xl lg:px-0">
        <p data-reveal="item" className="hdc-eyebrow">Avant de réserver</p>
        <h1 data-split className="mt-1.5 font-catalog-display text-[2rem] leading-[1.1] text-catalog-ink lg:text-5xl">
          Remboursement et <span className="hdc-serif">modification</span>
        </h1>
        <p data-reveal="item" className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-catalog-muted lg:text-base">
          Les délais se comptent avant la date de l’activité. Une demande se fait auprès de l’équipe de réservation.
        </p>

        <section className="mt-8" aria-labelledby="policy-refund">
          <h2 id="policy-refund" data-heading className="font-catalog-display text-[1.5rem] leading-tight text-catalog-ink">
            Remboursement
          </h2>
          <ul className="mt-4 space-y-3">
            {REFUND_ROWS.map((row) => (
              <li key={row.when} data-reveal="item" className="hdc-card flex items-center justify-between gap-4 p-4">
                <p className="text-sm font-medium leading-snug text-catalog-ink">{row.when}</p>
                <p className="shrink-0 text-right text-sm font-semibold text-catalog-lagoon">{row.amount}</p>
              </li>
            ))}
          </ul>
          <Link to="/modification" className="hdc-btn hdc-btn-primary mt-4 w-full">
            Modification / annulation
          </Link>
        </section>

        <section className="mt-10" aria-labelledby="policy-change">
          <h2 id="policy-change" data-heading className="font-catalog-display text-[1.5rem] leading-tight text-catalog-ink">
            Modification
          </h2>
          <div data-reveal="item" className="hdc-card mt-4 space-y-3 p-4 text-sm leading-relaxed text-catalog-ink">
            <p>Une activité peut être modifiée gratuitement jusqu’à 48 h avant sa date.</p>
            <p>En dessous de ce délai, l’activité n’est plus modifiable.</p>
            <p className="font-semibold">Une activité déjà modifiée ne pourra pas être remboursée, quel que soit le délai.</p>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="policy-special">
          <h2 id="policy-special" data-heading className="font-catalog-display text-[1.5rem] leading-tight text-catalog-ink">
            Cas particuliers
          </h2>
          <ul className="mt-4 space-y-3">
            {SPECIAL_CASES.map((item) => (
              <li key={item.title} data-reveal="item" className="hdc-card p-4">
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-catalog-label">{item.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-catalog-ink">{item.text}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </PublicAppShell>
  );
}
