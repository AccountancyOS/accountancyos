# Proposal Scope, Periods, Billing & Signatories — Discovery Report (Phase 0)

**Spec:** `docs/superpowers/specs/2026-07-25-proposal-scope-periods-signatories-design.md` (Approved 2026-07-25)
**Status:** Discovery only — NO implementation. Produced from code + live schema inspection (3 discovery passes) reconciled against the approved spec.
**Discipline:** every concept classified Reuse / Extend / Introduce; no parallel proposal/status/job/billing models.

---

## 0. Executive summary

**`quote` IS `proposal`.** The DB models everything as `quotes`; "Proposal" is the client-facing label (`PublicQuoteView.tsx`, `lifecycle_send_quote` subject `'Proposal from …'`). We reuse the `quotes`/`quote_lines`/`quote_acceptance_tokens` spine, its versioning (`supersedes_quote_id` + `reissue_quote` + immutable `accepted_snapshot`), templates, pricing, branding, engagement letters, e-sign, reminders, Stripe onboarding, CH sync, and the service→job→deadline engine. **None of these are rebuilt.**

The spec is ~70% already-present. The work is: **(A)** a handful of targeted *extends* (SA multi-year, CH accounts-period prefill, VAT stagger periods, zero-fee "Included", externally-billed producer, MTD job split, signatory snapshot, decline vocabulary); **(B)** a few genuine *introduces* (VAT period generator, MTD-final-declaration catalog code, engagement-letter signatories child + signing rule, shared structured decline-reason vocabulary, a light job-prerequisite link); **(C)** fixing 5 pre-existing defects the spec's behaviour depends on; and **(D)** one load-bearing architectural decision: **commit to the canonical activation path** (§4.1).

**The single most important finding:** the spec's core principles #3 ("no live jobs before required signatures") and #7/idempotent activation are *incompatible with the legacy accept-time job-creation path*, which materialises jobs the moment a token is accepted, with no signature and no gate. Delivering the spec **requires routing all activation through the canonical onboarding-approval gate and neutralising legacy `public_accept_quote_by_token` job creation.** This is a product-confirmation item (§9.1) and the backbone of Phase 2.

---

## 1. Architecture map

### 1.1 Proposal / quote
- **Tables:** `quotes` (status enum `draft|sent|accepted|rejected|expired|superseded` — CHECK `quotes_status_check`, mirrored `src/lib/db-constants/check-constraints.ts:81`), `quote_lines` (`unit_price`/`subtotal` NOT NULL, `billing_frequency` default `'now'`, `canonical_service_code`), `quote_acceptance_tokens` (30-day `expires_at`).
- **Versioning:** `supersedes_quote_id` self-FK + `reissue_quote(quote_id)` RPC (clones lines → new draft, supersedes source, invalidates open tokens). `accepted_snapshot` jsonb = immutable priced snapshot at acceptance. `prevent_accepted_quote_line_changes` trigger locks lines once accepted. `terms_version`.
- **View/open tracking EXISTS** (`viewed_at` ×59, `opened_at` ×10 across schema) — available for Delivered/First-viewed/Last-viewed as events.
- **UI:** `PublicQuoteView.tsx` (accept/decline), `Quotes.tsx` (list), `QuoteDetail.tsx` (reissue), `CreateQuoteDialog.tsx`.

### 1.2 Services, periods, scope→jobs, deadlines
- **`services_catalog` (live):** `company_accounts`, `corporation_tax` (CT600), `confirmation_statement`, `sa_non_mtd`, `sa_mtd`, `mtd_quarterly` (orphaned, canonical NULL — dead), `vat_return`, `payroll`, `cis`, etc. Billing frequency is driven off `quote_lines.billing_frequency`, **not** the catalog. **Accounts and CT600 are already separate codes with separate prices.** `sole_trader_accounts` is mis-scoped `entity_scope='company'` (bug).
- **Periods:** `jobs.period_start/end/period_label`. `lifecycle_materialize_jobs` hard-codes period per code — company services → year-end from `companies.year_end_month/day` (one current period); `sa_*` → single current tax year; `vat_return`/others → `'Setup Pending'` (today+30d). **VAT gets no real period from the engine.**
- **Scope→jobs:** `lifecycle_materialize_jobs(org,client,company,partnership,quote,source)` → per quote_line, upserts `engagements` + `lifecycle_upsert_job_with_deadlines(...)`. Dedup key = **(org, service_code, entity, period_label)** — distinct labels ⇒ distinct jobs. Also `add_service_to_client(...)` (manual, caller supplies period).
- **Deadlines — TWO engines:** System A (legacy, always-on) `calculate_deadline` via `lifecycle_upsert_job_with_deadlines`; System B (canonical, flag-gated) `lifecycle_generate_deadlines_for_job` + `canonical_deadline_rules` — requires `job.canonical_service_code`+`job_template_code` (which the engine leaves NULL) + org flag. **System B (the rich, MTD-quarter-aware one) is dormant for engine-created jobs.** System B already models `mtd_itsa_q1..q4`, `mtd_itsa_final_declaration` (no catalog row), `ct600_filing` off `accounting_period_end`, etc.
- **Job dependency:** only `next_year_job_id` (rollover) + `source_job_id` (provenance) — **no general `depends_on`/prerequisite model.**

### 1.3 Billing / Stripe
- Pricing on `quote_lines`; `billing_frequency` effectively `'now'|'monthly'` only. `invoice_settings` = branding/terms, not pricing. Sales `invoices`/`invoice_lines` = separate AR; a quote does **not** auto-create an invoice on accept. `recurring_invoice_schedules` exists.
- **Two Stripe integrations:** (A) practice SaaS subscription (`stripe-webhook`, idempotent via `stripe_webhook_events`) — gates the app via `BillingGate`; (B) client onboarding via **Stripe Connect** (`onboarding-stripe-checkout` — hard-requires `org.stripe_connect_account_id`; `onboarding-stripe-verify` polls; sets `billing_status`). **Onboarding Connect payment has NO webhook — client-side polling only.**
- **Zero-fee: NONE.** No "Included"/£0 concept; a £0 line goes to Stripe as `unit_amount:0` (rejected in payment mode).
- **Externally-billed: latent.** `billing_status` enum already has `'skipped'|'not_required'` and the gate `billing_settled := billing_status IN ('completed','skipped','not_required')` — but **no code path ever produces `'skipped'|'not_required'`** and `onboarding-stripe-checkout` hard-throws without Connect.

### 1.4 Engagement letters / signatures
- `engagement_letters` = **one row, one signature** (`signed_at/by`, `signer_name/email`, `signature_ip/UA`, `version`, `status`). **No multi-signatory model, no all/any rule.**
- **Two divergent signing RPCs:** `public_sign_engagement_letter` sets `contracts_signed_at` (satisfies gate) but not signer_name/email; `public_sign_engagement_letter_by_token` sets `signature_name` (field drift) and **omits `contracts_signed_at`** → emailed-link sign **fails the activation gate**. `protect_engagement_letter_signatures` freezes signature fields once signed.
- **Signatory *data* exists, disconnected from signing:** `company_officers.is_signatory` (≤10, `enforce_signatory_rules`, `set_officer_signatory` RPC), `contacts.can_sign`. Neither is read by any signing RPC/gate.

### 1.5 Companies House / contacts
- `onboarding-fetch-ch-officers` → upserts `company_persons` on `(org, ch_officer_id)`; `approve_onboarding_transactional` merges `personal_details[]`; `resolve_company_director` resolves via contacts→officers→profile→lead. `companies` holds `year_end_month/day`, `accounts_next_made_up_to`, `accounts_next_due`, `confirmation_statement_*`, `ch_company_profile` (full jsonb). **`accounts_next_made_up_to`/`accounts_next_due` are synced but ignored by the job engine.** The spec's `period_start_on` + `overdue` live inside `ch_company_profile.accounts.next_accounts.*` (not in dedicated columns).

### 1.6 CRM outcomes
- **No structured loss/decline vocabulary** anywhere. `leads.lost_reason` + `quotes.rejection_reason` are both free text; `rejection_reason` auto-defaults to `'Declined by client'` and is mutable. `'expired'` status exists but is **never written**. Declines/reasons are **not surfaced** in CRM board or reporting.

### 1.7 Activation
- Three entry points: **legacy accept** (`public_accept_quote_by_token` — materialises jobs AT ACCEPT when `NOT canonical`, no signature/payment); **canonical accept trigger** (`tg_quote_accepted_activate_canonical` → `lifecycle_activate_client_services`, idempotent on `(org,entity,canonical_service_code)`); **onboarding approval** (`approve_onboarding_transactional`→`lifecycle_approve_onboarding`, gated by `lifecycle_onboarding_gates`: engagement_letter_signed + aml_passed + billing_settled + submitted). Idempotency: snapshot short-circuit, `tokens.used_at`, materialize dedup, `stripe_webhook_events`.

---

## 2. Requirement → gap matrix

| # | Spec requirement | Current state (file/model) | Class | Gap / action |
|---|---|---|---|---|
| R1 | Each service separate scope item incl. £0 | `quote_lines` per service; Accounts & CT600 already separate | **Reuse** | none for separation |
| R2 | Zero-fee "Included" — in scope, activates jobs, £0 total, **no** Stripe/invoice object | no £0 concept; £0→Stripe rejected | **Extend** | add `billing_frequency='included'` **or** `quote_lines.is_chargeable bool`; exclude from `onboarding-stripe-checkout:79-127`; skip checkout if all-included |
| R3 | CT600 "Included with Accounts" via existing relationship | thin `bundle` concept (×4) | **Introduce (light)** | confirm bundle usability; else `quote_lines.parent_line_id` link |
| R4 | SA: N returns, exact tax years, item+job per year; historic ≠ ongoing | writer dedups on period_label ✔; `lifecycle_materialize_jobs` emits only current year | **Extend** | proposal emits one line/period per selected SA year; materialize loops years; `sa_non_mtd` one-off vs `sa_mtd` recurring |
| R5 | Company accounts: prefill next period from CH (`period_start_on/end_on/due_on/overdue`), confirm/correct, add catch-up, item+job per period | `accounts_next_made_up_to`/`accounts_next_due` synced but unused; `period_start_on`+`overdue` only in `ch_company_profile` jsonb | **Extend** | read next-accounts from `ch_company_profile.accounts.next_accounts` (or add 2 columns); prefill proposal; per-period line+job |
| R6 | CT600 separate item, label to accounts YE, no CT split in UI, one CT600 job/year, depends on finalised accounts, sub-submissions beneath | `corporation_tax` code separate; CT600 deadline already off accounts YE; **no job-dependency**; `filings`/`filing_submissions` exist | **Reuse + Introduce (dep link)** | reuse separation + YE mapping; introduce a job-prerequisite link (CT600←Accounts); represent multiple submissions via `filing_submissions` under one job |
| R7 | VAT: freq + stagger → generate valid periods; select every catch-up; item+job per period; first ongoing period | `companies.vat_frequency/vat_stagger_group`, `vat_periods`, `vat_obligations` exist; **no generator**; VAT job = 'Setup Pending' | **Introduce (generator) + Extend (engine)** | add stagger→periods calculator writing `vat_periods`; proposal requires freq+stagger; per-period line+job |
| R8 | MTD: quarterly, annual, SA as **separate jobs** each | `sa_mtd` = one job w/ q1–q4 deadlines (System B, dormant); no MTD-final catalog row | **Extend + Introduce** | introduce `mtd_itsa_final_declaration` catalog code; split MTD quarterly into per-quarter jobs; keep `sa_non_mtd` separate |
| R9 | Fee integer minor units, one-off/recurring, coverage period, billing start/due, AoS/external | `quote_lines` numeric price + `billing_frequency`; `recurring_invoice_schedules` | **Extend** | add billing-start/coverage fields to line (or reuse schedule); normalise money handling; V1 no proration |
| R10 | Only positive values to Stripe; one-off & recurring independent; failure = retryable, non-blocking | checkout splits one-off/monthly; no zero filter; no webhook | **Extend + Fix** | filter £0; add failure→retryable billing-issue surface; **decouple activation from payment** (already true in legacy; keep true in canonical via `not_required`) |
| R11 | External billing: record fee/schedule, no Stripe, identical scope/job behaviour | `billing_status` enum has values; no producer | **Reuse (enum) + Introduce (producer)** | billing-mode selector sets `not_required`; bypass Connect checkout; record schedule for reporting |
| R12 | SA signatory = linked individual; Ltd: CH directors→contacts, ≥1 signatory, primary contact, email each | CH import ✔; `is_signatory`/`can_sign` ✔ but unused in signing; single-signer EL | **Reuse (data) + Introduce (link)** | reuse import + `is_signatory`; introduce proposal signatory selection wired to signing |
| R13 | All-must-sign (default) / any-one; partially-signed; first-sig completes for any | single `signed_at`; no rule | **Introduce** | `engagement_letter_signatories` child (person, email, token, signed_at, required) + `signing_rule 'all'|'any'` on EL; add `partially_signed` status |
| R14 | Proposal stores its own signatory snapshot; CH/contact changes don't mutate in-flight | `accepted_snapshot` pattern for lines only | **Extend** | snapshot signatories into the proposal (like `accepted_snapshot`) |
| R15 | Activation only after signature rule; idempotent; independent of Stripe | canonical gate has `engagement_letter_signed` (single); legacy bypasses gate | **Extend + Fix** | gate on signatory-rule completion; **neutralise legacy accept-time job creation**; keep idempotency keys |
| R16 | Statuses: reuse lifecycle+events; add Delivered/First-viewed/Last-viewed (events), Partially-signed | enum draft/sent/accepted/rejected/expired/superseded; `viewed_at`/`opened_at` exist | **Reuse (events) + Extend (enum)** | Delivered/viewed = events (reuse `viewed_at`/`opened_at`); add `partially_signed`; "Declined"=`rejected` (UI relabel) |
| R17 | Decline: structured reason required, optional immutable client free-text, separate internal reason, who/when, surface in pipeline+reporting | free-text only; default clobbers blank; mutable; single field; not surfaced | **Introduce (vocab) + Extend + Fix** | one shared `decline_reasons` list (config, +Other) used by leads & quotes; split client vs internal fields; freeze client fields; render in CRM/Quotes/dashboard |
| R18 | Expiry ≠ decline; auto "No response / proposal expired" | `'expired'` never written; `valid_until` inert | **Extend** | cron transitions `sent` past `valid_until` → `expired` + records `no_response` outcome (not a client reason) |
| R19 | Validation blocks/warns (periods, signatories, billing start, dup jobs) | scattered validation | **Extend** | central proposal validation using existing patterns |
| R20 | Audit: versions, view/sign/accept/decline/expiry, CH data+time, activated jobs, billing attempts | `audit_log`, `accepted_snapshot`, `automation_events` | **Reuse + Extend** | ensure all listed events audited; snapshot CH-data-time |

---

## 3. Reuse / Extend / Introduce — consolidated

**Reuse unchanged:** quotes/quote_lines/tokens spine; `reissue_quote` + `supersedes_quote_id` versioning; `accepted_snapshot` immutability; Accounts & CT600 separation; CT600→accounts-YE deadline derivation; CH officer import (`onboarding-fetch-ch-officers`, `resolve_company_director`); `company_officers.is_signatory` (+`set_officer_signatory`, `enforce_signatory_rules`) & `contacts.can_sign`; `viewed_at`/`opened_at` tracking; `recurring_invoice_schedules`; `billing_status` enum values `skipped`/`not_required` + `billing_settled` gate; `lifecycle_onboarding_gates`/`approve_onboarding_transactional` idempotency; automation-template attachment; templates/branding/reminders.

**Extend:** `lifecycle_materialize_jobs` (SA multi-year, CH accounts-period prefill, VAT periods); `quote_lines` (zero-fee flag, billing-start/coverage); status enum (`partially_signed`); `onboarding-stripe-checkout` (zero-fee filter, external-billed bypass); CH sync/read for `next_accounts.period_start_on`+`overdue`; decline flow (split client/internal reason, freeze, surface); expiry cron.

**Introduce (genuine gaps, minimal):** VAT stagger→periods generator; `mtd_itsa_final_declaration` catalog code + MTD per-quarter job split; `engagement_letter_signatories` child + `signing_rule`; one shared structured `decline_reasons`/`loss_reasons` vocabulary; a light job-prerequisite link (CT600←Accounts); external-billed producer (billing-mode selector); (light) service-bundle link if `bundle` insufficient.

---

## 4. Contradictions between spec & current architecture

1. **Legacy accept-time job creation vs "no jobs before signatures" (R15, principle #3).** `public_accept_quote_by_token` materialises jobs on token-accept with no signature/gate (legacy mode). The spec forbids this. **Resolution: commit to canonical path; neutralise legacy job creation.** → §9.1.
2. **"Reuse CRM loss-reason vocabulary" (R17) presupposes one that doesn't exist.** Both `leads.lost_reason` and `quotes.rejection_reason` are free text. → introduce ONE shared vocab for both (the spec's fallback "small configurable list + Other" applies).
3. **`rejection_reason` default+mutable contradicts "preserve client free-text immutably" (R17).** Must stop the `'Declined by client'` default and freeze the field; split from the internal reason.
4. **Two `public_reject_quote_by_token` overloads** (text sets lead→lost, uuid doesn't) — decline/pipeline drift; consolidate before adding structured reasons (RPC-replacement-guard applies).
5. **Two engagement-letter signing RPCs** — `_by_token` omits `contracts_signed_at` → fails the activation gate. Multi-signatory work must consolidate signing + gate on the signatory table, not a single `signed_at`.
6. **Onboarding Connect payment has no webhook** — activation completion relies on client polling; the spec's "duplicate callbacks don't repeat activation / failure doesn't block" needs a durable idempotent completion path, ideally a Connect webhook, not just polling.
7. **Two deadline engines** — the rich MTD-quarter/CT/VAT deadline rules live in System B, which is dormant for engine-created jobs (they never set `canonical_service_code`/`job_template_code`). Delivering MTD/VAT/CT deadline separation (R6/R7/R8) requires bridging engine jobs into System B (set the two codes + enable flag).

---

## 5. Data migrations / backfills genuinely required (no speculation)

Additive only, one small migration per increment, receipt-verified:
1. `quote_lines`: `is_chargeable boolean default true` (or `billing_frequency` 'included'); `billing_start_date date null`, `coverage_period_start/end date null`. (R2/R9)
2. `engagement_letters`: `signing_rule text default 'all'`; new `engagement_letter_signatories` table (+RLS, +immutability trigger, +signatory snapshot). (R13/R14)
3. `quotes`: `client_decline_reason_code text`, `internal_outcome_reason_code text`, `declined_by/at`; stop the `rejection_reason` default + add a freeze trigger. (R17)
4. `decline_reasons` config table (org-scoped, seeded with the spec's 7 values + Other) OR a CHECK-constrained enum in `db-constants`; referenced by both `mark_lead_lost` and quote decline. (R17)
5. `services_catalog`: add `mtd_itsa_final_declaration` row; fix `sole_trader_accounts` entity_scope. (R8, defect)
6. Status enum: add `partially_signed`. (R16)
7. `jobs`: a prerequisite link (reuse `source_job_id` semantics or add `prerequisite_job_id`) for CT600←Accounts. (R6)
8. VAT: no new table (reuse `vat_periods`); the generator is a function, not a migration of data.
**No backfills** of existing data are required by the approved behaviour (the tenant was reset; new proposals flow forward). Historic quotes need no migration.

---

## 6. Phased implementation plan (maps to spec Phases 1–4)

Each task = smallest additive change, TDD, one migration where needed (owner applies via Lovable, receipt-verified), committed to `main`.

**Phase 1 — scope & periods (spec §Phase 1):**
- 1a Zero-fee "Included" (R2/R3): line flag + Stripe exclusion + all-included checkout skip. Files: `quote_lines` migration, `CreateQuoteDialog.tsx`, `QuoteDetail.tsx`, `PublicQuoteView.tsx`, `onboarding-stripe-checkout/index.ts`.
- 1b SA multi-year (R4): proposal tax-year multiselect → line/period per year; extend `lifecycle_materialize_jobs` SA branch to honour supplied years. Files: quote UI, `lifecycle_materialize_jobs`.
- 1c Company-accounts CH prefill (R5): read `ch_company_profile.accounts.next_accounts` (+persist `period_start_on`/`overdue` if needed); prefill+confirm+catch-up UI; per-period Accounts job.
- 1d VAT periods (R7): stagger→periods generator (function) writing `vat_periods`; proposal freq+stagger+catch-up selection; per-period VAT job.
- 1e MTD split + CT600 (R6/R8): `mtd_itsa_final_declaration` catalog row; per-quarter + annual + SA jobs; CT600 job-prerequisite link + `filing_submissions` sub-model; bridge engine jobs into System B (canonical codes) so the right deadlines generate.

**Phase 2 — contacts, signatures, activation (spec §Phase 2):**
- 2a Signatories model (R12/R13/R14): `engagement_letter_signatories` + `signing_rule`; proposal signatory selection from CH directors (reuse import + `is_signatory`); signatory snapshot; consolidate the two signing RPCs; add `partially_signed`.
- 2b Gated activation (R15): route activation through canonical gate on signatory-rule completion; **neutralise legacy accept-time job creation**; idempotency keyed on rule-completion.
- 2c Billing modes (R9/R10/R11): billing-start/coverage on lines; external-billed producer (`not_required`); positive-only Stripe; failure→retryable billing issue; decouple from activation.

**Phase 3 — decline reasons & reporting (spec §Phase 3):**
- 3a Shared `decline_reasons` vocab; split client vs internal reason + freeze; consolidate reject overloads. 3b Expiry cron (`expired` + `no_response`). 3c Surface declines/reasons + win/loss reporting in `CRM.tsx`/`Quotes.tsx`/`DashboardKPICards.tsx`.

**Phase 4 — verification & migration (spec §Phase 4):** regression on existing proposal/accept/onboarding flows; only the additive migrations in §5; no speculative backfills.

---

## 7. Test coverage

- **Unit:** VAT stagger→periods generator (all frequencies/staggers, catch-up sets); SA multi-year job emission; zero-fee → no Stripe object; billing-mode routing (Stripe vs external); signing-rule evaluation (all vs any, partial); decline-reason immutability (client field frozen, internal separate).
- **Integration (RPC + DB):** activation gated on signatory-rule completion; idempotent activation (repeat accept / duplicate signature callback → no dup jobs/engagements/invoices — assert on `lifecycle_materialize_jobs` dedup + snapshot short-circuit); reject-overload consolidation (lead always moves to lost); expiry cron transitions.
- **E2E (golden paths):** (a) Ltd proposal: Accounts+CT600(Included)+VAT(catch-up)+MTD → sign (all-must-sign) → jobs+deadlines materialise once; (b) SA multi-year → N SA jobs; (c) external-billed acceptance activates jobs with no Stripe; (d) Stripe failure leaves acceptance+jobs intact + retryable issue; (e) decline with structured reason → no activation, surfaces in pipeline.
- Reuse existing regression patterns (`src/test/regression/*`, vocabulary-drift, single-source-job tests).

## 8. Risks
- **Duplicate activation** (two engines + legacy accept + canonical approve). Mitigate: single canonical activation point; dedup on stable business keys not source-strings; rule-completion idempotency key.
- **Stripe callbacks:** onboarding Connect has no webhook (polling only) + a mis-routed Connect `checkout.session.completed` could clobber `organizations.stripe_*`. Mitigate: durable idempotent completion (webhook or verified poll) + strict metadata typing.
- **Proposal versioning:** `reissue_quote` invalidates tokens but doesn't carry decline reasons / signatories forward; ensure superseded versions keep immutable reasons + signatory snapshots.
- **Existing jobs:** spec R "flag equivalent live job for review, don't duplicate" — reuse the materialize dedup key + surface a warning.
- **Backward compatibility:** additive migrations only; `partially_signed`/new statuses must be added to `db-constants` + all CHECKs together (vocabulary-drift risk — [[accountancyos-vocabulary-drift]]).

## 9. Decisions requiring product confirmation
1. **Commit to the canonical activation path** (neutralise legacy accept-time job creation) — required to satisfy "no jobs before signatures" + idempotency. Confirm we flip all target orgs to canonical and retire the legacy job path. *(Load-bearing.)*
2. **Zero-fee representation:** `billing_frequency='included'` vs a `is_chargeable` boolean — recommend the boolean (clearer, orthogonal to frequency).
3. **MTD quarterly = separate jobs per quarter** (spec R8 says separate jobs) — confirm this replaces today's one-job-four-deadlines shape (a decomposition change).
4. **Decline vocabulary home:** one shared `decline_reasons` config table used by both leads (`mark_lead_lost`) and quotes — confirm shared (recommended) vs quote-only.
5. **CT600 multiple submissions:** represent beneath one CT600 job via `filing_submissions` — confirm that's the "existing filing/submission concept" intended (vs child jobs).
6. **Onboarding Connect webhook:** add a real Stripe Connect webhook for durable payment completion (recommended) vs keep polling — affects idempotency guarantees.
7. **Money units:** normalise to integer minor units on new fields vs keep `numeric` — recommend keep `numeric` (reuse) unless the spec's "integer minor units" is a hard requirement.

---
*No code was written in this pass. Awaiting confirmation on §9 before Phase 1.*
