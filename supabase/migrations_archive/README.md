# Archived migrations — history only, NEVER applied

These 528 files are the migration history of the retired Lovable-hosted project (Nov 2025 –
Aug 2026). They are kept as a record of how the schema evolved and why. **They are not migrations
any more:** the Supabase CLI only reads `supabase/migrations/`, so nothing here is ever applied, by
`supabase db reset`, `supabase db push`, or anything else.

## Why they were archived (cutover B, 2026-11-11)

Production is the London project `ezsvdsjdtardkxfswjvq`. London was never built from these files.
It was built from a verified schema export (`docs/migration/london-baseline/london-baseline.sql`),
plus storage, cron and seed bootstraps, plus six London-only increments
(`docs/migration/london-increments/001`–`006`). As a result:

- London's migration-history table and these files shared **zero** versions.
- Replaying these 528 files would **not** reproduce London. They include work that was later
  reverted out of band, cron literals pointing at the retired project, and changes London
  received differently.

So `supabase/migrations/` was restarted from a single baseline, `<timestamp>_london_baseline.sql`.
It is London's actual schema, storage, reference data and cron, dumped read-only on 2026-11-11 and
proven locally to rebuild London with no schema differences. London's history table was repaired to
mark that baseline as applied. Every change from now on is a normal migration in
`supabase/migrations/`, applied with `supabase db push`.

## Rules

1. Never move a file from here back into `supabase/migrations/`.
   `src/test/regression/london-baseline-safety.test.ts` fails the build if any archived file, by
   name or by content, appears there.
2. Do not edit these files. They are a historical record. If you need a past definition, the live
   one is in the baseline.
3. They still contain the retired project's ref and URLs. That is history, not configuration; the
   repo-wide guard (`no-legacy-platform.test.ts`) deliberately skips this directory.
