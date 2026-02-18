
# Phase 8: FRS105 Accounts Editor + Disclosure Manager + iXBRL (with corrections applied)

## Overview

Build a production-grade FRS105 micro-entity accounts editor with a legally-compliant, restriction-first Disclosure Manager, canonical model-driven iXBRL generation, line-level provenance, prior period comparatives, and enhanced snapshot integrity. FRS102 remains completely locked out.

All user corrections have been incorporated:
- Narrative fields are allowed inside typed disclosure objects (sanitised + iXBRL-tagged)
- Over-disclosure rules are facts-based, not blanket-banned
- Average employees accepts count = 0 as valid
- Directors' advances allows confirmed_none when no ledger/DLA tagging is available
- mapping_rules_version is a deterministic SHA-256 hash of mapping rules content

---

## Database Migration

Add three columns to `filing_model_snapshots` for mapping provenance:

| Column | Type | Purpose |
|--------|------|---------|
| `tb_snapshot_ref` | TEXT | SHA-256 hash of the TB snapshot captured at lock time |
| `coa_mapping_ref` | TEXT | SHA-256 hash of the COA tax mapping state at lock time |
| `mapping_rules_version` | TEXT | Deterministic SHA-256 hash of `FRS105_ACCOUNT_MAPPINGS` content + any referenced mapping tables |

These are added as nullable columns (other filing types don't need them), but the lock service will hard-fail for ACCOUNTS_FRS105 filings if any are null.

Note: The table has immutability triggers that block UPDATE/DELETE. The migration only adds columns -- new snapshots will include these values at INSERT time.

---

## Type System Changes

### `src/types/filing-schemas.ts`

Replace the generic `DisclosureEntry` and `AccountsDraftScheduleData` with production-grade structured types:

**Balance Sheet Line with Provenance:**
```
BalanceSheetLineValue {
  amount: number;
  source: 'derived' | 'manual_override';
  override_reason?: string;
}
```

**9 Structured Disclosure Types (no generic blobs):**

| Disclosure | Typed Fields | Narrative Allowed |
|---|---|---|
| Statement of Compliance | System-generated text, locked | No (system text only) |
| Average Employees | `count: number` (>= 0 valid) | No |
| Directors' Advances | Array of `{ director_name, opening_balance, movement, closing_balance, interest_rate, terms_narrative }` or `confirmed_none` with `accountant_affirmation` | Yes: `terms_narrative` per entry (sanitised) |
| Dividends | Array of `{ amount, date, type }` or `confirmed_none` | No |
| Related Party Transactions | Array of `{ relationship, description, amount, balance, terms_narrative }` or `confirmed_none` | Yes: `terms_narrative` per entry (sanitised) |
| Commitments / Contingent Liabilities | Array of `{ category, amount, narrative }` or `confirmed_none` | Yes: `narrative` per entry (sanitised) |
| Off-Balance Sheet Arrangements | `confirmed_none` or structured entry with `narrative` | Yes: `narrative` (sanitised) |
| Going Concern | `{ flagged: boolean, narrative }` | Yes: `narrative` (sanitised, only if flagged) |
| Prior Period Adjustments | `{ flagged: boolean, description, amount }` | Yes: `description` (sanitised, only if flagged) |

**Prior Period Comparatives:**
A first-class `prior_period` object mirroring the balance sheet structure with its own iXBRL context. Default-populated from the last accepted/filed snapshot for the same company.

**Directors List:**
Array of `{ name, appointed_date?, resigned_date? }` -- validated as non-empty.

---

## Disclosure Determination Engine

### `src/lib/frs105-disclosure-engine.ts` (new)

A pure-function engine that:

1. Accepts: company profile, ledger account data (DLA tags, RPT flags), payroll data, commitment flags, current disclosure state
2. Returns: for each of the 9 disclosure types, whether it is `required`, `not_required`, or `locked`, plus the reason string
3. Validates: blocks `confirmed_none` for directors' advances ONLY if ledger/DLA tagging exists AND balances are non-zero. If no ledger or tagging is unavailable, `confirmed_none` is allowed with explicit accountant affirmation.
4. Validates completeness: returns `all_complete: boolean` as a hard gate for iXBRL generation

Disclosure inclusion is rules-based (facts-driven), not blanket-banned:
- Fixed asset notes: only if tangible assets > 0
- Share capital movements: only if share capital changed from prior period
- Dividends: only if dividends declared/detected
- Director loans: always required (either entries or confirmed_none)
- RPTs: only if RPT-tagged transactions detected
- Over-disclosure is prevented by only showing disclosures that are factually relevant

---

## Canonical FRS105 Accounts Model Update

### `src/lib/frs105-accounts-model.ts` (update)

Extend `FRS105AccountsModel` to include:

- `prior_period_balance_sheet` as a required field (nullable for first-year companies) with its own context ID
- Structured `disclosures` object replacing the old `FRS105Notes` string array
- `units` and `decimals` metadata for iXBRL
- `contexts` object defining current period instant, current period duration, prior period instant, prior period duration

---

## iXBRL Generator Update

### `src/lib/ixbrl-generator.ts` (update)

Refactor `generateFRS105iXBRL()` to:

1. Accept the canonical `FRS105AccountsModel` (with structured disclosures and prior period contexts)
2. Generate prior period comparative column with its own `xbrli:context`
3. Include disclosure sections mapped to proper iXBRL tags (e.g., `uk-direp:DirectorsAdvances`, `uk-bus:AverageNumberEmployees`)
4. Sanitise all narrative fields through `sanitizeFooterHtml()` before embedding
5. Hard-fail if any disclosure is in `required_missing` state (not a warning)

---

## UI Components

### New Files

| File | Purpose |
|------|---------|
| `src/components/filings/accounts/FRS105AccountsEditor.tsx` | Main orchestrator with tabs: Balance Sheet, Comparatives, Disclosures, Directors, Approval, Validation |
| `src/components/filings/accounts/BalanceSheetGrid.tsx` | Editable grid with provenance badges (derived/override) per line, auto-computed subtotals, balance check indicator |
| `src/components/filings/accounts/TBImportButton.tsx` | TB data import with override-aware re-import (does not blindly overwrite manual_override lines; shows selection dialog) |
| `src/components/filings/accounts/DisclosureManager.tsx` | Fixed checklist of system-determined disclosures. No add/remove/hide. Status badges: Complete, Required and Missing, Not Required, Locked. Click-through to structured editors. |
| `src/components/filings/accounts/disclosure-editors/AverageEmployeesEditor.tsx` | Integer input >= 0, auto-populated from payroll |
| `src/components/filings/accounts/disclosure-editors/DirectorsAdvancesEditor.tsx` | Table of directors with opening/movement/closing/rate/terms_narrative; confirmed_none with accountant affirmation when no ledger data |
| `src/components/filings/accounts/disclosure-editors/DividendsEditor.tsx` | Entries with amount/date/type |
| `src/components/filings/accounts/disclosure-editors/RelatedPartyEditor.tsx` | Entries with relationship/description/amount/balance/terms_narrative |
| `src/components/filings/accounts/disclosure-editors/CommitmentsEditor.tsx` | Entries with category/amount/narrative; confirmed_none |
| `src/components/filings/accounts/disclosure-editors/OffBalanceSheetEditor.tsx` | Confirmed_none or structured entry with narrative |
| `src/components/filings/accounts/disclosure-editors/GoingConcernEditor.tsx` | Flag + structured narrative (only shown if flagged) |
| `src/components/filings/accounts/disclosure-editors/PriorPeriodAdjustmentsEditor.tsx` | Flag + description + amount (only shown if flagged) |
| `src/components/filings/accounts/IXBRLPreviewPanel.tsx` | Sandboxed iframe preview (`sandbox="allow-same-origin"`), download, integrity hash |
| `src/components/filings/accounts/ApprovalSection.tsx` | Board approval fields |
| `src/components/filings/accounts/DirectorsEditor.tsx` | Director list management |

### Modified Files

| File | Change |
|------|--------|
| `src/types/filing-schemas.ts` | Replace `DisclosureEntry` + `AccountsDraftScheduleData` with structured types |
| `src/lib/frs105-accounts-model.ts` | Add prior period contexts, structured disclosures, units/decimals |
| `src/lib/ixbrl-generator.ts` | Prior period comparatives, disclosure iXBRL tags, narrative sanitisation, hard validation gate |
| `src/lib/filing-version-service.ts` | Capture `tb_snapshot_ref`, `coa_mapping_ref`, `mapping_rules_version` hashes on lock for ACCOUNTS_FRS105 |
| `src/lib/filing-lock-service.ts` | Pre-lock validation: disclosures complete, balance sheet balances, provenance hashes non-null |
| `src/pages/FilingDetail.tsx` | Add ACCOUNTS_FRS105 branch rendering `FRS105AccountsEditor` |
| `src/components/jobs/JobFilingTab.tsx` | Replace amber placeholder with real "Open Filing Editor" action |

---

## Snapshot Integrity on Lock

When locking an ACCOUNTS_FRS105 filing:

1. Capture TB snapshot data and compute SHA-256 hash -> `tb_snapshot_ref`
2. Capture COA mapping state and compute SHA-256 hash -> `coa_mapping_ref`
3. Compute deterministic SHA-256 hash of `FRS105_ACCOUNT_MAPPINGS` object content (the actual mapping rules, not a human version string) -> `mapping_rules_version`
4. All three must be non-null; locking hard-fails otherwise
5. All mandatory disclosures must be in `complete` or `locked` state
6. Balance sheet must balance (net_assets === total_equity within tolerance)

---

## FRS102 Lockout

- No UI path to create ACCOUNTS_FRS102_1A filings
- No filing type selector option for FRS102
- Internal code in `accounts-model-mapper.ts` (FRS102 branch) remains but is unreachable from any UI

---

## Validation Chain (Hard Gates)

```text
TB Import --> Balance Sheet Grid (provenance tracked per line)
                    |
                    v
Disclosure Engine (auto-determines requirements from ledger/profile)
                    |
                    v
Disclosure Manager UI (system-determined, no user override)
         |                        |
         | Any Required+Missing   | All complete
         v                        v
  BLOCK iXBRL              Build Canonical FRS105AccountsModel
  BLOCK Send to Client     (with contexts, comparatives, units)
  BLOCK Lock                      |
                                  v
                          generateFRS105iXBRL()
                          (sanitise narratives, map disclosure tags)
                                  |
                                  v
                          Sandboxed iframe Preview
                                  |
                                  v
                          Save Artefact + Lock
                          (tb_snapshot_ref + coa_mapping_ref + mapping_rules_version)
```
