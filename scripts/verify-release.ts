#!/usr/bin/env bunx tsx
/**
 * Independent live verifier. Hits the production `?action=version` probe and
 * asserts it matches the pending release record. Also runs any declared
 * `behavioural_smoke` probe.
 *
 * Exit codes:
 *   0 — verification.result = "pass"
 *   1 — verification.result = "fail"
 *   2 — verification.result = "inconclusive" (network/timeout/non-2xx handled
 *       as fail per convention §4a, but distinguished on stderr)
 *
 * Usage:
 *   bunx tsx scripts/verify-release.ts --release docs/releases/pending/<id>.json
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface VerificationAssertionResult {
  assertion: string;
  ok: boolean;
  actual?: unknown;
}

interface StepResult {
  name: string;
  endpoint: string;
  http_status: number | null;
  body: unknown;
  assertions: VerificationAssertionResult[];
  ok: boolean;
  note?: string;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function hit(method: string, url: string): Promise<{ status: number | null; body: unknown; note?: string }> {
  try {
    const resp = await fetch(url, { method });
    const text = await resp.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // leave as raw text
    }
    return { status: resp.status, body };
  } catch (e) {
    return { status: null, body: null, note: `network_error: ${(e as Error).message}` };
  }
}

async function main() {
  const releasePath = arg("release");
  if (!releasePath) {
    console.error("usage: bunx tsx scripts/verify-release.ts --release <pending.json>");
    process.exit(2);
  }
  const pending = JSON.parse(readFileSync(resolve(process.cwd(), releasePath), "utf8"));

  const steps: StepResult[] = [];
  let anyInconclusive = false;

  const probeArtifact = (pending.artifacts ?? []).find(
    (a: any) => a.expected_probe_response,
  );
  const probeEndpoint = pending.verification?.probe?.endpoint;

  if (probeArtifact && probeEndpoint) {
    const { status, body, note } = await hit(pending.verification.probe.method ?? "GET", probeEndpoint);
    const expected = probeArtifact.expected_probe_response;
    const assertions: VerificationAssertionResult[] = [];
    assertions.push({ assertion: "http_status == 200", ok: status === 200, actual: status });
    const b = (body ?? {}) as Record<string, unknown>;
    for (const key of ["sha", "source_sha", "release_id"] as const) {
      const expVal =
        key === "sha"
          ? pending.release_commit_sha
          : key === "source_sha"
          ? pending.source_commit_sha
          : pending.release_id;
      assertions.push({
        assertion: `body.${key} == ${JSON.stringify(expVal)}`,
        ok: b[key] === expVal,
        actual: b[key],
      });
    }
    assertions.push({
      assertion: "body.built_at is ISO-8601",
      ok: typeof b.built_at === "string" && !Number.isNaN(Date.parse(String(b.built_at))),
      actual: b.built_at,
    });
    const stepOk = status === 200 && assertions.every((a) => a.ok);
    if (status === null) anyInconclusive = true;
    steps.push({
      name: "probe",
      endpoint: probeEndpoint,
      http_status: status,
      body,
      assertions,
      ok: stepOk,
      note,
    });
  }

  const smoke = pending.verification?.behavioural_smoke;
  if (smoke?.target_company_number) {
    const base = probeEndpoint?.split("?")[0];
    if (base) {
      const smokeUrl = `${base}?action=profile&company_number=${encodeURIComponent(smoke.target_company_number)}`;
      const { status, body, note } = await hit(smoke.method ?? "GET", smokeUrl);
      const assertions: VerificationAssertionResult[] = [];
      assertions.push({ assertion: "http_status == 200", ok: status === 200, actual: status });
      const b = (body ?? {}) as Record<string, unknown>;
      assertions.push({
        assertion: `body.company_number == ${JSON.stringify(smoke.target_company_number)}`,
        ok: b.company_number === smoke.target_company_number,
        actual: b.company_number,
      });
      const stepOk = status === 200 && assertions.every((a) => a.ok);
      if (status === null) anyInconclusive = true;
      steps.push({
        name: "behavioural_smoke",
        endpoint: smokeUrl,
        http_status: status,
        body,
        assertions,
        ok: stepOk,
        note,
      });
    }
  }

  const allOk = steps.length > 0 && steps.every((s) => s.ok);
  const result: "pass" | "fail" = allOk ? "pass" : "fail";
  const output = {
    release_id: pending.release_id,
    result,
    inconclusive: anyInconclusive,
    steps,
    checked_at: new Date().toISOString(),
  };
  console.log(JSON.stringify(output, null, 2));
  if (result === "pass") process.exit(0);
  if (anyInconclusive) {
    console.error("verification inconclusive — treating as fail per convention §4a");
    process.exit(2);
  }
  process.exit(1);
}

main();