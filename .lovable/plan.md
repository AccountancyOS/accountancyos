## Audit — what exists today

| Concern | Today | Gap vs spec |
|---|---|---|
| Canonical service registry | `services_catalog` rows per-org, code is free text, ~15 codes with drift (`BOOKKEEPING`, `company_accounts`, `cgt_60_day`, `sa_non_mtd`, etc.) | No global canonical set; no `allowed_client_types`, `filing_regime`, `requires_*` flags, `creates_jobs/deadlines`, `default_deadline_rules`. Accountants can invent codes. |
| Practice-configurable layer | Same `services_catalog` row mixes "canonical" and "practice config" | Need a clean split (canonical global / practice override). |
| Client active services | `engagements` table — already has `service_id`, `quote_id`, `frequency`, `status`, `active`, `activated_at`, `service_config` | Closest match to spec's `client_services`. Missing: `canonical_service_code`, `quote_line_id`, `engagement_letter_version_id`, `pending_re-engagement`, `current_period_start/end`, `partner_owner_id`/`staff_owner_id`. |
| Jobs | `jobs` table with `service_code` text + free fields | Missing FK to `engagements.id` (client_service), missing `canonical_service_code`/`job_template_code`/`created_from`/`source_job_id` discipline. |
| Deadlines | `deadlines` has `service_code`, `job_id`, `engagement_id`, `metadata`, `recurrence_rule` | No `deadline_code`/`deadline_rule_id`, no required-facts gating, no canonical source enum. |
| Job template registry | `job_templates` table + `job-template-engine.ts` (810 LOC) | Not pinned to canonical codes; no canonical seed. |
| Deadline rules | None — logic hardcoded in `src/lib/deadline-engine.ts` (1,161 LOC, 11 generator fns per regime) | Spec wants a `deadline_rules` table driving generation; current engine is JS-only and can drift. |
| Lifecycle RPCs | `lifecycle_send_quote`, `lifecycle_accept_quote`, `lifecycle_approve_onboarding`, … | `lifecycle_accept_quote` only flips quote+lead+creates onboarding row — good, no jobs/deadlines created at accept (already correct). Missing: `lifecycle_activate_client_service`, `lifecycle_generate_jobs_for_service`, `lifecycle_generate_deadlines_for_job`. |
| Quote → EL → activation chain | Quote acceptance → onboarding row; engagement_letters table exists; activation of services happens implicitly via `engagements.active` toggles in UI | No enforced gate that EL-signed + AML-pass must precede activation. |
| Missing-fact handling | None — JS engine creates "estimated" deadlines | Need missing-fact task creation instead. |

Net: the bones exist (`services_catalog`, `engagements`, `jobs`, `deadlines`, `lifecycle_*` RPCs). The spine is broken by (1) free-text drift in service codes, (2) two parallel job/deadline engines in JS rather than DB rules, (3) no explicit canonical/practice split, (4) no enforced activation gate.

## Gap-driven phase plan

Each phase is one PR-sized increment. After each, I stop and give you a UI test checklist. No phase ships behind a removed feature flag until the next phase lands.

### Phase A — Canonical registry foundation (no behaviour change)
- New table `canonical_services` (global, `organization_id IS NULL`-only, RLS read-all-authenticated, write service_role).
- New table `canonical_job_templates` (FK `canonical_service_code`).
- New table `canonical_deadline_rules` (FK `canonical_service_code`, `job_template_code`).
- Seed all 33 canonical services, 35 job templates, ~30 deadline rules from the spec.
- Add `canonical_service_code` (nullable, FK) to `services_catalog`, `quote_lines`, `engagements`, `jobs`, `deadlines`.
- Backfill best-effort mapping from existing free-text codes (`BOOKKEEPING` → `bookkeeping`, `company_accounts` → `accounts_production_ltd`, `cgt_60_day` → `capital_gains_tax_return`, etc.).
- Add `feature_flag: canonical_spine_v1` in `org_settings` defaulting OFF. All new behaviour from B onwards reads this flag.

### Phase B — Practice services layer
- Re-purpose existing `services_catalog` as the practice-config layer. Add: `default_partner_owner_id`, `default_staff_owner_id`, `default_questionnaire_template_id`, `default_workpaper_template_id`, `default_engagement_letter_template_id`, `default_chaser_policy_id`, `display_name_override`, `enabled`. Existing `default_price`/`billing_model`/`default_job_template_id` already cover the rest.
- Add server-side validation: `code` on `services_catalog` must equal a `canonical_services.code` unless `category='custom'`/`custom_advisory`.
- Settings → Services page rebuild grouped by canonical category; show "what jobs/deadlines this creates" panel. Block editing of canonical `code`; allow display override.

### Phase C — Quote line mapping
- Make `quote_lines.canonical_service_code` required for new lines (DB trigger when flag is ON).
- Quote line picker pulls from `services_catalog WHERE enabled=true` for the org; price/frequency default from practice row, overrideable.
- No change to `lifecycle_accept_quote`: it already only sets `quote.status='accepted'` and creates an onboarding row — that's correct per spec.

### Phase D — Client active services from signed EL
- Extend `engagements`: add `quote_line_id`, `engagement_letter_version_id`, `pending_reengagement`, `current_period_start/end`, `partner_owner_id`, `staff_owner_id`. Treat `engagements` as `client_services`; do not create a parallel table.
- New RPC `lifecycle_activate_client_services(p_engagement_letter_id uuid)`:
  - Requires EL `signed_at IS NOT NULL`, onboarding `aml_status='approved'`, onboarding `billing_status='ready'`.
  - For each accepted quote line, upsert engagement row with `status='active'`, `activated_at=now()`, copying agreed fee/frequency.
  - Idempotent on `(quote_line_id, engagement_letter_version_id)`.
- Trigger on `engagements` UPDATE of fee/scope after `activated_at` sets `pending_reengagement=true`.

### Phase E — Job generation from active services
- New RPC `lifecycle_generate_jobs_for_service(p_engagement_id uuid)`:
  - Reads `canonical_job_templates` for the service.
  - Computes period (tax year / accounting period / VAT period / pay period) from client/company facts.
  - Inserts `jobs` rows with `client_service_id = engagements.id`, `canonical_service_code`, `job_template_code`, `created_from='service_activation'`, `period_start/end`.
  - Idempotent on `(client_service_id, job_template_code, period_start, period_end)`.
- Called automatically at end of Phase D activation, and from rollover (Phase G).
- Existing `job-template-engine.ts` becomes a thin client of this RPC (delete duplicated generation logic; keep UI helpers).

### Phase F — Deadline generation from job + rules
- New RPC `lifecycle_generate_deadlines_for_job(p_job_id uuid)`:
  - Reads `canonical_deadline_rules` for the job template.
  - For each rule, evaluate `required_facts`. If satisfied, compute `due_date` via `calculation_method` (e.g. `period_end + 9 months + 1 day`, `completion_date + 60 days`); if not, insert a `client_tasks` row of `request_type='missing_fact'` with the deadline-rule code, instead of a deadline.
  - Prefer CH/HMRC API values where the rule's `source` is API-preferred and a value exists in `companies.accounts_next_due` / `hmrc_authorisations.last_obligation_response` etc.
  - Idempotent on `(job_id, deadline_code)`.
- Retire the per-regime JS generators in `src/lib/deadline-engine.ts` to read-only preview helpers that call the RPC server-side.

### Phase G — Rollover
- Extend `auto_rollover-service.ts` to call `lifecycle_generate_jobs_for_service` for the next period when a job moves to `completed`/`filed`. Idempotency key as in Phase E.
- Deadlines regenerate from the new job via Phase F.

### Phase H — Cleanup
- Drop the JS deadline/job creator paths.
- Remove tolerance for free-text `service_code` outside `custom_advisory`.
- Add regression tests: canonical seed integrity, idempotency on activation/job/deadline generators, missing-fact behaviour, RLS isolation, no deadline created without rule.

## Files / surfaces affected
- DB (migrations): `canonical_services`, `canonical_job_templates`, `canonical_deadline_rules`, extensions to `services_catalog`/`quote_lines`/`engagements`/`jobs`/`deadlines`, new lifecycle RPCs, validation triggers.
- Frontend: `src/pages/Services.tsx` (rebuild), `src/components/quotes/CreateQuoteDialog.tsx`, `src/pages/QuoteDetail.tsx`, `src/components/clients/*` (Services tab), `src/pages/Jobs.tsx`, `src/pages/Deadlines.tsx`, `src/lib/deadline-engine.ts` (shrink), `src/lib/job-template-engine.ts` (shrink), `src/lib/auto-rollover-service.ts`.
- Edge functions: none new; `chaser-tick`, `companies-house-sync`, `hmrc-vat-obligations` continue to feed facts the rules read.

## Data migration strategy
- Phase A migration is additive only (new tables + nullable columns).
- Backfill SQL maps current rows: `services_catalog.code` → canonical via a fixed lookup table (committed in the migration). Unmapped rows get `category='custom_advisory'` and a warning row in `audit_log`.
- `engagements` rows backfilled with `canonical_service_code` from their `service_id → services_catalog.code → canonical` chain.
- Existing `jobs`/`deadlines` keep their free-text `service_code`; new column populated when canonical mapping exists.
- No destructive deletes until Phase H, and only after a per-org dry-run report shows zero unmapped rows.

## Idempotency strategy
Every generator RPC uses a deterministic uniqueness key, enforced by partial unique indexes:
- Activation: `(quote_line_id, engagement_letter_version_id)` on `engagements`.
- Jobs: `(client_service_id, job_template_code, period_start, period_end)` on `jobs`.
- Deadlines: `(job_id, deadline_code)` on `deadlines`.
- Rollover: same job uniqueness key, so a retry never duplicates.

## Feature-flag / rollout
- `org_settings.canonical_spine_v1` (boolean). Phase A ships flag=OFF for everyone (no observable change).
- Phases B–G read the flag; legacy paths remain until flag flips per-org.
- Enable for one greenfield test org (Greenfield & Co), then your live org, then broader.
- Phase H removes the flag and the legacy paths.

## UI test plan (after each phase)
- **A:** Settings → Services still works; quote/job/deadline pages unchanged.
- **B:** Settings → Services shows 33 canonical entries grouped by category; toggling one off hides it from the quote line picker; non-canonical custom service still creatable as `custom_advisory`.
- **C:** Creating a new quote line forces a canonical pick; price defaults from the practice row; existing draft quotes still render.
- **D:** Signing an EL after AML approval activates engagements; tampering with fee post-activation flips the "Re-engagement required" badge.
- **E:** Activated engagement spawns the expected jobs (e.g. `accounts_production_ltd` → one `ltd_accounts_production` job per accounting period); running activation twice doesn't duplicate.
- **F:** A CT600 job shows `corporation_tax_payment` + `ct600_filing` deadlines computed from period end; a CGT service without completion_date shows a missing-fact task, no 60-day deadline.
- **G:** Marking a CT600 filed creates the next-period CT600 job + deadlines.
- **H:** Legacy JS-generated rows are gone; no orphan `service_code` strings outside `custom_advisory`.

## Risks / open questions
1. **First-accounts logic** (21 months from incorporation vs 3 months after ARD) needs a tested formula; propose centralising in `canonical_deadline_rules.calculation_method`.
2. **VAT scheme variants** (annual accounting, payments-on-account) — Phase F should ship only the standard quarterly rule first; annual + POA in a Phase F.1.
3. **MTD ITSA** is unsettled UK policy; quarterly dates per spec are correct for 2026, but rule rows should be versioned (`effective_from`).
4. **`engagements` reuse vs new `client_services`**: I recommend extending `engagements` to avoid a two-table refactor; spec uses the name `client_services` but the substrate is the same. Confirm naming preference (table can be renamed in Phase H if you prefer).
5. **CH/HMRC API precedence**: rule evaluator needs a clear precedence (API value → calculated fallback → manual override). Will codify in Phase F's RPC.
6. **Backfill confidence**: a few existing live engagements may not map cleanly; we surface them as a per-org report before enabling the flag.

## Decision needed before I build
1. Approve the phase order and that **A ships first as a pure additive migration with the flag OFF** so nothing user-visible changes.
2. Confirm extending `engagements` rather than creating a new `client_services` table (Risk 4).
3. Confirm we exclude annual-accounting VAT and MTD ITSA from the first cut of Phase F and ship them as F.1.
