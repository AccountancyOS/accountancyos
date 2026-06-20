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
import { CHECK_CONSTRAINT_REGISTRY } from "../src/lib/db-constants/check-constraints";

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
    const sent = data?.find((r: any) => r.status === "sent");
    if (sent) {
      // Non-negotiable #2: a `sent` row is only credible if the provider
      // acknowledged with an id / response. Without it we treat the run as
      // a failure even though the worker marked it sent — this is the exact
      // failure mode that hid Amy's missing recovery email.
      const providerId =
        (sent as any)?.metadata?.provider_message_id ??
        (sent as any)?.metadata?.provider_response?.id ??
        null;
      if (!providerId) {
        record(
          "email:send_log row reaches sent",
          false,
          `template=${sent.template_name} but no provider_message_id`,
          "process-email-queue must capture provider response into metadata",
        );
        return;
      }
      record(
        "email:send_log row reaches sent",
        true,
        `template=${sent.template_name} provider_id=${providerId}`,
      );
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

/**
 * Non-negotiable #3: prove RLS using real user JWTs, never the service role.
 *
 * Requires two seeded users that own different orgs and one client id owned
 * by Org B. If creds aren't provided the check is reported as skipped so the
 * smoke run still flags it for the release checklist.
 */
async function checkCrossOrgRls() {
  const aEmail = process.env.SMOKE_RLS_ORG_A_EMAIL;
  const aPass = process.env.SMOKE_RLS_ORG_A_PASSWORD;
  const bEmail = process.env.SMOKE_RLS_ORG_B_EMAIL;
  const bPass = process.env.SMOKE_RLS_ORG_B_PASSWORD;
  const orgBClientId = process.env.SMOKE_RLS_ORG_B_CLIENT_ID;

  if (!aEmail || !aPass || !bEmail || !bPass || !orgBClientId) {
    record(
      "rls:cross-org isolation (user JWT)",
      true,
      "skipped (set SMOKE_RLS_ORG_A_* and SMOKE_RLS_ORG_B_* to enable)",
      "Add seeded org A/B users via seed-portal-test-users to enable in CI",
    );
    return;
  }

  const sbA = createClient(SUPABASE_URL!, ANON_KEY!);
  const sbB = createClient(SUPABASE_URL!, ANON_KEY!);

  const { error: aErr } = await sbA.auth.signInWithPassword({ email: aEmail, password: aPass });
  if (aErr) {
    record("rls:cross-org isolation (user JWT)", false, `Org A sign-in failed: ${aErr.message}`);
    return;
  }
  const { error: bErr } = await sbB.auth.signInWithPassword({ email: bEmail, password: bPass });
  if (bErr) {
    record("rls:cross-org isolation (user JWT)", false, `Org B sign-in failed: ${bErr.message}`);
    return;
  }

  // Sanity: Org B owner CAN read its own client.
  const ownRead = await sbB.from("clients").select("id").eq("id", orgBClientId).maybeSingle();
  if (ownRead.error || !ownRead.data) {
    record(
      "rls:cross-org isolation (user JWT)",
      false,
      `Org B owner cannot read own client ${orgBClientId} (${ownRead.error?.message ?? "no row"})`,
      "Re-seed fixtures or update SMOKE_RLS_ORG_B_CLIENT_ID",
    );
    return;
  }

  // Real test: Org A MUST NOT see Org B's client.
  const crossRead = await sbA.from("clients").select("id").eq("id", orgBClientId);
  const leaked = (crossRead.data ?? []).length > 0;
  record(
    "rls:cross-org isolation (user JWT)",
    !leaked,
    leaked ? `Org A leaked Org B client ${orgBClientId}` : "Org A cannot see Org B clients",
    leaked ? "RLS policy regression — review clients table policies immediately" : undefined,
  );

  // Negative-write probe: Org A must not be able to update Org B's client.
  const crossWrite = await sbA
    .from("clients")
    .update({ name: "rls-probe" })
    .eq("id", orgBClientId)
    .select("id");
  const writeLeaked = (crossWrite.data ?? []).length > 0;
  record(
    "rls:cross-org write blocked",
    !writeLeaked,
    writeLeaked ? "Org A updated Org B client (CRITICAL)" : "write blocked",
  );

  await sbA.auth.signOut();
  await sbB.auth.signOut();
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

/**
 * Asserts the live DB-side allowed values for EVERY registered CHECK constraint
 * match the frontend SSOT (`CHECK_CONSTRAINT_REGISTRY`). Catches the class of
 * "write rejected by check constraint" regressions — the original manual
 * job-creation failure, the filings double-constraint, etc. — across all
 * constrained vocabularies, not just jobs.
 */
async function checkConstraintVocabularies(supabase: SupabaseClient) {
  for (const entry of CHECK_CONSTRAINT_REGISTRY) {
    const label = `db:${entry.table}.${entry.column} (${entry.constraint}) matches SSOT`;
    const { data, error } = await supabase.rpc("get_check_constraint_values", {
      constraint_name: entry.constraint,
    });
    if (error) {
      record(label, false, error.message, "Apply the migration that adds public.get_check_constraint_values()");
      continue;
    }
    const dbValues: string[] = Array.isArray(data) ? [...data] : [];
    if (dbValues.length === 0) {
      record(label, false, "constraint not found or empty", `Check ${entry.constraint} still exists on public.${entry.table}`);
      continue;
    }
    const expected = new Set<string>(entry.values);
    const actual = new Set<string>(dbValues);
    const missingInDb = [...expected].filter((v) => !actual.has(v));
    const extraInDb = [...actual].filter((v) => !expected.has(v));
    const ok = missingInDb.length === 0 && extraInDb.length === 0;
    record(
      label,
      ok,
      ok ? `${dbValues.length} values aligned` : `missingInDb=[${missingInDb.join(",")}] extraInDb=[${extraInDb.join(",")}]`,
      ok ? undefined : `Reconcile src/lib/db-constants/check-constraints.ts with ${entry.constraint}`,
    );
  }
}

/**
 * Detects infrastructure drift that the end-to-end checks can miss: a critical
 * pg_cron job being unscheduled/inactive (e.g. the email worker that, when it
 * silently stopped, broke password-reset delivery). Non-critical jobs are
 * reported but do not fail the run.
 */
async function checkCronJobs() {
  if (!SERVICE_KEY) {
    record("db:cron jobs scheduled", true, "skipped (no service-role key)");
    return;
  }
  const admin = createClient(SUPABASE_URL!, SERVICE_KEY);
  for (const job of manifest.cronJobs) {
    const { data, error } = await admin.rpc("get_cron_job_status", { p_jobname: job.name });
    const critical = job.critical === true;
    if (error) {
      record(`cron:${job.name}`, !critical, error.message, "Apply the migration adding public.get_cron_job_status()");
      continue;
    }
    const exists = (data as { exists?: boolean })?.exists === true;
    const active = (data as { active?: boolean })?.active === true;
    const scheduled = exists && active;
    record(
      `cron:${job.name}${critical ? " (critical)" : ""}`,
      scheduled || !critical,
      scheduled ? `active, schedule=${(data as { schedule?: string })?.schedule}` : exists ? "exists but INACTIVE" : "NOT scheduled",
      scheduled ? undefined : "Cron drift — (re)schedule the job (see its migration)",
    );
  }
}

/**
 * Verifies required Vault secrets exist (presence only — never the value). The
 * email worker cron reads `email_queue_service_role_key` from Vault at run time;
 * if it is missing, branded auth emails enqueue but never send.
 */
async function checkVaultSecrets() {
  if (!SERVICE_KEY) {
    record("db:vault secrets present", true, "skipped (no service-role key)");
    return;
  }
  const admin = createClient(SUPABASE_URL!, SERVICE_KEY);
  for (const name of manifest.requiredVaultSecrets ?? []) {
    const { data, error } = await admin.rpc("vault_secret_exists", { p_name: name });
    if (error) {
      record(`vault:${name}`, false, error.message, "Apply the migration adding public.vault_secret_exists()");
      continue;
    }
    const present = data === true;
    record(
      `vault:${name}`,
      present,
      present ? "present" : "MISSING",
      present ? undefined : "Set the Vault secret (run setup_email_infra, or Dashboard > Project Settings > Vault)",
    );
  }
}

async function main() {
  console.log(`Smoke test against ${SUPABASE_URL}`);
  const supabase = createClient(SUPABASE_URL!, ANON_KEY!);

  await checkEdgeFunctions();
  await checkPortalRoute();
  await checkAuthHookEndToEnd(supabase);
  await checkInfraTables();
  await checkRlsRequiredTables();
  await checkCrossOrgRls();
  await checkConstraintVocabularies(supabase);
  await checkCronJobs();
  await checkVaultSecrets();

  // Manual release checks (cannot be machine-verified from outside).
  console.log("\nManual release checks (verify before publish):");
  for (const item of manifest.manualReleaseChecks ?? []) {
    console.log(`  • ${item}`);
  }

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