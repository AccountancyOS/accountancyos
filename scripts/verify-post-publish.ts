#!/usr/bin/env -S deno run --allow-env --allow-read --allow-write --allow-run
// Automated post-publish verifier for data-migration releases.
//
// Reads a pending release JSON (`docs/releases/pending/<id>.json`) that carries
// a `post_publish_verification` block, executes every declared check against
// the LIVE database via managed `psql` (using the ambient PG* env vars), and
// records structured evidence back into the record.
//
// Gate policy (convention §6 + §10):
//   - If ANY check fails, exit non-zero and DO NOT move the file. The release
//     stays in docs/releases/pending/ and status is set to
//     "post-publish-verification-failed" with per-check evidence attached.
//   - Only when ALL checks pass AND `--finalize` is passed does the runner
//     flip status to "applied-verified", stamp `verified_at`, populate the
//     `expected_objects[].result` fields (id-matched), and move the file into
//     docs/releases/.
//
// Usage:
//   deno run -A scripts/verify-post-publish.ts \
//     docs/releases/pending/2026-07-24-reset-bluetick-test-client-data.json \
//     [--finalize] [--approver=<name>]
//
// Requires: PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE in env (the same
// managed access the exec sandbox exposes for LIVE reads).

import { dirname, basename, join } from "https://deno.land/std@0.224.0/path/mod.ts";

type Check = {
  id: string;
  kind: "count_equals" | "count_at_least";
  expected: number;
  sql: string;
};

type Verification = {
  runner: string;
  environment: string;
  gate_policy: string;
  org_id: string;
  checks: Check[];
};

type Receipt = Record<string, unknown> & {
  release_id: string;
  status: string;
  post_publish_verification: Verification;
  migrations?: Array<{ expected_objects?: Array<{ id: string; result: string; [k: string]: unknown }> }>;
};

const args = Deno.args.slice();
const finalize = args.includes("--finalize");
const approver = (args.find((a) => a.startsWith("--approver=")) ?? "").split("=")[1] ?? null;
const path = args.find((a) => !a.startsWith("--"));

if (!path) {
  console.error("Usage: verify-post-publish.ts <pending-receipt.json> [--finalize] [--approver=<name>]");
  Deno.exit(2);
}

for (const k of ["PGHOST", "PGUSER", "PGPASSWORD", "PGDATABASE"]) {
  if (!Deno.env.get(k)) {
    console.error(`Missing required env: ${k}. Aborting — this verifier must run against LIVE via managed psql.`);
    Deno.exit(2);
  }
}

const raw = await Deno.readTextFile(path);
const receipt = JSON.parse(raw) as Receipt;
const v = receipt.post_publish_verification;
if (!v || !Array.isArray(v.checks) || v.checks.length === 0) {
  console.error("Receipt has no post_publish_verification.checks block; nothing to verify.");
  Deno.exit(2);
}

async function psqlScalar(sql: string, param: string): Promise<number> {
  // Parameterised via psql -v; SQL uses $1 which we rewrite to :'org' to keep injection surface minimal.
  const bound = sql.replace(/\$1/g, `:'org'`);
  const cmd = new Deno.Command("psql", {
    args: ["-A", "-t", "-v", "ON_ERROR_STOP=1", "-v", `org=${param}`, "-c", bound],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await cmd.output();
  if (code !== 0) {
    throw new Error(`psql exit ${code}: ${new TextDecoder().decode(stderr).trim()}`);
  }
  const out = new TextDecoder().decode(stdout).trim();
  const n = Number(out);
  if (!Number.isFinite(n)) throw new Error(`Non-numeric psql result: "${out}"`);
  return n;
}

type Result = { id: string; kind: string; expected: number; actual: number | null; pass: boolean; error?: string };
const results: Result[] = [];

for (const c of v.checks) {
  try {
    const actual = await psqlScalar(c.sql, v.org_id);
    const pass = c.kind === "count_equals" ? actual === c.expected : actual >= c.expected;
    results.push({ id: c.id, kind: c.kind, expected: c.expected, actual, pass });
  } catch (e) {
    results.push({ id: c.id, kind: c.kind, expected: c.expected, actual: null, pass: false, error: String(e) });
  }
}

const allPass = results.every((r) => r.pass);
const verifiedAt = new Date().toISOString();

const evidence = {
  runner: "scripts/verify-post-publish.ts",
  verified_at: verifiedAt,
  environment: v.environment,
  org_id: v.org_id,
  results,
  overall: allPass ? "pass" : "fail",
};

console.log(JSON.stringify(evidence, null, 2));

// Always write evidence back into the record so failures are auditable.
(receipt as Record<string, unknown>).post_publish_verification_evidence = evidence;

if (!allPass) {
  receipt.status = "post-publish-verification-failed";
  await Deno.writeTextFile(path, JSON.stringify(receipt, null, 2) + "\n");
  console.error(`\nGATE: ${results.filter((r) => !r.pass).length} check(s) failed. Release NOT finalized; file kept in docs/releases/pending/.`);
  Deno.exit(1);
}

if (!finalize) {
  await Deno.writeTextFile(path, JSON.stringify(receipt, null, 2) + "\n");
  console.error("\nAll checks pass. Re-run with --finalize to mark applied-verified and move into docs/releases/.");
  Deno.exit(0);
}

// Finalize: stamp status, fill expected_objects[].result by id, move file.
receipt.status = "applied-verified";
(receipt as Record<string, unknown>).verified_at = verifiedAt;
if (approver) (receipt as Record<string, unknown>).approver = approver;

const byId = new Map(results.map((r) => [r.id, r] as const));
for (const m of receipt.migrations ?? []) {
  for (const obj of m.expected_objects ?? []) {
    const r = byId.get(obj.id);
    if (r) {
      obj.result = r.pass ? "pass" : "fail";
      (obj as Record<string, unknown>).actual = r.actual;
      (obj as Record<string, unknown>).expected = r.expected;
    }
  }
}

const destDir = join(dirname(path), "..");
const destPath = join(destDir, basename(path));
await Deno.writeTextFile(destPath, JSON.stringify(receipt, null, 2) + "\n");
await Deno.remove(path);
console.error(`\nFinalized: moved ${path} -> ${destPath} (status=applied-verified).`);
Deno.exit(0);