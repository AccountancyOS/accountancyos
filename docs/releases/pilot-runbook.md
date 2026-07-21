# Pilot Release Runbook — `companies-house-sync` version probe

**Status:** draft · **Applies to:** first attestation-based release under
`docs/releases/production-release-convention.md` (with §1a, §2a, §4a, §10).

This runbook is the *only* approved path for the pilot release. Deviations are exceptions
under §7 of the convention and require an incident record.

## 0. Preconditions (not part of the release window)

These MUST already be true before declaring the pending release. If any is false, stop and
build the missing piece as its own reviewed change first — do not shortcut.

- [ ] `supabase/functions/_shared/release-version.ts` exists and exports a `VERSION`
      reader + the `?action=version` handler shape defined in convention §5.
- [ ] `supabase/functions/companies-house-sync/VERSION.ts` exists as a stamped-in-place
      module with the shape `{ release_id, source_commit_sha, release_commit_sha, built_at }`.
- [ ] `supabase/functions/companies-house-sync/index.ts` short-circuits on
      `?action=version` before auth/business logic and returns the four fields above.
- [ ] `scripts/release-checksum.ts` computes a deterministic SHA-256 over the function
      directory tree **including** `_shared/` files it imports and any `deno.json` /
      `import_map.json` in scope.
- [ ] `scripts/stamp-release.ts` rewrites `VERSION.ts` from CLI args and exits non-zero on
      any other diff.
- [ ] `scripts/verify-release.ts` calls the probe on the **production custom domain** and
      asserts `sha`, `source_sha`, and `release_id` all match the pending record.
- [ ] Regression tests exist for: probe shape, checksum determinism, receipt schema,
      pre-deploy check ordering.

**Current status (2026-07-21):** none of the above are in the workspace yet. This runbook
is committed ahead of them so the sequencing is unambiguous; the tooling PR is the next
reviewed change.

## 1. Declare the pending release

1. Merge the reviewed source change on `main`. Note that SHA — this is `source_commit_sha`.
2. On a fresh clean workspace at that SHA, run
   `bunx tsx scripts/stamp-release.ts --function companies-house-sync --source-sha <source_commit_sha> --release-id <yyyy-mm-dd-slug>`.
   The only file that changes is `supabase/functions/companies-house-sync/VERSION.ts`.
3. Commit that change with message `release: stamp companies-house-sync <release_id>`.
   That commit's SHA is `release_commit_sha`.
4. Run `bunx tsx scripts/release-checksum.ts supabase/functions/companies-house-sync` and
   capture the value as `artifact_checksum_post_stamp`.
5. Write `docs/releases/pending/<release_id>.json` (schema in `_schema/pending-release.json`)
   with all of: `release_kind: "attestation-based"`, `source_commit_sha`,
   `release_commit_sha`, `artifact_checksum_post_stamp`, verification commands, approver,
   rollback plan.
6. Open a PR containing only steps 2 and 5. Merge after review. The merge does **not**
   deploy anything.

## 2. Open the release window

Executed by the release operator, in one uninterrupted session:

1. `git fetch && git checkout <release_commit_sha>` (detached HEAD is fine).
2. `git rev-parse HEAD` MUST equal `release_commit_sha`. If not — abort.
3. `git status --porcelain` MUST be empty. If not — abort.
4. `bunx tsx scripts/release-checksum.ts supabase/functions/companies-house-sync` MUST
   equal `artifact_checksum_post_stamp` in the pending record. If not — abort (tree drift).
5. Record `release_window.locked_at = now()` and set both boolean flags true.
6. **No other tool calls, file edits, or deploys until step 4 of §3 completes.**

## 3. Deploy and verify

1. Call `supabase--deploy_edge_functions(["companies-house-sync"])`. Record
   `release_window.deployed_at`.
2. Run `bunx tsx scripts/verify-release.ts --release docs/releases/pending/<release_id>.json`.
   The script hits
   `https://<production-domain>/functions/v1/companies-house-sync?action=version`
   and asserts `sha == release_commit_sha`, `source_sha == source_commit_sha`,
   `release_id == pending.release_id`. Any mismatch, timeout, or non-2xx → `result: fail`.
3. Run the behavioural smoke: a read-only CH profile fetch (e.g. company `00000006`)
   against production, asserting HTTP 200 and the expected `company_number` field. No writes.
4. Record `release_window.unlocked_at = now()`.

## 4. Commit the receipt

1. Append the completed record to `docs/releases/release-log.jsonl` (append-only, one JSON
   object per line) with `release_kind: "attestation-based"`, both SHAs, the
   `release_window` block, `executor_deployed_at`, and the raw probe + smoke output as
   `verification.evidence`.
2. Set `verification.result` to `pass` only if steps 3.2 and 3.3 both passed. Otherwise
   `fail` (with evidence of what failed) and jump to §5.
3. PR the receipt. Merge closes the release.

## 5. Rollback

`companies-house-sync` has a previous deployed version. Rollback = redeploy the last
known-good `release_commit_sha` via the same runbook (§2–§4) with a new `release_id`
marked `rollback_of: <failed_release_id>`. There is no "revert deploy" button on the
executor — rollback is another attestation-based deploy of an earlier `VERSION.ts`.

## 6. What this runbook does not prove

Per convention §1a and §10, this is **attestation-based, not Git-pinned**. A green
receipt proves:

- The workspace tree at deploy time claimed to be `release_commit_sha`.
- The live function reports the same SHA and passes one behavioural check.

It does **not** prove the deployed bytes were produced from that Git object. Closing
that gap requires either a commit-pinned Lovable deploy tool or moving production to
our own CI pipeline.
