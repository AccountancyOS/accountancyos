import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * Cutover workstream A (security containment) — static guards on the edge-function changes.
 * The database half is covered by docs/migration/london-increments/006_* and
 * supabase/tests/006_security_containment.test.sql.
 */
const root = resolve(__dirname, "../../../");
const fnDir = resolve(root, "supabase/functions");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const functionSources = walk(fnDir).filter((p) => /\.(ts|tsx|js|json)$/.test(p));
const functionDirs = readdirSync(fnDir).filter(
  (d) => d !== "_shared" && statSync(join(fnDir, d)).isDirectory(),
);

describe("A4.6 — no hosting-platform origins baked into edge functions", () => {
  // (The retired-platform string scan now lives in no-legacy-platform.test.ts.)
  it("trusted origins come only from ALLOWED_ORIGINS", () => {
    const src = read("supabase/functions/_shared/origins.ts");
    expect(src).toMatch(/Deno\.env\.get\('ALLOWED_ORIGINS'\)/);
    expect(src).not.toMatch(/endsWith\(/); // no suffix matching
  });

  it("redirect-building functions use the shared resolver and fail closed when unconfigured", () => {
    for (const f of ["onboarding-stripe-checkout", "stripe-checkout", "portal-pay-invoice"]) {
      const src = read(`supabase/functions/${f}/index.ts`);
      expect(src, f).toMatch(/from "\.\.\/_shared\/origins\.ts"/);
      expect(src, f).toMatch(/not_configured/);
      expect(src, f).not.toMatch(/function resolveAppBaseUrl/);
    }
  });
});

describe("A4.7 — ENCRYPTION_KEY fails closed", () => {
  it("no function carries the published fallback key or the padEnd derivation", () => {
    const offenders = functionSources.filter((p) => {
      const s = readFileSync(p, "utf8");
      return s.includes("default-dev-key") || /ENCRYPTION_KEY[^\n]*padEnd/.test(s) || /padEnd\(32/.test(s);
    });
    expect(offenders).toEqual([]);
  });

  it("the shared cipher requires a 32-byte base64 key and derives with HKDF-SHA256", () => {
    const src = read("supabase/functions/_shared/token-crypto.ts");
    expect(src).toMatch(/TokenCryptoNotConfiguredError/);
    expect(src).toMatch(/bytes\.length !== 32/);
    expect(src).toMatch(/name: 'HKDF', hash: 'SHA-256'/);
    expect(src).not.toMatch(/\|\|\s*['"][^'"]+['"]/); // no `|| 'fallback'`
  });

  it("every HMRC token reader/writer goes through the shared cipher", () => {
    for (const p of [
      "supabase/functions/_shared/hmrc-auth.ts",
      "supabase/functions/hmrc-callback/index.ts",
      "supabase/functions/hmrc-vat-obligations/index.ts",
    ]) {
      const src = read(p);
      expect(src, p).toMatch(/token-crypto\.ts/);
      expect(src, p).not.toMatch(/Deno\.env\.get\(['"]ENCRYPTION_KEY['"]\)/);
    }
    expect(read("supabase/functions/hmrc-callback/index.ts")).toMatch(/notConfiguredResponse/);
    expect(read("supabase/functions/hmrc-vat-obligations/index.ts")).toMatch(/notConfiguredResponse/);
    expect(read("supabase/functions/hmrc-vat-submit/index.ts")).toMatch(/ENCRYPTION_NOT_CONFIGURED[\s\S]{0,400}status: 503/);
  });
});

describe("A4.1 — verify_jwt is an explicit decision for every function", () => {
  const toml = read("supabase/config.toml");
  const lines = toml.split("\n");
  const declared = new Map<string, { value: string; line: number }>();
  lines.forEach((l, i) => {
    const m = l.match(/^\s*\[functions\.([a-z0-9-]+)\]\s*$/);
    if (m) {
      const v = (lines[i + 1] ?? "").match(/^\s*verify_jwt\s*=\s*(true|false)\s*$/);
      if (v) declared.set(m[1], { value: v[1], line: i });
    }
  });

  it("every function directory has an explicit verify_jwt entry", () => {
    const missing = functionDirs.filter((d) => !declared.has(d));
    expect(missing).toEqual([]);
  });

  it("config.toml declares no function that does not exist", () => {
    const stale = [...declared.keys()].filter((d) => !functionDirs.includes(d));
    expect(stale).toEqual([]);
  });

  it("every verify_jwt = false entry sits under a comment justifying it", () => {
    const unjustified = [...declared.entries()]
      .filter(([, d]) => d.value === "false")
      .filter(([, d]) => {
        // Walk up past sibling entries in the same group until a comment line is found.
        for (let i = d.line - 1; i >= 0; i--) {
          const l = lines[i].trim();
          if (l.startsWith("#")) return false;
          if (l === "" || l.startsWith("[functions]")) return true;
        }
        return true;
      })
      .map(([name]) => name);
    expect(unjustified).toEqual([]);
  });
});

describe("A3 — QA tooling is not deployable", () => {
  it("seed-portal-test-users and portal-qa-probe are not under supabase/functions", () => {
    expect(existsSync(resolve(fnDir, "seed-portal-test-users"))).toBe(false);
    expect(existsSync(resolve(fnDir, "portal-qa-probe"))).toBe(false);
  });

  it("they live under scripts/qa with a never-deploy README", () => {
    expect(existsSync(resolve(root, "scripts/qa/seed-portal-test-users/index.ts"))).toBe(true);
    expect(existsSync(resolve(root, "scripts/qa/portal-qa-probe/index.ts"))).toBe(true);
    expect(read("scripts/qa/README.md")).toMatch(/NEVER DEPLOY/);
  });

  it("PORTAL_SEED_SECRET is not a production secret any more", () => {
    expect(read("infra/supabase-manifest.json")).not.toMatch(/PORTAL_SEED_SECRET|seed-portal-test-users|portal-qa-probe/);
    expect(read("docs/migration/london-baseline/SECRETS.md")).not.toMatch(/PORTAL_SEED_SECRET/);
  });
});

describe("A4.3 / A4.4 — the email drain and mailbox senders", () => {
  const drain = read("supabase/functions/process-email-queue/index.ts");

  it("only the service role can trigger the drain (no end-user JWT accepted)", () => {
    expect(drain).toMatch(/timingSafeEqualString\(bearer, supabaseServiceKey\)/);
    expect(drain).not.toMatch(/callerRole !== 'service_role' && callerRole !== 'authenticated'/);
  });

  it("a queue row's mailbox_id is honoured only within the row's organisation", () => {
    const fn = drain.slice(drain.indexOf("async function resolvePracticeMailbox"), drain.indexOf("async function sendViaPracticeMailbox"));
    expect(fn).toMatch(/\.eq\('id', queueRow\.mailbox_id\)\s*\n\s*\.eq\('organization_id', orgId\)/);
    expect(fn).not.toMatch(/return \{ id: queueRow\.mailbox_id/); // never trusts the row without a lookup
    expect(drain).toMatch(/organization_id: mailbox\.organization_id/); // passed through to the sender
  });

  it("gmail-send and outlook-send scope service-role calls to the named organisation", () => {
    for (const f of ["gmail-send", "outlook-send"]) {
      const src = read(`supabase/functions/${f}/index.ts`);
      expect(src, f).toMatch(/organization_id is required/);
      expect(src, f).toMatch(/\.eq\('organization_id', body\.organization_id\)/);
    }
  });

  it("the browser never invokes the global drain", () => {
    const offenders = walk(resolve(root, "src"))
      .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes(`${join("src", "test")}`))
      .filter((p) => /functions\.invoke\(\s*["']process-email-queue["']/.test(readFileSync(p, "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("A4.2 — onboarding Stripe functions authenticate the applicant", () => {
  it("checkout and verify both require the onboarding access token", () => {
    for (const f of ["onboarding-stripe-checkout", "onboarding-stripe-verify"]) {
      const src = read(`supabase/functions/${f}/index.ts`);
      expect(src, f).toMatch(/validate_onboarding_access_token/);
      expect(src, f).toMatch(/"unauthorized"/);
    }
  });

  it("verify binds the Stripe session to the application and takes the amount from Stripe", () => {
    const src = read("supabase/functions/onboarding-stripe-verify/index.ts");
    expect(src).toMatch(/stripe_checkout_session_id !== session_id/);
    expect(src).toMatch(/session\.metadata\?\.onboarding_application_id !== application_id/);
    expect(src).toMatch(/session\.amount_total \/ 100/);
    expect(src).not.toMatch(/app\.access_token/); // never the token stored in the DB
    expect(src).not.toMatch(/billing_amount \?\?/); // never a stored or client figure
  });

  it("checkout refuses to reopen a completed payment", () => {
    expect(read("supabase/functions/onboarding-stripe-checkout/index.ts")).toMatch(/already_paid/);
  });

  it("the public onboarding page sends its token to both functions", () => {
    const src = read("src/pages/PublicOnboarding.tsx");
    const calls = src.match(/functions\.invoke\("onboarding-stripe-(checkout|verify)"[\s\S]{0,200}?access_token: getAccessToken\(\)/g) ?? [];
    expect(calls.length).toBe(2);
  });
});

describe("A4.5 / A2 — tenant binding and token hygiene in edge code", () => {
  it("automation-dry-run binds every service-role lookup to the caller's organisations", () => {
    const src = read("supabase/functions/automation-dry-run/index.ts");
    expect(src).toMatch(/from\("organization_users"\)[\s\S]*\.eq\("user_id", callerId\)/);
    expect((src.match(/\.in\("organization_id", orgIds\)/g) ?? []).length).toBe(3); // client, company, policy
  });

  it("truelayer-callback no longer stores token material as provider_connection_id", () => {
    const src = read("supabase/functions/truelayer-callback/index.ts");
    expect(src).not.toMatch(/provider_connection_id:\s*tokens\.access_token/);
  });

  it("user-JWT reads of connected_mailboxes name non-secret columns only", () => {
    const src = read("supabase/functions/send-engagement-letter/index.ts");
    expect(src).toMatch(/userSupabase\s*\n\s*\.from\('connected_mailboxes'\)\s*\n\s*\.select\('id, provider, email_address, status'\)/);
  });
});

describe("Increment 006 SQL — structure", () => {
  const sql = read("docs/migration/london-increments/006_security_containment.sql");

  it("revokes from PUBLIC explicitly for every A1 function", () => {
    const targets = [
      "post_to_ledger", "approve_invoice", "approve_bill", "record_invoice_payment", "record_bill_payment",
      "read_email_batch", "enqueue_email", "delete_email", "move_to_dlq", "lifecycle_send_back_onboarding",
      "public_complete_billing", "trigger_records_request", "get_trial_balance_from_ledger",
    ];
    for (const t of targets) {
      expect(sql, t).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${t}\\([^)]*\\) FROM PUBLIC`));
    }
    expect((sql.match(/^REVOKE ALL ON FUNCTION .* FROM PUBLIC/gm) ?? []).length).toBe(16);
  });

  it("no rewritten body takes its actor from a caller-supplied parameter", () => {
    expect(sql).not.toMatch(/:= COALESCE\(p_(created_by|user_id), auth\.uid\(\)\)/);
  });

  it("is not placed where the legacy executor would run it", () => {
    expect(existsSync(resolve(root, "supabase/migrations/006_security_containment.sql"))).toBe(false);
  });
});
