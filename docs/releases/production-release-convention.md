# Production Release Convention

**Status:** proposed · **Date:** 2026-07-21

## 1. Principle & roles

- **Git is the single source of truth** for the *intended* production state. Nothing reaches
  production except from a reviewed, merged commit.
- **The executor** (Lovable Cloud today; a git-driven CI pipeline is the target) is *authorised
  to apply* that intended state to production. It may not originate changes.
- **Verification is independent of the executor.** Every release is confirmed against the live
  database/function/app by a check that we run and that compares live state to the intended
  commit — never by the executor's own attestation alone.

A migration filename is **not** an adequate identifier: the executor assigns its own applied
timestamp, so the filename never matches `schema_migrations.version`. The binding identity of a
release is the **git commit SHA + file path + content checksum**, mapped to the live deployment
via a **release receipt** stored in git.

## 2. A "release" is a unit

A release is a set of artifacts that ship together, tied to **one merged commit SHA**, with a
declared **apply order**. Artifact types:

- `migration` — a SQL file under `supabase/migrations/`.
- `function` — an edge function under `supabase/functions/<name>/`.
- `frontend` — the built Vite app.

Dependencies are explicit (e.g. "frontend depends on migration X"). Verification of a dependency
**must pass before** the dependent artifact is applied/published. A coordinated release is never
"half-applied": if a step fails verification, the release halts and dependent steps do not run.

## 3. Per-artifact requirements

Every artifact in a release must have:

1. a **merged PR** and the exact **git commit SHA** it is built from;
2. the **file path** and an **immutable content checksum** (`sha256` of the file, or for a
   function the tree hash of its directory);
3. **application/deployment only from that reviewed commit** — no hand-edits in the executor's
   console, ever;
4. a **release receipt** (§4) committed to git;
5. a **post-release verification** (§6) run independently against live, with **evidence** recorded
   in the receipt — not a bare "pass".

## 4. Release receipt (the durable mapping)

Each release appends one machine-readable record to `docs/releases/release-log.jsonl`
(append-only; one JSON object per line). This is the durable git-commit ↔ live-deployment map
that filenames can't provide.

```json
{
  "release_id": "2026-07-21-person-model",
  "commit_sha": "7bef041a...",
  "approver": "leon@bluetickaccountants.com",
  "artifacts": [
    {
      "type": "migration",
      "path": "supabase/migrations/20260720190000_company_profile_person_fields.sql",
      "sha256": "…",
      "executor_applied_version": "20260720224301",   // Lovable's own timestamp
      "executor_applied_at": "2026-07-20T22:43:01Z",
      "verification": {
        "method": "object-existence",
        "evidence": "company_persons_org_ch_officer_uq present; is_signatory column present; …",
        "result": "pass"
      }
    },
    {
      "type": "function",
      "path": "supabase/functions/companies-house-sync",
      "tree_sha": "…",
      "verification": {
        "method": "version-endpoint",
        "evidence": "GET ?action=version → {\"sha\":\"7bef041a\",\"built_at\":\"…\"}",
        "result": "pass"
      }
    }
  ]
}
```

`executor_applied_version` is how we reconcile Lovable's re-timestamping: the receipt records
*both* our commit SHA and Lovable's applied version, so the mapping is never lost.

## 5. Edge function Git SHA exposure — attestation, not proof (required)

The version probe is an **attestation and a diagnosis aid, not independent verification.** If the
deployer sets `RELEASE_SHA`, the endpoint proves only that the deployer shipped code *claiming*
that SHA — it does **not** cryptographically prove the deployed bytes came from that commit. It is
a large improvement for observability (you can finally see what a function *says* it is), but real
provenance requires either CI stamping the SHA from the actual checked-out commit, or a behavioural
verification of the changed behaviour (§6). Treat a matching SHA as necessary, not sufficient.

Every deployed function must still be able to state which commit it is. Mechanism:

- At deploy time the deployer sets a **`RELEASE_SHA`** environment variable (secret) to the git
  commit SHA being deployed. In a git-driven CI deploy this is `git rev-parse HEAD`; if Lovable is
  the deployer it must inject the SHA it is deploying from.
- Each function **logs `RELEASE_SHA` on cold start**: `console.log("[boot] release_sha", sha)`.
- Each function answers a **version probe** with no side effects:

  ```ts
  // near the top of the request handler, before auth/business logic
  if (action === "version" || url.searchParams.get("action") === "version") {
    return jsonResponse(
      { sha: Deno.env.get("RELEASE_SHA") ?? "unset", built_at: Deno.env.get("RELEASE_BUILT_AT") ?? null },
      200,
    );
  }
  ```

The post-release check calls `…/functions/v1/<name>?action=version` and asserts the returned `sha`
**equals the release commit SHA**. A mismatch (or `"unset"`) means the deployed code is definitely
not the reviewed code — a failed release. A *match* is an attestation only (§5 opening): it must be
paired with a behavioural spot-check on the changed path (§6) before the release counts as verified.

> A `RELEASE_SHA` env var is only as honest as the deployer that sets it. When CI owns the deploy,
> the value is stamped from the actual checked-out commit and is trustworthy. While Lovable is the
> deployer it is self-reported — an attestation — so the behavioural spot-check is what actually
> verifies the release.

## 6. Verification methods (evidence required)

- **Migration → definition-exact catalog check.** Asserting an object *name* exists is not enough —
  it hides a wrong type/default/nullability, wrong index columns/predicate/uniqueness, a wrong
  function body, a wrong RLS `USING`/`WITH CHECK` expression, or a missing grant. For any sensitive
  migration the checker compares the **expected definitions** against the live catalog:
  `pg_get_functiondef(oid)` for functions, `pg_get_indexdef(oid)` for indexes,
  `pg_policies.qual` / `with_check` for RLS, `information_schema.columns`
  (`data_type` / `column_default` / `is_nullable`) for columns, and the relevant ACL/grants — not
  just presence by name. Record the actual catalog output as evidence. (Checksums verify the *git*
  file; they cannot verify a live migration.)
- **Function → SHA attestation** (§5) **plus** one behavioural smoke call on the changed path — the
  attestation alone does not verify (§5 opening).
- **Frontend → embedded SHA.** The build embeds `VITE_RELEASE_SHA`; the live app exposes it at
  `/version` (or a `<meta name="release-sha">`). Verification fetches it and asserts it equals the
  release commit SHA. This catches stale published UI.

"Verification result: pass" without recorded evidence is not acceptable — the evidence is the point.

## 7. Failure handling & exceptions

- **Verification fails** → the release is marked `failed` in the log, dependent steps do not run,
  and remediation happens before anything downstream ships.
- **Any direct-to-production change without a receipt** (a console hand-patch, an out-of-band
  migration) is an **exception** and requires an incident-style record in
  `docs/releases/incidents/`: what changed, why, who, the drift it introduced, and the action taken
  to bring git back into sync. The goal is that git can always be re-derived as truth.

## 8. Control today vs. control later

**Be precise about what enforces this.** While Lovable is the only system permitted to deploy, CI
**cannot enforce deployment** — it cannot stop or gate a Lovable deploy that already happened. So:

- **Today (Lovable is the executor): independent post-release *verification*** — a *detective*
  control. After each Lovable release we run the checks (§6) from an independent live connection
  (read-only DB role + the function attestation endpoints + the frontend `/version`) and record the
  evidence in the receipt. If verification fails, the release is `failed` and **dependent** steps do
  not proceed — but the underlying deploy has already occurred and can only be *detected and
  remediated*, not prevented. This detective check **replaces** the filename-based drift guard,
  which is structurally defeated by Lovable's re-timestamping.
- **Later (CI is the executor): *enforcement*** — a *preventive* control. When CI owns the deploy
  end-to-end, receipt creation, SHA stamping, and verification become steps in the deploy job, and a
  change cannot reach production without passing them. Only then is the convention enforced rather
  than verified-after-the-fact.

## 9. Adoption — pilot before rollout

Do not instrument everything up front. Prove Lovable can faithfully execute a declared revision on
**one** function first:

1. Put the two questions to Lovable: can it deploy strictly from an **exact immutable git SHA**, and
   can it set a **per-release `RELEASE_SHA`**?
2. Add the version probe + boot log to **`companies-house-sync` only**.
3. Run **one complete test release**: approved commit → Lovable deploy → independent live probe +
   definition-exact DB checks → a recorded receipt.
4. Roll the probe out to the other functions **only if** that test proves the attestation matches the
   intended SHA and the behaviour matches the intended commit. If it doesn't, that is the signal to
   move the executor to CI.
