# AccountancyOS – Full System Audit & Critical Issues Report (Batch 2)

**Date:** 2026-02-18  
**Auditor perspective:** Principal Engineer / CTO (regulated fintech) / UK Tax Technologist  
**Scope:** Post-hardening deep audit — architecture, data model, compliance, UX, scale

---

## 1️⃣ Executive Summary

The most dangerous issues currently in the system:

1. **Dual CT computation engines produce divergent results.** `tax-calculation-engine.ts` (synchronous, hardcoded rates) and `ct-computation-engine.ts` (async, DB-driven rates) coexist. Workpapers use the former; CT filing uses the latter. A filing built from workpaper data will contain different tax numbers than the CT computation snapshot — this is a compliance-destroying inconsistency.

2. **VAT aggregator computes VAT incorrectly from ledger.** `vat-ledger-aggregator.ts` line 154 calculates `netAmount = entry.credit - entry.debit` then derives VAT as `netAmount × (rate/100)`. This is wrong: VAT should come from the actual posted VAT amount (already split on invoice/bill lines), not re-derived from the net. This will produce incorrect VAT returns.

3. **FRS105 account mapping uses hardcoded account codes** (`FRS105_ACCOUNT_MAPPINGS` in `frs105-accounts-model.ts`) instead of the CoA `account_subtype` taxonomy. Any client with non-standard account codes will produce an empty or wrong balance sheet.

4. **Tax calculation engine uses synchronous hardcoded rates** (`calculateSelfAssessmentTax` calls `getTaxYearConfig()` sync). The `@deprecated` annotation is ignored in all production paths through `workpaper-from-tb.ts`. DB-driven rates exist but are never used in the actual calculation flow.

5. **No P&L in FRS105 accounts model.** The iXBRL generator produces a Balance Sheet only. FRS105 micro-entities do not require a P&L by law, BUT the filing must include a "Statement of Income and Retained Earnings" or equivalent. Currently, retained earnings has no movement explanation.

6. **Filing `draft_schedule_data_json` and workpaper `field_values` are two separate JSONB stores** with different schemas for the same domain concepts (e.g., SA schedule data). This is state duplication that will drift.

7. **`window.location.origin` used in server-facing code paths** (`filing-service.ts` lines 326, 395) for constructing portal URLs. This will break in edge functions, SSR, or any non-browser context.

8. **Control account lookup by name pattern** (`posting-service.ts` `getControlAccount`) is fragile. It matches accounts by searching for substrings like "Trade Debtors" in account names. Any client renaming accounts breaks all postings.

9. **TB snapshot opening balance calculation is wrong for asset/liability sign conventions.** `trial-balance-service.ts` line 128 calculates closing as `openingBalance + debit - credit` which is only correct for asset accounts; liability/equity accounts should be `credit - debit`.

10. **No Flat Rate Scheme (FRS) or Cash Accounting scheme support** in VAT. Approximately 30% of small UK businesses use FRS. The entire VAT engine assumes standard accrual accounting.

---

## 2️⃣ Critical Issues (Must Fix Before Production)

### CRIT-01: Dual CT Computation Engines — Divergent Tax Numbers

**Modules:** `tax-calculation-engine.ts`, `ct-computation-engine.ts`, `workpaper-from-tb.ts`

**What exists today:** Two completely separate CT calculation implementations:
- `tax-calculation-engine.ts::calculateCorporationTax()` — synchronous, uses hardcoded `TAX_YEAR_CONFIGS`, called from `applyTaxCalculationsToWorkpaper()` → workpapers
- `ct-computation-engine.ts::computeCorporationTax()` — async, fetches `ct_rate_tables` from DB, used for CT filing snapshots

**Why this is wrong:** The marginal relief formula differs between them. `tax-calculation-engine.ts` line 469: `MR = fraction × (UL - P)`. `ct-computation-engine.ts` line 214: `MR = fraction × (UL - P)` — same formula but different `fraction` values (hardcoded 3/200 vs DB `marginal_relief_fraction` which is 0.015). 3/200 = 0.015 so they happen to match today, but the hardcoded version cannot change and will silently diverge when rates change.

**Concrete failure:** A workpaper shows CT of £X. The filing CT computation shows £Y. Accountant spots discrepancy, loses trust, or worse — submits the wrong number.

**Recommendation:** Delete `calculateCorporationTax` from `tax-calculation-engine.ts`. Make `applyTaxCalculationsToWorkpaper` async and call `computeCorporationTax` (the DB-driven engine) for CT workpapers. Single engine, single source of truth.

---

### CRIT-02: VAT Ledger Aggregator Computes VAT from Net Amount Instead of Actual VAT

**Module:** `vat-ledger-aggregator.ts`

**What exists today:**
```typescript
const netAmount = entry.credit - entry.debit;
const vatAmount = Math.abs(netAmount) * (vatRate / 100);
```

**Why this is wrong:** When an invoice posts, the VAT amount is already calculated at the line level and posted to the VAT control account as a separate ledger entry. Re-deriving VAT from the net amount introduces rounding differences and is fundamentally incorrect for:
- Partial VAT recovery scenarios
- Manual VAT adjustments
- Fuel scale charges
- Bad debt relief adjustments

**Concrete failure:** A £1,000 invoice with 20% VAT posts net £1,000 + VAT £200. The aggregator fetches the £1,000 net entry and calculates VAT as £200 (happens to match). But a manual VAT adjustment journal of £50 (no net) will be ignored because `netAmount × rate` = 0.

**Recommendation:** The aggregator must read the actual VAT amount from the ledger entry's VAT split, not re-derive it. Either:
1. Add `vat_amount` column to `ledger_entries`, or
2. Join to `invoice_lines`/`bill_lines` to get the actual VAT posted

---

### CRIT-03: FRS105 Hardcoded Account Code Mapping

**Module:** `frs105-accounts-model.ts`

**What exists today:**
```typescript
tangible_assets: ['1500', '15'],
debtors: ['1100', '1200', '11', '12'],
cash_at_bank: ['1000', '10'],
```

**Why this is wrong:** This assumes all clients use the same chart of accounts numbering. The `bookkeeping_accounts` table already has `account_type` and `account_subtype` columns specifically for this purpose. The `ct_addback_category` and `tax_mapping` columns exist but are unused.

**Concrete failure:** A Xero-imported client has account code 8100 for trade debtors. FRS105 model shows £0 debtors. Balance sheet filed at Companies House is materially wrong.

**Recommendation:** Replace all code-prefix matching with `account_subtype` lookups. The CoA already has the taxonomy; use it.

---

### CRIT-04: SA Tax Engine Uses Hardcoded Rates in Production Path

**Module:** `tax-calculation-engine.ts` → `workpaper-from-tb.ts`

**What exists today:** `calculateSelfAssessmentTax()` calls `getTaxYearConfig()` (sync, hardcoded). The async `getTaxYearConfigFromDB()` exists but is never called from the workpaper pipeline.

**Why this is wrong:** The `sa_rate_tables` DB table was specifically created to make rates updatable without code deploys. But the production path bypasses it entirely. When 2025/26 rates are enacted, a code change is required despite the DB table existing.

**Recommendation:** Make `calculateWorkpaperFields` async. Call `getTaxYearConfigFromDB()` in the SA path. Same pattern as CRIT-01 fix.

---

### CRIT-05: TB Opening Balance Sign Convention Error

**Module:** `trial-balance-service.ts`

**What exists today:**
```typescript
const openingBalance = openingDebit - openingCredit; // Line 116
closingBalance: openingBalance + periodDebit - periodCredit // Line 128
```

**Why this is wrong:** This produces a debit-normal balance for ALL accounts. For liability, equity, and income accounts (credit-normal), the opening balance should be `credit - debit`. The closing balance formula `opening + debit - credit` only works if opening is consistently debit-signed.

**Concrete failure:** A company with £50,000 share capital (credit balance) shows opening balance of -£50,000. The TB snapshot shows negative equity, producing an incorrect FRS105 balance sheet.

**Recommendation:** Use the `account_type` to determine sign convention:
```typescript
const isDebitNormal = ['ASSET', 'EXPENSE'].includes(account.account_type);
const openingBalance = isDebitNormal 
  ? (openingDebit - openingCredit) 
  : (openingCredit - openingDebit);
```

---

## 3️⃣ Architectural Violations

### ARCH-01: State Duplication — Workpaper `field_values` vs Filing `draft_schedule_data_json`

**Violation:** Single-source-of-truth principle

The SA schedule engine produces a `SADraftScheduleData` structure stored in `filings.draft_schedule_data_json`. The workpaper-from-tb pipeline produces `field_values` stored in `workpaper_instances.field_values`. Both contain overlapping SA tax data with different key schemas.

When a filing is created from a workpaper (`createFilingFromWorkpaper`), it copies workpaper field_values into `filing_data` — but the canonical SA schedule data lives in `draft_schedule_data_json`. Two sources of truth for the same filing's tax data.

**Impact:** Which one does the submission engine read? If `draft_schedule_data_json`, the workpaper data is decorative. If `filing_data`, the schedule engine is decorative.

---

### ARCH-02: Tax Calculation Logic in Two Layers

The `tax-calculation-engine.ts` duplicates logic that exists in dedicated engines:
- SA calculation exists in both `tax-calculation-engine.ts::calculateSelfAssessmentTax()` AND `sa-schedule-engine.ts` computations
- CT calculation exists in both `tax-calculation-engine.ts::calculateCorporationTax()` AND `ct-computation-engine.ts::computeCorporationTax()`
- VAT calculation exists in both `tax-calculation-engine.ts::calculateVAT()` AND `vat-ledger-aggregator.ts::aggregateVATFromLedger()`

Three parallel systems for every tax type. `tax-calculation-engine.ts` should be deleted and its callers routed to the canonical engines.

---

### ARCH-03: Control Account Resolution by Name Pattern

`posting-service.ts::getControlAccount()` uses string matching against account names:
```typescript
TRADE_DEBTORS: ["Trade Debtors", "Accounts Receivable", "Debtors"]
```

This is domain logic in a utility function relying on magic strings. The `bookkeeping_accounts` table has `is_control_account` and `account_subtype` columns — use those. The name-pattern matching is a ticking time bomb.

---

### ARCH-04: `window.location.origin` in Domain Services

`filing-service.ts` constructs portal URLs using `window.location.origin`. This couples the filing service to browser context. If this code is ever called from an edge function (e.g., scheduled approval reminders), it will crash.

---

## 4️⃣ Compliance & Regulatory Risks

### COMP-01: No Flat Rate Scheme Support

~30% of UK micro-businesses use the VAT Flat Rate Scheme. The entire VAT engine assumes standard accounting. FRS businesses apply a fixed percentage to gross turnover — none of this logic exists. Filing a standard VAT return for an FRS client would be materially wrong.

### COMP-02: No Cash Accounting Scheme Support

Businesses using VAT Cash Accounting only account for VAT when payment is received/made. The `vat-ledger-aggregator.ts` aggregates by `transaction_date` (accrual basis). Cash basis VAT requires filtering by payment date instead. The `bill_lines.payment_status` and `cash_vat_recognised` columns exist but are unused.

### COMP-03: iXBRL Taxonomy Version Risk

The iXBRL generator references `FRS-105-2022-01-01`. Companies House updates taxonomy versions periodically. The schema ref URL is hardcoded:
```typescript
xlink:href="https://xbrl.frc.org.uk/FRS-105/2022-01-01/FRS-105-2022-01-01.xsd"
```
If CH mandates a newer taxonomy, all filed accounts will be rejected until this is updated via code deploy.

### COMP-04: Missing Fixed Asset Note in FRS105

FRS105 micro-entity accounts must include a note showing fixed asset cost, accumulated depreciation, and movements if tangible assets exist. The `frs105-disclosure-engine.ts` generates disclosures but the iXBRL generator does not include a fixed asset movement table. Companies House will flag this.

### COMP-05: No MTD ITSA Support Path

The SA engine targets Non-MTD XML submission. HMRC's MTD for ITSA is mandatory from April 2026. There is no quarterly update mechanism, no EOPS (End of Period Statement), and no final declaration flow. This is now < 2 months away.

### COMP-06: CT600 Filing Deadline Wrong for Non-12-Month Periods

`calculatePaymentDeadline` in `filing-service.ts` adds 9 months + 1 day for CT. This is the *payment* deadline. The CT600 *filing* deadline is 12 months after period end. These are different dates and both need tracking.

---

## 5️⃣ UX Patterns That Will Cause Errors

### UX-01: No Validation on TB Import Sign Conventions

When importing a TB from Xero/QBO/CSV, there is no validation that the sign conventions match the expected debit-normal/credit-normal pattern. Xero exports credit balances as negative numbers; QBO uses positive numbers with type indicators. Silent misinterpretation = wrong accounts.

### UX-02: Workpaper "Manual" Fields Have No Audit Trail

`workpaper-from-tb.ts` creates "manual" source lines (e.g., capital allowances, disallowable expenses) with `source: "manual"` but no override tracking. When an accountant changes a manual field, the old value is lost. There is no `field_overrides` history mechanism despite the column existing.

### UX-03: CT Associated Companies Count Defaults to 1

`tax-calculation-engine.ts` line 606: `associated_companies_count: getFieldAmount(fieldValues, "associated_companies_count") || 1`. If the user doesn't explicitly set this, marginal relief limits are divided by 2 (self + 1 associated). This is silently wrong for any company with 0 associated companies (the majority).

### UX-04: Filing Approval Token Generated Client-Side as Fallback

`filing-service.ts` line 251: `const approvalToken = tokenData || crypto.randomUUID()`. If the RPC fails, a client-generated UUID is used as an approval token. This token has no server-side record and cannot be validated.

---

## 6️⃣ Scale & Operations Risks

### SCALE-01: TB from Native Ledger Loads ALL Entries into Memory

`trial-balance-service.ts::createSnapshotFromNativeLedger()` fetches ALL ledger entries for ALL accounts in a single query with `ledger_entries!inner(debit, credit, transaction_date)`. For a company with 50,000 transactions, this is a 50K-row inner join returned to the client. It will timeout.

### SCALE-02: VAT Aggregator Has No Pagination

`vat-ledger-aggregator.ts` fetches all VAT-coded entries for a period in one query. Default Supabase limit is 1000 rows. A busy quarter with >1000 VAT entries will silently truncate, producing an incorrect VAT return.

### SCALE-03: Workpaper-from-TB Stores Individual Account Lines in field_values

`workpaper-from-tb.ts` creates detail lines for every matching account. A client with 200 accounts generates 200+ entries in `field_values` JSONB. This makes the workpaper row very large and slows every query that touches it.

### SCALE-04: No Index on `ledger_entries.transaction_date`

The VAT aggregator and TB snapshot both filter by `transaction_date` range. Without a composite index on `(organization_id, company_id, transaction_date)`, these queries will table-scan at scale.

---

## 7️⃣ Recommended Refactor Batches

### Batch 1: Blocking / Structural (Must fix before any client goes live)

| # | Change | Tables/Services | Order | Impact | Risk |
|---|--------|----------------|-------|--------|------|
| 1 | Delete `tax-calculation-engine.ts` SA/CT/VAT functions; route all callers to canonical engines | tax-calculation-engine.ts, workpaper-from-tb.ts | 1 | Eliminates 3 parallel computation systems | Medium — must ensure async propagation |
| 2 | Fix TB sign convention | trial-balance-service.ts | 2 | Correct opening/closing balances for credit-normal accounts | High — affects all existing snapshots |
| 3 | Fix VAT aggregator to use actual VAT amounts | vat-ledger-aggregator.ts, ledger_entries | 3 | Correct VAT returns | Medium |
| 4 | Replace FRS105 hardcoded account codes with `account_subtype` lookups | frs105-accounts-model.ts | 4 | Works with any CoA | Low |
| 5 | Replace control account name matching with `account_subtype` | posting-service.ts | 5 | Reliable posting | Low |
| 6 | Remove `window.location.origin` from domain services | filing-service.ts | 6 | Portal URL from config/env | Low |
| 7 | Add `.range()` or pagination to VAT aggregator & TB snapshot queries | vat-ledger-aggregator.ts, trial-balance-service.ts | 7 | Prevent silent data truncation | Low |

### Batch 2: High-Impact Simplifications

| # | Change | Impact |
|---|--------|--------|
| 8 | Unify filing data model — remove `filing_data` field; use only `draft_schedule_data_json` | Eliminates state duplication |
| 9 | Make `applyTaxCalculationsToWorkpaper` async; use DB rates everywhere | Single rate source |
| 10 | Add `vat_amount` to ledger entries (or read from source lines) | Correct VAT from ledger |
| 11 | Fix associated_companies_count default to 0 | Correct CT for majority of companies |
| 12 | Add fixed asset movement note to iXBRL | CH compliance |
| 13 | Add workpaper field override audit trail | Accountant evidence |

### Batch 3: Scale Hardening & Compliance Extensions

| # | Change | Impact |
|---|--------|--------|
| 14 | Implement VAT Flat Rate Scheme engine | ~30% of micro-clients |
| 15 | Implement VAT Cash Accounting | Compliance for cash basis clients |
| 16 | Add composite DB indexes for ledger queries | Performance at scale |
| 17 | Paginate TB snapshot creation (server-side aggregation via RPC) | Handle large ledgers |
| 18 | Make iXBRL taxonomy version configurable (from DB) | Future-proof CH filing |
| 19 | Begin MTD ITSA quarterly update flow | Mandatory April 2026 |
| 20 | Separate CT filing deadline (12m) from payment deadline (9m+1d) | Correct deadline tracking |

---

## End-to-End Flow Traces

### Flow 1: Ltd Co → Accounts → Companies House

```
Ledger entries → createSnapshotFromNativeLedger() [CRIT-05: sign bug] 
  → mapTrialBalanceToFRS105() [CRIT-03: hardcoded codes] 
  → createFRS105AccountsModel() 
  → generateFRS105iXBRL() [COMP-04: missing FA note]
  → CH submission
```

**Verdict:** Will produce wrong balance sheet numbers for non-standard CoAs and credit-normal accounts.

### Flow 2: SA → Tax Computation → HMRC

```
Workpaper field_values → applyTaxCalculationsToWorkpaper() 
  → calculateSelfAssessmentTax() [CRIT-04: hardcoded rates]
  → createFilingFromWorkpaper() → filing_data [ARCH-01: duplication with draft_schedule_data_json]
  → SA XML builder → HMRC
```

**Verdict:** Uses deprecated sync rates. Filing data is duplicated across two JSONB fields.

### Flow 3: VAT → Return → HMRC MTD

```
Ledger entries → aggregateVATFromLedger() [CRIT-02: wrong VAT derivation, SCALE-02: no pagination]
  → mapWorkpaperToVATModel() → validateVATModel() → buildHMRCVATPayload()
  → hmrc-vat-submit edge function
```

**Verdict:** VAT amounts are re-derived instead of read from actual postings. Will be wrong for manual adjustments and partial recovery scenarios.

---

*This audit identifies 20 distinct issues. Items CRIT-01 through CRIT-05 are production-blocking and must be resolved before any client data is processed for real filings.*
