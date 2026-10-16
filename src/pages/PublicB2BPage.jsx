import { useEffect, useMemo, useState } from "react";
import { Building2, LogOut, Search, ShoppingBag, Trash2 } from "lucide-react";
import { GuestHeaderButton, PublicAppShell } from "../components/public/PublicAppShell";
import { HdLoader } from "../components/public/GuestPageLoader";
import { Sheet, SheetFooter, SheetHeader } from "../components/public/PublicUI";
import {
  CatalogueActivityCard,
  CatalogueActivityCardSkeleton,
} from "../components/public/CatalogueActivityCard";
import { displayActivityName, getPublicCategoryLabel } from "../components/public/catalogueDisplay";
import { supabase, __SUPABASE_DEBUG__ } from "../lib/supabase";
import { CATEGORIES, SITE_KEY } from "../constants";
import { getActivityPublicProse } from "../utils/activityHelpers";
import { normalizeCatalogImageUrlsFromDb } from "../utils/catalogContent";
import { getMinDepartureDate, isCatalogueStayTooShort } from "../utils/publicCatalogueStayStorage";
import {
  b2bCartKey,
  b2bSetupMessage,
  clearB2BSession,
  loadB2BSession,
  loginB2B,
  saveB2BSession,
  submitB2BAccessRequest,
  submitB2BQuote,
} from "../utils/b2b";

const EMPTY_REQUEST = {
  firstName: "",
  lastName: "",
  email: "",
  companyName: "",
  legalName: "",
  siret: "",
  message: "",
};

const EMPTY_CLIENT = {
  name: "",
  phone: "",
  email: "",
  hotel: "",
  arrivalDate: "",
  departureDate: "",
  notes: "",
};

function normalizeCategory(rawCategory) {
  const value = String(rawCategory || "").trim();
  return CATEGORIES.some((category) => category.key === value) ? value : "desert";
}

function dayAfter(iso) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDay(iso) {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function loadCart(accountId) {
  try {
    const raw = sessionStorage.getItem(b2bCartKey(accountId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function PublicB2BPage() {
  const [session, setSession] = useState(() => loadB2BSession());

  function handleLoggedIn(next) {
    saveB2BSession(next);
    setSession(next);
  }

  function handleLogout() {
    clearB2BSession();
    setSession(null);
  }

  if (!session) {
    return <B2BLogin onLoggedIn={handleLoggedIn} />;
  }

  return <B2BCatalog session={session} onLogout={handleLogout} />;
}

function B2BLogin({ onLoggedIn }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [request, setRequest] = useState(EMPTY_REQUEST);
  const [requestError, setRequestError] = useState("");
  const [requestSent, setRequestSent] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const next = await loginB2B(login, password);
      if (!next) {
        setError("Identifiant ou mot de passe incorrect.");
        return;
      }
      onLoggedIn(next);
    } catch (err) {
      setError(b2bSetupMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRequest(e) {
    e.preventDefault();
    setRequestError("");
    const siret = request.siret.replace(/\s/g, "");
    if (!/^\d{14}$/.test(siret)) {
      setRequestError("Le SIRET doit contenir 14 chiffres.");
      return;
    }
    setBusy(true);
    try {
      await submitB2BAccessRequest({ ...request, siret });
      setRequestSent(true);
      setRequest(EMPTY_REQUEST);
    } catch (err) {
      setRequestError(b2bSetupMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PublicAppShell title="Agences" revealKey="b2b-login">
      <section className="px-4 pb-16 pt-6">
        <p className="hdc-eyebrow">Espace agences</p>
        <h1 className="mt-2 font-catalog-display text-[2.4rem] leading-[1.05] text-catalog-ink">
          Le catalogue professionnel
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-catalog-muted">
          Les prix ne s’affichent pas. Vous composez la demande de votre client, Hurghada Dream vous répond avec un devis agence.
        </p>

        <form onSubmit={handleLogin} className="mt-8 space-y-3 rounded-[1.5rem] bg-white p-5 ring-1 ring-catalog-line">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-catalog-lagoonSoft text-catalog-lagoon">
              <Building2 className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-bold text-catalog-ink">Connexion</p>
              <p className="text-xs text-catalog-muted">Identifiant remis par Hurghada Dream</p>
            </div>
          </div>
          {error ? (
            <p className="rounded-2xl bg-catalog-coralSoft px-4 py-3 text-sm font-semibold text-catalog-coralDeep" role="alert">
              {error}
            </p>
          ) : null}
          <label className="block text-sm font-bold text-catalog-ink">
            Identifiant
            <input value={login} onChange={(e) => setLogin(e.target.value)} required autoComplete="username" className="hdc-input mt-1.5" />
          </label>
          <label className="block text-sm font-bold text-catalog-ink">
            Mot de passe
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="hdc-input mt-1.5"
            />
          </label>
          <button type="submit" disabled={busy} className="hdc-btn hdc-btn-primary w-full min-h-[3.25rem]">
            {busy ? "Connexion…" : "Entrer dans le catalogue"}
          </button>
          <button type="button" onClick={() => { setRequestOpen(true); setRequestSent(false); }} className="hdc-btn w-full min-h-11">
            Demander un identifiant
          </button>
        </form>
      </section>

      {requestOpen ? (
        <Sheet variant="bottom" onClose={() => setRequestOpen(false)} labelledBy="b2b-request-title" as="form" panelProps={{ onSubmit: handleRequest }}>
          <SheetHeader eyebrow="Nouvel accès" title="Demande d’identifiant" titleId="b2b-request-title" onClose={() => setRequestOpen(false)} />
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-4 sm:px-6">
            {requestSent ? (
              <p className="rounded-2xl bg-catalog-lagoonSoft px-4 py-3 text-sm font-semibold text-catalog-ink">
                Demande envoyée. Hurghada Dream vous transmettra un identifiant après vérification.
              </p>
            ) : null}
            {requestError ? (
              <p className="rounded-2xl bg-catalog-coralSoft px-4 py-3 text-sm font-semibold text-catalog-coralDeep" role="alert">
                {requestError}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prénom" value={request.firstName} onChange={(v) => setRequest((f) => ({ ...f, firstName: v }))} />
              <Field label="Nom" value={request.lastName} onChange={(v) => setRequest((f) => ({ ...f, lastName: v }))} />
            </div>
            <Field label="E-mail" type="email" value={request.email} onChange={(v) => setRequest((f) => ({ ...f, email: v }))} />
            <Field label="Société" value={request.companyName} onChange={(v) => setRequest((f) => ({ ...f, companyName: v }))} />
            <Field label="Raison sociale" value={request.legalName} onChange={(v) => setRequest((f) => ({ ...f, legalName: v }))} />
            <Field label="SIRET" value={request.siret} onChange={(v) => setRequest((f) => ({ ...f, siret: v }))} inputMode="numeric" />
            <label className="block text-sm font-bold text-catalog-ink">
              Description / demande
              <textarea
                required
                rows={4}
                value={request.message}
                onChange={(e) => setRequest((f) => ({ ...f, message: e.target.value }))}
                className="hdc-input mt-1.5 min-h-28"
              />
            </label>
          </div>
          <SheetFooter>
            <button type="submit" disabled={busy || requestSent} className="hdc-btn hdc-btn-primary w-full min-h-[3.25rem]">
              {requestSent ? "Demande envoyée" : "Envoyer la demande"}
            </button>
          </SheetFooter>
        </Sheet>
      ) : null}
    </PublicAppShell>
  );
}

function Field({ label, value, onChange, type = "text", inputMode, required = true }) {
  return (
    <label className="block text-sm font-bold text-catalog-ink">
      {label}
      <input
        type={type}
        inputMode={inputMode}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="hdc-input mt-1.5"
      />
    </label>
  );
}

function B2BCatalog({ session, onLogout }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [cart, setCart] = useState(() => loadCart(session.id));
  const [cartOpen, setCartOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [client, setClient] = useState(EMPTY_CLIENT);
  const [checkoutError, setCheckoutError] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    sessionStorage.setItem(b2bCartKey(session.id), JSON.stringify(cart));
  }, [cart, session.id]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!supabase || !__SUPABASE_DEBUG__.isConfigured) {
        setError("Base indisponible actuellement.");
        setLoading(false);
        return;
      }
      let { data, error: fetchError } = await supabase
        .from("activities")
        .select("*")
        .eq("site_key", SITE_KEY)
        .order("name", { ascending: true });
      if (!fetchError && (!data || data.length === 0)) {
        const retry = await supabase.from("activities").select("*").order("name", { ascending: true });
        if (!retry.error && Array.isArray(retry.data) && retry.data.length > 0) data = retry.data;
      }
      if (cancelled) return;
      if (fetchError) setError(fetchError.message);
      setActivities((data || []).filter((activity) => activity?.catalog_paused !== true));
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr");
    return activities.filter((activity) => {
      if (category !== "all" && normalizeCategory(activity.category) !== category) return false;
      if (!needle) return true;
      return String(activity.name || "").toLocaleLowerCase("fr").includes(needle);
    });
  }, [activities, category, query]);

  function addDraft() {
    if (!draft?.date) return;
    setCart((lines) => [
      ...lines,
      {
        id: `${draft.activity.id}-${Date.now()}`,
        activityId: draft.activity.id,
        activityName: displayActivityName(draft.activity.name),
        date: draft.date,
        adults: Math.max(0, Number(draft.adults) || 0),
        children: Math.max(0, Number(draft.children) || 0),
        babies: Math.max(0, Number(draft.babies) || 0),
        note: String(draft.note || "").trim(),
      },
    ]);
    setDraft(null);
    setCartOpen(true);
  }

  async function handleSend(e) {
    e.preventDefault();
    setCheckoutError("");
    if (cart.length === 0) {
      setCheckoutError("Ajoutez au moins une activité.");
      return;
    }
    if (isCatalogueStayTooShort(client)) {
      setCheckoutError("Le séjour du client doit durer au minimum 2 jours : arrivée le 18, départ le 20.");
      return;
    }
    const firstActivityDay = dayAfter(client.arrivalDate);
    const outside = cart.find((line) => line.date < firstActivityDay || line.date > client.departureDate);
    if (outside) {
      setCheckoutError(`${outside.activityName} est en dehors du séjour (à partir du lendemain de l’arrivée, jusqu’au départ).`);
      return;
    }
    setSending(true);
    try {
      await submitB2BQuote({
        account_id: session.id,
        agency_name: session.companyName || session.login,
        agency_login: session.login,
        client_name: client.name.trim(),
        client_phone: client.phone.trim(),
        client_email: client.email.trim(),
        client_hotel: client.hotel.trim(),
        arrival_date: client.arrivalDate,
        departure_date: client.departureDate,
        notes: client.notes.trim(),
        items: cart.map(({ id, ...line }) => line),
        status: "new",
      });
      setCart([]);
      setClient(EMPTY_CLIENT);
      setSent(true);
    } catch (err) {
      setCheckoutError(b2bSetupMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <PublicAppShell
      title="Catalogue agences"
      wide="xl"
      revealKey="b2b-catalog"
      right={
        <div className="flex items-center gap-2">
          <GuestHeaderButton onClick={() => setCartOpen(true)} count={cart.length} ariaLabel="Panier agence">
            <ShoppingBag className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Panier</span>
          </GuestHeaderButton>
          <button type="button" onClick={onLogout} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white px-3 text-sm font-bold text-catalog-ink ring-1 ring-catalog-border">
            <LogOut className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Sortir</span>
          </button>
        </div>
      }
    >
      <section className="px-4 pb-4 pt-6 lg:px-0">
        <p className="hdc-eyebrow">{session.companyName || session.login}</p>
        <h1 className="mt-2 font-catalog-display text-[2.2rem] leading-[1.05] text-catalog-ink lg:text-[3rem]">
          Composez la demande
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-catalog-muted">
          Aucun prix n’est affiché. Ajoutez les activités du client, puis validez avec ses coordonnées. Le devis professionnel arrive dans l’intranet.
        </p>
        <label className="mt-6 flex min-h-12 items-center gap-2 rounded-full bg-white px-4 ring-1 ring-catalog-line">
          <Search className="h-4 w-4 text-catalog-muted" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une excursion"
            className="h-12 w-full bg-transparent text-sm outline-none"
          />
        </label>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          <FilterChip active={category === "all"} onClick={() => setCategory("all")}>Toutes</FilterChip>
          {CATEGORIES.map((item) => (
            <FilterChip key={item.key} active={category === item.key} onClick={() => setCategory(item.key)}>
              {getPublicCategoryLabel(item.key)}
            </FilterChip>
          ))}
        </div>
      </section>

      <section className="px-4 pb-24 lg:px-0">
        {error ? <p className="mb-4 rounded-2xl bg-catalog-coralSoft px-4 py-3 text-sm font-semibold text-catalog-coralDeep">{error}</p> : null}
        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {Array.from({ length: 6 }, (_, i) => <CatalogueActivityCardSkeleton key={i} />)}
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {visible.map((activity) => (
              <CatalogueActivityCard
                key={activity.id}
                activity={activity}
                categoryKey={normalizeCategory(activity.category)}
                coverUrl={normalizeCatalogImageUrlsFromDb(activity.catalog_image_urls)[0] || null}
                prose={getActivityPublicProse(activity)}
                onAdd={(item) => setDraft({ activity: item, date: "", adults: 2, children: 0, babies: 0, note: "" })}
                ctaLabel="Ajouter"
              />
            ))}
          </div>
        )}
        {!loading && visible.length === 0 ? (
          <p className="mt-8 text-sm text-catalog-muted">Aucune excursion ne correspond à cette recherche.</p>
        ) : null}
      </section>

      {draft ? (
        <Sheet variant="bottom" onClose={() => setDraft(null)} labelledBy="b2b-add-title">
          <SheetHeader eyebrow="Sans prix affiché" title={displayActivityName(draft.activity.name)} titleId="b2b-add-title" onClose={() => setDraft(null)} />
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 pb-4 sm:px-6">
            <p className="text-sm leading-relaxed text-catalog-muted">Le tarif professionnel sera calculé sur le devis, pas ici.</p>
            <label className="block text-sm font-bold text-catalog-ink">
              Date de l’activité
              <input type="date" required value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} className="hdc-input mt-1.5" />
            </label>
            <div className="grid grid-cols-3 gap-3">
              <CountField label="Adultes" value={draft.adults} onChange={(adults) => setDraft((d) => ({ ...d, adults }))} />
              <CountField label="Enfants" value={draft.children} onChange={(children) => setDraft((d) => ({ ...d, children }))} />
              <CountField label="Bébés" value={draft.babies} onChange={(babies) => setDraft((d) => ({ ...d, babies }))} />
            </div>
            <label className="block text-sm font-bold text-catalog-ink">
              Note
              <input value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} className="hdc-input mt-1.5" />
            </label>
          </div>
          <SheetFooter>
            <button type="button" disabled={!draft.date} onClick={addDraft} className="hdc-btn hdc-btn-primary w-full min-h-[3.25rem]">
              Ajouter au panier
            </button>
          </SheetFooter>
        </Sheet>
      ) : null}

      {cartOpen ? (
        <Sheet variant="right" onClose={() => { setCartOpen(false); setSent(false); }} labelledBy="b2b-cart-title" as="form" panelProps={{ onSubmit: handleSend }}>
          <SheetHeader eyebrow={session.companyName || "Agence"} title="Demande de devis" titleId="b2b-cart-title" onClose={() => setCartOpen(false)} />
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4 sm:px-6">
            {sent ? (
              <p className="rounded-2xl bg-catalog-lagoonSoft px-4 py-3 text-sm font-semibold text-catalog-ink">
                Demande envoyée. Elle apparaît dans Devis B2B sur l’intranet.
              </p>
            ) : null}
            {cart.length === 0 ? <p className="text-sm text-catalog-muted">Le panier est vide.</p> : null}
            {cart.map((line) => (
              <div key={line.id} className="flex items-start justify-between gap-3 rounded-2xl bg-catalog-bg px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-catalog-ink">{line.activityName}</p>
                  <p className="mt-1 text-xs text-catalog-muted">
                    {formatDay(line.date)} · {line.adults} adulte{line.adults > 1 ? "s" : ""} · {line.children} enfant{line.children > 1 ? "s" : ""}
                    {line.babies ? ` · ${line.babies} bébé${line.babies > 1 ? "s" : ""}` : ""}
                  </p>
                  {line.note ? <p className="mt-1 text-xs text-catalog-body">{line.note}</p> : null}
                </div>
                <button type="button" aria-label="Retirer" onClick={() => setCart((lines) => lines.filter((item) => item.id !== line.id))} className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-catalog-ink">
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nom du client" value={client.name} onChange={(name) => setClient((c) => ({ ...c, name }))} />
              <Field label="Téléphone" type="tel" value={client.phone} onChange={(phone) => setClient((c) => ({ ...c, phone }))} />
            </div>
            <Field label="E-mail" type="email" required={false} value={client.email} onChange={(email) => setClient((c) => ({ ...c, email }))} />
            <Field label="Hôtel" required={false} value={client.hotel} onChange={(hotel) => setClient((c) => ({ ...c, hotel }))} />
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-bold text-catalog-ink">
                Arrivée
                <input type="date" required value={client.arrivalDate} onChange={(e) => setClient((c) => ({ ...c, arrivalDate: e.target.value }))} className="hdc-input mt-1.5" />
              </label>
              <label className="block text-sm font-bold text-catalog-ink">
                Départ
                <input
                  type="date"
                  required
                  min={getMinDepartureDate(client.arrivalDate) || undefined}
                  value={client.departureDate}
                  onChange={(e) => setClient((c) => ({ ...c, departureDate: e.target.value }))}
                  className="hdc-input mt-1.5"
                />
              </label>
            </div>
            <label className="block text-sm font-bold text-catalog-ink">
              Notes
              <textarea rows={3} value={client.notes} onChange={(e) => setClient((c) => ({ ...c, notes: e.target.value }))} className="hdc-input mt-1.5" />
            </label>
            {checkoutError ? <p className="rounded-2xl bg-catalog-coralSoft px-4 py-3 text-sm font-semibold text-catalog-coralDeep">{checkoutError}</p> : null}
          </div>
          <SheetFooter>
            <button type="submit" disabled={sending || cart.length === 0} className="hdc-btn hdc-btn-primary w-full min-h-[3.25rem]">
              {sending ? "Envoi…" : "Valider la demande"}
            </button>
          </SheetFooter>
        </Sheet>
      ) : null}
    </PublicAppShell>
  );
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold ${
        active ? "bg-catalog-ink text-white" : "bg-white text-catalog-ink ring-1 ring-catalog-line"
      }`}
    >
      {children}
    </button>
  );
}

function CountField({ label, value, onChange }) {
  return (
    <label className="block text-sm font-bold text-catalog-ink">
      {label}
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="hdc-input mt-1.5"
      />
    </label>
  );
}
