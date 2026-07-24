The reset migration is applied to Test but Live still holds the pre-reset data — the last verifier run against Live returned `overall: fail` with 9 leads / 4 clients / 6 companies / 35 jobs / 16 quotes / 9 onboarding / 26 engagements / 17 deadlines still present. So finalization is blocked on one thing: getting the change onto Live and proving it.

## Steps

1. **Publish to Live.** Run `preview_ui--publish` to promote the current commit (which carries the applied migration) to https://app.accountancyos.com. Wait ~1 minute for the deploy to finish.
2. **Run the automated gate against Live.**
   `deno run -A scripts/verify-post-publish.ts docs/releases/pending/2026-07-24-reset-bluetick-test-client-data.json`
   - If any of the 8 zero-count checks still return non-zero, stop. The receipt gets stamped `post-publish-verification-failed` with the actual counts, and we treat it as an incident (Lovable publish didn't carry the data change to Live — likely because destructive DML from a migration is only executed once against the backend it was applied to; a data-only re-apply against Live may be needed as a separate declared release). Report back before doing anything else.
   - If all 11 checks pass, continue.
3. **Finalize the receipt.**
   `deno run -A scripts/verify-post-publish.ts docs/releases/pending/2026-07-24-reset-bluetick-test-client-data.json --finalize --approver=<you>`
   This flips status to `applied-verified`, writes actual counts into `expected_objects[].result`, and moves the file from `docs/releases/pending/` to `docs/releases/`.
4. **Update the baseline.** Add version `20260724183022` to `docs/audits/unapplied-migrations-baseline.json` and rerun `src/test/regression/migration-application-drift.test.ts` to confirm the drift guard is clean.
5. **Close-out note in the receipt** naming the applied version, verified_at timestamp, and the evidence hash so the git-commit ↔ live-deployment mapping is durable.

## Technical notes

- The gate is already wired; there's no code to write for the happy path.
- Two realistic failure modes to be ready for after step 2:
  a. **Publish carried nothing to the DB** (most likely — `preview_ui--publish` deploys frontend/functions, not migrations; the migration was applied via `supabase--migration` and its DELETEs run once per backend). If Live counts are unchanged, the fix is to declare a Live-targeted apply of the same migration file (same sha256 `7bea1026...`) as a new pending release entry, apply it, then re-run steps 2–4.
  b. **Partial delete** (some tables zero, others not). Verifier will name exactly which — we'd raise an incident record and diagnose from there rather than hand-patching.
- No code changes are proposed in this plan; it is purely execution + gated verification.