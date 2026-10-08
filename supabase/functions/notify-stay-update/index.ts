import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildPushPayload } from "npm:@block65/webcrypto-web-push@2.0.0";

type PushRow = {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
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

function phoneFromBody(body: Record<string, unknown>) {
  const record = body.record && typeof body.record === "object" ? (body.record as Record<string, unknown>) : null;
  const siteKey = String(body.p_site_key || body.site_key || record?.site_key || "").trim();
  const phone = String(body.p_phone || body.phone || record?.client_phone || "").trim();
  return { siteKey, phone };
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

  const { siteKey, phone } = phoneFromBody(body);
  if (!siteKey || !phone) return json(400, { ok: false, error: "site_key and phone required" });

  const { data: keysData, error: keysError } = await admin.rpc("get_vapid_keys");
  if (keysError || !keysData?.public || !keysData?.private) {
    return json(500, { ok: false, error: "VAPID keys missing" });
  }

  const { data: phoneKeyRows, error: keyErr } = await admin.rpc("phone_match_key", { p_phone: phone });
  const phoneKey = String(phoneKeyRows || "").trim();
  if (keyErr || phoneKey.length < 10) return json(200, { ok: true, sent: 0 });

  const { data: subs, error: subErr } = await admin
    .from("client_stay_push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("site_key", siteKey)
    .eq("phone_key", phoneKey);

  if (subErr) return json(500, { ok: false, error: subErr.message });
  const rows = (subs || []) as PushRow[];
  if (rows.length === 0) return json(200, { ok: true, sent: 0 });

  const vapid = {
    subject: String(keysData.subject || "mailto:ewenkermorvantpro@gmail.com"),
    publicKey: String(keysData.public),
    privateKey: String(keysData.private),
  };

  const message = {
    title: "Hurghada Dream",
    body: "Votre programme a été mis à jour. Ouvrez Mon séjour pour voir les nouvelles heures.",
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
        { data: JSON.stringify(message), options: { ttl: 86400 } },
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
      /* drop dead endpoints silently on next expiry */
    }
  }

  return json(200, { ok: true, sent });
});
