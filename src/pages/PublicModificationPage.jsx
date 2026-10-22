import { useEffect, useMemo, useState } from "react";
import { PublicAppShell } from "../components/public/PublicAppShell";
import { supabase } from "../lib/supabase";
import { SITE_KEY } from "../constants";
import { currencyNoCents } from "../utils";
import { fetchClientStayByCode, normalizeReservationCode } from "../utils/clientStay";
import { getActivityPickupOptions } from "../utils/transferPricing";
import {
  formatStayDay,
  modificationTooLate,
  paxLabel,
  refundLabel,
  refundPercent,
  upcomingOpenDates,
} from "../utils/modificationRequest";

const inputClass =
  "mt-1.5 h-12 w-full rounded-2xl border border-catalog-border bg-white px-4 text-base text-catalog-ink outline-none focus:border-catalog-lagoon";

function mapActivity(row) {
  return {
    id: row.id,
    name: String(row.name || "").trim(),
    priceAdult: Number(row.price_adult) || 0,
    priceChild: Number(row.price_child) || 0,
    priceBaby: Number(row.price_baby) || 0,
    currency: row.currency || "EUR",
    availableDays: Array.isArray(row.available_days) ? row.available_days : [],
    transfers: row.transfers && typeof row.transfers === "object" ? row.transfers : {},
    catalogPaused: row.catalog_paused === true,
  };
}

function ChoiceButton({ children, onClick }) {
  return (
    <button type="button" onClick={onClick} className="hdc-card w-full p-4 text-left text-base font-semibold text-catalog-ink">
      {children}
    </button>
  );
}

export function PublicModificationPage() {
  const [step, setStep] = useState("code");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stay, setStay] = useState(null);
  const [activities, setActivities] = useState([]);
  const [stops, setStops] = useState([]);
  const [pushes, setPushes] = useState([]);
  const [item, setItem] = useState(null);
  const [changeType, setChangeType] = useState("");
  const [pickup, setPickup] = useState("");
  const [adults, setAdults] = useState(0);
  const [children, setChildren] = useState(0);
  const [babies, setBabies] = useState(0);
  const [nextActivityId, setNextActivityId] = useState("");
  const [nextDate, setNextDate] = useState("");

  useEffect(() => {
    if (!supabase) return undefined;
    let cancelled = false;
    (async () => {
      const [activityResult, stopResult, pushResult] = await Promise.all([
        supabase
          .from("activities")
          .select("id, name, price_adult, price_child, price_baby, currency, available_days, transfers, catalog_paused")
          .eq("site_key", SITE_KEY)
          .order("name", { ascending: true }),
        supabase.from("stop_sales").select("activity_id, date").eq("site_key", SITE_KEY),
        supabase.from("push_sales").select("activity_id, date").eq("site_key", SITE_KEY),
      ]);
      if (cancelled) return;
      setActivities((activityResult.data || []).map(mapActivity).filter((row) => row.name));
      setStops(stopResult.data || []);
      setPushes(pushResult.data || []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activityByName = useMemo(() => {
    const map = new Map();
    activities.forEach((activity) => map.set(activity.name, activity));
    return map;
  }, [activities]);

  const currentActivity = item ? activityByName.get(item.activityName) || null : null;
  const neighborhood = String(stay?.client?.neighborhood || "").trim();
  const pickupOptions = currentActivity ? getActivityPickupOptions(currentActivity, neighborhood) : [];
  const chosenActivity = activities.find((activity) => String(activity.id) === String(nextActivityId)) || null;
  const tooLate = item ? modificationTooLate(item.date) : false;
  const refund = item ? refundPercent(item.date, item.pickupTime) : 0;

  const openDatesFor = (activity) => {
    if (!activity) return [];
    const sameActivity = (row) => String(row.activity_id) === String(activity.id);
    const blocked = stops.filter(sameActivity).map((row) => String(row.date || "").slice(0, 10));
    const pushed = pushes.filter(sameActivity).map((row) => String(row.date || "").slice(0, 10));
    return upcomingOpenDates(activity, blocked, new Date(), 18, pushed);
  };

  const lookup = async () => {
    setError("");
    const formatted = normalizeReservationCode(code);
    if (!/^[A-Z]{2}-\d{3,}$/.test(formatted)) {
      setError("Le numéro ressemble à HU-10042.");
      return;
    }
    setBusy(true);
    const result = await fetchClientStayByCode(formatted);
    setBusy(false);
    if (!result.found) {
      setError(result.expired ? "Ce séjour est terminé." : "Aucune réservation ne correspond à ce numéro.");
      return;
    }
    const upcoming = (result.items || []).filter((row) => String(row.activityName || "").trim());
    if (!upcoming.length) {
      setError("Aucune activité n’est associée à ce numéro.");
      return;
    }
    setStay(result);
    setCode(formatted);
    setStep("activities");
  };

  const submit = async () => {
    if (!item || !stay || !supabase) return;
    const payload = {
      previous: {
        activityName: item.activityName,
        date: item.date,
        adults: item.adults,
        children: item.children,
        babies: item.babies,
        pickup: item.pickupTime || "",
      },
    };
    if (changeType === "pickup") payload.pickup = pickup;
    if (changeType === "pax") {
      payload.adults = adults;
      payload.children = children;
      payload.babies = babies;
    }
    if (changeType === "activity") {
      payload.activityId = chosenActivity?.id || "";
      payload.activityName = chosenActivity?.name || "";
      payload.date = nextDate;
    }
    if (changeType === "date") payload.date = nextDate;

    setBusy(true);
    setError("");
    const { error: insertError } = await supabase.from("public_modification_requests").insert({
      site_key: SITE_KEY,
      reservation_code: code,
      ticket_number: String(item.ticketNumber || "").trim(),
      client_name: stay.client?.name || "",
      client_phone: stay.client?.phone || "",
      hotel: stay.client?.hotel || "",
      activity_name: item.activityName,
      activity_date: String(item.date || "").slice(0, 10),
      kind: changeType ? "modify" : "cancel",
      change_type: changeType || "refund",
      payload,
      refund_percent: changeType ? null : refund,
      status: "pending",
    });
    setBusy(false);
    if (insertError) {
      setError("La demande n’a pas pu être envoyée. Réessayez dans un instant.");
      return;
    }
    setStep("done");
  };

  return (
    <PublicAppShell title="Modification / annulation">
      <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-6">
        <p className="hdc-eyebrow">Votre séjour</p>
        <h1 className="mt-1.5 font-catalog-display text-[2rem] leading-[1.1] text-catalog-ink">
          Modification / <span className="hdc-serif">annulation</span>
        </h1>

        {error ? <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</p> : null}

        {step === "code" ? (
          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void lookup();
            }}
          >
            <label className="block">
              <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-catalog-label">Numéro de réservation</span>
              <input
                value={code}
                onChange={(event) => setCode(normalizeReservationCode(event.target.value))}
                placeholder="HU-10042"
                autoCapitalize="characters"
                className={`${inputClass} uppercase`}
              />
            </label>
            <button type="submit" disabled={busy} className="hdc-btn hdc-btn-primary w-full">
              {busy ? "Recherche…" : "Continuer"}
            </button>
          </form>
        ) : null}

        {step === "activities" ? (
          <section className="mt-6 space-y-3">
            <h2 className="font-catalog-display text-2xl text-catalog-ink">Quelle activité souhaitez-vous modifier ou annuler ?</h2>
            {(stay?.items || []).map((row, index) => (
              <ChoiceButton
                key={`${row.ticketNumber || index}-${row.date}`}
                onClick={() => {
                  setItem(row);
                  setAdults(Math.round(Number(row.adults) || 0));
                  setChildren(Math.round(Number(row.children) || 0));
                  setBabies(Math.round(Number(row.babies) || 0));
                  setError("");
                  setStep("intent");
                }}
              >
                <span className="block">{row.activityName}</span>
                <span className="mt-1 block text-sm font-medium text-catalog-muted">
                  {formatStayDay(row.date)}
                  {row.ticketNumber ? ` · ticket ${row.ticketNumber}` : ""}
                </span>
              </ChoiceButton>
            ))}
          </section>
        ) : null}

        {step === "intent" && item ? (
          <section className="mt-6 space-y-3">
            <h2 className="font-catalog-display text-2xl text-catalog-ink">Que souhaitez-vous faire ?</h2>
            <p className="text-sm text-catalog-muted">{item.activityName} · {formatStayDay(item.date)}</p>
            <ChoiceButton
              onClick={() => {
                setError("");
                if (tooLate) {
                  setError("Ce n’est pas possible. Une modification ne peut pas être demandée la veille pour le lendemain.");
                  return;
                }
                setStep("change");
              }}
            >
              Modifier
            </ChoiceButton>
            <ChoiceButton
              onClick={() => {
                setChangeType("");
                setError("");
                setStep("refund");
              }}
            >
              Annuler
            </ChoiceButton>
          </section>
        ) : null}

        {step === "change" && item ? (
          <section className="mt-6 space-y-3">
            <h2 className="font-catalog-display text-2xl text-catalog-ink">Que souhaitez-vous modifier ?</h2>
            {pickupOptions.length > 1 ? (
              <ChoiceButton onClick={() => { setChangeType("pickup"); setStep("detail"); }}>
                Heure de prise en charge
              </ChoiceButton>
            ) : null}
            <ChoiceButton onClick={() => { setChangeType("pax"); setStep("detail"); }}>
              Nombre de personnes
            </ChoiceButton>
            <ChoiceButton onClick={() => { setChangeType("activity"); setNextActivityId(""); setNextDate(""); setStep("detail"); }}>
              Modifier par une autre activité
            </ChoiceButton>
            <ChoiceButton onClick={() => { setChangeType("date"); setNextDate(""); setStep("detail"); }}>
              Modifier juste la date
            </ChoiceButton>
          </section>
        ) : null}

        {step === "detail" && changeType === "pickup" ? (
          <section className="mt-6 space-y-3">
            <h2 className="font-catalog-display text-2xl text-catalog-ink">Nouvelle heure</h2>
            {pickupOptions.map((option) => (
              <ChoiceButton key={option.value} onClick={() => setPickup(option.time || option.value)}>
                <span className={pickup === (option.time || option.value) ? "text-catalog-lagoon" : ""}>{option.label}</span>
              </ChoiceButton>
            ))}
            <button type="button" disabled={!pickup || busy} onClick={() => void submit()} className="hdc-btn hdc-btn-primary w-full">
              Valider la demande
            </button>
          </section>
        ) : null}

        {step === "detail" && changeType === "pax" ? (
          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <h2 className="font-catalog-display text-2xl text-catalog-ink">Vous serez finalement</h2>
            {[
              ["Adultes", adults, setAdults],
              ["Enfants", children, setChildren],
              ["Bébés", babies, setBabies],
            ].map(([label, value, setter]) => (
              <label key={label} className="block">
                <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-catalog-label">{label}</span>
                <input type="number" min="0" value={value} onChange={(event) => setter(Math.max(0, Number(event.target.value) || 0))} className={inputClass} />
              </label>
            ))}
            <p className="text-sm text-catalog-muted">{paxLabel(adults, children, babies)}</p>
            <button type="submit" disabled={busy || adults + children + babies < 1} className="hdc-btn hdc-btn-primary w-full">
              Valider la demande
            </button>
          </form>
        ) : null}

        {step === "detail" && changeType === "activity" ? (
          <section className="mt-6 space-y-3">
            <h2 className="font-catalog-display text-2xl text-catalog-ink">Choisir une activité</h2>
            {activities.filter((activity) => !activity.catalogPaused).map((activity) => (
              <button
                key={activity.id}
                type="button"
                onClick={() => {
                  setNextActivityId(activity.id);
                  setNextDate("");
                }}
                className={`hdc-card w-full p-4 text-left ${String(nextActivityId) === String(activity.id) ? "ring-2 ring-catalog-lagoon" : ""}`}
              >
                <span className="block font-semibold text-catalog-ink">{activity.name}</span>
                <span className="mt-1 block text-sm text-catalog-lagoon">
                  {activity.priceAdult > 0 ? currencyNoCents(activity.priceAdult, activity.currency) : "Prix sur demande"} / adulte
                </span>
              </button>
            ))}
            {chosenActivity ? (
              <div className="space-y-2 pt-2">
                <h3 className="text-sm font-semibold text-catalog-ink">Jours disponibles</h3>
                <div className="flex flex-wrap gap-2">
                  {openDatesFor(chosenActivity).map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setNextDate(day)}
                      className={`min-h-10 rounded-full px-3 text-sm font-semibold ${nextDate === day ? "bg-catalog-lagoon text-white" : "bg-white text-catalog-ink ring-1 ring-catalog-border"}`}
                    >
                      {formatStayDay(day)}
                    </button>
                  ))}
                </div>
                {openDatesFor(chosenActivity).length === 0 ? (
                  <p className="text-sm text-catalog-muted">Aucune date ouverte pour cette activité.</p>
                ) : null}
              </div>
            ) : null}
            <button type="button" disabled={!chosenActivity || !nextDate || busy} onClick={() => void submit()} className="hdc-btn hdc-btn-primary w-full">
              Valider la demande
            </button>
          </section>
        ) : null}

        {step === "detail" && changeType === "date" ? (
          <section className="mt-6 space-y-3">
            <h2 className="font-catalog-display text-2xl text-catalog-ink">Nouvelle date</h2>
            <p className="text-sm text-catalog-muted">Disponibilités de {String(item?.activityName || "").trim()}.</p>
            <div className="flex flex-wrap gap-2">
              {openDatesFor(currentActivity).map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => setNextDate(day)}
                  className={`min-h-10 rounded-full px-3 text-sm font-semibold ${nextDate === day ? "bg-catalog-lagoon text-white" : "bg-white text-catalog-ink ring-1 ring-catalog-border"}`}
                >
                  {formatStayDay(day)}
                </button>
              ))}
            </div>
            {currentActivity && openDatesFor(currentActivity).length === 0 ? (
              <p className="text-sm text-catalog-muted">Aucune autre date n’est ouverte pour cette activité.</p>
            ) : null}
            {!currentActivity ? <p className="text-sm text-catalog-muted">Les disponibilités de cette activité ne sont pas affichées. Écrivez-nous depuis Contacts.</p> : null}
            <button type="button" disabled={!nextDate || busy} onClick={() => void submit()} className="hdc-btn hdc-btn-primary w-full">
              Valider la demande
            </button>
          </section>
        ) : null}

        {step === "refund" && item ? (
          <section className="mt-6 space-y-4">
            <h2 className="font-catalog-display text-2xl text-catalog-ink">Remboursement possible</h2>
            <p className="hdc-card p-4 text-base font-semibold text-catalog-ink">
              Selon notre politique : {refundLabel(refund)} ({refund} %).
            </p>
            <ul className="space-y-2 text-sm text-catalog-muted">
              <li>Plus de 72 h avant : remboursement intégral</li>
              <li>Entre 48 h et 72 h : remboursement de 50 %</li>
              <li>Moins de 48 h : aucun remboursement</li>
            </ul>
            <button type="button" disabled={busy} onClick={() => void submit()} className="hdc-btn hdc-btn-primary w-full">
              Envoyer la demande d’annulation
            </button>
          </section>
        ) : null}

        {step === "done" ? (
          <p className="hdc-card mt-6 p-5 text-base leading-relaxed text-catalog-ink">
            Votre demande est envoyée. Nous revenons vers vous au plus vite.
          </p>
        ) : null}
      </main>
    </PublicAppShell>
  );
}
