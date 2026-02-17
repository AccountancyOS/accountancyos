
# Workpapers + Filing Restructure — Revised Implementation Plan

All six mandatory corrections from the user are incorporated below. This plan supersedes the previously approved plan.

## Corrections Applied

### 1. Single Source of Truth (SSOT)
- **No `filing_versions` table.** The existing `filing_model_snapshots` table is extended to serve as the immutable snapshot store.
- **`filings` table gets `draft_schedule_data_json` (JSONB)** for the current mutable draft. When "Send to Client" or "Submit" is triggered, the draft is frozen into a new `filing_model_snapshots` row.
- **`filings.filing_data` is deprecated** (left in place for migration but no longer written to by new code). All new reads/writes use `draft_schedule_data_json`.
- No `sa_schedule_data` table either. All schedule modules (Employment, Self-Employment, CGT, etc.) are stored as keyed sections inside `draft_schedule_data_json` using canonical keys.

### 2. R&D Module — Real, Not Placeholder
A minimal but functional R&D module ships at launch:
- SME vs RDEC scheme classification per claim
- Qualifying cost categories: staff costs, subcontractor costs, consumables, software, clinical trial volunteer costs
- Restriction rules: subsidised expenditure flags, connected-party subcontractor cap (65%)
- Computed outputs: qualifying expenditure total, enhancement rate applied, additional deduction / tax credit, mapped into CT600 schedules
- Audit/evidence capture: links to `job_artifacts` for supporting workpapers (optional but structurally supported)

### 3. All Tax Parameters DB-Driven
- Create `sa_rate_tables` with all SA parameters: income tax bands, dividend rates/allowance, savings/PSA thresholds, NIC Class 2/4 rates, student loan plan thresholds (Plan 1/2/4/5 + PG), CGT rates and annual exempt amount, marriage allowance, HICBC threshold, pension annual allowance + taper + MPAA.
- `ct_rate_tables` already exists and is already used by `ct-computation-engine.ts`.
- `tax-calculation-engine.ts` will be refactored to fetch from `sa_rate_tables` instead of using hardcoded `TAX_YEAR_CONFIGS`.
- `capital-allowances-engine.ts` constants (AIA limits, WDA rates, full expensing dates) moved to a `ca_rate_tables` DB table.

### 4. SA Submission Pathway — HMRC-Aligned
- SA Non-MTD: `sa-submit` edge function targeting HMRC Self Assessment Online XML API (GovTalk/IREnvelope schema)
- MTD ITSA: separate edge functions for quarterly updates (`mtd-itsa-update`), EOPS (`mtd-itsa-eops`), and final declaration (`mtd-itsa-final-dec`) — all using HMRC MTD REST APIs per vendor guidance
- SA800 (Partnership) follows the SA Online XML API pathway

### 5. Locking Includes TB + COA Snapshots
- "Send to Client" creates a `filing_model_snapshots` row that includes not just the schedule data but also:
  - `tb_snapshot`: the full trial balance grid at lock time
  - `coa_tax_mapping_snapshot`: the COA tax_allowability + ct_addback_category values at lock time
- These are stored inside `snapshot_data` as nested objects, ensuring the locked filing is fully self-contained and reproducible.

### 6. Partnership to Individual — Reference-Based
- `partnership_allocations` rows store the computed allocation per partner.
- Individual SA filings reference the allocation via `partnership_allocation_id` (a FK pointer), not copied values.
- The SA schedule engine reads from the allocation record at computation time, so any correction to the partnership return automatically flows through (until the individual's filing is locked).

---

## Existing Infrastructure Summary

**Already exists (extend, don't replace):**
- `filings` table with 50+ columns, status workflow, snapshot refs
- `filing_model_snapshots` table — immutable, SHA-256 hashed, RLS-locked, trigger-protected against UPDATE/DELETE
- `filing_submissions` table — full request/response audit log per submission
- `ct_rate_tables` — DB-driven CT rates, already consumed by `ct-computation-engine.ts`
- `ct_computation_snapshots` — CT computation results store
- `workpaper_instances` — existing workpaper data with field_values, overrides, locking
- `bookkeeping_accounts` — has `tax_mapping` JSONB (to be extended with structured columns)
- `audit_log` — entity-level audit with before/after state, IP, user agent (needs `reason` column)
- Capital allowances engine, CT computation engine, FRS105 model, iXBRL generator, CT600 XML builder

**Does NOT exist yet (must create):**
- `job_artifacts`, `workpaper_templates`, `job_workpaper_instances`
- `sa_rate_tables`, `ca_rate_tables`
- `cgt_disposals`, `crypto_token_pools`, `crypto_transactions`
- `partnership_allocations`
- R&D module tables
- SA schedule engine, SA302 renderer, CGT/crypto engine, partnership engine
- Submission edge functions for SA, MTD ITSA

---

## Phase-by-Phase Build Order

### Phase 1: Schema Language + DB-Driven Tax Rates + Validation Framework ✅ COMPLETE

**Database:**
- Create `sa_rate_tables` with columns for every SA parameter by `tax_year` and `effective_from`: personal_allowance, taper_threshold, basic_rate_limit, higher_rate_limit, basic_rate, higher_rate, additional_rate, dividend_allowance, dividend_basic_rate, dividend_higher_rate, dividend_additional_rate, savings_nil_rate_basic, savings_nil_rate_higher, class2_threshold, class2_weekly_rate, class4_lower_limit, class4_upper_limit, class4_main_rate, class4_additional_rate, cgt_basic_rate, cgt_higher_rate, cgt_residential_basic, cgt_residential_higher, cgt_annual_exempt_amount, student_loan_plan1_threshold, student_loan_plan2_threshold, student_loan_plan4_threshold, student_loan_plan5_threshold, student_loan_pg_threshold, student_loan_plan1_rate, student_loan_plan2_rate, student_loan_plan4_rate, student_loan_plan5_rate, student_loan_pg_rate, marriage_allowance_amount, hicbc_threshold, hicbc_upper_threshold, pension_annual_allowance, pension_taper_threshold, pension_taper_floor, pension_mpaa
- Create `ca_rate_tables` with AIA limits, WDA main/special rates, full expensing start date, FYA rates — by `effective_from`/`effective_to`
- Seed both tables with 2023/24 and 2024/25 data
- Add `reason` TEXT column to `audit_log`

**Code:**
- Create `src/lib/tax-rates-service.ts` — fetches from `sa_rate_tables` and `ca_rate_tables` by tax year
- Create `src/lib/schema-field-engine.ts` — canonical field schema definitions (sections, fields with types: money/number/date/text/boolean/enum/table-grid, validation rules, computation mapping keys)
- Create `src/types/filing-schemas.ts` — TypeScript interfaces for all canonical schedule keys
- Refactor `src/lib/tax-calculation-engine.ts` to call `tax-rates-service.ts` instead of using `TAX_YEAR_CONFIGS`
- Refactor `src/lib/capital-allowances-engine.ts` to fetch AIA/WDA/FYA rates from DB

### Phase 2: Workpapers — Job Artifacts, Templates, Instances ✅ COMPLETE

**Database:**
- Create `job_artifacts` (id, org_id, client_id, job_id, artifact_type, source_document_id, title, period_label, created_by, created_at, locked_at, locked_by, status, version)
- Create `workpaper_templates` (id, org_id, job_type, name, schema_json, is_default, version, is_active)
- Create `job_workpaper_instances` (id, org_id, job_id, template_id, template_version, instance_schema_json, instance_data_json, status, lock fields)
- Seed default templates per job type
- RLS policies scoped via `organization_users`
- Migration: existing `workpaper_instances` -> `job_workpaper_instances`; existing job-linked docs -> `job_artifacts`

**Code:**
- Create `src/lib/job-artifacts-service.ts`
- Create `src/lib/workpaper-template-service.ts`
- Create `src/components/workpaper/WorkpaperTemplateManager.tsx`
- Create `src/components/workpaper/JobArtifactsPanel.tsx`
- Update Workpapers page to use new model

### Phase 3: Filing — SSOT Draft + Snapshots + Locking + Audit

**Database:**
- Add `draft_schedule_data_json JSONB DEFAULT '{}'` to `filings`
- Add `current_snapshot_id UUID REFERENCES filing_model_snapshots(id)` to `filings`
- Add `current_version INT DEFAULT 0` to `filings`
- Add `locked_at TIMESTAMPTZ`, `locked_by UUID` to `filings` (supplement existing `is_locked`)
- Extend `filing_model_snapshots` with: `version INT`, `lock_reason TEXT`, `filing_id UUID REFERENCES filings(id)`, `tb_snapshot JSONB`, `coa_snapshot JSONB`, `computed_outputs JSONB`, `pdf_artifact_id UUID`, `submission_artifact_id UUID`
- Update filings status CHECK to include: draft, ready_for_review, sent_to_client, client_changes_requested, approved, submitted, accepted, rejected
- Migration: existing `filings.filing_data` -> copy to `draft_schedule_data_json`; existing linked snapshots -> create v1 `filing_model_snapshots` rows

**Code:**
- Create `src/lib/filing-version-service.ts` — creates snapshot from draft + TB + COA state, increments version
- Create `src/lib/filing-lock-service.ts` — locks filing + workpapers + captures TB/COA snapshots; unlock with mandatory audit_log reason
- Create `src/components/filings/FilingUnlockDialog.tsx` — warning modal, reason field (required)
- Create `src/components/filings/FilingVersionHistory.tsx` — snapshot timeline with diff
- Create `src/components/filings/SendToClientDialog.tsx`
- Refactor `src/pages/FilingDetail.tsx` for new status flow

### Phase 4: SA Non-MTD Schedules + SA302 + PDF

**Code:**
- Create `src/lib/sa-schedule-engine.ts` — canonical schedule definitions for all 13 modules
- Create schedule editor components under `src/components/filings/sa/`:
  - EmploymentSchedule, SelfEmploymentSchedule, PropertySchedule (UK + overseas), DividendsSchedule, InterestSchedule, UnitTrustIncomeSchedule, PensionIncomeSchedule, ChargeableEventGainsSchedule, TrustEstateIncomeSchedule, CGTSchedule, ReliefsSchedule, AdjustmentsSchedule
- All read/write to `filings.draft_schedule_data_json` using canonical keys
- Refactor `tax-calculation-engine.ts` to consume canonical schedule data
- Create `src/lib/sa302-renderer.ts` — SA302 computation from schedules
- Create `src/components/filings/sa/SA302View.tsx` + `SATaxReturnPDFView.tsx`
- Auto-populate identity/UTR/NINO/prior year data from client records

### Phase 5: CGT Engine Including Crypto

**Database:**
- Create `cgt_disposals` (id, filing_id, org_id, client_id, asset_type, description, acquisition/disposal dates, proceeds, costs, gain_loss, token_symbol, is_crypto)
- Create `crypto_token_pools` (id, org_id, client_id, token_symbol, pool_type, quantity, pooled_cost)
- Create `crypto_transactions` (id, org_id, client_id, tx_date, tx_type, token_symbol, quantity, cost_gbp, proceeds_gbp, fee_gbp, classification, notes)

**Code:**
- Create `src/lib/cgt-crypto-engine.ts` — Section 104 pooling, same-day rule, 30-day rule, fees, airdrop/fork classification
- Create `src/components/filings/sa/CryptoImportDialog.tsx`, `CryptoPoolsView.tsx`, `CGTDisposalsGrid.tsx`
- Integrate into CGTSchedule; annual exemption + loss carry-forward

### Phase 6: Partnership + Reference-Based Linking

**Database:**
- Create `partnership_allocations` (id, filing_id, partner_client_id, allocation_method, percentage, fixed_amount, special_allocation_json, computed_profit_share, computed_tax_adjustments)
- Add `partnership_allocation_id UUID REFERENCES partnership_allocations(id)` to `filings` for individual SA filings that receive a partner share

**Code:**
- Create `src/lib/partnership-engine.ts` — profit allocation, export partner shares as references
- Create partnership schedule components
- Individual SA schedule engine reads partner share via FK reference (not copied values)

### Phase 7: TB Grid + COA Tax Mapping

**Database:**
- Add to `bookkeeping_accounts`: `tax_allowability TEXT`, `ct_addback_category TEXT`, `vat_treatment TEXT`

**Code:**
- Create `src/components/bookkeeping/TBGridEditor.tsx` — manual entry + CSV import + ledger pull
- Create `src/components/bookkeeping/COATaxMappingEditor.tsx`
- Refactor `accounts-model-mapper.ts` to use structured COA mappings

### Phase 8: FRS105 Accounts + iXBRL

**Code:**
- Refactor `frs105-accounts-model.ts` to generate from TB with COA mappings
- Create `src/components/filings/accounts/AccountsScheduleEditor.tsx`
- Create `src/components/filings/accounts/DisclosureEditor.tsx` — per-filing editable
- Extend `ixbrl-generator.ts` for TB-line-level tagging + disclosure tagging
- Create `src/components/filings/accounts/AccountsPDFView.tsx`

### Phase 9: CT600 Engine — Add-backs + CA + Losses + R&D

**Code:**
- Refactor `ct-computation-engine.ts` for auto add-backs from COA `ct_addback_category`
- Create `src/components/filings/ct/CTAddBacksReview.tsx` — auto-detected vs manual overrides
- Create `src/components/filings/ct/CTLossesSchedule.tsx` — B/F, C/F, carry back
- Create `src/lib/rd-module-engine.ts`:
  - SME vs RDEC classification
  - Qualifying cost categories: staff, subcontractors, consumables, software, clinical trials
  - Restrictions: subsidised expenditure, connected-party 65% cap
  - Computed outputs: qualifying expenditure, enhancement, additional deduction / tax credit
  - Evidence links to job_artifacts
- Create `src/components/filings/ct/RDClaimEditor.tsx`
- Create `src/components/filings/ct/CTComputationView.tsx`
- "Create CT600 from Accounts" button linking to accounts filing + TB version

### Phase 10: CT Journal Posting

**Code:**
- Create `src/lib/ct-journal-service.ts` — propose CT journal, approval flow, references CT snapshot version
- Create `src/components/filings/ct/CTJournalProposal.tsx`
- Integrate with `posting-service.ts`

### Phase 11: Submission Payloads + Readiness Gates

**Code:**
- Create `src/lib/submission-readiness-service.ts` — pre-submission validation, error list with field links, override with audit + reason
- Extend `ct600-xml-builder.ts` for structured schedule data consumption
- Create `src/lib/sa-submission-builder.ts` — SA Online XML API payload (IREnvelope schema)
- Create `src/lib/accounts-submission-builder.ts` — iXBRL payload for CH

**Edge functions:**
- Create `supabase/functions/sa-submit/index.ts` — targets HMRC SA Online XML API
- Create `supabase/functions/mtd-itsa-update/index.ts` — quarterly update via MTD REST API
- Create `supabase/functions/mtd-itsa-eops/index.ts` — EOPS via MTD REST API  
- Create `supabase/functions/mtd-itsa-final-dec/index.ts` — final declaration via MTD REST API
- Create `src/components/filings/SubmissionReadinessPanel.tsx`

---

## Data Flow Summary

```text
Accountant edits schedules
       |
       v
filings.draft_schedule_data_json  (mutable, canonical keys)
       |
       v  [Send to Client / Submit]
filing_model_snapshots row created (immutable)
  - snapshot_data: schedule data
  - tb_snapshot: trial balance at lock time
  - coa_snapshot: COA tax mappings at lock time  
  - computed_outputs: SA302 / CT computation
  - snapshot_hash: SHA-256 integrity
       |
       v
Submission edge function reads from snapshot
       |
       v
filing_submissions (request/response audit)
```
