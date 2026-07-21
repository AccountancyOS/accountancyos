// Independent post-release verifier (convention §6). Runs from OUTSIDE the
// executor: it hits the live function's version probe and a behavioural smoke,
// and asserts the attestation matches the declared release. No DB access needed
// for the function artifact; database artifacts are checked by verify-*.sql.
//
// Usage:
//   PROD_BASE=https://<ref>.functions.supabase.co \
//   ANON_KEY=<supabase anon key> \
//   EXPECTED_SOURCE_SHA=<source_commit_sha from the pending record> \
//   EXPECTED_RELEASE_ID=2026-07-21-ch-sync-pilot-v1 \
//   deno run --allow-net --allow-env scripts/verify-release.ts
//
// Exit 0 = pass (prints the evidence JSON to paste into the receipt); non-zero = fail.

const base = Deno.env.get("PROD_BASE");
const anonKey = Deno.env.get("ANON_KEY");
const expectedSha = Deno.env.get("EXPECTED_SOURCE_SHA");
const expectedReleaseId = Deno.env.get("EXPECTED_RELEASE_ID");
const fn = Deno.env.get("FUNCTION") ?? "companies-house-sync";

if (!base || !anonKey || !expectedSha || !expectedReleaseId) {
  console.error(
    "Missing env. Required: PROD_BASE, ANON_KEY, EXPECTED_SOURCE_SHA, EXPECTED_RELEASE_ID.",
  );
  Deno.exit(2);
}

const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
const failures: string[] = [];

// 1. Version attestation.
const versionUrl = `${base}/functions/v1/${fn}?action=version`;
const vRes = await fetch(versionUrl, { headers });
const vBody = await vRes.json().catch(() => ({}));
if (vRes.status !== 200) failures.push(`version probe HTTP ${vRes.status}`);
if (vBody.source_sha !== expectedSha) {
  failures.push(`source_sha "${vBody.source_sha}" != expected "${expectedSha}"`);
}
if (vBody.release_id !== expectedReleaseId) {
  failures.push(`release_id "${vBody.release_id}" != expected "${expectedReleaseId}"`);
}

// 2. Behavioural smoke — proves the live CH path is deployed (not a stale mock):
//    the search action must return an items[] array from the real API.
const smokeUrl = `${base}/functions/v1/${fn}`;
const sRes = await fetch(smokeUrl, {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ action: "search", query: "tesco" }),
});
const sBody = await sRes.json().catch(() => ({}));
const smokeOk = sRes.status === 200 && Array.isArray(sBody?.items);
if (!smokeOk) failures.push(`search smoke: HTTP ${sRes.status}, items is ${typeof sBody?.items}`);

const evidence = {
  function: fn,
  version_probe: { url: versionUrl, status: vRes.status, body: vBody },
  behavioural_smoke: { status: sRes.status, item_count: Array.isArray(sBody?.items) ? sBody.items.length : null },
  result: failures.length === 0 ? "pass" : "fail",
  failures,
};

console.log(JSON.stringify(evidence, null, 2));
Deno.exit(failures.length === 0 ? 0 : 1);
