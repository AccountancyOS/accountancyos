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
| DEF-001 | APPLIED — context repair CLOSED, two callers still broken | Migration `20260731210000` applied 2026-08-01 as executor version `20260801081847` (commit `333d501`). Verified live 2026-08-03 by **two independent routes** that agree: a full body sweep of all **366** public functions returns **zero** references to `set_rpc_context` (the executor's `prosrc` count query returned 0 separately), the helper itself does not exist, and all eight def-hashes changed. No call raises `42883`; pre-apply `approve_bill_safe` did. **But `approve_bill_safe` and `create_customer_safe` still fail on pre-existing body defects — DEF-026 and DEF-027.** Bill approval and customer creation are broken on LIVE for reasons unrelated to the context repair. |
| DEF-002 | APPLIED, CLOSED at resolution level | Same migration. Exactly two invoice-draft signatures remain — 14-arg create (`0f9e8acf`), 9-arg update (`99c9bde5`). All four observed payload shapes exercised as anon and as authenticated: **no `PGRST203`, no `PGRST202`** in any of eight calls. Three of the four were PostgREST-level failures pre-apply. Privileges confirmed by `proacl`: `postgres`/`authenticated`/`service_role`/`sandbox_exec` hold EXECUTE on all ten signatures; no PUBLIC, no `anon`. |
| **DEF-029** | **NEW — REGRESSION INTRODUCED BY THIS RELEASE** | The canonical invoice-draft bodies cast `NULLIF(v_line->>'vat_code_id','')` and `NULLIF(v_line->>'account_id','')` into `uuid` columns with **no cast**, so any draft create or update supplying lines fails with `42804`. Drafts succeed only with an **empty** lines array — which is what every probe on both verification routes used, which is why neither harness caught it. **Invoice drafting with lines is broken on LIVE and was not broken before.** Fix-forward migration required. |
| DEF-026 / DEF-027 / DEF-028 / DEF-030 | NEW — found during verification, all pre-existing | `approve_bill_safe` writes status `'APPROVED'`, rejected by `bills_status_check` (`23514`). `create_customer_safe` inserts four columns that do not exist on `public.customers` (`42703`). `stamp_portal_provenance()` selects `portal_access.contact_id`, which does not exist — **critical: every portal write to a table carrying that trigger fails with `42703`**, which also blocks the portal-capability check. `can_create_invoices` requires role ≥ `staff` while `organization_users_role_check` permits only owner/admin/staff, so the capability branch can never refuse a member — either the constraint or the capability model is wrong. |
| DEF-001/002 receipt | **stays in `pending/`** | Status `live_verified_with_open_defects`. 6 of 8 expected objects pass; portal capability is **blocked** by DEF-028 and capability tightening is **not demonstrable** (DEF-030). Convention §3 forbids `applied-verified` unless every check passes, and DEF-029 must be fixed regardless. |
| DEF-015 (the remaining 90) | **CLOSED** | Migration `20260801120000` (commit `1c351ed`) applied and verified live 2026-08-03; receipt promoted to `docs/releases/`. **91 signatures across 90 names**: `anon` EXECUTE false on 91/91, `authenticated` and `service_role` true on 91/91, `sandbox_exec` preserved. The audit's proof-of-exposure case is closed — `find_entities_by_email` returned a real client record to the anon key before, and now returns `PGRST202`. All 19 anonymous-page RPCs kept their grants and the proposal → onboarding → EL-signing journey was probed intact. **DEF-004** (the wider 326-function anon surface, all of which *do* authorise internally) remains open. |
| DEF-012 | FIXED, awaiting deploy | Commit `c5e37b3` — explicit batched query, no foreign key. Orphan check run 2026-07-28: **1 membership, 0 orphans, 0 pending invitations**. Note `organization_users` has no status column at all, so a "legitimate pending membership" cannot exist in this schema — an orphan could only ever be corrupt data. DEF-012 was never an orphan problem: the embed failed for a fully intact single-member tenant. Fixture-based role testing (Owner/Staff/Admin, removed member, multiple roles) belongs with the approved Phase 0 §4 fixture work. |

Suite at the time of writing: **719 tests passing, typecheck clean**. (Earlier figures like
705 are test counts, not commits.)

---

## 2b. Status as at 2026-08-05

Verified against LIVE this morning, independently of the executor. **The receipts were stale
in both directions** — one defect was recorded as unfixed when it was applied, another as
awaiting an executor that has not run.

| Defect | Correction |
|---|---|
| **DEF-029** | **APPLIED, not pending.** The receipt said `NOT APPLIED`; the executor had in fact applied `20260803120000` as version `20260803203957`. Confirmed by reading the live bodies: both now carry `NULLIF(...)::uuid` on `vat_code_id` and `account_id`, hashes moved `0f9e8acf`→`e989e584` and `99c9bde5`→`d7d6bad7`. Invoice drafting with lines works again. The receipt stays in `pending/` because five of its seven expected objects are behavioural and unverifiable without writing real invoice data to production. |
| **DEF-028** | **STILL NOT APPLIED.** Live body unchanged at hash `f67d2205`, still running `SELECT contact_id INTO v_contact FROM public.portal_access`. **Every portal write to invoices, bills, bank_transactions and receipts is still failing with `42703`, as it has since June.** The migration has been authored and committed since 2026-08-03 and is waiting on the executor. This is the single highest-value outstanding apply. |
| **DEF-018 + DEF-003** | **THEY ARE ONE DEFECT.** Confirmed live: exactly the six jobs using `current_setting('app.settings.*')` are the six failing, and the six healthy ones hard-code the URL. `process-email-queue` is absent from `cron.job` entirely — and the migration authored on 2026-07-20 to schedule it (`20260720120000`) was never applied **and carries the same GUC defect**, so applying it would have produced a seventh permanently-failing job. Repaired together in `20260805100000`; that migration supersedes the 2026-07-20 one, which must never be applied. |
| **DEF-026** | Not a typo — a **half-applied design change**. `20251217171128` deliberately moved `approve_bill_safe` to write `APPROVED`; the constraint was never widened. `record_bill_payment_safe` already accepts `APPROVED`, so the constraint is what is wrong. Repaired in `20260805110000`. Root cause of the eight-month blindness: **`bills` was never in the CHECK-constraint drift registry**, which is the system built to catch exactly this. It is now registered. |
| **DEF-027** | The four missing columns are **not repaired uniformly**: `billing_address` is decomposed onto the existing address columns (the caller already sends that shape, and an address feeding invoice projections cannot have two roots), `internal_notes` maps to the existing `notes`, and only `company_name` and `default_currency` become new columns. Two further defects found in the same body and repaired: `p_entity_type` was never validated, and **there was no tenancy check on `p_entity_id`** — a member of one organisation could attach a customer to another organisation's client. |
| **DEF-030** | **HELD, not actioned.** The owner ruled on 2026-08-05 to delete the dead `can_create_invoices` branch, but that ruling predates finding `src/lib/permissions.ts`, which defines a deliberate 3-role model (`owner > admin > staff`) and a full capability matrix. The branch is a no-op *today* only because all three roles are granted the capability — `can_issue_invoices` is already narrower (`owner`/`admin`). Deleting it would remove the server-side enforcement point for a modelled permission and leave enforcement client-side only, and therefore bypassable. Returned to the owner for re-ruling. |

### DEF-031 — `sandbox_exec` bypasses RLS. P1, security.

Established 2026-08-05 by the executor at our request, from `pg_roles`:

| attribute | value |
|---|---|
| `rolbypassrls` | **`t`** |
| `rolcanlogin` | `t` |
| `rolsuper` | `f` |
| `rolcreaterole` / `rolcreatedb` | `f` / `f` |
| member of | none |
| owns `cron.job_run_details`, `vault.secrets` | no — `supabase_admin` |

**A login role that bypasses RLS is a tenancy bypass.** RLS is the only mechanism enforcing
the tenant boundary in this database; `rolbypassrls` removes it wholesale for any session
opened as that role. If those credentials leak, every client record in every organisation is
readable and writable, and no policy in the schema intervenes. It is not superuser and owns
neither the cron nor the vault relations, which bounds it — but it does not need to be
superuser to defeat tenancy.

**This is why the grant request was withdrawn**, correctly and by the executor itself: the
missing privileges were never the problem. `cron.job_run_details` is not grant-denied at all
(`PUBLIC` already holds `r` and `d`); the denial was schema `USAGE` on `cron`.
`vault.decrypted_secrets` is a view with `service_role=rd` and no RLS, so `rolbypassrls` buys
nothing there — widening it would be a decryption grant on the secret store. The DEF-019
projections are the right shape for both.

#### What this voids, precisely — and what it does not

The executor's own summary ("every RLS proof in this codebase is silently void") is the right
instinct but overstates the blast radius. Checked directly:

- **VOID — behavioural checks issued as `sandbox_exec`.** The executor's cross-tenant probes
  during the DEF-001/002 and DEF-028 verifications returned `42501`, and it has correctly
  re-read those as proving **grants and in-function `RAISE`s, not RLS**. Any conclusion of the
  form "role X could not see tenant Y's row" drawn through psql as `sandbox_exec` proves
  nothing about RLS.
- **NOT VOID — `scripts/smoke-test.ts` cross-org isolation.** It calls
  `signInWithPassword` for a real Org A and a real Org B user and reads through PostgREST as
  `authenticated` with genuine JWTs. `SMOKE_SERVICE_ROLE_KEY` is used only for unrelated
  introspection checks and is explicitly absent from this path — `rls-cross-org.test.ts`
  guards exactly that ("no service role"). RLS applies. **This is the actual tenancy proof and
  it stands.**
- **NOT VOID — `docs/automation/rls-isolation-evidence.md` §1 and §2.** Those are catalog
  reads: `relrowsecurity` flags and policy definitions. Catalog visibility is not RLS-filtered,
  so which role read them is immaterial. The structural evidence — RLS enabled on all 23
  tables, every non-catalog policy resolving org through `auth.uid()` — stands.
- **NOT VOID — DEF-015.** That release concerned function `EXECUTE` grants (`proacl`).
  `rolbypassrls` does not bypass privilege checks, only row-security policies. Unaffected.

So the correction is narrow but worth stating plainly: **tenancy isolation for real users
remains evidenced.** What is unevidenced is anything concluded about RLS from a
`sandbox_exec` session, and that is a smaller set than it first appeared.

#### Ruling required

Removing `BYPASSRLS` (`ALTER ROLE sandbox_exec NOBYPASSRLS`) is the obvious remedy and is
unlikely to impede the executor: DDL and migration application are unaffected by RLS, and the
verification reads that would become RLS-filtered are the ones currently producing misleading
evidence. Where a verification genuinely needs to see across tenants, the DEF-019 pattern —
a narrow `SECURITY DEFINER` projection in `public` — serves it without a standing bypass.
Owner ruling needed before altering a production role.

### DEF-032 — `PUBLIC` can DELETE `cron.job_run_details`. P2, audit integrity.

Reported alongside DEF-031: the ACL on `cron.job_run_details` is `=rd/supabase_admin`, so
**any role can delete cron run history.** That table is the audit trail of scheduled
execution, and it is the evidence base for the DEF-018 release.

This has a direct consequence for our own verification design, and it is recorded rather than
glossed: the `no-failed-runs` and `no-unrecognized-parameter-errors` checks in the DEF-018
receipt assert an **absence** over a time window. An absence is not distinguishable from a
deletion. Those checks are therefore weaker than they read — they cannot detect a history that
was truncated rather than clean. `all-seven-ran-successfully` and `http-calls-succeeded` assert
a **presence** and are unaffected, which is why the gate does not rest on the absence checks
alone. Revoking `DELETE` from `PUBLIC` on that relation would close it.

### New findings, 2026-08-05

- **An `OVERDUE` bill cannot be paid.** `record_bill_payment_safe` accepts only
  `('APPROVED','AWAITING_PAYMENT','PART_PAID')`, but the aged-balance path and the overdue
  scan can move a bill to `OVERDUE`, after which every payment is refused. Not repaired —
  it is a state-machine question, not a vocabulary one, and needs a ruling.
- **`approve_bill_safe` on LIVE has drifted from its own December definition**, losing the
  `locked_fields` assignment and the richer `audit_log` row that `20251217171128` wrote, and
  swapping `can_approve_bills` for `user_has_role_at_least(...,'manager')`. Something
  re-issued it later with *less* behaviour. This is DEF-020/DEF-023 evidence.
- **The bills UI compared against `'VOID'`**, a spelling retired in `20260703145810`, so the
  void filter matched nothing and the payment button never hid for a voided bill. Fixed.
- **Delivery cannot be verified by the reviewing party.** `pg_cron` records a run as
  succeeded when the *SQL* completes, but `net.http_post` is asynchronous — a job can be
  "succeeded" while every HTTP call it makes returns 401. `cron.job_run_details` and
  `net._http_response` are outside the `public` schema and unreadable through the connector.
  This is further DEF-020 evidence and is delegated explicitly in the DEF-018 receipt rather
  than claimed.

### DEF-001 corrected: TEN → EIGHT (confirmed 2026-07-31)

The audit states ten broken function bodies. **The evidenced number is eight.** The
correction is now applied, confirmed by the executor's unrestricted `pg_proc` inventory
(2026-07-31T20:15:16Z): `calls_helper = true` on exactly eight rows, no LIVE-only caller.

**Method.** `set_rpc_context` appears in five migrations. Parsing every `CREATE FUNCTION`
*and* `CREATE OR REPLACE FUNCTION` block in them yields **fifteen function names that ever
called the helper**; each was then checked against its live body. (A first pass matched only
`CREATE OR REPLACE FUNCTION` and returned two — the December migration uses bare
`CREATE FUNCTION`. Any future body-search over these files must match both forms.)

**Result — 17 instances across 15 names:**

- **8 still call `public.set_rpc_context()`:** `create_automation_rule_safe` (`de32451b`),
  `update_automation_rule_safe` (`3803ae13`), `toggle_automation_rule_safe` (`dbe752a5`),
  `delete_automation_rule_safe` (`1ef6b7fc`), `approve_bill_safe` (`75551314`),
  `void_bill_safe` (`cc7973c4`), `record_bill_payment_safe` (`2dbb0171`),
  `create_customer_safe` (`1ca6a433`).
- **9 already inline `set_config`:** `create_invoice_draft_safe` ×2,
  `update_invoice_draft_safe` ×2, `queue_email_safe`, `issue_invoice_safe`,
  `void_invoice_safe`, `create_bill_draft_safe`, `record_invoice_payment_safe`.

8 + 9 = 17; 15 names with two double-overloaded names = 17 instances. The December
remediation repaired seven names and missed eight.

**Two audit statements are contradicted by the live bodies** and must not be repeated:
invoice drafting is *not* currently broken (all four overloads are already inlined), and
neither is supplier payment via `record_invoice_payment_safe`. DEF-002's claim that one
invoice-draft overload "contains the DEF-001 failure" is likewise unsupported — that defect
is a pure signature collision.

**Why this is not yet conclusive.** Repository enumeration cannot see a function created
directly on LIVE and never committed, which DEF-020 establishes as a real risk here. The
outstanding `pg_proc` query closes that and is required regardless for `proacl`/`proowner`,
which the database connector cannot read (it exposes `db_select` over public tables,
`db_rpc`, and the `catalog_*` helpers — none reach function ACLs or ownership). It must be
run by the executor.

If it returns additional LIVE-only callers, the repair set expands on that evidence. The
number will not be forced back to either eight or ten.

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
