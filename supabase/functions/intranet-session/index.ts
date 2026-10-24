import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Après un code PIN valide, délivre une session Supabase Auth « ops »
 * (ou la session rédacteur Ewen/Léa/Sophia/Karim si intranet_auth_email est renseigné).
 * Les politiques RLS d’écriture exigent auth.uid() — la clé anon seule ne suffit plus.
 */

const OPS_EMAIL = "intranet-ops@hurghada-dream.internal";
const WRITER_NAMES = new Set(["ewen", "léa", "lea", "sophia", "karim"]);

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

function isWriterName(name: unknown) {
  return WRITER_NAMES.has(String(name || "").trim().toLowerCase());
}

async function ensureOpsUser(admin: ReturnType<typeof createClient>) {
  const perPage = 200;
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = (data?.users || []).find(
      (u) => String(u.email || "").toLowerCase() === OPS_EMAIL
    );
    if (found) {
      // is_intranet_authenticated() exige ce marqueur dans le JWT.
      if (found.app_metadata?.intranet_ops !== true) {
        const { error: updateError } = await admin.auth.admin.updateUserById(found.id, {
          app_metadata: { ...found.app_metadata, intranet_ops: true, role: "intranet_ops" },
        });
        if (updateError) throw updateError;
      }
      return found;
    }
    if (!data?.users?.length || data.users.length < perPage) break;
    page += 1;
    if (page > 20) break;
  }

  const password = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: OPS_EMAIL,
    password,
    email_confirm: true,
    app_metadata: { intranet_ops: true, role: "intranet_ops" },
  });
  if (createError) throw createError;
  if (!created?.user) throw new Error("createUser empty");
  return created.user;
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
  if (req.method !== "POST") return json(405, { ok: false, error: "method" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceKey) return json(500, { ok: false, error: "env" });

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, error: "json" });
  }

  const code = String(body.code || "").trim();
  if (!/^\d{6}$/.test(code)) return json(200, { ok: false });

  const clientIp =
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const { data: gate, error: gateError } = await admin.rpc("intranet_login_guarded", {
    p_code: code,
    p_ip: clientIp,
  });
  if (gateError) return json(500, { ok: false, error: "login" });

  const payload = gate && typeof gate === "object" ? (gate as Record<string, unknown>) : {};
  if (payload.locked === true) return json(200, { ok: false, locked: true });
  if (payload.ok !== true || !payload.user || typeof payload.user !== "object") {
    return json(200, { ok: false });
  }

  const user = payload.user as Record<string, unknown>;
  const writerEmail = String(user.intranet_auth_email || "").trim();
  let sessionEmail = OPS_EMAIL;

  try {
    if (writerEmail && isWriterName(user.name)) {
      sessionEmail = writerEmail;
    } else {
      await ensureOpsUser(admin);
      sessionEmail = OPS_EMAIL;
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: sessionEmail,
    });
    if (linkError || !linkData?.properties?.hashed_token) {
      return json(500, { ok: false, error: "session" });
    }

    return json(200, {
      ok: true,
      user,
      token_hash: linkData.properties.hashed_token,
      session_email: sessionEmail,
    });
  } catch (err) {
    console.error("intranet-session", err);
    return json(500, { ok: false, error: "session" });
  }
});
