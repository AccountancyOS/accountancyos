# London-only migrations

Migrations here are applied to the **London** project (`ezsvdsjdtardkxfswjvq`) **only**.

## Why these are not in `supabase/migrations/`

The legacy Lovable project (`moxpdejnucjjcplleefn`) is **still live and serving users**, and
Lovable's executor applies anything that appears in `supabase/migrations/` to it. Post-migration
work — sender identity, Postmark, attachment routing — changes schema for behaviour that only
London implements. Landing it on legacy would give that project schema changes its own code knows
nothing about.

So until cutover, the two diverge deliberately: **legacy is frozen, London moves.**

Owner decision, 2026-08-25.

## The obligation this creates

This is a deliberate, temporary divergence, and it has a cost that must not be forgotten:

1. **These migrations are NOT in London's `schema_migrations` provenance by filename.** They are
   applied through the management API with an explicit migration name, so the ledger records them
   — but the repo's own release-receipt gate does not cover this directory.
2. **At cutover they must be folded into `supabase/migrations/`** so a future rebuild from git
   reproduces London exactly. A rebuild that omits them silently loses sender-identity routing —
   which would send practice correspondence from AccountancyOS's domain, the one outcome the whole
   design exists to prevent.
3. Until that fold-back happens, `supabase/migrations/` alone **cannot** rebuild London.

`src/test/regression/london-baseline-safety.test.ts` fails the build if any file from this
directory appears in `supabase/migrations/`, so the divergence stays deliberate rather than drifting.

## Convention

- `NNN_short_name.sql`, applied in numeric order.
- Each is additive and self-verifying where it can be: preconditions that refuse rather than
  half-apply, post-assertions that prove the effect landed.
- Applied with `apply_migration` under the name `london_inc_NNN_short_name`.

## Applied so far

| # | File | Applied | Migration name on London |
|---|---|---|---|
| 001 | `001_email_vocabulary_and_sender_classification.sql` | 2026-08-26 | `london_inc_001_email_vocabulary_and_sender_classification` |

### 001 — what it fixed, and how it was verified

Two vocabularies on `email_queue` had drifted from the constraints policing them, and the drift
broke the **writers**, so it was invisible: the table simply stayed empty.

Constraint-violating writers, all raising `23514` and rolling back their whole transaction:

| Function | Wrote | Effect |
|---|---|---|
| `queue_email_safe` | a retired two-value status `CASE` | **Compose Email entirely non-functional** — all three modes |
| `trigger_records_request(uuid)` | retired status **and** a `context` outside the constraint | records-request dead; questionnaire instance, job link and `info_requested_at` all rolled back with it |
| `acknowledge_failed_email_safe` | retired dismissal status | failure-dismissal dead |

Unclassified senders (`context` NULL routes to the practice mailbox and is **held**, never sent):
`lifecycle_approve_onboarding` → `'job'`, `send_onboarding_questionnaire` → `'onboarding'`.
Mis-classified: `public_submit_onboarding_for_review` emails **practice staff** at their
AccountancyOS login address → reclassified `'system'` so it goes via Postmark rather than being
held behind a mailbox the practice may not have connected yet.

`queue_email_safe` also gained `p_context` (default `'general'`) and a guard that makes
`context='system'` **unreachable** from a user-callable RPC — sender identity is a security
boundary, and nothing a user composes is AccountancyOS's own mail.

**Verified after apply**, independently of the migration's own assertions:

- Every classification read back correctly from `pg_get_functiondef`.
- `trigger_records_request(uuid)` retains exactly one `'records_request'` literal — the
  `job_questionnaire_instances.questionnaire_type` value, a different table's vocabulary that must
  not change.
- The four fully-replaced bodies changed by exactly the intended byte deltas and nothing else
  (+2, −12, −17, −102), ruling out transcription drift.
- `queue_email_safe` has exactly one overload with 11 arguments — no ambiguity (the DEF-002 class).

**Correction recorded in the file:** the migration originally claimed to narrow the function's ACL
by omitting the PUBLIC/`anon` grants. It does not. Supabase's `ALTER DEFAULT PRIVILEGES` re-grants
them on `CREATE`, and the post-apply ACL is byte-identical to the pre-existing one. Narrowing a
function ACL here requires an explicit `REVOKE`, which was deliberately not done — see the comment
at that grant.
