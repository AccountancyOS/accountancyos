import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const PORTAL_ORIGINS = new Set([
  "https://client.accountancyos.com",
  "https://accountancyosclientportal.lovable.app",
]);
const LOVABLE_PREVIEW = /^https:\/\/[a-z0-9-]+\.lovable\.app$/i;

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (PORTAL_ORIGINS.has(origin)) return true;
  return LOVABLE_PREVIEW.test(origin);
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const allow = isAllowedOrigin(origin) ? origin! : "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function isDuplicateEmailError(err: { message?: string; code?: string; status?: number }): boolean {
  const code = (err.code ?? "").toLowerCase();
  if (code === "email_exists" || code === "user_already_exists") return true;
  const msg = (err.message ?? "").toLowerCase();
  if (!msg) return false;
  return (
    msg.includes("already registered") ||
    msg.includes("already been registered") ||
    msg.includes("already exists") ||
    msg.includes("user already") ||
    msg.includes("duplicate")
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json(req, { status: "error", message: "Method not allowed" }, 405);
  }

  let body: { token?: unknown; password?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(req, { status: "error", message: "Invalid JSON body" });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!token || token.length < 10) {
    return json(req, { status: "error", message: "Missing or invalid token" });
  }
  if (!password || password.length < 8) {
    return json(req, { status: "error", message: "Password must be at least 8 characters" });
  }
  if (!name) {
    return json(req, { status: "error", message: "Name is required" });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error("[accept-portal-invite-signup] missing env");
    return json(req, { status: "error", message: "Server misconfigured" });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Validate invite via existing RPC.
  const { data: invite, error: rpcErr } = await admin.rpc(
    "get_portal_invite_details",
    { p_token: token },
  );
  if (rpcErr) {
    console.error("[accept-portal-invite-signup] rpc error", rpcErr);
    return json(req, { status: "error", message: rpcErr.message });
  }

  const inv = (invite ?? {}) as Record<string, unknown>;
  if (inv.valid !== true) {
    return json(req, {
      status: "invalid_token",
      reason: typeof inv.reason === "string" ? inv.reason : null,
    });
  }

  const email = typeof inv.email === "string" ? inv.email.trim().toLowerCase() : "";
  if (!email) {
    return json(req, { status: "error", message: "Invite is missing an email address" });
  }

  // 2. Provision the auth user.
  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });

  if (!createErr) {
    // Return the invite email so the client signs in with the address the account was created
    // under (not a user-typed one) — FUN-1/F-08.
    return json(req, { status: "created", email });
  }

  if (isDuplicateEmailError(createErr as { message?: string; code?: string })) {
    return json(req, { status: "already_exists", email });
  }

  console.warn("[accept-portal-invite-signup] createUser failed", createErr);
  return json(req, { status: "error", message: createErr.message });
});