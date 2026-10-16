import { useEffect, useMemo, useState } from "react";
import { PrimaryBtn } from "../components/ui";
import {
  b2bSetupMessage,
  createB2BAccount,
  listB2BAccounts,
  listB2BRequests,
  resetB2BPassword,
  setB2BAccountActive,
  updateB2BRequestStatus,
} from "../utils/b2b";

const EMPTY_ACCOUNT = {
  requestId: "",
  login: "",
  password: "",
  companyName: "",
  contactName: "",
  email: "",
};

function formatWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function suggestLogin(company) {
  return String(company || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "")
    .slice(0, 32);
}

export function B2BAccessPage() {
  const [requests, setRequests] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(EMPTY_ACCOUNT);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [passwordDrafts, setPasswordDrafts] = useState({});

  const pendingCount = useMemo(() => requests.filter((row) => row.status === "pending").length, [requests]);

  async function reload() {
    const [nextRequests, nextAccounts] = await Promise.all([listB2BRequests(), listB2BAccounts()]);
    setRequests(nextRequests);
    setAccounts(nextAccounts);
  }

  useEffect(() => {
    let cancelled = false;
    reload().catch((err) => {
      if (!cancelled) setError(b2bSetupMessage(err));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function prefill(request) {
    setForm({
      requestId: request.id,
      login: suggestLogin(request.company_name),
      password: "",
      companyName: request.company_name || "",
      contactName: `${request.first_name || ""} ${request.last_name || ""}`.trim(),
      email: request.email || "",
    });
    setNotice(`Formulaire prérempli pour ${request.company_name}. Choisissez l’identifiant et le mot de passe à leur envoyer.`);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (form.password.length < 4) {
      setError("Le mot de passe doit faire au moins 4 caractères.");
      return;
    }
    setBusy(true);
    try {
      await createB2BAccount(form);
      setNotice(`Accès créé pour ${form.login}. Transmettez cet identifiant et ce mot de passe à l’agence : il ne sera plus affiché.`);
      setForm(EMPTY_ACCOUNT);
      await reload();
    } catch (err) {
      setError(b2bSetupMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleStatus(id, status) {
    setError("");
    try {
      await updateB2BRequestStatus(id, status);
      await reload();
    } catch (err) {
      setError(b2bSetupMessage(err));
    }
  }

  async function handleActive(account) {
    setError("");
    try {
      await setB2BAccountActive(account.id, !account.active);
      await reload();
    } catch (err) {
      setError(b2bSetupMessage(err));
    }
  }

  async function handlePassword(account) {
    const password = String(passwordDrafts[account.id] || "");
    if (password.length < 4) {
      setError("Le nouveau mot de passe doit faire au moins 4 caractères.");
      return;
    }
    setError("");
    try {
      await resetB2BPassword(account.id, password);
      setPasswordDrafts((prev) => ({ ...prev, [account.id]: "" }));
      setNotice(`Nouveau mot de passe enregistré pour ${account.login}. Envoyez-le à l’agence maintenant : il n’est pas conservé en clair.`);
    } catch (err) {
      setError(b2bSetupMessage(err));
    }
  }

  return (
    <div className="space-y-8">
      {error ? <p className="rounded-2xl border-2 border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">{error}</p> : null}
      {notice ? <p className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-950">{notice}</p> : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)]">
        <div className="space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-indigo-600">Demandes</p>
              <h2 className="text-xl font-bold text-slate-950">Identifiants demandés</h2>
            </div>
            <span className="rounded-full bg-rose-500 px-3 py-1 text-xs font-black text-white">{pendingCount} en attente</span>
          </div>
          {requests.length === 0 ? <p className="rounded-2xl bg-white px-4 py-6 text-sm text-slate-500 ring-1 ring-slate-200">Aucune demande pour le moment.</p> : null}
          {requests.map((request) => (
            <article key={request.id} className="rounded-2xl border-2 border-indigo-100 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-bold text-slate-950">{request.company_name}</p>
                  <p className="text-sm text-slate-600">
                    {request.first_name} {request.last_name} · {request.email}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {request.legal_name} · SIRET {request.siret} · {formatWhen(request.created_at)}
                  </p>
                </div>
                <StatusPill status={request.status} />
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{request.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <PrimaryBtn type="button" className="!min-h-0 !px-3 !py-2 !text-sm" onClick={() => prefill(request)}>
                  Créer l’accès
                </PrimaryBtn>
                {request.status !== "refused" ? (
                  <button type="button" onClick={() => handleStatus(request.id, "refused")} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                    Refuser
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>

        <form onSubmit={handleCreate} className="h-fit space-y-3 rounded-2xl border-2 border-indigo-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-indigo-600">Création</p>
          <h2 className="text-xl font-bold text-slate-950">Nouvel accès agence</h2>
          <IntranetField label="Identifiant" value={form.login} onChange={(login) => setForm((f) => ({ ...f, login }))} />
          <IntranetField label="Mot de passe" type="text" value={form.password} onChange={(password) => setForm((f) => ({ ...f, password }))} />
          <IntranetField label="Société" value={form.companyName} onChange={(companyName) => setForm((f) => ({ ...f, companyName }))} />
          <IntranetField label="Contact" value={form.contactName} onChange={(contactName) => setForm((f) => ({ ...f, contactName }))} />
          <IntranetField label="E-mail" type="email" value={form.email} onChange={(email) => setForm((f) => ({ ...f, email }))} />
          <PrimaryBtn type="submit" disabled={busy} className="w-full">
            {busy ? "Création…" : "Créer l’accès"}
          </PrimaryBtn>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-bold text-slate-950">Accès existants</h2>
        {accounts.length === 0 ? <p className="rounded-2xl bg-white px-4 py-6 text-sm text-slate-500 ring-1 ring-slate-200">Aucun accès créé.</p> : null}
        <div className="grid gap-3">
          {accounts.map((account) => (
            <article key={account.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-950">{account.company_name}</p>
                  <p className="text-sm text-slate-600">
                    Identifiant <span className="font-mono font-bold text-indigo-800">{account.login}</span>
                    {account.contact_name ? ` · ${account.contact_name}` : ""} · {account.email}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Créé le {formatWhen(account.created_at)}</p>
                </div>
                <button type="button" onClick={() => handleActive(account)} className={`rounded-full px-3 py-1 text-xs font-bold ${account.active ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-700"}`}>
                  {account.active ? "Actif · désactiver" : "Inactif · réactiver"}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  value={passwordDrafts[account.id] || ""}
                  onChange={(e) => setPasswordDrafts((prev) => ({ ...prev, [account.id]: e.target.value }))}
                  placeholder="Nouveau mot de passe"
                  className="min-w-[14rem] flex-1 rounded-xl border-2 border-indigo-100 px-3 py-2 text-sm"
                />
                <button type="button" onClick={() => handlePassword(account)} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
                  Changer le mot de passe
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatusPill({ status }) {
  const label = status === "approved" ? "Accès créé" : status === "refused" ? "Refusée" : "En attente";
  const tone = status === "approved" ? "bg-emerald-100 text-emerald-900" : status === "refused" ? "bg-slate-200 text-slate-700" : "bg-amber-100 text-amber-950";
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{label}</span>;
}

function IntranetField({ label, value, onChange, type = "text" }) {
  return (
    <label className="block text-xs font-bold uppercase tracking-wide text-indigo-950">
      {label}
      <input
        type={type}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-xl border-2 border-indigo-200/90 bg-white px-3 py-2.5 text-sm font-medium normal-case tracking-normal text-slate-900"
      />
    </label>
  );
}
