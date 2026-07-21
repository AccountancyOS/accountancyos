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

### 1a. Attestation-based, not Git-pinned (temporary posture)

Under the current Lovable executor surface this convention delivers **attested, detective**
release control — not preventive, Git-pinned deployment. Two capability gaps make this explicit:

1. **No commit-pinned deploy.** `supabase--deploy_edge_functions` ships the workspace file tree
   at invocation time. There is no `--rev` / tag / commit argument, so the executor cannot be
   ordered to deploy "exactly commit X". We can only stamp identity into the tree, then deploy
   the tree, then verify what came back.
2. **No per-release, per-function env injection.** Secrets are workspace-wide and persistent.
   `RELEASE_SHA` as an env var would apply to every function and drift on the next unrelated
   deploy. Identity therefore travels as a **committed `VERSION.ts`** inside each function
   directory, not as an env var.

Every receipt produced under this convention MUST be marked
`release_kind: "attestation-based"`. Fully preventive, Git-pinned deployment requires either a
Lovable capability change (commit-pinned deploy + per-release env injection) or moving
production to infrastructure controlled by our own CI pipeline. This limitation is recorded
in §10.

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

### 2a. Two commit SHAs per release (source vs. release)

Stamping `VERSION.ts` mutates the workspace, so the commit whose tree is actually deployed is
**not** the commit that was reviewed. Every release therefore carries two SHAs, and both are
mandatory in the pending record and the receipt:

- **`source_commit_sha`** — the reviewed, merged commit that authorises the change. This is
  what a human approver signed off on and what appears in the PR.
- **`release_commit_sha`** — the commit created *after* `VERSION.ts` is stamped with
  `source_commit_sha`. This is the commit whose tree is actually shipped to Lovable, and the
  value the live `?action=version` probe must return.

`release_commit_sha` MUST be a direct descendant of `source_commit_sha` and MUST differ from it
in exactly one file per stamped function: `supabase/functions/<name>/VERSION.ts`. Any other
diff between the two SHAs invalidates the release and it must be redeclared.

The **artifact checksum** in the receipt is computed against the **post-stamp workspace**
(i.e. against `release_commit_sha`'s tree), never against `source_commit_sha`'s tree — the
pre-stamp checksum does not describe what shipped.

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
  "release_kind": "attestation-based",
  "source_commit_sha": "7bef041a...",
  "release_commit_sha": "9c22b0e1...",
  "approver": "leon@bluetickaccountants.com",
  "release_window": {
    "locked_at": "2026-07-21T09:00:00Z",
    "deployed_at": "2026-07-21T09:04:12Z",
    "unlocked_at": "2026-07-21T09:11:40Z",
    "workspace_clean_at_lock": true,
    "head_equalled_release_commit_at_lock": true
  },
  "artifacts": [
    {
      "type": "migration",
      "path": "supabase/migrations/20260720190000_company_profile_person_fields.sql",
      "sha256_post_stamp": "…",
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
      "tree_sha_post_stamp": "…",
      "executor_deployed_at": "2026-07-21T09:04:12Z",
      "verification": {
        "method": "version-endpoint",
        "evidence": "GET /functions/v1/companies-house-sync?action=version → {\"source_sha\":\"7bef041a\",\"release_id\":\"2026-07-21-...\",\"built_at\":\"…\"} — source_sha matches source_commit_sha, release_id matches pending; behavioural smoke: CH profile fetch for 00000006 returned 200 with company_number field",
        "result": "pass"
      }
    }
  ]
}
```

`executor_applied_version` is how we reconcile Lovable's re-timestamping: the receipt records
*both* our commit SHA and Lovable's applied version, so the mapping is never lost.

The probe returns `source_sha` (== `source_commit_sha`, what was reviewed) and `release_id`. It
**cannot** return `release_commit_sha` — a commit can never contain its own hash — so
`release_commit_sha` is proven procedurally by §4a (`HEAD == release_commit_sha` + clean tree at
deploy), not self-reported by the function.

### 4a. Mandatory pre-deploy checks (executor is Lovable)

Because the executor cannot be pinned to a commit, the release window is protected procedurally.
Before calling `supabase--deploy_edge_functions` (or `supabase--migration`), the operator MUST,
in order, and record each in the receipt under `release_window`:

1. **Head equals release commit.** `git rev-parse HEAD` == `release_commit_sha`. If not, abort.
2. **Workspace is clean.** `git status --porcelain` returns empty. No untracked, no unstaged,
   no staged-but-uncommitted changes. If not, abort.
3. **Post-stamp checksum recomputed and matches the pending record.** Recompute the artifact
   checksum against the current tree and confirm it equals the value in
   `docs/releases/pending/<id>.json`. If not, abort — the tree drifted after declaration.
4. **Release window locked.** From `locked_at` until `unlocked_at`, no other workspace edits,
   no other tool calls that mutate files, no other deploys. Any interruption voids the window
   and the release must be redeclared.
5. **Deploy.** Call the executor tool for exactly the declared artifacts, nothing else.
6. **Independent verification.** Run the version probe against the **production** endpoint
   (custom domain, not preview) and the declared behavioural smoke call. Record raw output as
   evidence — not a bare "pass".
7. **Unlock and commit receipt.** Append the record to `docs/releases/release-log.jsonl`.

A release that skips any step is an **exception** under §7 and requires an incident record.

## 5. Edge function Git SHA exposure — attestation, not proof (required)

The version probe is an **attestation and a diagnosis aid, not independent verification.** If the
deployer sets `RELEASE_SHA`, the endpoint proves only that the deployer shipped code *claiming*
that SHA — it does **not** cryptographically prove the deployed bytes came from that commit. It is
a large improvement for observability (you can finally see what a function *says* it is), but real
provenance requires either CI stamping the SHA from the actual checked-out commit, or a behavioural
verification of the changed behaviour (§6). Treat a matching SHA as necessary, not sufficient.

Every deployed function must still be able to state which commit it is. Mechanism:

- At deploy time the deployer stamps `VERSION.ts` (`source_commit_sha` + `release_id`) with the
  reviewed commit being deployed, then deploys the tree. Env vars cannot carry per-function,
  per-release identity under Lovable (see §1a); under CI the same stamp is written from the actual
  checkout.
- Each function **logs its stamp on cold start**:
  `console.log("[boot] source_sha", VERSION.source_commit_sha)`.
- Each function answers a **version probe** with no side effects:

  ```ts
  // near the top of the request handler, before auth/business logic
  if (action === "version" || url.searchParams.get("action") === "version") {
    return jsonResponse(
      {
        function: "companies-house-sync",
        source_sha: VERSION.source_commit_sha, // what was reviewed (release_commit_sha proven by §4a)
        release_id: VERSION.release_id,
        built_at: VERSION.built_at,
      },
      200,
    );
  }
  ```

Under the Lovable executor, identity is sourced from a committed `VERSION.ts` in the function
directory, not from `Deno.env.get("RELEASE_SHA")` — workspace-wide secrets cannot carry
per-function, per-release identity (see §1a). The post-release check calls
`…/functions/v1/<name>?action=version` against the **production custom domain** and asserts
`source_sha == source_commit_sha` AND `release_id == pending.release_id` (with §4a proving the
shipped tree is `release_commit_sha`). A mismatch on either, or an `"unset"`/absent field, is a
failed release. A full match is still attestation only (§5 opening) and must be
paired with a behavioural spot-check on the changed path (§6).

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

## 10. Architectural limitation (recorded)

**Fully preventive, Git-pinned production deployment is not achievable on the current Lovable
Cloud executor surface.** Two independent gaps cause this:

| Gap | Consequence | Remediation |
| --- | ----------- | ----------- |
| No commit-pinned deploy tool (`deploy_edge_functions` ships the current workspace tree) | Cannot prove "commit X was deployed"; only "the tree at deploy time claimed to be commit X" | Lovable adds `--rev` / commit argument, OR move production deploy to our own CI |
| No per-release, per-function env injection (secrets are workspace-wide and persistent) | `RELEASE_SHA` cannot safely be an env var; identity must live in a committed `VERSION.ts` | Lovable adds per-deploy env vars, OR move production deploy to our own CI |

While these gaps exist, this convention is **temporary containment and drift detection**, not
proof of provenance. Every receipt is marked `release_kind: "attestation-based"`. When either
gap closes, revise this section, introduce `release_kind: "git-pinned"`, and gate the receipt
schema on the new capability.

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
