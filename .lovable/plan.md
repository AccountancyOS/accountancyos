# Production Release Control — Convention + Pilot Instrumentation

Establishes Git as the source of truth for intended production state, with independently verifiable evidence of what is actually live. This is a controls + tooling change only. No production migrations, secrets, deploys, or broad function edits happen in this task.

## Capability Answers (Design Constraints)

Both need explicit statement in the convention because they shape what the controls can guarantee vs. only record.

1. **Applying from an exact immutable Git SHA/tag.** Lovable Cloud's migration and edge-function deploy tools operate on the workspace's current file tree (the state the agent commits during a turn), not on a caller-supplied Git SHA. There is **no `--rev`/`--sha` parameter**. Deployment identity is therefore *asserted* by the agent ("I am deploying files that match SHA X") and *attested* by a stamped `VERSION.ts`; it is **not cryptographically pinned by the Lovable tool itself**. The convention will state this plainly and require independent verification (§Verification) rather than trusting the tool metadata.
2. **Injecting `RELEASE_SHA` / `RELEASE_BUILD_AT` at deploy time.** Lovable has no per-release env-var injection API for edge functions distinct from workspace secrets. The workable, in-scope mechanism is a **stamped `VERSION.ts` file committed alongside the function**, produced by `scripts/stamp-release.ts` before the agent is asked to deploy. Values travel in-source, so they are visible at runtime via the version probe and at cold start via logs, and they are covered by the source checksum.

Both facts get a "What is guaranteed vs. recorded" table in the convention.

## Files To Create / Change

**Convention & records**
- `docs/releases/production-release-convention.md` — the single canonical convention (reconciled from Claude's proposal + earlier draft). Includes capability answers, release lifecycle, verification rules, ordering & publish gates, exception register, checksum scope rules.
- `docs/releases/README.md` — index + how to file a release.
- `docs/releases/_schema/pending-release.schema.json` — JSON Schema for a pending release declaration.
- `docs/releases/_schema/release-record.schema.json` — JSON Schema for the appended post-deploy record.
- `docs/releases/EXAMPLE-2026-07-21-ch-sync-pilot.json` — one concrete example pending+release record for the pilot.
- `docs/releases/exceptions/README.md` — exception (incident-class) record format + mandatory backfill-PR rule.
- `infra/release-manifest.json` — machine-readable index of accepted release records (append-only bridge between Git SHA/checksum and Lovable-reported applied version/deploy timestamp).

**Tooling (no runtime side effects)**
- `scripts/release-checksum.ts` — SHA-256 of a migration file, or deterministic hash over a function's deployable surface (function dir + `supabase/functions/_shared/**` + `supabase/config.toml` function block + `deno.json`/import map when present, excluding `VERSION.ts` which is regenerated).
- `scripts/stamp-release.ts` — writes `supabase/functions/<name>/VERSION.ts` with `RELEASE_SHA`, `RELEASE_BUILD_AT`, `RELEASE_ID`, `ARTIFACT_CHECKSUM`. Idempotent; used only when a release record exists.
- `scripts/verify-release.ts` — independent live checker. Reads a release record, runs the declared verification queries against the live DB via the read-only path we already use in smoke tests, hits `?action=version` on the declared function endpoint against the **production custom domain**, diffs identity fields, and exits non-zero on any mismatch/inconclusive result. Migration checks assert exact expected state (column type/default/nullability, index def, function body/signature hash, policy definition, grants, cron schedule) — not merely "object exists".
- `supabase/functions/_shared/release-version.ts` — shared helper exporting `handleVersionProbe(name)` returning `{ name, release_sha, release_id, artifact_checksum, build_at, deployed_at_first_seen }` and `logColdStartIdentity(name)`.

**Pilot: `companies-house-sync` only**
- `supabase/functions/companies-house-sync/VERSION.ts` — placeholder committed with `RELEASE_SHA = "unstamped"` so the module compiles today; real values written by `stamp-release.ts` at pilot time.
- `supabase/functions/companies-house-sync/index.ts` — add: (a) early `?action=version` branch that returns the version probe response *before* auth/env checks so it works without secrets and never touches provider APIs; (b) a single `logColdStartIdentity("companies-house-sync")` call at module top level. No behaviour change to `search` / `profile` / `sync` actions.

**Tests (regression, in-repo, no live calls)**
- `src/test/regression/release-version-probe.test.ts` — asserts `companies-house-sync/index.ts` imports `handleVersionProbe`, that `?action=version` is dispatched before any secret read or provider call, that the probe response schema contains only the safe fields, and that no secret names appear in the probe branch. Also asserts a `logColdStartIdentity` call exists at top level.
- `src/test/regression/release-record-schema.test.ts` — validates every file in `docs/releases/*.json` against the JSON Schemas; asserts the example record round-trips.
- `src/test/regression/release-checksum-determinism.test.ts` — runs `release-checksum.ts` twice on the pilot function and asserts identical output; asserts `VERSION.ts` is excluded from the hash input.
- Extend `src/test/regression/migration-application-drift.test.ts` — every entry in `infra/release-manifest.json` of type `migration` must map to a file at the declared SHA whose re-computed checksum matches.

**Runbook**
- `docs/releases/pilot-runbook.md` — one-page "how to run the first controlled release" for `companies-house-sync`: declare → stamp → get approval → apply (order) → run `verify-release.ts` against `app.accountancyos.com` and the CH-sync production endpoint → append record → rollback recipe.

## Pilot Verification (how we prove this works without deploying)

Verification of the *convention & tooling* (in this task):
- All new tests pass under `bun run test`.
- `bun scripts/release-checksum.ts supabase/functions/companies-house-sync` prints a stable hash twice.
- `bun scripts/stamp-release.ts --dry-run --function companies-house-sync --sha <fake> --release-id EXAMPLE-*` prints the `VERSION.ts` it would write without mutating anything.
- `bun scripts/verify-release.ts docs/releases/EXAMPLE-2026-07-21-ch-sync-pilot.json --offline` performs schema + checksum checks and clearly reports the live checks as "skipped: offline" (not "passed"). This proves inconclusive-≠-green.

Verification of the *actual first release* is deferred to when you approve the pilot runbook; it will hit the production custom domain and the production CH-sync endpoint and require identity match before marking green.

## Explicit Non-Goals For This Task
- No migration is applied, no function is deployed, no secret is added/rotated, no cron is created, no `preview_ui--publish` call.
- No changes to the other ~60 edge functions. `_shared/release-version.ts` is added but only wired into `companies-house-sync`.
- No changes to live schema, RLS, grants, or policies to "make things fit" the convention.
- No hand-patched code paths — every change is via the committed repo.

## Reconciliation With Claude's Draft
Since `docs/releases/production-release-convention.md` does not yet exist in the repo, "reconciliation" means: adopt Claude's structure where it goes further than the earlier draft (pending-release-first, exception register, checksum-scope rule, verification must be independent and exact-state), and add the two capability answers plus the explicit "attestation vs. proof" framing that neither draft made unambiguous. Single canonical document; no second copy.

## Technical Notes
- The version probe must dispatch *before* `Deno.env.get("CH_PROD_API_KEY")` reads and *before* the service-role auth gate, so a probe against an un-keyed environment still returns identity. It must not accept a request body, must reject non-GET, and must set `Cache-Control: no-store`.
- Cold-start log line format: `[release] fn=companies-house-sync release_sha=<sha> release_id=<id> artifact_checksum=<hex> build_at=<iso>`. No key names, no env values.
- Checksum scope for functions: sorted list of `(path, sha256)` over the function directory + `_shared/**` + the function's `supabase/config.toml` block + `deno.json`/import map, hashed as a single SHA-256. `VERSION.ts` excluded (else stamping would invalidate its own input).
- Live migration verification uses the same read path as `scripts/smoke-test.ts` (service-role read against `pg_catalog` / `pg_policies` / `pg_cron.job`), keyed by declared expectations in the release record — never a bare "object exists" check.
- Applied-version timestamps from Lovable are recorded only as a bridge field on the release record; identity remains `{git_sha, artifact_checksum, release_id}`.
- Exception records live under `docs/releases/exceptions/` and are blocked-open until a backfill PR SHA is recorded; `release-record-schema.test.ts` fails if an exception is closed without one.
