# Launch-readiness remediation — plan and reconciliation

Source of truth: `docs/audits/2026-07-27-launch-readiness-e2e.md` (the report), which
overrides the handoff summary wherever they differ. This document is the dependency-aware
plan the handoff asked for, plus the ID reconciliation it required first.

Status: planning only. One containment migration is authored (see §5); nothing else in
here has been implemented.

---

## 1. ID reconciliation

The handoff listed five defects whose definitions it could not supply. Four are in the
report and are recovered here. **One is not in the report at all.**

| ID | Recovered? | What it actually is |
|---|---|---|
| DEF-005 | Yes (report L161) | P3 — 14 functions have mutable `search_path` (linter `0011`). All in `public`; pin before launch. |
| DEF-007 | Yes (L191) | P3 — `/jobs` fires `user_saved_views?is_default=eq.true` through `.single()`; `PGRST116` on every load. Fix: `maybeSingle()`. |
| DEF-009 | Yes (L266) | P3 — quote timeline renders `Sent 7/27/2026` (US) beside UK-formatted fields. |
| DEF-010 | Yes (L273) | P3 — overlapping catalogue entries (MTD Quarterly Filing £35 vs MTD Quarterly Submission £75; SA (MTD) £35 vs MTD Final Declaration £35) and three £0.00 services. Product decision, not a code fix. |
| **DEF-016** | **NO** | **Not defined anywhere in the report.** |

### DEF-016 is an undefined launch gate

DEF-016 is named as one of four conditions that must close before the launch restriction
lifts, and as catastrophic-class from Phase 2. The report references it four times but the
defect register contains no DEF-016 entry. The only substantive clue is inside DEF-017:
`ON DELETE CASCADE (see DEF-016, 34-table radius)`.

The handoff explicitly says not to implement from that clue, and I agree — but the
consequence needs stating plainly: **a launch gate that cannot be defined cannot be closed,
and cannot be planned around.** This is not a scheduling problem, it is a hole in the audit
record.

Two ways forward, and the first is preferred:

1. The auditor supplies the DEF-016 entry from their working notes.
2. Failing that, it is re-derived from evidence: enumerate every `ON DELETE CASCADE`
   foreign key in `public`, establish the deletion radius from each tenant-root table
   (`organizations`, `clients`, `companies`), and state what a single delete actually
   destroys. That produces a defensible finding rather than a reconstructed guess — but it
   is new work, not recovery, and it should not inherit DEF-016's severity by assumption.

Until then DEF-016 is tracked as **undefined — blocking by declaration, unplannable in
substance**.

### DEF-004 vs DEF-015 — narrowed, not superseded

They measure different things and both should stay open:

- **DEF-004** — 326 `SECURITY DEFINER` functions executable by `anon`, *including* those
  that enforce their own authorisation. Adversarial probes found no bypass; the tenancy
  boundary held. It is an attack-surface finding.
- **DEF-015** — the 93 of those that contain **no** internal check at all (no `auth.uid()`,
  no token check, no role check). Confirmed live: `find_entities_by_email` returned a real
  client record to the anon key with no session.

DEF-015 is the sharp subset and is where the work starts. DEF-004 remains as the wider
surface-reduction obligation once DEF-015 is contained. Closing DEF-015 does not close
DEF-004.

---

## 2a. Remediation evidence

| Defect | State | Evidence |
|---|---|---|
| DEF-015 (`el_signature_progress` only) | CLOSED | Migration `20260728120000` → executor version `20260728121603`. LIVE: `anon` EXECUTE = false; `authenticated`/`service_role` = true. Receipt completed. 92 functions remain. |
| DEF-007 | FIXED, awaiting deploy | Commit `4e1cc99` — `maybeSingle()` in `jobs-filter-service.ts`. |
| DEF-009 | FIXED, awaiting deploy | Commit `4e1cc99` — UK formatting in `OnboardingStatusStepper`. |
| DEF-011 | FIXED, awaiting deploy | Commit `4e1cc99` — `maybeSingle()` + `limit(1)` in `auth-context.tsx`. |
| DEF-014 | FIXED, awaiting deploy | Commit `4e1cc99` — kill switch moved out of `AccordionTrigger`. |
| DEF-010 part 1 (legacy orphan) | FIXED, awaiting apply | Migration `20260728130000`, commit `4e1cc99`. |
| DEF-010 part 2 (`sa_mtd` double-billing) | FIXED, awaiting deploy + verification | Builder-hiding in `CreateQuoteDialog`; closes only once job materialisation is re-verified live. |
| DEF-010 part 3 (unpriced services) | FIXED, awaiting apply | Migration `20260728140000` — `default_price` nullable + the owner's three prices. Send-time guard still outstanding. |
| DEF-024 | FIXED, awaiting deploy | JWT + `portal_access` authorisation, uniform not-found response, explicit `verify_jwt` in `config.toml`. |
| DEF-013 | CLOSED | Migration `20260728150000` applied; `profiles.email_signature` present, RLS `profiles_update_own` confirmed. `send-engagement-letter` renders it in both the variant path (`{{staff_signature}}`) and the default wording; NULL renders nothing. Commit `243d898`. |
| DEF-006 | CLOSED | Migration `20260728160000` applied. Forbidden path verified FIRST — no session → `42501`; member calling a foreign org id → `42501`, so the qualification did not turn the `EXISTS` always-true. Success path returns a result set instead of `42702`; new `prosrc` md5 `99175c30…`. App-side error state confirmed distinct from empty. Sibling `get_bank_connection_health_for_entity` checked and cleared — it authorises via `portal_can_access_bookkeeping`/`portal_has_perm` and references only its IN parameters. Per-status verification (connected/expired/degraded) still needs real connection fixtures. |
| DEF-012 | FIXED, awaiting deploy | Commit `c5e37b3` — explicit batched query, no foreign key. Orphan check run 2026-07-28: **1 membership, 0 orphans, 0 pending invitations**. Note `organization_users` has no status column at all, so a "legitimate pending membership" cannot exist in this schema — an orphan could only ever be corrupt data. DEF-012 was never an orphan problem: the embed failed for a fully intact single-member tenant. Fixture-based role testing (Owner/Staff/Admin, removed member, multiple roles) belongs with the approved Phase 0 §4 fixture work. |

Suite at the time of writing: **719 tests passing, typecheck clean**. (Earlier figures like
705 are test counts, not commits.)

### New DEF-020 evidence, found while verifying this batch

`supabase_migrations.schema_migrations` is readable by **neither** party: not by the executor
from its exec role, and not by Claude through the database connector, which exposes only the
`public` schema. The step "confirm a row exists in `schema_migrations`" that earlier receipts
carry is therefore unverifiable by anyone — attestation dressed as verification.

`docs/releases/production-release-convention.md` §1a now records this and makes **object
verification the authoritative proof of apply**, which was always the stronger evidence: a
ledger row proves a file executed, a changed def-hash proves the effect landed. Receipts must
not list the ledger check as a verification step.

This is a governance gap, not paperwork. With no readable ledger and a version probe on only 2
of 62 functions, git-versus-LIVE identity cannot presently be reconciled by either party — which
is precisely what DEF-020 says.

DEF-010 is deliberately tracked as three parts. Retiring the legacy orphan does not close
the `sa_mtd` double-billing exposure, and neither closes the unpriced-service exposure;
each has its own evidence and its own verification.

---

## 2. What is already done

Two of the three DEF-023 symptoms were fixed yesterday, before this handoff arrived:

- The executor's re-authored copies (`20260727204940`, `20260727205036`) are recorded in
  `docs/audits/unapplied-migrations-baseline.json`, so the receipt gate is green.
- Both governance assertions that pinned "this file is the last definer" now assert on
  *whichever* migration owns the body — the executor re-timestamps every migration, so
  filename ownership was never a stable identity. The onboarding-token repair is guarded
  this way and is protected.

The audit's "690 of 692 passed, the two failures were governance gates" refers to exactly
these. The suite is at **699 passing**.

DEF-023's remaining substance — content-addressed receipts, and detecting executor renaming
at deploy time — is real and unaddressed. It belongs with DEF-020.

---

## 3. Sequencing

I agree with the CTO's adjusted order over the auditor's, with one change: **DEF-024 moves
into containment**. It is an unauthenticated endpoint reachable from the open internet
today; it does not belong behind four infrastructure repairs.

### Workstream A — containment (days, not weeks; mostly not migrations)

Reduce what is reachable and what can be believed, before repairing anything.

1. **DEF-022** — gate public practice signup. The approved posture is controlled internal
   use; open self-service registration contradicts it.
2. **DEF-021** — hide Google sign-in. A dead auth choice is a support incident waiting to
   happen.
3. **DEF-015 sharpest first** — `grant_person_portal_access`, `enqueue_email`,
   `find_entities_by_email`. Portal-access granting and outbound email injection from an
   unauthenticated caller are the two that matter most.
4. **DEF-024** — authenticate `portal-verify-invoice-payment`. `portal-pay-invoice` is the
   local reference pattern.
5. **DEF-019 minimum** — cron failure, consecutive-failure and email-queue-age alerts.
   Without this, every repair below is unverifiable in production.

### Workstream B — infrastructure repair (the P1s)

Ordered by dependency, not severity:

1. **DEF-018** (cron configuration) — must precede DEF-003, because the email processor is
   itself a scheduled job. Repairing the schedule while the GUC mechanism is broken fixes
   nothing.
2. **DEF-003** (email delivery) — schedule, idempotent processing, and the queue record
   transitioning rather than a second `sent` row. The UI must stop reporting `SENT` before
   delivery is durably accepted.
3. **DEF-001** (ten RPCs calling the deleted `set_rpc_context()`) and **DEF-002** (invoice
   overloads) — **these must deploy together.** DEF-002's broken overload *is* a DEF-001
   failure; fixing one alone leaves PostgREST still choosing between candidates.
4. **DEF-016** — blocked on §1.

### Workstream C — back-office

DEF-012 (permissions), DEF-013 (email signature), DEF-006 (bank health). Each is
independent; DEF-013 needs a product decision on the canonical signature field before code.

### Workstream D — identity and performance

DEF-020 + DEF-023 remainder together (they are one problem: no reliable identity between
git and LIVE). Then DEF-017 indexes, informed by DEF-016 once defined — the cascade radius
determines which indexes actually matter. DEF-025 explicit `verify_jwt`.

### Workstream E — product quality

DEF-011, DEF-008, DEF-007, DEF-009, DEF-010, DEF-014, DEF-005.

---

## 4. Migrations that must deploy together

- **DEF-001 + DEF-002** — one migration family. Reissue all ten bodies with the context
  handling inlined, and resolve the overloads in the same deploy, or PostgREST keeps
  picking the broken candidate.
- **DEF-018's six jobs** — one mechanism, one deploy. Repairing three of six leaves two
  configuration patterns live, which is how this happened.
- **DEF-015 revokes** — batch by risk class, not all 93 at once. A revoke that breaks a
  legitimate anonymous path is a production outage; each class needs its own verification
  that the token-gated public endpoints still work.

## Verification standard

Per the handoff, and it is the right standard: reproduce the original failure first, deploy
through git, confirm migration identity and receipt, re-run the exact reproduction, then
check UI *and* database *and* queue *and* monitoring. A deployed migration is not a closed
defect.

Gate 6 is the reason. Five defects reported success while nothing durable happened, so
"the UI looked fine" is not evidence of anything.

---

## 5. Authored now

`supabase/migrations/20260728120000_revoke_anon_el_signature_progress.sql`.

`el_signature_progress` is on the DEF-015 list because of a mistake I made when I
introduced it yesterday: created SECURITY DEFINER, without revoking the default PUBLIC
EXECUTE grant. It is an internal helper — the single implementation of the signing rule —
and was never intended to be reachable without a session. To an anonymous caller holding an
engagement-letter UUID it currently discloses the signing rule and the signed/required
counts.

The two public signing endpoints added alongside it keep their anon grants deliberately: a
client following an emailed link has no session, and both authorise on the signing token
itself. That is the same pattern as `public_get_onboarding`.

This is one function out of 93. It is authored now because it is mine, it is unambiguous,
and it needs no product decision.

---

## 6. Owner rulings (answered 2026-07-28)

1. **DEF-016** — **the auditor supplies the missing register entry.** No re-derivation, no
   guessing. DEF-016 stays tracked as *undefined — blocking by declaration* until those
   notes arrive; it is not planned around and its severity is not reconstructed.
2. **DEF-010** — **both MTD entries are canonical, because they are different
   obligations:** *MTD Quarterly Updates* (recurring quarterly submissions) and *MTD Final
   Declaration* (separate annual finalisation). Any further catalogue entry describing the
   same quarterly or annual obligation is a duplicate and must be **mapped onto the
   corresponding canonical service**, not maintained alongside it. A displayed **£0.00
   means "Included"** — confirmed as the engine's existing behaviour: `isIncludedLine()`
   in `src/lib/quote-defaults.ts` treats a zero unit price (or zero subtotal) as Included,
   renders it as such, and excludes it from the one-off total, the monthly total and the
   Stripe checkout line items. So this is a catalogue-data reconciliation, not a code
   change. £0.00 must never be used to mean "not yet priced".
3. **DEF-013** — the staff email signature lives on the **per-user profile**. No
   practice-level template and no override layer for launch.
4. **DEF-022** — public practice signup is **gated for launch, re-openable later.**
   Disable behind a flag rather than deleting the path.
5. **Bookkeeping coverage** — accepted. The bookkeeping module is **not to be described as
   tested** until its write paths are re-run after DEF-001/DEF-002 deploy together.
