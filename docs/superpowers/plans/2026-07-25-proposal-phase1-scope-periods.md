# Proposal — Phase 1: Shared scope & period behaviour — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.
> Grounding docs: spec `docs/superpowers/specs/2026-07-25-proposal-scope-periods-signatories-design.md`; discovery `docs/superpowers/plans/2026-07-25-proposal-discovery-report.md`.

**Goal:** Let a proposal define the *exact* compliance periods per service so acceptance creates the right separate jobs — SA per tax year, Accounts per CH-prefilled period, VAT per stagger-generated period, MTD quarterly/annual/SA as separate jobs — plus zero-fee "Included" items. Reuse the `quotes` spine; no parallel models.

**Global constraints (from resolved spec decisions):**
- `quote == proposal`; reuse `quotes`/`quote_lines`/`accepted_snapshot`/`reissue_quote`. No new proposal entity/status system.
- "Included" = derived from `unit_price = 0` (NO `is_chargeable` flag). Keep `numeric` money.
- Each exact period = a separate `quote_line` → a separate job (dedup key already `(org, service_code, entity, period_label)`).
- MTD quarterly + MTD annual + SA = separate jobs. Bridge engine-created jobs into the canonical deadline spine (set `canonical_service_code` + `job_template_code`) so the rich deadlines generate.
- Every DB change = one small additive migration + receipt; owner applies via Lovable; verify live.

---

### Task 1 (FOUNDATION): `quote_lines` carry exact periods; materialize honours them
**Why first:** every other Phase 1 task writes per-period lines; the engine must consume the line's period instead of computing one.

**Files:** Create migration `…_quote_lines_periods_and_materialize.sql`; Test `src/test/regression/proposal-line-periods.test.ts`; receipt.
**Interfaces produced:** `quote_lines.period_start date null`, `period_end date null`, `period_label text null`. `lifecycle_materialize_jobs` uses the line's `(period_start,period_end,period_label)` when present, else falls back to today's computed period (backward-compatible).

- [ ] Write failing regression test: migration set adds the three `quote_lines` columns AND `lifecycle_materialize_jobs` references `ql.period_start`/`ql.period_label`.
- [ ] Run → FAIL.
- [ ] Migration: `ALTER TABLE quote_lines ADD COLUMN IF NOT EXISTS period_start date, period_end date, period_label text`. `CREATE OR REPLACE FUNCTION lifecycle_materialize_jobs` (base on the LIVE body via catalog_functions) — inside the loop, `v_period_start := COALESCE(ql.period_start, <computed>)` etc.; label likewise. Preserve all other behaviour byte-for-byte (RPC-replacement discipline).
- [ ] Run → PASS. Write receipt (both objects; behavioural: a quote_line with an explicit period materializes a job with that period_label). Receipt-gate green.
- [ ] Commit `feat(proposal): quote_lines carry exact periods; materialize honours them (Phase 1 T1)`. Owner applies; verify live.

### Task 2: Zero-fee "Included"
**Files:** `onboarding-stripe-checkout/index.ts` (exclude £0 lines; skip checkout if all-included); `PublicQuoteView.tsx`/`QuoteDetail.tsx`/`CreateQuoteDialog.tsx` (render `unit_price=0` as "Included", exclude from totals); test.
**Interfaces:** helper `isIncludedLine(line) => line.unit_price === 0`. Totals exclude included lines; Stripe line-item builder filters them; if no positive line, skip Stripe entirely (billing settled/not-required per Phase 2).
- [ ] Failing test: checkout builder given lines incl. a £0 line emits Stripe items only for positive lines; all-£0 → no Stripe call.
- [ ] Run → FAIL. Implement filter + "Included" badge + totals exclusion. Run → PASS.
- [ ] `tsc -p tsconfig.app.json --noEmit` clean. Commit `feat(proposal): zero-fee Included items (Phase 1 T2)`.

### Task 3: SA multiple exact tax years → one item + job per year
**Files:** `CreateQuoteDialog.tsx` (SA: "how many returns" + exact tax-year multiselect → one `sa_non_mtd`/`sa_mtd` line per year with `period_start/end/label='YYYY/YY'`); test. (Materialize already honours per-line period from T1 → one SA job per year.)
- [ ] Failing test: selecting SA years 2023/24 + 2024/25 produces two lines with those period labels. Implement. Run → PASS. Historic-only (`sa_non_mtd`) stays one-off (no ongoing forced). Commit `feat(proposal): SA multi-year selection (Phase 1 T3)`.

### Task 4: Company-accounts CH period prefill + confirm + catch-up
**Files:** a small period helper reading `companies.ch_company_profile.accounts.next_accounts.{period_start_on,period_end_on,due_on,overdue}` (+ persist `period_start_on`/`overdue` if a column is cleaner — verify during build); `CreateQuoteDialog.tsx` (prefill+confirm+editable; "add catch-up period"); each accounts period → one `company_accounts` line with its period; test.
- [ ] Failing test: given a company with CH next_accounts, the accounts line prefills that period and is confirmable/editable; a catch-up period adds a second line. Implement. Run → PASS. Commit `feat(proposal): company-accounts CH period prefill + catch-up (Phase 1 T4)`.

### Task 5: VAT frequency + stagger → generated periods (the one big introduce)
**Files:** Migration `…_vat_period_generator.sql` — function `generate_vat_periods(p_frequency text, p_stagger int, p_from date, p_to date) RETURNS TABLE(period_start date, period_end date, period_label text)` (monthly/quarterly-by-stagger/annual); receipt. `CreateQuoteDialog.tsx` VAT step (require frequency + stagger/annual-end; list valid catch-up periods to select; require first ongoing period); each selected period → one `vat_return` line with its period; test (unit test the generator across frequencies/staggers).
- [ ] Failing test (generator): quarterly stagger 1/2/3 produce the correct period ends; monthly → 12; annual → 1. Implement migration + UI. Run → PASS. Receipt + owner apply. Commit `feat(proposal): VAT stagger period generator + selection (Phase 1 T5)`.

### Task 6: MTD split + CT600 + bridge jobs into the canonical deadline spine
**Files:** Migration — add `services_catalog` row `mtd_itsa_final_declaration`; fix `sole_trader_accounts` entity_scope; set `canonical_service_code`+`job_template_code` on materialize so `tg_job_canonical_generate_deadlines`/`lifecycle_generate_deadlines_for_job` fire (bridge System A→B); a light `jobs.prerequisite_job_id` (or reuse `source_job_id` semantics) for CT600←Accounts; receipt. Proposal: MTD tax year → separate quarterly + annual + SA lines/jobs; CT600 line labelled to accounts YE → one CT600 job depending on the Accounts job; test.
- [ ] Failing tests: (a) an MTD tax-year selection emits per-quarter + annual + SA lines; (b) materialize sets canonical codes so canonical deadlines generate; (c) CT600 job carries a prerequisite to the Accounts job. Implement. Run → PASS. Receipt + owner apply. Commit `feat(proposal): MTD job split + CT600 prerequisite + canonical deadline bridge (Phase 1 T6)`.

---
## Self-review
- Spec §Phase 1 coverage: SA multi-year (T3) ✔, accounts prefill (T4) ✔, VAT periods (T5) ✔, MTD split (T6) ✔, Accounts/CT600 separate (reuse + T6 link) ✔, Included (T2) ✔. Foundation (T1) enables per-period jobs.
- Sequencing: T1 first (foundation); T2 independent (can parallel); T3/T4/T5 depend on T1; T6 depends on T1 + touches the canonical bridge (highest risk — last).
- Decisions honoured: Included=zero-fee (T2), numeric money kept, per-period lines→jobs, MTD separate jobs, canonical bridge. Billing-method + gate-split are Phase 2.
