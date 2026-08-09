# Vocabulary audit — 2026-08-09

## Why this exists

DEF-026, DEF-027, DEF-028 and DEF-033 were logged as four defects. They are one defect wearing
four numbers: **the same concept has more than one name, and nothing failed when the names
diverged.**

- DEF-026 — the bills UI filtered on `VOID` after the constraint had moved to `VOIDED`.
- DEF-027 — `create_customer_safe` wrote `company_name` to a table that did not have it.
- DEF-028 — `stamp_portal_provenance` wrote columns that did not exist.
- DEF-033 — four bank-reconciliation functions wrote `performed_by`/`payload` to a table whose
  columns are `actor_id`/`metadata`.

Each surfaced one per fix-cycle, because a runtime error masks the next one. Each was trivially
visible statically. Fixing them individually does not stop the next one.

## What was measured

`scripts/audit-vocabulary.py` replays all 519 migrations in order — honouring `DROP CONSTRAINT`,
which 51 statements use — and reports the vocabulary as it actually stands.

> **Method note.** The first run of this audit did not track `DROP CONSTRAINT` and reported that
> `bills.status` and `invoices.status` permitted *no legal value at all*. That was a replay
> artefact, not a defect: the contradicting constraints had been dropped. It is recorded here
> because it is the exact failure mode this document exists to prevent — a confident conclusion
> from an incomplete replay.

### Status casing

| Convention | Constrained columns |
|---|---|
| `lower_snake` | 156 |
| `UPPER_SNAKE` | 40 |

The UPPER cluster is not random. It is the sales/purchase ledger (`bills`, `invoices`,
`credit_notes`), `vat_periods`, and the automation engine. Everything else is lower.

**No column mixes casings internally**, so nothing is currently broken by this. It is a
consistency and onboarding cost, not a live defect — a developer must know which era a table
belongs to before writing a literal.

### Rival column names

| Concept | Names in use (tables) |
|---|---|
| structured detail | `metadata` (22), `payload` (2), `context` (2), `details` (1) |
| enabled flag | `is_active` (19), `active` (5), `enabled` (4), `is_enabled` (2), `archived` (1), `is_archived` (1) |
| when it happened | `created_at` (206), `occurred_at` (1) |

`metadata`, `is_active` and `created_at` are the canonical names by a wide margin. The
minority spellings are what DEF-033 tripped over.

`created_by`/`updated_by`/`approved_by`/`submitted_by`/`posted_by` are **not** drift — they
record distinct events. `actor_id` (on `bookkeeping_audit_log`) is the audit-event actor and is
also correct. `performed_by` was the only genuine rival, and DEF-033 removes it.

`clients` vs `customers` is **not** drift either: `clients` are the practice's clients,
`customers` are those clients' own sales-ledger customers. UI usage matches. The only entity
drift found is `vendor` (3 uses) against `supplier` (110) — cosmetic.

## What is now enforced

| Artefact | Role |
|---|---|
| `scripts/audit-vocabulary.py` | Measures drift: casing, rival names, contradictions |
| `scripts/generate-db-vocabulary.py` | Generates the canonical vocabulary from the migrations |
| `src/lib/db-constants/vocabularies.generated.ts` | 196 constrained columns, machine-derived |
| `src/test/regression/vocabulary-registry.test.ts` | 31 tests; drift now fails the build |

`src/lib/db-constants/check-constraints.ts` described itself as "the single source of truth for
every constrained status/enum-like column". It covered **20 of 196**, and three of the 20
disagreed with the constraint they claimed to mirror — it declared `email_queue.status` permits
`cancelled`, which no live constraint allows, while omitting `draft`, `queued` and `ignored`,
which they do. A hand-maintained mirror of the schema will always drift, because nothing fails
when it does. It is now checked against the generated file on every run.

### The intersection rule

A column may carry several live CHECK constraints. **Postgres enforces every one of them, so
the writable set is their intersection.** Nothing in the codebase computed that before. Reading
a single constraint is how a value comes to look legal while being rejected at runtime.

## Findings requiring an owner ruling

### 1. Two self-contradicting columns

Both are the same shape: a **November 2025 constraint that was never dropped** when its
replacement landed.

**`filings.status`** — `valid_status` (2025-11-27, 6 values) ∩ `chk_filing_status`
(2026-06-20, 13 values). Seven states are declared, referenced by code, and **impossible to
write**: `accepted`, `client_changes_requested`, `in_progress`, `not_started`,
`ready_for_review`, `sent_to_client`, `submitted`.

`chk_filing_status` matches both the hand registry and the `FilingStatus` TypeScript union, so
`valid_status` is the leftover. **Recommendation: drop `valid_status`.** This is on the filing
engine's critical path — `submitted` being unwritable means a filing cannot be recorded as
submitted.

*Held pending approval:* the standing ruling of 2026-08-05 was "make no further bill/invoice/
filing status changes". That ruling was scoped to the DEF-026 investigation, which has
concluded, but filings sit on the non-negotiable architecture and this is not mine to assume.

**`deadlines.status`** — `deadlines_status_check` (2025-11-27) ∩ `chk_deadlines_status`
(2025-12-18). Only `cancelled`, `overdue`, `pending` are writable. **A deadline cannot be marked
`completed` or `in_progress`.**

Here the *newer* constraint is not obviously canonical: the app code and the hand registry both
use the **older** vocabulary (`completed`, `in_progress`, `filed`), while the newer one
introduced `complete`, `due`, `upcoming`, `waived`. This needs a ruling on which is intended.

### 2. Thirteen functions write literals no constraint permits

Every call raises 23514. Baselined in the test as `KNOWN_LITERAL_VIOLATIONS`.

**Filing engine** — blocked on the ruling above:
- `approve_filing_safe` → `filings.status = 'approved_by_client'`
- `queue_filing_for_submission` → `filings.status = 'queued'`
- `regress_filing_status` → `filings.status = 'ready_for_approval'`

All three target the *dropped* `chk_filings_status` vocabulary. Note `queued` may belong on
`filing_queue.status` rather than `filings.status` — writing submission state onto the filing
record conflates the projection with the HMRC transport layer, which the architecture forbids.

**Job workflow** — the vocabulary moved from a generic lifecycle to workflow stages and these
callers were never migrated. Which stage each generic state maps to is a workflow decision:
- `create_job_from_template` → `jobs.status = 'not_started'`, `jobs.priority = 'medium'`,
  `job_tasks.status = 'not_started'`
- `process_questionnaire_submission` → `jobs.status = 'in_progress'`
- `lifecycle_generate_jobs_for_service` → `jobs.automation_source = 'canonical_spine_v1'`

**Straightforward renames** — held only so the class lands under one ruling:
- `lifecycle_accept_portal_invitation` → `portal_access.status = 'revoked_by_system'` → `revoked`
- `lifecycle_generate_deadlines_for_job` → `client_tasks.status = 'pending'` → `not_started`;
  `client_tasks.visibility = 'internal'` → `internal_only`; `deadlines.status = 'open'` → `pending`
- `on_cgt_disposal_date_changed` → `deadlines.deadline_type = 'filing'` → `statutory`

### 3. Casing harmonisation — recommendation: do not

Normalising the 40 UPPER columns to `lower_snake` (or the reverse) means rewriting live status
data across the sales and purchase ledgers. The bug class is "code writes a literal the
constraint rejects", and the generated registry closes that regardless of casing. The migration
carries real data risk for a cosmetic gain.

**Recommendation: leave existing vocabularies as they are; require `lower_snake` for new ones**,
matching the 80% majority. Enforced by the registry, not by convention alone.

## The rule going forward

1. A migration that replaces a CHECK constraint **must drop the one it replaces, in the same
   migration.** Both live contradictions came from not doing this.
2. Application and PL/pgSQL code reads vocabularies from `vocabularies.generated.ts`. No
   hardcoded status literals.
3. New vocabularies are `lower_snake`.
4. `metadata`, `is_active`, `created_at` are the canonical column names for their concepts.
