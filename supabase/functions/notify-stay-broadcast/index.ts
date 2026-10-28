import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildPushPayload } from "npm:@block65/webcrypto-web-push@2.0.0";

const SITE_KEY = "hurghada_dream_0606";
const MAX_MESSAGE = 240;

type PushRow = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  phone_key: string;
  reservation_code?: string | null;
  last_seen_at?: string | null;
};

type QuoteStayRow = {
  reservation_code?: string | null;
  client_arrival_date?: string | null;
  client_departure_date?: string | null;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

/** Jour calendaire à Hurghada (YYYY-MM-DD). */
function todayCairoYmd(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function dateKey(value: unknown): string {
  if (value == null) return "";
  const s = String(value).trim();
  if (!s) return "";
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

function normalizeReservationCode(raw: unknown): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/** Client actuellement à Hurghada : aujourd’hui inclus entre arrivée et départ. */
function isCurrentlyOnStay(arrivalRaw: unknown, departureRaw: unknown, todayYmd: string): boolean {
  const arrival = dateKey(arrivalRaw);
  const departure = dateKey(departureRaw);
  if (!arrival || !departure || !todayYmd) return false;
  return arrival <= todayYmd && todayYmd <= departure;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) return json(500, { ok: false, error: "Missing service env" });

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  const action = String(body.action || "").trim();
  const siteKey = String(body.site_key || "").trim();
  const staffCode = String(body.staff_code || "").trim();
  const message = String(body.message || "").trim();

  if (siteKey !== SITE_KEY) return json(400, { ok: false, error: "site" });
  if (action !== "count" && action !== "send") return json(400, { ok: false, error: "action" });
  if (action === "send" && (message.length < 1 || message.length > MAX_MESSAGE)) {
    return json(400, { ok: false, error: "message" });
  }

  const { data: gate, error: gateError } = await admin.rpc("intranet_confirm_ewen_or_karim", {
    p_code: staffCode,
  });
  if (gateError) return json(500, { ok: false, error: "auth" });
  const allowed = gate && typeof gate === "object" ? (gate as { ok?: boolean; locked?: boolean }) : {};
  if (allowed.locked) return json(200, { ok: false, locked: true });
  if (allowed.ok !== true) return json(200, { ok: false, error: "Accès refusé." });

  const freshAfter = Date.now() - 3 * 60 * 1000;
  const todayYmd = todayCairoYmd();
  const { data: subs, error: subErr } = await admin
    .from("client_stay_push_subscriptions")
    .select("id, endpoint, p256dh, auth, phone_key, reservation_code, last_seen_at")
    .eq("site_key", SITE_KEY)
    .not("reservation_code", "is", null);

  if (subErr) return json(500, { ok: false, error: subErr.message });
  const connectedRows = ((subs || []) as PushRow[]).filter((row) => {
    if (String(row.phone_key || "").length < 10) return false;
    if (!normalizeReservationCode(row.reservation_code)) return false;
    const seen = Date.parse(String(row.last_seen_at || ""));
    return Number.isFinite(seen) && seen >= freshAfter;
  });

  const codes = [
    ...new Set(
      connectedRows
        .map((row) => normalizeReservationCode(row.reservation_code))
        .filter(Boolean)
    ),
  ];

  /** @type {Map<string, { arrival: string, departure: string }>} */
  const stayByCode = new Map();
  if (codes.length > 0) {
    const { data: quotes, error: quoteErr } = await admin
      .from("quotes")
      .select("reservation_code, client_arrival_date, client_departure_date")
      .eq("site_key", SITE_KEY)
      .in("reservation_code", codes);

    if (quoteErr) return json(500, { ok: false, error: quoteErr.message });

    for (const q of (quotes || []) as QuoteStayRow[]) {
      const code = normalizeReservationCode(q.reservation_code);
      if (!code) continue;
      const arrival = dateKey(q.client_arrival_date);
      const departure = dateKey(q.client_departure_date);
      const prev = stayByCode.get(code) || { arrival: "", departure: "" };
      stayByCode.set(code, {
        arrival: prev.arrival || arrival,
        departure: prev.departure || departure,
      });
    }
  }

  const rows = connectedRows.filter((row) => {
    const code = normalizeReservationCode(row.reservation_code);
    const stay = stayByCode.get(code);
    if (!stay) return false;
    return isCurrentlyOnStay(stay.arrival, stay.departure, todayYmd);
  });

  const clients = new Set(rows.map((row) => row.phone_key)).size;
  if (action === "count") return json(200, { ok: true, clients, sent: 0, today: todayYmd });

  const { data: keysData, error: keysError } = await admin.rpc("get_vapid_keys");
  if (keysError || !keysData?.public || !keysData?.private) {
    return json(500, { ok: false, error: "VAPID keys missing" });
  }

  const vapid = {
    subject: String(keysData.subject || "mailto:ewenkermorvantpro@gmail.com"),
    publicKey: String(keysData.public),
    privateKey: String(keysData.private),
  };
  const payload = {
    title: "Hurghada Dream",
    body: message,
    url: "/sejour",
  };

  let sent = 0;
  for (const row of rows) {
    try {
      const subscription = {
        endpoint: row.endpoint,
        expirationTime: null,
        keys: { p256dh: row.p256dh, auth: row.auth },
      };
      const requestInfo = await buildPushPayload(
        { data: JSON.stringify(payload), options: { ttl: 86400 } },
        subscription,
        vapid
      );
      const res = await fetch(row.endpoint, requestInfo);
      if (res.status === 404 || res.status === 410) {
        await admin.from("client_stay_push_subscriptions").delete().eq("id", row.id);
      } else if (res.ok || res.status === 201) {
        sent += 1;
      }
    } catch {
      /* un téléphone injoignable ne bloque pas les autres */
    }
  }

  return json(200, { ok: true, clients, sent, today: todayYmd });
});
