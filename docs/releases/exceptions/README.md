# Release Exceptions

An **exception** is any production change that did not go through the
normal release lifecycle in `../production-release-convention.md`. Examples:
a hand-applied migration during an incident, a direct edge-function redeploy
outside a PR, a hotfix applied before the pending record was declared.

Every exception is **incident-class**. It must:

1. Be recorded here as `YYYY-MM-DD-<slug>.md` at the time it happens.
2. Have a **mandatory backfill PR** that brings Git into agreement with the
   state that was applied to production.
3. Reference the backfill PR's merged commit SHA in the exception file.

Until the backfill SHA is recorded the exception is `open`. The regression
test `src/test/regression/release-record-schema.test.ts` fails the build if
an exception file marked `status: closed` has no `backfill_commit_sha`.

## File format

```markdown
---
id: 2026-07-21-hotfix-example
status: open        # open | closed
authorised_by: name
applied_by: name
started_at: 2026-07-21T12:00:00Z
ended_at: 2026-07-21T12:12:00Z
backfill_pr_url: null
backfill_commit_sha: null
---

## What happened

What was changed in production, why the normal lifecycle was skipped, and
what independent verification was performed at the time.

## Backfill

How the change will be brought into git and re-verified through the normal
lifecycle.
```