# Test Fixtures

Deterministic fixtures used by automated tests and the smoke script. Real users (e.g. `amyleestevens7@gmail.com`) are **never** used as regression subjects.

## Seeded Test Users
All passwords: `PortalQA!2026`. Seed via `supabase/functions/seed-portal-test-users` (requires `x-seed-secret: $PORTAL_SEED_SECRET`).

| Email | Role | Notes |
|---|---|---|
| `regression+accountant@accountancyos.test` | Org owner (Org A) | Used for accountant-side flows |
| `regression+client.active@accountancyos.test` | Portal user (Client A) | `portal_access.status = active` |
| `regression+client.noportal@accountancyos.test` | None | Client exists, no `portal_access` row |
| `regression+client.revoked@accountancyos.test` | Portal user (Client A) | `portal_access.status = revoked` |
| `regression+client.company@accountancyos.test` | Portal user (Company C1) | Limited company client |
| `regression+client.sole@accountancyos.test` | Portal user (Client B sole trader) | Sole trader |
| `regression+orgA.owner@accountancyos.test` | Org A owner | RLS isolation pair |
| `regression+orgB.owner@accountancyos.test` | Org B owner | RLS isolation pair |

## Legacy Probe Users
The existing probe users (`portal-a@accountancyos.test`, `portal-b@…`, `portal-c@…`, `portal-d@…`) remain valid and are still used by `portal-qa-probe`.

## Do Not Use for Tests
- `amyleestevens7@gmail.com` (real client at Blue Tick)
- Any production accountant or client account

## Re-seeding
```bash
curl -X POST \
  -H "x-seed-secret: $PORTAL_SEED_SECRET" \
  https://<project>.supabase.co/functions/v1/seed-portal-test-users
```