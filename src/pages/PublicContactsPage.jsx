import { Phone } from "lucide-react";
import { Link } from "react-router-dom";
import { PublicAppShell } from "../components/public/PublicAppShell";
import { WhatsAppGlyph } from "../components/public/PublicUI";
import { useTranslation } from "../hooks/useTranslation";

const CONTACT_ROWS = [
  {
    titleKey: "public.contacts.service.booking",
    display: "+20 10 62002850",
    tel: "+201062002850",
    whatsapp: "201062002850",
  },
  {
    titleKey: "public.contacts.service.hotel",
    display: "+20 12 71756017",
    tel: "+201271756017",
    whatsapp: "201271756017",
  },
  {
    titleKey: "public.contacts.service.dayTransfer",
    display: "+20 10 06346043",
    tel: "+201006346043",
    whatsapp: "201006346043",
  },
  {
    titleKey: "public.contacts.service.nightTransfer",
    display: "+20 12 73333545",
    tel: "+201273333545",
    whatsapp: "201273333545",
  },
];

export function PublicContactsPage() {
  const { t } = useTranslation();

  return (
    <PublicAppShell title={t("public.contacts.title")}>
      <main className="mx-auto w-full max-w-lg px-4 pb-12 pt-6">
        <p data-reveal="item" className="hdc-eyebrow">
          {t("public.contacts.eyebrow")}
        </p>
        <h1 data-split className="mt-1.5 font-catalog-display text-[2rem] leading-[1.1] text-catalog-ink">
          {t("public.contacts.headingBefore")}{" "}
          <span className="hdc-serif">{t("public.contacts.headingAccent")}</span>
        </h1>
        <p data-reveal="item" className="mt-3 max-w-sm text-[0.9375rem] leading-relaxed text-catalog-muted">
          {t("public.contacts.intro")}
        </p>

        <ul className="mt-6 space-y-3">
          {CONTACT_ROWS.map((contact) => (
            <li key={contact.tel} data-reveal="item" className="hdc-card p-4">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-catalog-label">
                {t(contact.titleKey)}
              </p>
              <a href={`tel:${contact.tel}`} data-press className="mt-2 flex min-h-11 items-center gap-3 text-catalog-ink">
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
                className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-catalog-lagoon"
              >
                <WhatsAppGlyph className="h-4 w-4 text-[#1F8F55]" />
                {t("public.common.whatsapp")}
              </a>
            </li>
          ))}
        </ul>

        <div className="mt-6 space-y-3">
          <Link to="/qui-sommes-nous" data-press data-reveal="item" className="hdc-card block p-4 text-catalog-ink">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-catalog-label">
              {t("public.about.eyebrow")}
            </p>
            <p className="mt-1 font-catalog-display text-[1.25rem] leading-tight">{t("public.about.title")}</p>
            <p className="mt-1 text-sm text-catalog-muted">{t("public.about.intro")}</p>
          </Link>
          <Link to="/politique" data-press data-reveal="item" className="hdc-card block p-4 text-catalog-ink">
            <p className="mt-1 font-catalog-display text-[1.25rem] leading-tight">{t("public.policy.title")}</p>
          </Link>
          <Link to="/confidentialite" data-press data-reveal="item" className="hdc-card block p-4 text-catalog-ink">
            <p className="mt-1 font-catalog-display text-[1.25rem] leading-tight">{t("public.privacy.title")}</p>
          </Link>
        </div>
      </main>
    </PublicAppShell>
  );
}
