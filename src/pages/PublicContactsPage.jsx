import { Phone } from "lucide-react";
import { PublicAppShell } from "../components/public/PublicAppShell";
import { WhatsAppGlyph } from "../components/public/PublicUI";

const CONTACTS = [
  {
    title: "Service réservation",
    display: "+20 10 62002850",
    tel: "+201062002850",
    whatsapp: "201062002850",
  },
  {
    title: "Service hôtel",
    display: "+20 12 71756017",
    tel: "+201271756017",
    whatsapp: "201271756017",
  },
  {
    title: "Service transfert de jour",
    display: "+20 10 06346043",
    tel: "+201006346043",
    whatsapp: "201006346043",
  },
  {
    title: "Transfert de nuit",
    display: "+20 12 73333545",
    tel: "+201273333545",
    whatsapp: "201273333545",
  },
];

export function PublicContactsPage() {
  return (
    <PublicAppShell title="Contacts">
      <main className="mx-auto w-full max-w-lg px-4 pb-12 pt-6">
        <p className="hdc-eyebrow">Nous joindre</p>
        <h1 className="mt-1.5 font-catalog-display text-[1.75rem] leading-tight text-catalog-ink">
          Nos <span className="hdc-serif">contacts</span>
        </h1>
        <p className="mt-2 max-w-sm text-[0.9375rem] leading-relaxed text-catalog-muted">
          Une équipe française vous répond, 7 jours sur 7. Appuyez sur un numéro pour appeler.
        </p>

        <ul className="mt-6 space-y-3">
          {CONTACTS.map((contact) => (
            <li key={contact.tel} className="hdc-card p-4">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-catalog-label">
                {contact.title}
              </p>
              <a
                href={`tel:${contact.tel}`}
                data-press
                className="mt-2 flex min-h-11 items-center gap-3 text-catalog-ink"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-catalog-mist text-catalog-lagoon">
                  <Phone className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="font-catalog-display text-[1.35rem] leading-none tracking-tight">{contact.display}</span>
              </a>
              <a
                href={`https://wa.me/${contact.whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                data-press
                className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-catalog-lagoon"
              >
                <WhatsAppGlyph className="h-4 w-4 text-[#1F8F55]" />
                Écrire sur WhatsApp
              </a>
            </li>
          ))}
        </ul>
      </main>
    </PublicAppShell>
  );
}
