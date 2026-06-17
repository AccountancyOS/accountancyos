## Goal

Run a read-only schema-compatibility audit of every database write in the codebase, deliver a single prioritised audit table, then apply fixes in five small batches with stop-and-test checkpoints. No code changes until the audit is delivered and you approve.

## Phase 1 — Read-only audit (no code changes)

### Sources of truth
1. Live Postgres introspection via `psql` — columns, NOT NULL, defaults, CHECK constraints, UNIQUE indexes, FKs, triggers.
2. `src/integrations/supabase/types.ts` — generated client types.
3. `supabase/migrations/*.sql` — latest authoritative definitions for tables, RPCs, triggers.

### Code surfaces to scan
- Frontend writes: `.insert(`, `.upsert(`, `.update(`, `.delete(`, `supabase.rpc(` across `src/` and `src/portal/`.
- Edge functions: every `supabase/functions/**/index.ts` insert/update/upsert/rpc.
- Migration RPC bodies: every `CREATE OR REPLACE FUNCTION` that performs INSERT/UPDATE.

### Methodology
For each write site, build a row with:
- file/function and line
- table or RPC targeted
- operation (insert/upsert/update/rpc)
- columns/values supplied
- schema reality (required NOT NULL without default, allowed CHECK values, UNIQUE columns, FK targets, renamed columns, replaced columns)
- issue class: `missing_required` | `unknown_column` | `invalid_enum` | `unique_violation_risk` | `renamed_column` | `legacy_fk_replaced_by_entity_ref` | `stale_rpc_body` | `bypasses_canonical_rpc`
- severity: P0 (blocks user-facing flow) | P1 (latent bug) | P2 (cleanup)
- proposed fix (code change vs. trigger backfill vs. constant/helper)

### Priority order during scanning (P0 candidates first)
quote send/resend/accept/reject → questionnaire send/submit/review → client create/convert/import → onboarding/EL signing → portal access → document upload/sign → email queue → jobs/deadlines → services/engagements → workpapers → HMRC/filing snapshots.

### Deliverable
A single markdown table grouped by priority area, plus a short "guardrails" list (proposed triggers, TS const enums, helper modules). I will post this and stop before any code change.

## Phase 2 — Batched fixes (only after you approve the audit)

Each batch follows the same loop: apply only the related fixes, add the guardrail listed for that batch, run typecheck/lint, push, stop, and give you a precise UI test script.

- **Batch 1 — Quote / Email / Onboarding blockers.** Likely includes `lifecycle_send_quote`, `email_queue` writes, EL signing inserts. Guardrail: BEFORE INSERT trigger to backfill `quote_acceptance_tokens.organization_id` from `quote_id`; TS `EMAIL_QUEUE_STATUS` const.
- **Batch 2 — Questionnaire / Client portal blockers.** Questionnaire instance/response writes, portal_send_message, portal access grants. Guardrail: TS `QUESTIONNAIRE_STATUS` const; require `crypto.randomUUID()` for legacy unique token columns or route via `create_questionnaire_public_link`.
- **Batch 3 — Client / CRM / conversion / import blockers.** Lead conversion RPC, client/company inserts, CRM activity writes, CSV import paths.
- **Batch 4 — Documents / jobs / services / workpapers.** Document signing version bump, job/task inserts, services_catalog writes, workpaper instance writes.
- **Batch 5 — Remaining lower-priority stale writes.** Bookkeeping, payroll, filing snapshot edges, anything P2 from the audit.

### Rules I will follow during fixes
- Update app code to match DB; do not weaken DB constraints unless the audit proves the constraint itself is wrong (flagged explicitly with reasoning).
- For every `CREATE OR REPLACE FUNCTION` migration: diff against the current live body, list behavioural changes, then replace.
- Replace hardcoded placeholder values in UNIQUE columns with `crypto.randomUUID()` or route through the canonical RPC.
- Add TS const enums under `src/lib/db-constants/` for any CHECK-constrained text column touched by code.
- Prefer existing secure token/link RPCs over direct writes to legacy token columns.

## What happens next on approval
I switch to build mode, run the audit as a single read-only pass (psql introspection + ripgrep across writes + diff against types.ts and migrations), and post the audit table. No file edits in that step.
