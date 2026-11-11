# QA tooling — NEVER DEPLOY

These two programs were Supabase Edge Functions until cutover workstream A
(`docs/migration/london-increments/006_CALLER_MAP.md`). They are kept here only as local QA aids.

| Directory | What it does |
|---|---|
| `seed-portal-test-users/` | Creates/resets four portal fixture users to a **password committed in this repo** and grants them portal access to hard-coded client/company IDs, overwriting those records' names and emails. |
| `portal-qa-probe/` | Signs in as those fixtures with the same committed password and probes portal RLS. |

## Rules

1. **Never deploy either of these to any Supabase project** — not London, not a preview branch
   that holds real data. A function that sets a known password on real portal access is a
   standing account-takeover hole the moment it is reachable.
2. They are deliberately **outside `supabase/functions/`**, so `supabase functions deploy` (with
   or without a name) cannot pick them up. Do not move them back.
3. Run them only against a disposable local stack (`supabase start`) seeded with fixture data,
   e.g. `deno run --allow-net --allow-env scripts/qa/seed-portal-test-users/index.ts` behind a
   local server, with `PORTAL_SEED_SECRET` set in your shell only.
4. `PORTAL_SEED_SECRET` is **not** a production secret and must not be set on any deployed
   project (it was removed from `london-baseline/SECRETS.md` and `infra/supabase-manifest.json`).
