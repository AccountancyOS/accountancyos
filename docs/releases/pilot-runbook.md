# Pilot Release Runbook — `companies-house-sync`

This is the first end-to-end use of the production release convention. Scope:
deploy the `?action=version` identity probe only. No behaviour change.

## 0. Prereqs

- Merged PR that adds the probe. Note its merge commit SHA — this is `<SHA>`.
- `docs/releases/2026-XX-XX-ch-sync-pilot.json` is committed at `state: pending`.

## 1. Stamp the version file

```bash
bun scripts/stamp-release.ts \
  --function companies-house-sync \
  --sha <SHA> \
  --release-id 2026-XX-XX-ch-sync-pilot
```

Commit the updated `supabase/functions/companies-house-sync/VERSION.ts` in a
follow-up PR (the stamp is only meaningful after merge). Update the pending
record's `artifact_checksum` with the value the stamp prints.

## 2. Approve

Approver flips `state` to `approved` in the JSON and signs off in the PR.

## 3. Apply (ordered)

Ask Lovable to deploy `companies-house-sync` **only**. No migrations in this
pilot. No frontend publish is required — the probe is server-side.

## 4. Verify

```bash
bun scripts/verify-release.ts docs/releases/2026-XX-XX-ch-sync-pilot.json
```

The verifier hits the production functions base URL and requires
`release_sha`, `release_id`, and `artifact_checksum` in the probe response to
match the declared record. Any mismatch or network failure exits non-zero.
Also spot-check the cold-start log line via `edge_function_logs` search for
`[release] fn=companies-house-sync release_id=2026-XX-XX-ch-sync-pilot`.

## 5. Record

On green: append the `execution` block (§6 of the convention) to the same
JSON file, flip `state` to `succeeded`, add the id to
`infra/release-manifest.json`, open the closing PR.

On red: flip `state` to `failed`, keep the file, decide rollback vs. fix.

## 6. Rollback

1. Revert the merge commit in git.
2. Ask Lovable to redeploy `companies-house-sync` from the reverted HEAD.
3. Re-run `verify-release.ts` against the previous succeeded record; expect
   the probe to report the previous release identity.

## Capability caveats you must state to reviewers

- Lovable's deploy tool does not pin to a caller-supplied SHA. The identity
  in `VERSION.ts` is a **deployment attestation**, not cryptographic proof
  of the running artifact. This is the reason for the independent verifier.
- There is no per-release env-var injection. Identity travels via stamped
  source, which is why the checksum excludes `VERSION.ts`.