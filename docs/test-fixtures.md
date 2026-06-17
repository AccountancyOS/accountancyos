# Test Fixtures

Deterministic fixtures used by automated tests and the smoke script. Real users (e.g. `amyleestevens7@gmail.com`) are **never** used as regression subjects.

## Seeded Test Users (current)
All passwords: `PortalQA!2026`. Seed via `supabase/functions/seed-portal-test-users` (requires an org-owner bearer token; gated to Blue Tick org).

| Email | Role | Notes |
|---|---|---|
| `portal-a@accountancyos.test` | Portal user (Client A — sole trader) | `portal_access.status = active`; rich data |
| `portal-b@accountancyos.test` | Portal user (Client B — individual) | Active, minimal visibility flags |
| `portal-c@accountancyos.test` | Portal user (Company C1 + C2) | Limited company access, dual-entity |
| `portal-d@accountancyos.test` | Portal user (Company D) | `portal_access.status = revoked` — used to verify revoke path |

These are the live fixtures referenced in `supabase/functions/portal-qa-probe`, the smoke script, and the Vitest suite. Email/password literals (`regression+client.active@accountancyos.test` etc.) used inside tests are **mocked**, not real users — see `src/portal/pages/PortalLogin.test.tsx`.

## Planned Additions (not yet seeded)
The seed function still needs to be extended to provision:
- a second organisation (Org B) plus its owner for cross-org RLS isolation
- a client with no `portal_access` row at all

Tracked in `docs/critical-workflows.md` §15. Until then, RLS isolation is asserted via the existing `portal-qa-probe` and the manifest contract tests.

## Do Not Use for Tests
- `amyleestevens7@gmail.com` (real client at Blue Tick)
- Any production accountant or client account

## Re-seeding
```bash
curl -X POST \
  -H "x-seed-secret: $PORTAL_SEED_SECRET" \
  https://<project>.supabase.co/functions/v1/seed-portal-test-users
```