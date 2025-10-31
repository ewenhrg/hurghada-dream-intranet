import React, { useEffect, useMemo, useState } from "react";
import { supabase, SITE_KEY as SB_SITE_KEY } from "./lib/supabase";

/* ================== Constantes ================== */
const SITE_KEY = SB_SITE_KEY || "hurghada_dream_0606";
const PIN_CODE = "0606";
const LS = { activities: "hd_activities", quotes: "hd_quotes_cache" };

const WEEKDAYS = [
  { key: 0, label: "Dim" },
  { key: 1, label: "Lun" },
  { key: 2, label: "Mar" },
  { key: 3, label: "Mer" },
  { key: 4, label: "Jeu" },
  { key: 5, label: "Ven" },
  { key: 6, label: "Sam" },
];

const CATEGORIES = [
  { key: "desert", label: "Désert" },
  { key: "aquatique", label: "Aquatique" },
  { key: "exploration_bien_etre", label: "Exploration / Bien-être" },
];

const NEIGHBORHOODS = [
  { key: "soma_bay", label: "soma bay" },
  { key: "makadi", label: "makadi" },
  { key: "salh_hasheesh", label: "salh hasheesh" },
  { key: "el_gouna", label: "el gouna" },
  { key: "hurghada_cora", label: "hurghada cora" },
  { key: "hurghada_kawther", label: "hurghada kawther" },
  { key: "hurghada_sheraton", label: "hurghada sheraton" },
  { key: "hurghada_arabia", label: "hurghada arabia" },
];

/* ================== Utils ================== */
const loadLS = (k, f) => {
  try {
    const r = localStorage.getItem(k);
    return r ? JSON.parse(r) : f;
  } catch {
    return f;
  }
};
const saveLS = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};
const uuid = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `hd-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`);

const currency = (n, c = "EUR") => {
  if (n === undefined || n === null || Number.isNaN(Number(n))) return "—";
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: c }).format(Number(n));
  } catch {
    return `${Number(n).toFixed(2)} ${c}`;
  }
};
const classNames = (...a) => a.filter(Boolean).join(" ");
const nice = (s) => (s || "").replaceAll("_", " ");

/* ============ WhatsApp (sans lien paiement) ============ */
function buildWhatsAppLinkForQuote(q) {
  const phoneDigits = (q?.client?.phone || "").replace(/\D+/g, "");
  const lines = (q?.items || [])
    .map(
      (li) =>
        `• ${li.activityName} — ${new Date(li.date + "T12:00:00").toLocaleDateString("fr-FR")} (${li.adults}A/${li.children}E/${li.babies}B)` +
        `${li.slot ? ` ${li.slot === "morning" ? "Matin" : "Après-midi"}` : ""}` +
        `${li.withDolphin ? " [Dauphin]" : ""}`,
    )
    .join("\n");

  const text =
    `Bonjour ${q?.client?.name || ""} !\n` +
    `Voici votre devis Hurghada Dream :\n` +
    `${lines}\n` +
    `Total: ${currency(q.total, q.currency)}\n` +
    `Dites-moi si vous souhaitez modifier quelque chose.`;

  const base = phoneDigits ? `https://wa.me/${phoneDigits}` : `https://api.whatsapp.com/send`;
  return `${base}?text=${encodeURIComponent(text)}`;
}

/* ============ Helpers transferts ============ */
function emptyTransfers() {
  const o = {};
  for (const n of NEIGHBORHOODS) {
    // surcharge en STRING pour permettre champ vide (plus de "0" bloqué)
    o[n.key] = { morningEnabled: false, morningTime: "", afternoonEnabled: false, afternoonTime: "", surcharge: "" };
  }
  return o;
}
const normalizeTransfers = (t) => {
  const base = emptyTransfers();
  const v = { ...base, ...(t || {}) };
  for (const k of Object.keys(v)) {
    const r = v[k] || {};
    v[k] = {
      morningEnabled: !!r.morningEnabled,
      morningTime: r.morningTime || "",
      afternoonEnabled: !!r.afternoonEnabled,
      afternoonTime: r.afternoonTime || "",
      surcharge:
        r.surcharge === 0 || r.surcharge === null || r.surcharge === undefined || r.surcharge === ""
          ? ""
          : String(r.surcharge),
    };
  }
  return v;
};

/* ============ Données par défaut (fallback local) ============ */
const DEFAULT_ACTIVITIES = [
  {
    id: uuid(),
    category: "desert",
    name: "Safari Désert (Quad)",
    priceAdult: 30,
    priceChild: 22,
    priceBaby: 0,
    currency: "EUR",
    notes: "Transfert inclus, 3 h",
    availableDays: [false, true, true, true, true, true, false],
    transfers: emptyTransfers(),
  },
];

/* ============ Mappers DB <-> FRONT (activités) ============ */
function mapActFromDB(r = {}) {
  return {
    id: r.id,
    category: r.category,
    name: r.name,
    priceAdult: Number(r.priceadult ?? 0),
    priceChild: Number(r.pricechild ?? 0),
    priceBaby: Number(r.pricebaby ?? 0),
    currency: r.currency || "EUR",
    notes: r.notes || "",
    availableDays: Array.isArray(r.availabledays) ? r.availabledays : [false, false, false, false, false, false, false],
    transfers: normalizeTransfers(r.transfers),
  };
}
function mapActToDB(a = {}) {
  return {
    id: a.id,
    site_key: SITE_KEY,
    name: a.name || "",
    category: a.category || "desert",
    priceadult: Number(a.priceAdult ?? 0),
    pricechild: Number(a.priceChild ?? 0),
    pricebaby: Number(a.priceBaby ?? 0),
    currency: a.currency || "EUR",
    notes: a.notes || "",
    availabledays: Array.isArray(a.availableDays) ? a.availableDays : [false, false, false, false, false, false, false],
    transfers: normalizeTransfers(a.transfers),
  };
}

/* ============ Mappers DB <-> FRONT (quotes) ============ */
const mapQuoteFromDB = (r) => ({
  id: r.id,
  createdAt: r.created_at,
  client: r.client,
  notes: r.notes || "",
  items: Array.isArray(r.items) ? r.items : [],
  total: Number(r.total || 0),
  currency: r.currency || "EUR",
  status: r.status || "draft",
  paidAt: r.paid_at || null,
});
const mapQuoteToDB = (q) => ({
  site_key: SITE_KEY,
  client: q.client,
  notes: q.notes || "",
  items: q.items,
  total: Number(q.total || 0),
  currency: q.currency || "EUR",
  status: q.status || "draft",
  paid_at: q.paidAt || null,
});

/* ================== Primitives UI ================== */
const Section = ({ title, subtitle, right = null, children }) => (
  <section className="space-y-4">
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
      <div>
        <h2 className="text-2xl font-bold">{title}</h2>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>
      {right}
    </div>
    <div className="bg-white rounded-2xl shadow p-4 md:p-6 border border-gray-100">{children}</div>
  </section>
);
const Pill = ({ active, children, onClick }) => (
  <button
    onClick={onClick}
    className={classNames(
      "px-3 py-1.5 rounded-full text-sm border",
      active ? "bg-black text-white border-black" : "bg-white text-gray-700 hover:bg-gray-50 border-gray-300",
    )}
  >
    {children}
  </button>
);
const TextInput = (p) => (
  <input
    {...p}
    className={classNames(
      "w-full rounded-xl border px-3 py-2 outline-none",
      "border-gray-300 focus:ring-2 focus:ring-black/10 focus:border-black",
      p.className,
    )}
  />
);
const NumberInput = (p) => (
  <input
    type="number"
    step="0.01"
    inputMode="decimal"
    {...p}
    className={classNames(
      "w-full rounded-xl border px-3 py-2 outline-none",
      "border-gray-300 focus:ring-2 focus:ring-black/10 focus:border-black",
      p.className,
    )}
  />
);
const PrimaryBtn = ({ children, ...p }) => (
  <button
    {...p}
    className={classNames(
      "inline-flex items-center gap-2 rounded-xl px-4 py-2",
      "bg-black text-white shadow hover:opacity-90 active:opacity-80",
      p.className,
    )}
  >
    {children}
  </button>
);
const GhostBtn = ({ children, ...p }) => (
  <button
    type="button"
    {...p}
    className={classNames(
      "inline-flex items-center gap-2 rounded-xl px-4 py-2",
      "border border-gray-300 text-gray-700 bg-white hover:bg-gray-50",
      p.className,
    )}
  >
    {children}
  </button>
);

/* ================== Widgets ================== */
function DaysSelector({ value = [], onChange }) {
  const safe = Array.isArray(value) && value.length === 7 ? value : [false, false, false, false, false, false, false];
  return (
    <div className="flex flex-wrap gap-2">
      {WEEKDAYS.map((d, i) => (
        <label key={i} className="inline-flex items-center gap-2 border rounded-xl px-3 py-1 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={!!safe[i]}
            onChange={(e) => {
              const a = [...safe];
              a[i] = e.target.checked;
              onChange(a);
            }}
          />
          {d.label}
        </label>
      ))}
    </div>
  );
}

function TransfersEditor({ value, onChange }) {
  const v = normalizeTransfers(value);
  return (
    <div className="space-y-3">
      {NEIGHBORHOODS.map((n) => {
        const row = v[n.key];
        return (
          <div key={n.key} className="border rounded-xl p-3">
            <div className="font-medium capitalize">{n.label}</div>
            <div className="grid md:grid-cols-5 gap-3 mt-2 items-end">
              <label className="flex items-center gap-2 md:col-span-2">
                <input
                  type="checkbox"
                  checked={!!row.morningEnabled}
                  onChange={(e) => onChange({ ...v, [n.key]: { ...row, morningEnabled: e.target.checked } })}
                />
                Matin
              </label>
              <TextInput
                type="time"
                value={row.morningTime}
                onChange={(e) => onChange({ ...v, [n.key]: { ...row, morningTime: e.target.value } })}
              />
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!row.afternoonEnabled}
                  onChange={(e) => onChange({ ...v, [n.key]: { ...row, afternoonEnabled: e.target.checked } })}
                />
                Après-midi
              </label>
              <TextInput
                type="time"
                value={row.afternoonTime}
                onChange={(e) => onChange({ ...v, [n.key]: { ...row, afternoonTime: e.target.value } })}
              />
              <div className="md:col-span-1">
                <label className="text-sm text-gray-600">Supplément (par adulte)</label>
                <NumberInput
                  value={row.surcharge ?? ""}
                  onChange={(e) => onChange({ ...v, [n.key]: { ...row, surcharge: e.target.value } })}
                  placeholder="0"
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ================== Pages ================== */
function ActivitiesPage({ activities, setActivities }) {
  const [form, setForm] = useState({
    name: "",
    priceAdult: "",
    priceChild: "",
    priceBaby: "",
    currency: "EUR",
    notes: "",
    category: "desert",
    availableDays: [false, false, false, false, false, false, false],
    transfers: emptyTransfers(),
  });
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit] = useState(null);

  async function addActivity(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const newA = {
      id: uuid(),
      name: form.name.trim(),
      priceAdult: Number(form.priceAdult || 0),
      priceChild: Number(form.priceChild || 0),
      priceBaby: Number(form.priceBaby || 0),
      currency: form.currency || "EUR",
      availableDays: form.availableDays,
      notes: form.notes?.trim() || "",
      category: form.category,
      transfers: normalizeTransfers(form.transfers),
    };
    try {
      const { data, error } = await supabase.from("activities").insert([mapActToDB(newA)]).select("*").single();
      if (error) throw new Error(error.message);
      setActivities((p) => [mapActFromDB(data), ...p]);
    } catch (err) {
      alert("Erreur Supabase (création) : " + err.message + "\nL’activité sera tout de même ajoutée en local.");
      setActivities((p) => [newA, ...p]);
    }
    setForm({
      name: "",
      priceAdult: "",
      priceChild: "",
      priceBaby: "",
      currency: form.currency,
      notes: "",
      category: "desert",
      availableDays: [false, false, false, false, false, false, false],
      transfers: emptyTransfers(),
    });
    setShowForm(false);
  }

  async function updateActivity(e) {
    e.preventDefault();
    if (!edit) return;
    try {
      const { data, error } = await supabase
        .from("activities")
        .update(mapActToDB(edit))
        .eq("id", edit.id)
        .eq("site_key", SITE_KEY)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      setActivities((p) => p.map((a) => (a.id === edit.id ? mapActFromDB(data) : a)));
    } catch (err) {
      alert("Erreur Supabase (modification) : " + err.message + "\nLa modification sera appliquée en local.");
      setActivities((p) => p.map((a) => (a.id === edit.id ? edit : a)));
    }
    setEdit(null);
  }

  async function removeActivity(id) {
    if (!confirm("Supprimer cette activité ?")) return;
    setActivities((p) => p.filter((a) => a.id !== id));
    try {
      const { error } = await supabase.from("activities").delete().eq("id", id).eq("site_key", SITE_KEY);
      if (error) alert("Erreur Supabase (suppression) : " + error.message + "\nL’activité a été retirée localement.");
    } catch {}
  }

  const grouped = useMemo(() => {
    const g = CATEGORIES.reduce((acc, c) => ({ ...acc, [c.key]: [] }), {});
    for (const a of activities)
      (g[CATEGORIES.find((c) => c.key === a.category) ? a.category : "desert"] || g.desert).push(a);
    Object.keys(g).forEach((k) => g[k].sort((x, y) => x.name.localeCompare(y.name, "fr")));
    return g;
  }, [activities]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-gray-600">Gérez les activités, jours, transferts et prix.</div>
        <PrimaryBtn onClick={() => setShowForm((s) => !s)}>{showForm ? "Fermer" : "Ajouter une activité"}</PrimaryBtn>
      </div>

      {showForm && (
        <form onSubmit={addActivity} className="space-y-3 bg-gray-50 p-4 rounded-xl border">
          <div className="grid md:grid-cols-2 gap-3">
            <TextInput
              placeholder="Nom de l'activité"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <select
              className="w-full rounded-xl border px-3 py-2 border-gray-300 focus:ring-2 focus:ring-black/10 focus:border-black"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid md:grid-cols-4 gap-3">
            <NumberInput
              placeholder="Prix adulte"
              value={form.priceAdult}
              onChange={(e) => setForm({ ...form, priceAdult: e.target.value })}
            />
            <NumberInput
              placeholder="Prix enfant"
              value={form.priceChild}
              onChange={(e) => setForm({ ...form, priceChild: e.target.value })}
            />
            <NumberInput
              placeholder="Prix bébé"
              value={form.priceBaby}
              onChange={(e) => setForm({ ...form, priceBaby: e.target.value })}
            />
            <TextInput
              placeholder="Devise (ex: EUR)"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
            />
          </div>
          <div>
            <label className="text-sm text-gray-600">Jours disponibles</label>
            <DaysSelector value={form.availableDays} onChange={(v) => setForm({ ...form, availableDays: v })} />
          </div>
          <div>
            <label className="text-sm text-gray-600">Transferts par quartier (matin / après-midi + supplément/adulte)</label>
            <TransfersEditor value={form.transfers} onChange={(v) => setForm({ ...form, transfers: v })} />
          </div>
          <TextInput
            placeholder="Notes (facultatif)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <div className="flex justify-end">
            <PrimaryBtn type="submit">Ajouter</PrimaryBtn>
          </div>
        </form>
      )}

      {edit && (
        <form onSubmit={updateActivity} className="space-y-3 bg-amber-50 p-4 rounded-2xl border border-amber-200">
          <div className="text-sm font-medium">Modifier: {edit.name}</div>
          <div className="grid md:grid-cols-2 gap-3">
            <TextInput value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <select
              className="w-full rounded-xl border px-3 py-2 border-gray-300 focus:ring-2 focus:ring-black/10 focus:border-black"
              value={edit.category}
              onChange={(e) => setEdit({ ...edit, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid md:grid-cols-4 gap-3">
            <NumberInput
              value={edit.priceAdult}
              onChange={(e) => setEdit({ ...edit, priceAdult: Number(e.target.value) || 0 })}
            />
            <NumberInput
              value={edit.priceChild}
              onChange={(e) => setEdit({ ...edit, priceChild: Number(e.target.value) || 0 })}
            />
            <NumberInput value={edit.priceBaby} onChange={(e) => setEdit({ ...edit, priceBaby: Number(e.target.value) || 0 })} />
            <TextInput value={edit.currency} onChange={(e) => setEdit({ ...edit, currency: e.target.value.toUpperCase() })} />
          </div>
          <label className="text-sm text-gray-600">Jours disponibles</label>
          <DaysSelector value={edit.availableDays} onChange={(v) => setEdit({ ...edit, availableDays: v })} />
          <label className="text-sm text-gray-600">Transferts par quartier</label>
          <TransfersEditor value={edit.transfers || emptyTransfers()} onChange={(v) => setEdit({ ...edit, transfers: v })} />
          <TextInput value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
          <div className="flex gap-2 justify-end">
            <GhostBtn onClick={() => setEdit(null)}>Annuler</GhostBtn>
            <PrimaryBtn type="submit">Enregistrer</PrimaryBtn>
          </div>
        </form>
      )}

      {CATEGORIES.map((cat) => (
        <div key={cat.key} className="space-y-2">
          <h3 className="text-lg font-semibold">{cat.label}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-2">Activité</th>
                  <th className="py-2 pr-2">Adulte</th>
                  <th className="py-2 pr-2">Enfant</th>
                  <th className="py-2 pr-2">Bébé</th>
                  <th className="py-2 pr-2">Devise</th>
                  <th className="py-2 pr-2">Jours dispo</th>
                  <th className="py-2 pr-2">Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(grouped[cat.key] || []).map((a) => (
                  <tr key={a.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 pr-2 font-medium">{a.name}</td>
                    <td className="py-2 pr-2">{currency(a.priceAdult, a.currency)}</td>
                    <td className="py-2 pr-2">{currency(a.priceChild, a.currency)}</td>
                    <td className="py-2 pr-2">{currency(a.priceBaby, a.currency)}</td>
                    <td className="py-2 pr-2">{a.currency}</td>
                    <td className="py-2 pr-2">
                      <div className="flex flex-wrap gap-1">
                        {WEEKDAYS.map((d, i) =>
                          a.availableDays[i] ? (
                            <span key={i} className="px-2 py-1 rounded-full bg-green-100 text-green-700 border border-green-200 text-xs">
                              {d.label}
                            </span>
                          ) : null,
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-2 text-gray-600">{a.notes || "—"}</td>
                    <td className="py-2 pr-2 text-right">
                      <div className="flex gap-2 justify-end">
                        <GhostBtn onClick={() => setEdit(a)}>Modifier</GhostBtn>
                        <GhostBtn onClick={() => removeActivity(a.id)}>Supprimer</GhostBtn>
                      </div>
                    </td>
                  </tr>
                ))}
                {(!grouped[cat.key] || grouped[cat.key].length === 0) && (
                  <tr>
                    <td colSpan={8} className="text-center text-gray-400 py-6">
                      Aucune activité dans cette catégorie.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============ Impression (utilisée par Historique) ============ */
function renderQuoteHTML(q, title = "Devis") {
  const rows = q.items
    .map((li) => {
      const supTotal = Number(li.transferSurchargeTotal ?? 0);
      const supPer = Number(li.transferSurchargePer ?? 0);
      const supQty = Number(li.adults || 0);
      const supRow = supTotal
        ? `<tr><td>Supplément transfert</td><td class="right">${supQty}</td><td class="right">${currency(
            supPer,
            q.currency,
          )}</td><td class="right">${currency(supTotal, q.currency)}</td></tr>`
        : "";
      const dolphinRow = li.dolphinFee
        ? `<tr><td>Option « Dauphin »</td><td class="right">1</td><td class="right">${currency(
            li.dolphinFee,
            q.currency,
          )}</td><td class="right">${currency(li.dolphinFee, q.currency)}</td></tr>`
        : "";
      const extraRow = li.extraAmount
        ? `<tr><td>${li.extraLabel || "Extra"}</td><td class="right">1</td><td class="right">${currency(
            li.extraAmount,
            q.currency,
          )}</td><td class="right">${currency(li.extraAmount, q.currency)}</td></tr>`
        : "";
      const ticketBadge = li.ticketNo ? ` — Ticket: ${li.ticketNo}` : "";
      const head = `${li.activityName} — ${new Date(li.date + "T12:00:00").toLocaleDateString("fr-FR")}
${li.neighborhood ? `Quartier: ${nice(li.neighborhood)}` : ""}${li.slot ? ` — Créneau: ${li.slot === "morning" ? "Matin" : "Après-midi"}` : ""}${li.pickupTime ? ` — Prise en charge: ${li.pickupTime}` : ""}${ticketBadge}`;
      return `
      <tr><td colspan="4"><b>${head}</b></td></tr>
      <tr><td>Adultes</td><td class="right">${li.adults}</td><td class="right">${currency(
        li.priceAdult,
        q.currency,
      )}</td><td class="right">${currency(li.adults * li.priceAdult, q.currency)}</td></tr>
      <tr><td>Enfants</td><td class="right">${li.children}</td><td class="right">${currency(
        li.priceChild,
        q.currency,
      )}</td><td class="right">${currency(li.children * li.priceChild, q.currency)}</td></tr>
      <tr><td>Bébés</td><td class="right">${li.babies}</td><td class="right">${currency(
        li.priceBaby,
        q.currency,
      )}</td><td class="right">${currency(li.babies * li.priceBaby, q.currency)}</td></tr>
      ${supRow}${dolphinRow}${extraRow}
      <tr><td colspan="3" class="right"><b>Sous-total</b></td><td class="right"><b>${currency(
        li.lineTotal,
        q.currency,
      )}</b></td></tr>`;
    })
    .join("");

  return `<!doctype html><html lang="fr"><meta charset="utf-8"/><title>${title} — Hurghada Dream</title>
<style>
body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Noto Sans,Ubuntu,Cantarell,Helvetica Neue,Arial;padding:24px;background:#fafafa}
.box{max-width:900px;margin:0 auto;background:#fff;border:1px solid #eee;border-radius:12px;padding:20px}
table{border-collapse:collapse;width:100%} th,td{border-bottom:1px solid #eee;padding:8px 0;text-align:left}
.right{text-align:right}.muted{color:#666;font-size:12px}.toolbar{display:flex;gap:8px;justify-content:flex-end;margin-bottom:10px}
button{padding:8px 12px;border-radius:10px;border:1px solid #ddd;background:#fff;cursor:pointer}
</style>
<div class="box">
  <div class="toolbar"><button onclick="window.print()">Imprimer</button></div>
  <h1>Hurghada Dream — ${title}</h1>
  <div><b>Client:</b> ${q.client.name || ""} — <b>Tél:</b> ${q.client.phone || ""}</div>
  <div><b>Hôtel:</b> ${q.client.hotel || ""} — <b>Chambre:</b> ${q.client.room || ""} — <b>Quartier:</b> ${
    q.client.neighborhood ? q.client.neighborhood.replace(/_/g, " ") : ""
  }</div>
  ${q.notes ? `<div style="margin-top:6px"><b>Notes:</b> ${q.notes}</div>` : ""}
  <table style="margin-top:12px;"><thead><tr><th class="left">Description</th><th class="right">Qté</th><th class="right">PU</th><th class="right">Total</th></tr></thead>
  <tbody>${rows}<tr><td colspan="3" class="right"><b>Total</b></td><td class="right"><b>${currency(
    q.total,
    q.currency,
  )}</b></td></tr></tbody>
  </table>
  <p class="muted" style="margin-top:24px;">Créé le ${new Date(q.createdAt).toLocaleString("fr-FR")}</p>
</div></html>`;
}
const printQuote = (q) => {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(renderQuoteHTML(q, "Devis") + `<script>window.print();</script>`);
  w.document.close();
};

/* ============ Historique (avec PAYÉ + VOIR modale) ============ */
function HistoryPage({ quotes, setQuotes }) {
  const [q, setQ] = useState("");
  const [payModal, setPayModal] = useState({ open: false, quote: null, tickets: [] });
  const [viewModal, setViewModal] = useState({ open: false, quote: null });
  const [loading, setLoading] = useState(false);

  const digits = (s) => (s || "").toString().replace(/\D+/g, "");
  const filtered = useMemo(() => {
    const needle = digits(q);
    if (!needle) return quotes;
    return quotes.filter((x) => digits(x?.client?.phone).includes(needle));
  }, [q, quotes]);

  function openPayModal(quote) {
    setPayModal({ open: true, quote, tickets: (quote.items || []).map((li) => li.ticketNo || "") });
  }
  function closePayModal() {
    setPayModal({ open: false, quote: null, tickets: [] });
  }
  function openViewModal(quote) {
    setViewModal({ open: true, quote });
  }
  function closeViewModal() {
    setViewModal({ open: false, quote: null });
  }

  async function confirmPaid() {
    const q0 = payModal.quote;
    const updated = {
      ...q0,
      status: "paid",
      paidAt: new Date().toISOString(),
      items: q0.items.map((li, i) => ({ ...li, ticketNo: (payModal.tickets[i] || "").trim() })),
    };
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("quotes")
        .update(mapQuoteToDB(updated))
        .eq("id", q0.id)
        .eq("site_key", SITE_KEY)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      setQuotes((prev) => prev.map((x) => (x.id === q0.id ? mapQuoteFromDB(data) : x)));
    } catch (err) {
      alert("Erreur Supabase (PAYÉ) : " + err.message + "\nLa mise à jour est gardée localement.");
      setQuotes((prev) => prev.map((x) => (x.id === q0.id ? updated : x)));
    } finally {
      setLoading(false);
      closePayModal();
    }
  }

  async function handleDelete(id) {
    if (!confirm("Supprimer ce devis ?")) return;
    setQuotes((prev) => prev.filter((x) => x.id !== id));
    try {
      const { error } = await supabase.from("quotes").delete().eq("id", id).eq("site_key", SITE_KEY);
      if (error) alert("Erreur Supabase (suppression) : " + error.message);
    } catch {}
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <TextInput
          placeholder="Rechercher par numéro de téléphone (ex: 06 12 34...)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="space-y-3">
        {filtered.map((q) => {
          const isPaid = q.status === "paid";
          return (
            <div key={q.id} className="border rounded-2xl p-4 bg-white shadow">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <div className="text-sm text-gray-500">
                    {new Date(q.createdAt).toLocaleString("fr-FR")}
                    {isPaid && q.paidAt ? (
                      <span className="ml-2 text-emerald-700">
                        • Payé le {new Date(q.paidAt).toLocaleString("fr-FR")}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-sm text-gray-600">
                    <b>Tél:</b> {q.client?.phone || "—"} — Hôtel: {q.client?.hotel || "—"} (Ch. {q.client?.room || "—"}) — Quartier:{" "}
                    {q.client?.neighborhood
                      ? NEIGHBORHOODS.find((n) => n.key === q.client.neighborhood)?.label || q.client.neighborhood
                      : "—"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isPaid ? <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs">Payé</span> : null}
                  <div className="font-semibold mr-2">{currency(q.total, q.currency)}</div>
                  <GhostBtn onClick={() => window.open(buildWhatsAppLinkForQuote(q), "_blank")}>WhatsApp</GhostBtn>
                  {!isPaid && <PrimaryBtn onClick={() => openPayModal(q)}>PAYÉ</PrimaryBtn>}
                  <GhostBtn onClick={() => openViewModal(q)}>Voir</GhostBtn>
                  <GhostBtn onClick={() => handleDelete(q.id)}>Supprimer</GhostBtn>
                </div>
              </div>

              <div className="mt-3 text-sm text-gray-700">
                {q.items.map((li, i) => (
                  <div key={i} className="border-t py-2">
                    <div className="font-medium">
                      {li.activityName} — {new Date(li.date + "T12:00:00").toLocaleDateString("fr-FR")}{" "}
                      {li.neighborhood ? `· ${nice(li.neighborhood)}` : ""} {li.slot ? `· ${li.slot === "morning" ? "Matin" : "Après-midi"}` : ""}{" "}
                      {li.pickupTime ? `· ${li.pickupTime}` : ""} {li.withDolphin ? "· Dauphin" : ""}{" "}
                      {li.ticketNo ? `· Ticket: ${li.ticketNo}` : ""}
                    </div>
                    <div className="text-xs text-gray-500">
                      A:{li.adults} · E:{li.children} · B:{li.babies}{" "}
                      {li.transferSurchargeTotal ? `· Suppl.: ${currency(li.transferSurchargeTotal, q.currency)}` : ""}{" "}
                      {li.dolphinFee ? `· Dauphin: ${currency(li.dolphinFee, q.currency)}` : ""}{" "}
                      {li.extraAmount ? `· Extra: ${currency(li.extraAmount, q.currency)}` : ""} — Sous-total:{" "}
                      <b>{currency(li.lineTotal, q.currency)}</b>
                    </div>
                  </div>
                ))}
              </div>
              {q.notes && <div className="text-xs text-gray-500 mt-1">Notes: {q.notes}</div>}
            </div>
          );
        })}
        {filtered.length === 0 && <div className="text-center text-gray-500 py-10">Aucun devis trouvé pour ce numéro.</div>}
      </div>

      {/* --- Modale PAYÉ --- */}
      {payModal.open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="font-semibold">Marquer « payé » — N° de ticket par activité</div>
              <button onClick={closePayModal} className="text-xl leading-none px-2">
                ×
              </button>
            </div>
            <div className="p-4 space-y-3 max-h-[70vh] overflow-auto">
              {payModal.quote.items.map((li, i) => (
                <div key={i} className="border rounded-xl p-3">
                  <div className="text-sm font-medium">
                    {li.activityName} — {new Date(li.date + "T12:00:00").toLocaleDateString("fr-FR")}
                  </div>
                  <div className="grid md:grid-cols-2 gap-3 mt-2">
                    <TextInput
                      placeholder="N° de ticket (ex: 161050)"
                      value={payModal.tickets[i]}
                      onChange={(e) => {
                        const arr = [...payModal.tickets];
                        arr[i] = e.target.value;
                        setPayModal((s) => ({ ...s, tickets: arr }));
                      }}
                    />
                    <div className="text-sm text-gray-600 self-center">
                      Adultes: {li.adults} · Enfants: {li.children} · Bébés: {li.babies}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <GhostBtn onClick={closePayModal}>Annuler</GhostBtn>
              <PrimaryBtn onClick={confirmPaid} disabled={loading}>
                {loading ? "Enregistrement..." : "Confirmer « payé »"}
              </PrimaryBtn>
            </div>
          </div>
        </div>
      )}

      {/* --- Modale VOIR --- */}
      {viewModal.open && viewModal.quote && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="font-semibold">Aperçu du devis</div>
              <button onClick={closeViewModal} className="text-xl leading-none px-2">
                ×
              </button>
            </div>

            <div className="p-4 max-h-[75vh] overflow-auto">
              <div className="mb-4">
                <div>
                  <b>Client:</b> {viewModal.quote.client?.name || "—"} — <b>Tél:</b> {viewModal.quote.client?.phone || "—"}
                </div>
                <div>
                  <b>Hôtel:</b> {viewModal.quote.client?.hotel || "—"} — <b>Chambre:</b> {viewModal.quote.client?.room || "—"} —{" "}
                  <b>Quartier:</b>{" "}
                  {viewModal.quote.client?.neighborhood
                    ? viewModal.quote.client.neighborhood.replace(/_/g, " ")
                    : "—"}
                </div>
                {viewModal.quote.notes && <div className="mt-1"><b>Notes:</b> {viewModal.quote.notes}</div>}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="py-2 pr-2">Description</th>
                      <th className="py-2 pr-2 text-right">Qté</th>
                      <th className="py-2 pr-2 text-right">PU</th>
                      <th className="py-2 pr-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewModal.quote.items.map((li, i) => {
                      const supTotal = Number(li.transferSurchargeTotal || 0);
                      const supPer = Number(li.transferSurchargePer || 0);
                      const supQty = Number(li.adults || 0);
                      return (
                        <React.Fragment key={i}>
                          <tr className="border-b">
                            <td colSpan={4} className="py-2 font-medium">
                              {li.activityName} — {new Date(li.date + "T12:00:00").toLocaleDateString("fr-FR")}{" "}
                              {li.neighborhood ? ` — Quartier: ${nice(li.neighborhood)}` : ""}{" "}
                              {li.slot ? ` — Créneau: ${li.slot === "morning" ? "Matin" : "Après-midi"}` : ""}{" "}
                              {li.pickupTime ? ` — Prise en charge: ${li.pickupTime}` : ""}{" "}
                              {li.withDolphin ? ` — Option: Dauphin` : ""} {li.ticketNo ? ` — Ticket: ${li.ticketNo}` : ""}
                            </td>
                          </tr>
                          <tr>
                            <td>Adultes</td>
                            <td className="text-right">{li.adults}</td>
                            <td className="text-right">{currency(li.priceAdult, viewModal.quote.currency)}</td>
                            <td className="text-right">
                              {currency(li.adults * li.priceAdult, viewModal.quote.currency)}
                            </td>
                          </tr>
                          <tr>
                            <td>Enfants</td>
                            <td className="text-right">{li.children}</td>
                            <td className="text-right">{currency(li.priceChild, viewModal.quote.currency)}</td>
                            <td className="text-right">
                              {currency(li.children * li.priceChild, viewModal.quote.currency)}
                            </td>
                          </tr>
                          <tr>
                            <td>Bébés</td>
                            <td className="text-right">{li.babies}</td>
                            <td className="text-right">{currency(li.priceBaby, viewModal.quote.currency)}</td>
                            <td className="text-right">
                              {currency(li.babies * li.priceBaby, viewModal.quote.currency)}
                            </td>
                          </tr>
                          {supTotal ? (
                            <tr>
                              <td>Supplément transfert</td>
                              <td className="text-right">{supQty}</td>
                              <td className="text-right">{currency(supPer, viewModal.quote.currency)}</td>
                              <td className="text-right">{currency(supTotal, viewModal.quote.currency)}</td>
                            </tr>
                          ) : null}
                          {li.dolphinFee ? (
                            <tr>
                              <td>Option « Dauphin »</td>
                              <td className="text-right">1</td>
                              <td className="text-right">{currency(li.dolphinFee, viewModal.quote.currency)}</td>
                              <td className="text-right">{currency(li.dolphinFee, viewModal.quote.currency)}</td>
                            </tr>
                          ) : null}
                          {li.extraAmount ? (
                            <tr>
                              <td>{li.extraLabel || "Extra"}</td>
                              <td className="text-right">1</td>
                              <td className="text-right">{currency(li.extraAmount, viewModal.quote.currency)}</td>
                              <td className="text-right">{currency(li.extraAmount, viewModal.quote.currency)}</td>
                            </tr>
                          ) : null}
                          <tr>
                            <td colSpan={3} className="text-right">
                              <b>Sous-total</b>
                            </td>
                            <td className="text-right">
                              <b>{currency(li.lineTotal, viewModal.quote.currency)}</b>
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end mt-4">
                <PrimaryBtn onClick={() => printQuote(viewModal.quote)}>Imprimer</PrimaryBtn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============ Devis (tarif spécial speed boat + case Dauphin) ============ */
function QuotesPage({ activities, quotes, setQuotes }) {
  const blank = () => ({
    activityId: "",
    date: new Date().toISOString().slice(0, 10),
    neighborhood: "",
    slot: "",
    adults: 2,
    children: 0,
    babies: 0,
    withDolphin: false, // ← NEW
    extraLabel: "",
    extraAmount: "",
  });
  const [client, setClient] = useState({ name: "", phone: "", hotel: "", room: "", neighborhood: "" });
  const [items, setItems] = useState([blank()]);
  const [notes, setNotes] = useState("");

  const setItem = (i, p) => setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...p } : it)));
  const add = () => setItems((p) => [...p, blank()]);
  const rm = (i) => setItems((p) => p.filter((_, x) => x !== i));

  const computed = useMemo(
    () =>
      items.map((it) => {
        const act = activities.find((a) => a.id === it.activityId);
        const weekday = it.date ? new Date(it.date + "T12:00:00").getDay() : null;
        const available = !!(act && weekday !== null && act.availableDays[weekday]);

        const tr = act && client.neighborhood ? normalizeTransfers(act.transfers)[client.neighborhood] : null;
        const slotTime = it.slot === "morning" ? tr?.morningTime : it.slot === "afternoon" ? tr?.afternoonTime : "";

        const a = Number(it.adults || 0);
        const c = Number(it.children || 0);
        const b = Number(it.babies || 0);

        const priceAdult = Number(act?.priceAdult || 0);
        const priceChild = Number(act?.priceChild || 0);
        const priceBaby = Number(act?.priceBaby || 0);

        const extra = Number(it.extraAmount || 0);

        const transferPer = Number(tr?.surcharge || 0);
        const transferTotal = a * transferPer;

        // Dauphin (+20€)
        const dolphinFee = it.withDolphin ? 20 : 0;

        // cas spécial "speed boat"
        let personsCost;
        const isSpeedBoat = !!act?.name && act.name.trim().toLowerCase() === "speed boat";
        if (isSpeedBoat) {
          const baseForTwo = 145;
          const addPerAdult = 20;
          const addPerChild = 10;

          if (a + c === 0) {
            personsCost = 0;
          } else {
            let remaining = 2;
            const coveredAdults = Math.min(a, remaining);
            remaining -= coveredAdults;
            const coveredChildren = Math.min(c, remaining);
            remaining -= coveredChildren;

            const extraAdults = Math.max(0, a - coveredAdults);
            const extraChildren = Math.max(0, c - coveredChildren);

            personsCost = baseForTwo + extraAdults * addPerAdult + extraChildren * addPerChild;
          }
          personsCost += b * priceBaby;
        } else {
          personsCost = a * priceAdult + c * priceChild + b * priceBaby;
        }

        const itemTotal = act ? personsCost + transferTotal + extra + dolphinFee : 0;

        return {
          it,
          act,
          weekday,
          available,
          tr,
          slotTime,
          adults: a,
          itemTotal,
          transferPer,
          transferTotal,
          dolphinFee,
        };
      }),
    [items, activities, client.neighborhood],
  );

  const grandCurrency = computed.find((c) => c.act)?.act?.currency || "EUR";
  const grandTotal = computed.reduce((s, c) => s + (c.itemTotal || 0), 0);

  async function createQuote(e) {
    e.preventDefault();
    const ex = computed.filter((c) => c.act && c.weekday !== null && !c.available);
    if (ex.length)
      alert(
        `⚠️ ${ex.length} activité(s) non disponible(s) au jour choisi. Le devis sera quand même créé (dates exceptionnelles).`,
      );

    const payloadFront = {
      id: uuid(),
      createdAt: new Date().toISOString(),
      client,
      notes: notes?.trim() || "",
      items: computed.map((c) => ({
        activityId: c.act?.id || "",
        activityName: c.act?.name || "",
        currency: c.act?.currency || grandCurrency,
        date: c.it.date,
        neighborhood: client.neighborhood || "",
        slot: c.it.slot,
        pickupTime: c.slotTime || "",
        adults: Number(c.it.adults || 0),
        children: Number(c.it.children || 0),
        babies: Number(c.it.babies || 0),
        priceAdult: c.act?.priceAdult || 0,
        priceChild: c.act?.priceChild || 0,
        priceBaby: c.act?.priceBaby || 0,
        transferSurchargePer: Number(c.transferPer || 0),
        transferSurchargeTotal: Number(c.transferTotal || 0),
        withDolphin: !!c.it.withDolphin,
        dolphinFee: Number(c.dolphinFee || 0),
        extraLabel: c.it.extraLabel || "",
        extraAmount: Number(c.it.extraAmount || 0),
        available: c.available,
        lineTotal: c.itemTotal,
        ticketNo: "",
      })),
      total: grandTotal,
      currency: grandCurrency,
      status: "draft",
      paidAt: null,
    };

    try {
      const { data, error } = await supabase.from("quotes").insert([mapQuoteToDB(payloadFront)]).select("*").single();
      if (error) throw new Error(error.message);
      const row = mapQuoteFromDB(data);
      setQuotes((p) => [row, ...p]);
    } catch (err) {
      alert("Erreur Supabase (création devis) : " + err.message + "\nLe devis est gardé localement (cache).");
      setQuotes((p) => [payloadFront, ...p]);
    } finally {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={createQuote} className="bg-gray-50 p-4 rounded-2xl border space-y-4">
        {/* Infos client + quartier */}
        <div className="grid md:grid-cols-5 gap-3">
          <div>
            <label className="text-sm text-gray-600">Client</label>
            <TextInput
              value={client.name}
              onChange={(e) => setClient({ ...client, name: e.target.value })}
              placeholder="Nom du client / agence"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600">Téléphone</label>
            <TextInput
              value={client.phone}
              onChange={(e) => setClient({ ...client, phone: e.target.value })}
              placeholder="Numéro de téléphone"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600">Hôtel</label>
            <TextInput
              value={client.hotel}
              onChange={(e) => setClient({ ...client, hotel: e.target.value })}
              placeholder="Nom de l'hôtel"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600">Chambre</label>
            <TextInput
              value={client.room}
              onChange={(e) => setClient({ ...client, room: e.target.value })}
              placeholder="N° de chambre"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600">Quartier (client)</label>
            <select
              className="w-full rounded-xl border px-3 py-2 border-gray-300 focus:ring-2 focus:ring-black/10 focus:border-black"
              value={client.neighborhood}
              onChange={(e) => setClient({ ...client, neighborhood: e.target.value })}
            >
              <option value="">— Choisir —</option>
              {NEIGHBORHOODS.map((n) => (
                <option key={n.key} value={n.key} className="capitalize">
                  {n.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Lignes d'activités */}
        <div className="space-y-4">
          {computed.map((c, idx) => (
            <div key={idx} className="border rounded-2xl bg-white p-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">Activité #{idx + 1}</div>
                <GhostBtn onClick={() => rm(idx)}>Supprimer</GhostBtn>
              </div>

              <div className="grid md:grid-cols-5 gap-3 mt-2">
                <div className="md:col-span-2">
                  <label className="text-sm text-gray-600">Activité</label>
                  <select
                    className="w-full rounded-xl border px-3 py-2 border-gray-300 focus:ring-2 focus:ring-black/10 focus:border-black"
                    value={c.it.activityId}
                    onChange={(e) => setItem(idx, { activityId: e.target.value, slot: "" })}
                  >
                    <option value="">— Choisir —</option>
                    {activities.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600">Date</label>
                  <TextInput type="date" value={c.it.date} onChange={(e) => setItem(idx, { date: e.target.value })} />
                  {c.act && !c.available && (
                    <p className="text-xs text-amber-700 mt-1">
                      ⚠️ Indispo le {WEEKDAYS[c.weekday].label}. Devis possible (date exceptionnelle).
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-sm text-gray-600">Quartier</label>
                  <div className="w-full rounded-xl border px-3 py-2 bg-gray-50 text-gray-700 capitalize">
                    {client.neighborhood
                      ? NEIGHBORHOODS.find((n) => n.key === client.neighborhood)?.label || client.neighborhood
                      : "— Choisir le quartier plus haut"}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-600">Créneau</label>
                  <select
                    className="w-full rounded-xl border px-3 py-2 border-gray-300 focus:ring-2 focus:ring-black/10 focus:border-black"
                    value={c.it.slot}
                    onChange={(e) => setItem(idx, { slot: e.target.value })}
                    disabled={!client.neighborhood || !c.tr || (!c.tr.morningEnabled && !c.tr.afternoonEnabled)}
                  >
                    <option value="">— Choisir —</option>
                    {c.tr?.morningEnabled && (
                      <option value="morning">Matin {c.tr.morningTime ? `— ${c.tr.morningTime}` : ""}</option>
                    )}
                    {c.tr?.afternoonEnabled && (
                      <option value="afternoon">Après-midi {c.tr.afternoonTime ? `— ${c.tr.afternoonTime}` : ""}</option>
                    )}
                  </select>
                  {c.tr && (
                    <p className="text-xs text-gray-600 mt-1">
                      Supplément transfert <b>(par adulte)</b> :{" "}
                      <b>{currency(Number(c.tr.surcharge || 0), c.act?.currency || "EUR")}</b>
                    </p>
                  )}
                </div>
              </div>

              {/* Case Dauphin */}
              <div className="mt-3">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!c.it.withDolphin}
                    onChange={(e) => setItem(idx, { withDolphin: e.target.checked })}
                  />
                  <span>Option « Dauphin » (+20 €)</span>
                </label>
              </div>

              {/* EXTRA */}
              <div className="grid md:grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="text-sm text-gray-600">Extra (libellé)</label>
                  <TextInput
                    value={c.it.extraLabel}
                    onChange={(e) => setItem(idx, { extraLabel: e.target.value })}
                    placeholder="Ex: Photos / Boissons / Option VIP"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">Montant Extra</label>
                  <NumberInput
                    value={c.it.extraAmount}
                    onChange={(e) => setItem(idx, { extraAmount: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-3 mt-3">
                <div>
                  <label className="text-sm text-gray-600">Adultes</label>
                  <NumberInput min={0} value={c.it.adults} onChange={(e) => setItem(idx, { adults: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm text-gray-600">Enfants</label>
                  <NumberInput min={0} value={c.it.children} onChange={(e) => setItem(idx, { children: e.target.value })} />
                </div>
                <div>
                  <label className="text-sm text-gray-600">Bébés</label>
                  <NumberInput min={0} value={c.it.babies} onChange={(e) => setItem(idx, { babies: e.target.value })} />
                </div>
              </div>

              <div className="flex items-center justify-between mt-3">
                <div className="text-sm text-gray-600">Sous-total</div>
                <div className="font-semibold">{c.act ? currency(c.itemTotal, c.act.currency) : "—"}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <GhostBtn onClick={add}>+ Ajouter une autre activité</GhostBtn>
          <div className="text-right">
            <div className="text-sm text-gray-600">Total</div>
            <div className="text-xl font-bold">{currency(grandTotal, grandCurrency)}</div>
          </div>
        </div>

        <div>
          <label className="text-sm text-gray-600">Notes</label>
          <TextInput
            placeholder="Infos supplémentaires : langue du guide, pick-up, etc."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <PrimaryBtn type="submit" className="w-full">
          Créer le devis
        </PrimaryBtn>
      </form>

      <div>
        <h4 className="font-semibold mb-3">Devis récents</h4>
        <div className="space-y-3">
          {quotes.map((q) => (
            <div key={q.id} className="border rounded-2xl p-4 bg-white shadow">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <div className="text-sm text-gray-500">{new Date(q.createdAt).toLocaleString("fr-FR")}</div>
                  <div className="text-sm text-gray-600">
                    <b>Tél:</b> {q.client?.phone || "—"} — Hôtel: {q.client?.hotel || "—"} (Ch. {q.client?.room || "—"}) — Quartier:{" "}
                    {q.client?.neighborhood
                      ? NEIGHBORHOODS.find((n) => n.key === q.client.neighborhood)?.label || q.client.neighborhood
                      : "—"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="font-semibold mr-2">{currency(q.total, q.currency)}</div>
                  <GhostBtn onClick={() => window.open(buildWhatsAppLinkForQuote(q), "_blank")}>WhatsApp</GhostBtn>
                  <GhostBtn onClick={() => printQuote(q)}>Imprimer</GhostBtn>
                </div>
              </div>
            </div>
          ))}
          {quotes.length === 0 && <div className="text-center text-gray-500 py-10">Aucun devis pour le moment.</div>}
        </div>
      </div>
    </div>
  );
}

/* ================== App ================== */
export default function App() {
  const [tab, setTab] = useState("devis");
  const [activities, setActivities] = useState(() =>
    loadLS(LS.activities, DEFAULT_ACTIVITIES).map((a) => ({ ...a, transfers: normalizeTransfers(a.transfers) })),
  );
  const [quotes, setQuotes] = useState(() => loadLS(LS.quotes, []));
  const [unlocked, setUnlocked] = useState(false);
  const [pin, setPin] = useState("");

  useEffect(() => saveLS(LS.activities, activities), [activities]);
  useEffect(() => saveLS(LS.quotes, quotes), [quotes]);

  // Load activities
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("activities")
          .select("*")
          .eq("site_key", SITE_KEY)
          .order("name", { ascending: true });
        if (!error && Array.isArray(data)) setActivities(data.map(mapActFromDB));
      } catch {}
    })();
  }, []);

  // Load quotes
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("quotes")
          .select("*")
          .eq("site_key", SITE_KEY)
          .order("created_at", { ascending: false });
        if (!error && Array.isArray(data)) setQuotes(data.map(mapQuoteFromDB));
      } catch (e) {
        console.warn("Load quotes error:", e);
      }
    })();
  }, []);

  if (!unlocked) {
    return (
      <div className="min-h-screen grid place-items-center bg-gradient-to-b from-gray-50 to-white">
        <div className="bg-white rounded-2xl shadow p-6 border w-[420px] max-w-[92vw]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-2xl bg-black text-white grid place-items-center font-bold">HD</div>
            <div>
              <div className="font-semibold">Hurghada Dream — Accès</div>
              <div className="text-xs text-gray-500">Code requis pour entrer</div>
            </div>
          </div>
          <label className="text-sm text-gray-600">Code</label>
          <TextInput
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && pin === PIN_CODE) setUnlocked(true);
            }}
            placeholder="0606"
          />
          <div className="mt-3 flex justify-end">
            <PrimaryBtn onClick={() => pin === PIN_CODE && setUnlocked(true)}>Entrer</PrimaryBtn>
          </div>
          <div className="text-xs text-gray-500 mt-2">Astuce : 0606</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white text-gray-900">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-black text-white grid place-items-center font-bold">HD</div>
            <div>
              <h1 className="text-lg font-bold">Hurghada Dream — Bureaux Internes</h1>
              <p className="text-xs text-gray-500 -mt-0.5">Mini site interne (devis, activités, historique)</p>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <Pill active={tab === "devis"} onClick={() => setTab("devis")}>
              Devis
            </Pill>
            <Pill active={tab === "activities"} onClick={() => setTab("activities")}>
              Activités
            </Pill>
            <Pill active={tab === "history"} onClick={() => setTab("history")}>
              Historique
            </Pill>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        {tab === "devis" && (
          <Section
            title="Créer & gérer les devis (multi-activités)"
            subtitle="Supplément transfert = (par adulte) × (nombre d’adultes). Alerte si jour hors-dispo, mais le devis peut être créé."
          >
            <QuotesPage activities={activities} quotes={quotes} setQuotes={setQuotes} />
          </Section>
        )}

        {tab === "activities" && (
          <Section
            title="Gestion des activités"
            subtitle="Ajoutez une activité, ses prix (adulte/enfant/bébé), ses jours, et ses transferts par quartier."
            right={
              <GhostBtn
                onClick={() => {
                  try {
                    localStorage.clear();
                  } catch {}
                  location.reload();
                }}
              >
                Réinitialiser les données
              </GhostBtn>
            }
          >
            <ActivitiesPage activities={activities} setActivities={setActivities} />
          </Section>
        )}

        {tab === "history" && (
          <Section title="Historique des devis" subtitle="Recherchez un devis par numéro de téléphone du client.">
            <HistoryPage quotes={quotes} setQuotes={setQuotes} />
          </Section>
        )}
      </main>

      <footer className="max-w-6xl mx-auto px-4 pb-10 text-xs text-gray-500">
        Astuce : les devis et activités sont sauvegardés sur Supabase (partagés entre PC). Un cache local est aussi conservé.
      </footer>
    </div>
  );
}
