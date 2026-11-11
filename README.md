# AccountancyOS

The all-in-one operating system for UK accountancy practices: CRM, practice management,
bookkeeping, workpapers, and HMRC / Companies House filing.

**One backend:** Supabase project `ezsvdsjdtardkxfswjvq` (London, `eu-west-2`) is the only
database and edge-function host. **One package manager:** npm (`package-lock.json`).
**Hosting:** Vercel.

## Regression Prevention (read first)

AccountancyOS uses a layered safety net to catch drift in critical workflows:

- [`docs/critical-workflows.md`](./docs/critical-workflows.md) — end-to-end definition of every business-critical flow (auth, portal, email queue, questionnaires, filings, RLS, etc.).
- [`docs/supabase-infrastructure.md`](./docs/supabase-infrastructure.md) + [`infra/supabase-manifest.json`](./infra/supabase-manifest.json) — expected backend infrastructure (edge functions, cron, secrets, RLS tables, email config).
- [`docs/change-checklist.md`](./docs/change-checklist.md) — required checklist for every change. Mirrored in `.github/PULL_REQUEST_TEMPLATE.md`.
- [`docs/test-fixtures.md`](./docs/test-fixtures.md) — deterministic seeded users. Real users (e.g. live clients) are never used as regression subjects.
- [`docs/email-system.md`](./docs/email-system.md) — both email pipelines (auth + app outbound queue), what silently breaks them, and the PR checklist.

## Local development

Requirements: Node.js + npm, Docker (for the local Supabase stack), the Supabase CLI, Deno.

```sh
npm ci                      # install exactly what package-lock.json pins
cp .env.example .env.local  # then fill in the three VITE_SUPABASE_* values
npm run dev                 # http://localhost:8080
```

`vite` refuses to start or build if any `VITE_SUPABASE_*` variable is missing — there is no
fallback project.

### Database

`supabase/migrations/` rebuilds the production schema exactly, starting from a single baseline
(`*_london_baseline.sql`). The pre-baseline history lives in `supabase/migrations_archive/` and is
never applied.

```sh
supabase start        # local stack (Docker)
supabase db reset     # apply supabase/migrations + supabase/seed.sql locally
supabase test db      # pgTAP suites in supabase/tests/
```

Never run `supabase db push` or `supabase db reset --linked` against production outside the
release process.

### Commands

```bash
npm test          # Vitest regression suite (frontend + manifest + edge contracts)
npm run lint      # ESLint
npm run build     # production build (needs VITE_SUPABASE_* set)
npm run smoke     # post-deploy smoke test against the live backend
deno check supabase/functions/<name>/index.ts   # type-check an edge function
```

CI (`.github/workflows/ci.yml`) runs all of the above plus the database (pgTAP) and edge-function
(`deno check` / `deno test`) jobs on every push and pull request.

## Stack

Vite · TypeScript · React · shadcn-ui · Tailwind CSS · Supabase (Postgres, Auth, Storage, Edge
Functions on Deno).
