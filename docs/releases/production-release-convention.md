# Production Release Convention

**Status:** canonical. Supersedes any earlier draft.

Git is the source of truth for intended production state. Lovable Cloud is the
authorised executor. Every production change must be traceable from an exact
reviewed Git revision to independently verified live state.

---

## 1. Executor capability — what is guaranteed vs. only recorded

Two hard facts shape this convention. Both are stated in the tooling and both
drive the "independent verification is mandatory" rule.

| Question | Answer |
| --- | --- |
| Can Lovable apply a migration or deploy an edge function from an exact immutable Git commit SHA / tag supplied by the caller? | **No.** The migration and deploy tools operate on the workspace's current file tree at the moment the tool is invoked. There is no `--rev` / `--sha` parameter. Deployment identity is **asserted** by the deployer and **attested** by a stamped `VERSION.ts`; it is **not cryptographically pinned by the tool**. |
| Can Lovable inject per-release `RELEASE_SHA` / `RELEASE_BUILD_AT` env values into an edge-function deployment? | **No** distinct per-release env-var injection API exists. The workable substitute is a **stamped `VERSION.ts`** committed alongside each release-managed function, produced by `scripts/stamp-release.ts`. It is visible at runtime via `?action=version` and at cold start in logs, and is covered by the artifact checksum. |

**Consequence.** A Lovable-filled "applied" receipt is **not** sufficient
evidence. Every release must pass an independent post-deploy verification
(§5) before it can be recorded as `succeeded`.

---

## 2. Release identity

Identity of a release is the triple:

```
{ git_sha, artifact_checksum, release_id }
```

Lovable's applied-version timestamp and function deployment timestamp are
recorded **only** as bridge fields — never as identity.

- `git_sha` — the merged-to-`main` commit SHA that carries the change.
- `artifact_checksum` — deterministic SHA-256 of the deployable surface:
  - Migrations: SHA-256 of the migration `.sql` file bytes.
  - Edge functions: SHA-256 over the sorted list of `(path, sha256(bytes))`
    covering `supabase/functions/<name>/**`, `supabase/functions/_shared/**`,
    the function's block in `supabase/config.toml`, and `deno.json` /
    import-map if present. `VERSION.ts` is excluded because stamping would
    otherwise invalidate its own input.
- `release_id` — human-readable `YYYY-MM-DD-<slug>` unique per release.

Migration filenames alone are **not** identity. Lovable assigns its own
`applied_version` timestamp and it will not equal the filename.

---

## 3. Release lifecycle

Every production change goes through the same states:

```
 pending  →  approved  →  applying  →  verifying  →  succeeded | failed
                                                        │
                                                        └→ rolled_back
```

### 3.1 Pending (declared in PR)

A file `docs/releases/<release_id>.json` is committed with the change and
validates against `_schema/pending-release.schema.json`:

- `release_id`, `owner`, `approver`
- `source.commit_sha`, `source.pr_url`, `source.branch`
- `artifacts[]` — each with `kind` (`migration` | `edge_function` | `frontend`),
  `path`, `artifact_checksum`, and for functions the `stamped_version_file`
- `deployment_order[]` — ordered list of artifact ids
- `expectations[]` — the exact live-state assertions §5 will check
- `verification.commands[]` — commands the verifier will run
- `rollback.steps[]`

### 3.2 Approved

Approver signs off in the PR. No live changes yet.

### 3.3 Applying

Lovable applies in the declared order. Ordering is one release, one unit
(§4). No step proceeds until the previous step is independently verified.

### 3.4 Verifying

`scripts/verify-release.ts` is run against the **production custom domain**
(`app.accountancyos.com`, `client.accountancyos.com`) and production function
endpoints. Verification is exact-state (§5), not existence-only. An
inconclusive result is treated as failed.

### 3.5 Succeeded / Failed / Rolled Back

The record is appended with `execution` fields (§6) and the id is added to
`infra/release-manifest.json`. A failed record stays in the tree.

---

## 4. Ordering and publish gates

A release is a single ordered unit:

1. **Database / schema** first, when the change requires it.
2. **Edge functions** second.
3. **Frontend publish** last.

Every step must independently verify before the next begins. Frontend and
function identity are verified against the **production custom domain** and
production endpoints, not preview. `?action=version` on a function must return
the release's declared identity before the frontend publish is considered
valid.

---

## 5. Independent verification

Verification must read the live environment through an independent read path
and compare it to the declared expectations. A named-object existence check is
**not** sufficient.

### 5.1 Migration expectations

Depending on the change, expectations must cover:

- Column: exact `data_type`, `is_nullable`, `column_default`.
- Index: exact `pg_get_indexdef` string.
- Function: `pg_get_functiondef` hash **or** exact signature + `prosecdef`.
- Policy: `pg_policies.qual` and `with_check` verbatim.
- Grant: `information_schema.role_table_grants` rows.
- Cron: `cron.job.schedule` and `command` verbatim.

### 5.2 Edge-function expectations

- `GET <endpoint>?action=version` returns `release_sha`, `release_id`,
  `artifact_checksum` matching the pending record.
- Cold-start log within the last hour contains the matching `[release]` line.

### 5.3 Frontend expectations

- The production custom domain serves an HTML response whose asset manifest
  contains the release's build fingerprint (declared in the pending record).

### 5.4 Verifier behaviour

`scripts/verify-release.ts` exits non-zero on any mismatch **or**
inconclusive result (network error, missing endpoint, unreadable catalog
row). Nothing about the run may be marked green under uncertainty.

---

## 6. Release record

After verification, the same JSON file is amended (validates against
`_schema/release-record.schema.json`) with:

- `execution.lovable_applied_version` (bridge only)
- `execution.deployed_at` (bridge only)
- `execution.verified_at`
- `execution.verification_output` — machine-readable per-expectation result
- `execution.status` — `succeeded` | `failed` | `rolled_back`

`infra/release-manifest.json` is updated in the same PR.

---

## 7. Exceptions (out-of-band production changes)

A direct production change not made through this lifecycle is an
**incident-class exception**. It must:

1. Be recorded immediately in `docs/releases/exceptions/<date>-<slug>.md` with
   what was done, why, who authorised it, and time bounds.
2. Have a **mandatory backfill PR** whose merged SHA is recorded in the
   exception file. Until the backfill SHA is present, the exception is
   `open`. `src/test/regression/release-record-schema.test.ts` fails if any
   exception is closed without a backfill SHA.

There is no legitimate "just this once" path that skips the exception file.

---

## 8. Scope of checksums

- Migration checksum proves the reviewed **input** only. It is not evidence
  that the migration was applied — that is what §5.1 checks.
- Function checksum must include shared code, config block, and import/dep
  configuration (§2). A checksum limited to the function folder is
  incomplete and rejected by `scripts/release-checksum.ts`.
- Lovable-generated migration timestamps are stored only as bridge fields.

---

## 9. What this convention deliberately does not do

- It does not claim the Lovable executor cryptographically pins source. It
  cannot; see §1.
- It does not treat the executor's success message as proof. See §5.
- It does not require rewriting historical releases. The manifest is
  append-only from adoption forward.