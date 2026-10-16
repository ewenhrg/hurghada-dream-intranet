import { supabase } from "../lib/supabase";

const SESSION_KEY = "hd_b2b_session_v1";

export function loadB2BSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.id || !parsed?.login) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveB2BSession(session) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearB2BSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

export function b2bCartKey(accountId) {
  return `hd_b2b_cart_v1_${accountId}`;
}

export function loadB2BCart(accountId) {
  try {
    const raw = sessionStorage.getItem(b2bCartKey(accountId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveB2BCart(accountId, lines) {
  sessionStorage.setItem(b2bCartKey(accountId), JSON.stringify(lines));
}

function missingTable(error) {
  const message = String(error?.message || error || "");
  return /b2b_|schema cache|does not exist|Could not find/i.test(message);
}

export function b2bSetupMessage(error) {
  if (missingTable(error)) {
    return "Les tables B2B ne sont pas encore en place. Exécutez supabase/supabase_b2b.sql dans Supabase.";
  }
  return error?.message || "Enregistrement impossible pour le moment.";
}

export async function loginB2B(login, password) {
  const { data, error } = await supabase.rpc("b2b_login", {
    p_login: String(login || "").trim(),
    p_password: String(password || ""),
  });
  if (error) throw error;
  if (!data?.id) return null;
  return {
    id: data.id,
    login: data.login,
    companyName: data.companyName || data.company_name || "",
    contactName: data.contactName || data.contact_name || "",
    email: data.email || "",
  };
}

export async function submitB2BAccessRequest(form) {
  const payload = {
    first_name: String(form.firstName || "").trim(),
    last_name: String(form.lastName || "").trim(),
    email: String(form.email || "").trim(),
    company_name: String(form.companyName || "").trim(),
    legal_name: String(form.legalName || "").trim(),
    siret: String(form.siret || "").replace(/\s/g, ""),
    message: String(form.message || "").trim(),
    status: "pending",
  };
  const { error } = await supabase.from("b2b_access_requests").insert(payload);
  if (error) throw error;
}

export async function listB2BRequests() {
  const { data, error } = await supabase
    .from("b2b_access_requests")
    .select("id, first_name, last_name, email, company_name, legal_name, siret, message, status, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function updateB2BRequestStatus(id, status) {
  const { error } = await supabase.from("b2b_access_requests").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function createB2BAccount(form) {
  const payload = {
    login: String(form.login || "").trim(),
    password_hash: String(form.password || ""),
    company_name: String(form.companyName || "").trim(),
    contact_name: String(form.contactName || "").trim(),
    email: String(form.email || "").trim(),
    request_id: form.requestId || null,
    active: true,
  };
  const { error } = await supabase.from("b2b_accounts").insert(payload).select("id");
  if (error) throw error;
  if (form.requestId) {
    await updateB2BRequestStatus(form.requestId, "approved");
  }
}

export async function listB2BAccounts() {
  const { data, error } = await supabase
    .from("b2b_accounts")
    .select("id, login, company_name, contact_name, email, active, created_at, request_id")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function setB2BAccountActive(id, active) {
  const { error } = await supabase.from("b2b_accounts").update({ active }).eq("id", id).select("id");
  if (error) throw error;
}

export async function resetB2BPassword(id, password) {
  const { error } = await supabase.from("b2b_accounts").update({ password_hash: password }).eq("id", id).select("id");
  if (error) throw error;
}

export async function submitB2BQuote(payload) {
  const { error } = await supabase.from("b2b_quotes").insert(payload);
  if (error) throw error;
}

export async function listB2BQuotes() {
  const { data, error } = await supabase
    .from("b2b_quotes")
    .select(
      "id, account_id, agency_name, agency_login, client_name, client_phone, client_email, client_hotel, arrival_date, departure_date, notes, items, status, created_at"
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function updateB2BQuoteStatus(id, status) {
  const { error } = await supabase.from("b2b_quotes").update({ status }).eq("id", id);
  if (error) throw error;
}
