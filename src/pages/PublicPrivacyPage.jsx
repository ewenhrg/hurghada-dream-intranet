import { PublicAppShell } from "../components/public/PublicAppShell";

function Section({ id, title, children }) {
  return (
    <section className="mt-10" aria-labelledby={id}>
      <h2 id={id} data-heading className="font-catalog-display text-[1.5rem] leading-tight text-catalog-ink">
        {title}
      </h2>
      <div data-reveal="item" className="mt-4 space-y-3 text-sm leading-relaxed text-catalog-ink">
        {children}
      </div>
    </section>
  );
}

function SubSection({ title, children }) {
  return (
    <div className="hdc-card space-y-2 p-4">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-catalog-label">{title}</p>
      <div className="space-y-2 text-sm leading-relaxed text-catalog-ink">{children}</div>
    </div>
  );
}

function BulletList({ items }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 marker:text-catalog-lagoon">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function PublicPrivacyPage() {
  return (
    <PublicAppShell title="Confidentialité" wide>
      <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-6 lg:max-w-3xl lg:px-0">
        <p data-reveal="item" className="hdc-eyebrow">Vos données</p>
        <h1 data-split className="mt-1.5 font-catalog-display text-[2rem] leading-[1.1] text-catalog-ink lg:text-5xl">
          Politique de <span className="hdc-serif">confidentialité</span>
        </h1>
        <p data-reveal="item" className="mt-2 text-sm font-semibold text-catalog-lagoon">
          Hurghada Dream — Al Fayed Travel
        </p>
        <p data-reveal="item" className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-catalog-muted lg:text-base">
          Dernière mise à jour : 13 octobre 2026
        </p>

        <Section id="privacy-1" title="1. Introduction">
          <p>Bienvenue sur le site internet de Hurghada Dream.</p>
          <p>
            Hurghada Dream est une agence de voyages et d’excursions basée à Hurghada, en Égypte, exploitée sous
            l’identité juridique communiquée d’Al Fayed Travel.
          </p>
          <p>
            Nous proposons notamment des excursions maritimes, des activités nautiques, des sorties dans le désert,
            des visites culturelles, des transferts et d’autres prestations touristiques.
          </p>
          <p>
            La présente politique de confidentialité explique comment nous collectons, utilisons, conservons et
            protégeons les données personnelles des personnes qui consultent notre site internet, nous contactent ou
            réservent une prestation auprès de notre agence.
          </p>
          <p>
            Nous accordons une importance particulière à la confidentialité de nos clients et nous nous engageons à
            traiter leurs données personnelles conformément aux règles applicables.
          </p>
        </Section>

        <Section id="privacy-2" title="2. Responsable du traitement">
          <p>Le responsable du traitement des données personnelles est :</p>
          <div className="hdc-card space-y-1.5 p-4">
            <p>
              <span className="font-semibold">Nom commercial :</span> Hurghada Dream
            </p>
            <p>
              <span className="font-semibold">Identité juridique communiquée :</span> Al Fayed Travel
            </p>
            <p>
              <span className="font-semibold">Licence touristique :</span> Tourism License No. 63
            </p>
            <p>
              <span className="font-semibold">Adresse professionnelle :</span> Esplanada Mall, Hurghada, Égypte
            </p>
            <p>
              <span className="font-semibold">Adresse e-mail :</span>{" "}
              <a href="mailto:hurghadadreamvente@gmail.com" className="font-semibold text-catalog-lagoon">
                hurghadadreamvente@gmail.com
              </a>
            </p>
            <p>
              <span className="font-semibold">Site internet :</span>{" "}
              <a
                href="https://hurghadadream.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-catalog-lagoon"
              >
                https://hurghadadream.com/
              </a>
            </p>
          </div>
          <p>
            Pour toute question concernant vos données personnelles ou pour exercer vos droits, vous pouvez nous
            contacter à l’adresse électronique indiquée ci-dessus.
          </p>
        </Section>

        <Section id="privacy-3" title="3. Données personnelles collectées">
          <p>
            Les données collectées dépendent des services que vous utilisez et des informations nécessaires au
            traitement de votre demande.
          </p>
          <SubSection title="3.1. Données d’identification et de contact">
            <p>Nous pouvons collecter :</p>
            <BulletList
              items={[
                "Votre nom et votre prénom.",
                "Votre numéro de téléphone.",
                "Votre adresse e-mail.",
                "Les coordonnées que vous nous communiquez volontairement.",
              ]}
            />
          </SubSection>
          <SubSection title="3.2. Données relatives aux réservations">
            <p>Pour préparer et gérer votre réservation, nous pouvons collecter :</p>
            <BulletList
              items={[
                "L’activité ou l’excursion choisie.",
                "La date de réservation et la date de la prestation.",
                "Le nombre de participants.",
                "Les informations nécessaires à l’organisation de l’activité.",
                "Les échanges concernant votre réservation.",
                "Les demandes de modification ou d’annulation.",
              ]}
            />
          </SubSection>
          <SubSection title="3.3. Informations relatives aux transferts">
            <p>
              Lorsque votre prestation comprend un transfert, nous pouvons traiter les informations nécessaires à son
              organisation, notamment :
            </p>
            <BulletList
              items={[
                "Le nom de votre hôtel ou votre lieu de prise en charge.",
                "Les informations pratiques nécessaires à la coordination du transport.",
                "Les informations relatives à votre réservation et à votre heure de prise en charge.",
              ]}
            />
            <p>Ces informations peuvent être communiquées aux prestataires chargés d’assurer le transfert.</p>
          </SubSection>
          <SubSection title="3.4. Données relatives aux paiements">
            <p>Hurghada Dream propose plusieurs moyens de paiement.</p>
            <p>
              Selon le moyen utilisé, nous pouvons traiter des informations telles que le montant payé, la date de la
              transaction, son statut et sa référence.
            </p>
            <p>
              Lorsque le paiement est effectué par l’intermédiaire d’un prestataire externe, les données nécessaires à
              la transaction peuvent être traitées directement par ce prestataire conformément à sa propre politique de
              confidentialité.
            </p>
            <p>Les modalités exactes de traitement des données bancaires dépendent du moyen de paiement choisi.</p>
          </SubSection>
          <SubSection title="3.5. Communications avec notre agence">
            <p>Les réservations et les échanges avec notre équipe sont principalement gérés par WhatsApp.</p>
            <p>
              Nous pouvons également recevoir des demandes par e-mail, par téléphone, via notre site internet ou par
              l’intermédiaire de nos réseaux sociaux.
            </p>
            <p>
              Les informations communiquées peuvent être utilisées pour répondre à vos questions, préparer un devis,
              organiser une prestation, assurer le suivi client et traiter une éventuelle réclamation.
            </p>
          </SubSection>
          <SubSection title="3.6. Données de navigation">
            <p>Lors de votre visite sur notre site, certaines données techniques peuvent être collectées, notamment :</p>
            <BulletList
              items={[
                "Les pages consultées.",
                "La date et la durée de la visite.",
                "Le type de navigateur et d’appareil.",
                "Certaines informations relatives à la navigation.",
                "L’adresse IP ou des informations techniques associées, selon la configuration des outils utilisés.",
              ]}
            />
            <p>
              Ces données peuvent notamment être traitées par Google Analytics lorsque cet outil est activé sur le site.
            </p>
          </SubSection>
        </Section>

        <Section id="privacy-4" title="4. Finalités de l’utilisation des données">
          <p>Vos données personnelles peuvent être utilisées pour :</p>
          <BulletList
            items={[
              "Répondre à vos demandes d’informations.",
              "Préparer des devis personnalisés.",
              "Gérer les réservations et les participants.",
              "Organiser les excursions et les transferts.",
              "Communiquer les informations pratiques nécessaires à votre activité.",
              "Traiter les paiements et assurer le suivi des transactions.",
              "Gérer les modifications, annulations, réclamations et demandes de remboursement.",
              "Respecter les obligations légales et comptables applicables.",
              "Assurer la sécurité et le bon fonctionnement de notre site.",
              "Analyser la fréquentation du site et améliorer l’expérience utilisateur, lorsque les outils correspondants sont utilisés conformément aux règles applicables.",
              "Envoyer des communications commerciales lorsque cela est autorisé.",
            ]}
          />
        </Section>

        <Section id="privacy-5" title="5. Bases légales du traitement">
          <p>
            Lorsque le Règlement général sur la protection des données (RGPD) s’applique, les traitements reposent sur
            une base légale adaptée à leur finalité.
          </p>
          <div className="hdc-card space-y-3 p-4">
            <p>
              <span className="font-semibold">Exécution d’un contrat ou mesures précontractuelles :</span> gestion des
              demandes de devis, réservations, paiements, transferts et prestations touristiques.
            </p>
            <p>
              <span className="font-semibold">Obligation légale :</span> conservation de documents et respect des
              obligations administratives, fiscales ou comptables applicables.
            </p>
            <p>
              <span className="font-semibold">Intérêt légitime :</span> gestion de la relation client, prévention des
              abus, sécurité des services et défense de nos droits, sous réserve du respect des droits et libertés des
              personnes concernées.
            </p>
            <p>
              <span className="font-semibold">Consentement :</span> utilisation de cookies ou de technologies non
              essentiels lorsqu’un consentement préalable est requis, ainsi que certaines communications commerciales
              lorsque la loi l’exige.
            </p>
          </div>
          <p>Lorsque le traitement repose sur le consentement, celui-ci peut être retiré à tout moment pour l’avenir.</p>
        </Section>

        <Section id="privacy-6" title="6. Réservations et communications via WhatsApp">
          <p>
            WhatsApp constitue le principal canal de communication utilisé par Hurghada Dream pour les demandes de
            renseignements, les devis et la gestion des réservations.
          </p>
          <p>Lorsque vous communiquez avec notre agence par WhatsApp, les informations que vous transmettez peuvent être utilisées pour :</p>
          <BulletList
            items={[
              "Identifier votre demande.",
              "Préparer et gérer votre réservation.",
              "Communiquer les informations nécessaires à votre excursion.",
              "Coordonner votre prise en charge.",
              "Assurer le suivi de votre prestation.",
            ]}
          />
          <p>
            WhatsApp et les sociétés qui exploitent ce service peuvent également traiter certaines données conformément
            à leurs propres conditions et politiques de confidentialité.
          </p>
          <p>
            Nous vous invitons à consulter la politique de confidentialité officielle de WhatsApp pour en savoir plus
            sur les traitements réalisés par cette plateforme.
          </p>
          <p>
            Nous vous recommandons de ne pas transmettre par messagerie des informations bancaires confidentielles ou
            des données personnelles qui ne sont pas nécessaires à votre réservation.
          </p>
        </Section>

        <Section id="privacy-7" title="7. Destinataires des données">
          <p>Hurghada Dream ne vend pas les données personnelles de ses clients.</p>
          <p>Certaines informations peuvent être communiquées, dans la mesure nécessaire, aux destinataires suivants :</p>
          <BulletList
            items={[
              "Les prestataires d’excursions et partenaires touristiques.",
              "Les chauffeurs et prestataires de transferts.",
              "Les prestataires de paiement.",
              "Les fournisseurs d’hébergement et de solutions techniques.",
              "Les services de communication utilisés par l’agence.",
              "Google, dans le cadre de l’utilisation de Google Analytics.",
              "Les autorités ou professionnels compétents lorsque la loi l’exige.",
            ]}
          />
          <p>
            Les informations communiquées sont limitées à ce qui est nécessaire pour réaliser la prestation ou répondre
            à l’objectif concerné.
          </p>
        </Section>

        <Section id="privacy-8" title="8. Cookies et Google Analytics">
          <p>
            Notre site internet utilise Google Analytics pour analyser la fréquentation et mieux comprendre la manière
            dont les visiteurs utilisent le site.
          </p>
          <p>
            Selon sa configuration, cet outil peut collecter des informations relatives à la navigation, aux pages
            consultées, aux interactions avec le site et à certaines caractéristiques techniques de l’appareil utilisé.
          </p>
          <p>
            Ces informations nous permettent notamment d’évaluer la fréquentation du site et d’identifier les
            améliorations possibles.
          </p>
          <p>
            Google peut traiter certaines données conformément à ses propres conditions et politiques de
            confidentialité. Selon la configuration du service, certaines données peuvent également être transférées ou
            traitées depuis d’autres pays.
          </p>
          <p>
            Les cookies strictement nécessaires au fonctionnement du site peuvent être utilisés conformément aux règles
            applicables. Lorsque le consentement préalable est requis pour les cookies analytiques ou d’autres
            technologies non essentielles, ceux-ci ne doivent être activés qu’après obtention de ce consentement.
          </p>
          <p>
            Vous pouvez gérer vos préférences à l’aide du dispositif de gestion des cookies du site, s’il est
            disponible, ou consulter les paramètres de votre navigateur.
          </p>
          <p>La désactivation des cookies peut affecter certaines fonctionnalités du site.</p>
          <p>
            Pour plus d’informations, nous vous invitons à consulter la politique de confidentialité de Google et les
            informations officielles relatives à Google Analytics.
          </p>
        </Section>

        <Section id="privacy-9" title="9. Transferts internationaux de données">
          <p>
            Hurghada Dream étant basée en Égypte, certaines données peuvent être traitées en Égypte ou dans d’autres
            pays par les prestataires intervenant dans le cadre de nos services.
          </p>
          <p>
            Les outils de communication, les prestataires de paiement et les fournisseurs techniques peuvent également
            traiter certaines données depuis des pays différents de celui dans lequel vous vous trouvez.
          </p>
          <p>
            Lorsque le RGPD s’applique et qu’un transfert de données vers un pays situé hors de l’Espace économique
            européen est effectué, ce transfert doit respecter les conditions légales applicables et bénéficier des
            garanties nécessaires lorsqu’elles sont requises.
          </p>
          <p>
            Pour toute question concernant les transferts applicables à vos données, vous pouvez nous contacter à
            l’adresse suivante :{" "}
            <a href="mailto:hurghadadreamvente@gmail.com" className="font-semibold text-catalog-lagoon">
              hurghadadreamvente@gmail.com
            </a>
            .
          </p>
        </Section>

        <Section id="privacy-10" title="10. Durée de conservation des données">
          <p>
            Hurghada Dream conserve les données personnelles pendant la durée nécessaire à la gestion des réservations,
            à la réalisation des prestations touristiques et au respect de ses obligations légales.
          </p>
          <div className="hdc-card space-y-3 p-4">
            <p>
              <span className="font-semibold">Données de réservation et informations clients :</span> les données
              opérationnelles nécessaires à la gestion de la réservation sont conservées jusqu’à la fin de la date de
              séjour du client, sauf si une conservation supplémentaire est nécessaire pour respecter une obligation
              légale ou traiter une réclamation ou un litige.
            </p>
            <p>
              <span className="font-semibold">Données relatives aux transferts et aux activités :</span> les
              informations nécessaires à l’organisation des excursions et des transferts sont conservées jusqu’à la fin
              de la date de séjour du client, sous réserve des obligations légales applicables.
            </p>
            <p>
              <span className="font-semibold">Demandes de renseignements et devis :</span> les informations sont
              conservées pendant la durée nécessaire au traitement de la demande et au suivi commercial justifié.
            </p>
            <p>
              <span className="font-semibold">Échanges et communications avec les clients :</span> les informations sont
              conservées pendant la durée nécessaire à la gestion de la réservation, au suivi de la prestation et au
              traitement des éventuelles demandes ou réclamations.
            </p>
            <p>
              <span className="font-semibold">Données de paiement et documents comptables :</span> les données et
              documents soumis à des obligations légales, fiscales ou comptables sont conservés pendant les durées
              imposées par la réglementation applicable, même si le séjour du client est terminé.
            </p>
            <p>
              <span className="font-semibold">Réclamations, annulations et remboursements :</span> les informations
              nécessaires sont conservées pendant la durée requise pour traiter le dossier et satisfaire aux obligations
              légales applicables.
            </p>
            <p>
              <span className="font-semibold">Données de navigation et Google Analytics :</span> les données sont
              conservées selon les paramètres de conservation configurés dans l’outil et les règles applicables.
            </p>
            <p>
              <span className="font-semibold">Communications commerciales :</span> les données sont conservées
              conformément aux conditions légales applicables et, lorsque nécessaire, jusqu’au retrait du consentement
              ou à l’exercice du droit d’opposition.
            </p>
          </div>
          <p>
            À l’issue des périodes de conservation applicables, les données sont supprimées ou anonymisées lorsqu’elles
            ne doivent plus être conservées.
          </p>
          <p>
            La fin du séjour constitue la référence pour la conservation des données opérationnelles de réservation,
            mais ne permet pas de supprimer automatiquement les documents comptables ou les informations devant être
            conservées plus longtemps en vertu de la loi.
          </p>
        </Section>

        <Section id="privacy-11" title="11. Sécurité des données">
          <p>Hurghada Dream accorde une importance particulière à la protection des informations qui lui sont confiées.</p>
          <p>
            Des mesures de sécurité adaptées doivent être mises en œuvre afin de limiter les risques d’accès non
            autorisé, de perte, de divulgation ou de modification des données personnelles.
          </p>
          <p>L’accès aux données doit être limité aux personnes qui en ont besoin pour leurs missions professionnelles.</p>
          <p>
            Malgré les précautions mises en œuvre, aucun système informatique ni moyen de transmission électronique ne
            peut garantir une sécurité absolue.
          </p>
        </Section>

        <Section id="privacy-12" title="12. Vos droits concernant vos données personnelles">
          <p>
            Lorsque le RGPD s’applique, vous pouvez bénéficier, dans les conditions prévues par la réglementation, des
            droits suivants :
          </p>
          <div className="hdc-card space-y-3 p-4">
            <p>
              <span className="font-semibold">Droit d’accès :</span> obtenir la confirmation que vos données sont
              traitées et accéder aux informations concernées.
            </p>
            <p>
              <span className="font-semibold">Droit de rectification :</span> demander la correction de données
              inexactes ou incomplètes.
            </p>
            <p>
              <span className="font-semibold">Droit à l’effacement :</span> demander la suppression de certaines données
              lorsque les conditions légales sont réunies.
            </p>
            <p>
              <span className="font-semibold">Droit à la limitation :</span> demander, dans certains cas, la limitation
              du traitement de vos données.
            </p>
            <p>
              <span className="font-semibold">Droit d’opposition :</span> vous opposer à certains traitements, notamment
              ceux fondés sur l’intérêt légitime, ainsi qu’à la prospection commerciale.
            </p>
            <p>
              <span className="font-semibold">Droit à la portabilité :</span> recevoir certaines données dans un format
              structuré et couramment utilisé lorsque les conditions légales sont remplies.
            </p>
            <p>
              <span className="font-semibold">Droit de retirer votre consentement :</span> lorsque le traitement est
              fondé sur votre consentement.
            </p>
          </div>
          <p>
            Pour exercer vos droits, vous pouvez envoyer une demande à :{" "}
            <a href="mailto:hurghadadreamvente@gmail.com" className="font-semibold text-catalog-lagoon">
              hurghadadreamvente@gmail.com
            </a>
          </p>
          <p>
            Nous pourrons vous demander les informations raisonnablement nécessaires pour vérifier votre identité et
            traiter votre demande de manière sécurisée.
          </p>
          <p>Ces droits sont soumis aux conditions et exceptions prévues par la réglementation applicable.</p>
          <p>
            Si vous estimez que vos droits ne sont pas respectés et que le RGPD s’applique, vous pouvez également
            introduire une réclamation auprès de l’autorité de contrôle compétente.
          </p>
        </Section>

        <Section id="privacy-13" title="13. Données concernant les mineurs">
          <p>
            Certaines excursions et activités peuvent être réservées pour des enfants ou des mineurs par leurs parents
            ou représentants légaux.
          </p>
          <p>
            Dans ce cadre, seules les informations nécessaires à la gestion de la réservation, à l’organisation de
            l’activité et à la sécurité des participants doivent être collectées.
          </p>
          <p>
            Lorsque le traitement de données concernant un mineur repose sur le consentement, les règles applicables à
            son âge et à sa situation doivent être respectées.
          </p>
        </Section>

        <Section id="privacy-14" title="14. Liens vers des sites tiers">
          <p>Notre site ou nos communications peuvent contenir des liens vers des sites ou services exploités par des tiers.</p>
          <p>
            Hurghada Dream ne contrôle pas nécessairement leurs pratiques en matière de confidentialité. Nous vous
            recommandons de consulter leurs politiques de confidentialité avant de leur transmettre des informations
            personnelles.
          </p>
        </Section>

        <Section id="privacy-15" title="15. Modification de la politique">
          <p>
            La présente politique peut être mise à jour afin de tenir compte de l’évolution de nos services, de nos
            outils techniques ou des obligations légales applicables.
          </p>
          <p>La version actualisée sera publiée sur notre site internet avec sa date de mise à jour.</p>
          <p>Nous vous invitons à consulter régulièrement cette page.</p>
        </Section>

        <Section id="privacy-16" title="16. Contact">
          <p>Pour toute question relative à la présente politique ou à l’utilisation de vos données personnelles, vous pouvez contacter notre agence :</p>
          <div className="hdc-card space-y-2 p-4">
            <p className="font-catalog-display text-[1.25rem] leading-tight text-catalog-ink">
              Hurghada Dream — Al Fayed Travel
            </p>
            <p>
              Esplanada Mall
              <br />
              Hurghada, Égypte
            </p>
            <p>
              <span className="font-semibold">Licence touristique :</span> Tourism License No. 63
            </p>
            <p>
              <span className="font-semibold">E-mail :</span>{" "}
              <a href="mailto:hurghadadreamvente@gmail.com" className="font-semibold text-catalog-lagoon">
                hurghadadreamvente@gmail.com
              </a>
            </p>
            <p>
              <span className="font-semibold">Site internet :</span>{" "}
              <a
                href="https://hurghadadream.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-catalog-lagoon"
              >
                https://hurghadadream.com/
              </a>
            </p>
          </div>
          <p>Nous traiterons votre demande conformément aux règles applicables.</p>
        </Section>
      </main>
    </PublicAppShell>
  );
}
