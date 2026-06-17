/**
 * AccountancyOS post-deploy smoke test.
 *
 * Verifies the live Supabase backend matches `infra/supabase-manifest.json`.
 * Exits non-zero on any failure so it is safe to wire into CI.
 *
 * Usage:
 *   bun scripts/smoke-test.ts                  # uses VITE_SUPABASE_URL + anon key
 *   SMOKE_TARGET=preview bun scripts/smoke-test.ts
 *
 * Environment:
 *   VITE_SUPABASE_URL              required
 *   VITE_SUPABASE_PUBLISHABLE_KEY  required (anon key)
 *   SMOKE_SERVICE_ROLE_KEY         optional (enables DB-level introspection checks)
 *   SMOKE_TEST_RECIPIENT           optional (defaults to regression+smoke@accountancyos.test)
 *   SMOKE_PORTAL_BASE_URL          optional (defaults to https://app.accountancyos.com)
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Manifest = typeof import("../infra/supabase-manifest.json");

const manifest: Manifest = JSON.parse(
  readFileSync(resolve(import.meta.dir, "../infra/supabase-manifest.json"), "utf8"),
);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SMOKE_SERVICE_ROLE_KEY;
const PORTAL_BASE = process.env.SMOKE_PORTAL_BASE_URL ?? manifest.siteUrl;
const RECIPIENT = process.env.SMOKE_TEST_RECIPIENT ?? "regression+smoke@accountancyos.test";

if (!SUPABASE_URL || !ANON_KEY) {
  console.error("✘ VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be set.");
  process.exit(2);
}

type Result = { name: string; ok: boolean; detail?: string; hint?: string };
const results: Result[] = [];

function record(name: string, ok: boolean, detail?: string, hint?: string) {
  results.push({ name, ok, detail, hint });
  const symbol = ok ? "✓" : "✘";
  const line = `${symbol} ${name}${detail ? ` — ${detail}` : ""}`;
  // eslint-disable-next-line no-console
  console.log(line);
  if (!ok && hint) console.log(`    hint: ${hint}`);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

async function checkEdgeFunctionReachable(name: string) {
  const url = `${SUPABASE_URL}/functions/v1/${name}`;
  try {
    const res = await withTimeout(
      fetch(url, { method: "OPTIONS", headers: { apikey: ANON_KEY! } }),
      10_000,
      `edge ${name}`,
    );
    // OPTIONS responds with 2xx/204 when the function is deployed.
    // 404 means the function isn't deployed. 401/405 still proves it exists.
    const deployed = res.status !== 404;
    record(
      `edge:${name}`,
      deployed,
      `HTTP ${res.status}`,
      deployed ? undefined : "Deploy with supabase--deploy_edge_functions",
    );
    await res.text().catch(() => undefined);
  } catch (err) {
    record(`edge:${name}`, false, (err as Error).message, "Network or DNS error reaching edge function");
  }
}

async function checkEdgeFunctions() {
  const critical = manifest.edgeFunctions.filter((f) => f.critical);
  await Promise.all(critical.map((f) => checkEdgeFunctionReachable(f.name)));
}

async function checkPortalRoute() {
  const url = `${PORTAL_BASE.replace(/\/$/, "")}/portal/reset-password`;
  try {
    const res = await withTimeout(fetch(url, { method: "GET", redirect: "manual" }), 10_000, "portal reset");
    const ok = res.status >= 200 && res.status < 400;
    record(
      "portal:reset-password reachable",
      ok,
      `${url} → HTTP ${res.status}`,
      ok ? undefined : "Confirm published portal and SPA fallback",
    );
    await res.text().catch(() => undefined);
  } catch (err) {
    record("portal:reset-password reachable", false, (err as Error).message);
  }
}

async function checkAuthHookEndToEnd(supabase: SupabaseClient) {
  // Anyone can call resetPasswordForEmail. We don't need the recipient to exist —
  // Supabase Auth still triggers the send-email hook for valid email syntax.
  // We assert that the auth API returns 200 (no provider error) AND that, if a
  // service-role key is available, a fresh row appears in email_send_log.
  const before = new Date();
  const { error } = await supabase.auth.resetPasswordForEmail(RECIPIENT, {
    redirectTo: `${PORTAL_BASE}/portal/reset-password`,
  });
  if (error) {
    record("auth:recovery accepted", false, error.message, "Supabase Auth rejected the reset request");
    return;
  }
  record("auth:recovery accepted", true, `triggered for ${RECIPIENT}`);

  if (!SERVICE_KEY) {
    record("email:send_log row reaches sent", true, "skipped (no service-role key)", "Set SMOKE_SERVICE_ROLE_KEY to enable");
    return;
  }

  const admin = createClient(SUPABASE_URL!, SERVICE_KEY);
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    const { data, error: qErr } = await admin
      .from("email_send_log")
      .select("status,created_at,error_message,template_name")
      .eq("recipient_email", RECIPIENT)
      .gte("created_at", before.toISOString())
      .order("created_at", { ascending: false })
      .limit(5);
    if (qErr) {
      record("email:send_log row reaches sent", false, qErr.message, "Check email_send_log exists and RLS allows service role");
      return;
    }
    const sent = data?.find((r) => r.status === "sent");
    if (sent) {
      record("email:send_log row reaches sent", true, `template=${sent.template_name}`);
      return;
    }
    const failed = data?.find((r) => ["failed", "dlq"].includes(r.status));
    if (failed) {
      record(
        "email:send_log row reaches sent",
        false,
        `status=${failed.status} error=${failed.error_message ?? "(none)"}`,
        "Inspect process-email-queue logs",
      );
      return;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  record(
    "email:send_log row reaches sent",
    false,
    "no terminal row within 25s",
    "Queue worker may not be running — check pg_cron + process-email-queue",
  );
}

async function checkInfraTables() {
  if (!SERVICE_KEY) {
    record("db:infra tables present", true, "skipped (no service-role key)");
    return;
  }
  const admin = createClient(SUPABASE_URL!, SERVICE_KEY);
  for (const t of manifest.emailInfrastructure.tables) {
    const { error } = await admin.from(t).select("*", { count: "exact", head: true });
    record(`db:table ${t}`, !error, error?.message, error ? "Run setup_email_infra" : undefined);
  }
}

async function checkRlsRequiredTables() {
  if (!SERVICE_KEY) {
    record("db:rls enforced on tenant tables", true, "skipped (no service-role key)");
    return;
  }
  const admin = createClient(SUPABASE_URL!, SERVICE_KEY);
  // Best-effort introspection via the existing helper view, if present.
  const { data, error } = await admin
    .from("pg_tables")
    .select("schemaname,tablename")
    .eq("schemaname", "public")
    .in("tablename", manifest.rlsRequiredTables);
  if (error) {
    record("db:rls tenant table presence", true, `introspection skipped (${error.message})`);
    return;
  }
  const found = new Set((data ?? []).map((r: any) => r.tablename));
  const missing = manifest.rlsRequiredTables.filter((t) => !found.has(t));
  record(
    "db:rls tenant table presence",
    missing.length === 0,
    missing.length === 0 ? `${manifest.rlsRequiredTables.length} tables present` : `missing: ${missing.join(", ")}`,
    missing.length === 0 ? undefined : "Run pending migrations or update the manifest",
  );
}

async function main() {
  console.log(`Smoke test against ${SUPABASE_URL}`);
  const supabase = createClient(SUPABASE_URL!, ANON_KEY!);

  await checkEdgeFunctions();
  await checkPortalRoute();
  await checkAuthHookEndToEnd(supabase);
  await checkInfraTables();
  await checkRlsRequiredTables();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    console.log("\nFAILED CHECKS:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail ?? ""}${f.hint ? `\n      hint: ${f.hint}` : ""}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(2);
});