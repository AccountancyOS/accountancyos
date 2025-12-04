# AccountancyOS Bookkeeping Infrastructure Inventory

**Document Version:** 1.0  
**Date:** 2025-12-04  
**Status:** Pre-Implementation Audit (Phase 4)

---

## Executive Summary

This document provides a complete inventory of the existing bookkeeping infrastructure in AccountancyOS. The audit confirms that **a comprehensive bookkeeping system already exists** with 20+ tables, 5 service files, 25 UI components, and 3 TrueLayer edge functions. 

**Key Finding:** Phase 4 should be a "gap-fill" exercise, NOT a rebuild. No new tables required - only extensions to existing schema.

---

## 1. Table Inventory

### 1.1 Core Ledger Tables

#### `bookkeeping_accounts` (Chart of Accounts)
| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| id | uuid | No | gen_random_uuid() | Primary key |
| organization_id | uuid | No | - | Tenant isolation |
| client_id | uuid | Yes | NULL | Entity scope (individual) |
| company_id | uuid | Yes | NULL | Entity scope (company) |
| code | text | No | - | Account code (e.g., "1000") |
| name | text | No | - | Account name |
| account_type | text | No | - | ASSET/LIABILITY/EQUITY/INCOME/EXPENSE |
| account_subtype | text | Yes | NULL | CURRENT_ASSET, FIXED_ASSET, etc. |
| is_bank_account | boolean | Yes | false | Bank account flag |
| is_control_account | boolean | Yes | false | Control account flag |
| is_revenue_account | boolean | Yes | true | Revenue account flag for KPIs |
| is_system_account | boolean | Yes | false | System-generated account |
| is_active | boolean | Yes | true | Active status |
| tax_mapping | jsonb | Yes | {} | Tax mapping configuration |
| created_at | timestamptz | Yes | now() | Created timestamp |
| updated_at | timestamptz | Yes | now() | Updated timestamp |

**Foreign Keys:**
- `organization_id` → `organizations.id`
- `client_id` → `clients.id`
- `company_id` → `companies.id`

**RLS Policies:**
- `Users can manage accounts in their organization` (ALL)
- `Users can view accounts in their organization` (SELECT)
- `Portal clients can view their accounts` (SELECT)

---

#### `ledger_entries` (General Ledger)
| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| id | uuid | No | gen_random_uuid() | Primary key |
| organization_id | uuid | No | - | Tenant isolation |
| client_id | uuid | Yes | NULL | Entity scope (individual) |
| company_id | uuid | Yes | NULL | Entity scope (company) |
| account_id | uuid | No | - | FK to bookkeeping_accounts |
| transaction_date | date | No | - | Transaction date |
| description | text | Yes | NULL | Transaction description |
| debit | numeric | Yes | NULL | Debit amount |
| credit | numeric | Yes | NULL | Credit amount |
| source_type | text | No | - | JOURNAL/INVOICE/BANK_TRANSACTION |
| source_id | uuid | Yes | NULL | Source document ID |
| vat_code_id | uuid | Yes | NULL | FK to vat_codes |
| document_id | uuid | Yes | NULL | FK to job_documents |
| is_locked | boolean | Yes | NULL | Period lock flag |
| created_by | uuid | Yes | NULL | Creator user ID |
| updated_by | uuid | Yes | NULL | Last updater user ID |
| created_at | timestamptz | Yes | now() | Created timestamp |
| updated_at | timestamptz | Yes | now() | Updated timestamp |

**Foreign Keys:**
- `account_id` → `bookkeeping_accounts.id`
- `vat_code_id` → `vat_codes.id`
- `document_id` → `job_documents.id`
- `client_id` → `clients.id`
- `company_id` → `companies.id`
- `organization_id` → `organizations.id`

**RLS Policies:**
- Organization-based access (implied from context)

**⚠️ GAP IDENTIFIED:** No `currency`, `base_currency`, `fx_rate`, or `base_amount` columns for multi-currency support.

---

#### `journals` (Journal Headers)
| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| id | uuid | No | gen_random_uuid() | Primary key |
| organization_id | uuid | No | - | Tenant isolation |
| client_id | uuid | Yes | NULL | Entity scope |
| company_id | uuid | Yes | NULL | Entity scope |
| journal_date | date | No | - | Journal date |
| reference | text | Yes | NULL | Journal reference |
| description | text | No | - | Journal description |
| journal_type | text | No | - | MANUAL/REVERSING/RECURRING/YEAR_END/OPENING |
| is_posted | boolean | Yes | false | Posted status |
| total_debit | numeric | Yes | 0 | Total debits |
| total_credit | numeric | Yes | 0 | Total credits |
| reversed_from_id | uuid | Yes | NULL | FK for reversal journals |
| created_by | uuid | Yes | NULL | Creator |
| created_at | timestamptz | Yes | now() | Created timestamp |
| updated_at | timestamptz | Yes | now() | Updated timestamp |

**⚠️ GAP IDENTIFIED:** Missing `reversal_date` field for scheduled reversals.

---

### 1.2 Bank & Transaction Tables

#### `bank_accounts`
| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| id | uuid | No | gen_random_uuid() | Primary key |
| organization_id | uuid | No | - | Tenant isolation |
| client_id | uuid | Yes | NULL | Entity scope |
| company_id | uuid | Yes | NULL | Entity scope |
| account_id | uuid | No | - | FK to bookkeeping_accounts |
| name | text | No | - | Account name |
| account_number | text | Yes | NULL | Bank account number |
| sort_code | text | Yes | NULL | Sort code |
| currency | text | No | 'GBP' | Currency code |
| provider | text | Yes | 'MANUAL' | MANUAL/TRUELAYER |
| external_identifier | text | Yes | NULL | External ID |
| truelayer_account_id | text | Yes | NULL | TrueLayer account ID |
| is_active | boolean | Yes | true | Active status |
| last_synced_at | timestamptz | Yes | NULL | Last sync time |
| created_at | timestamptz | Yes | now() | Created timestamp |
| updated_at | timestamptz | Yes | now() | Updated timestamp |

**Foreign Keys:**
- `account_id` → `bookkeeping_accounts.id`
- `client_id` → `clients.id`
- `company_id` → `companies.id`
- `organization_id` → `organizations.id`

**RLS Policies:**
- `Users can manage bank accounts in their organization` (ALL)
- `Users can view bank accounts in their organization` (SELECT)
- `Portal clients can view their bank accounts` (SELECT)

---

#### `bank_transactions`
| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| id | uuid | No | gen_random_uuid() | Primary key |
| organization_id | uuid | No | - | Tenant isolation |
| client_id | uuid | Yes | NULL | Entity scope |
| company_id | uuid | Yes | NULL | Entity scope |
| bank_account_id | uuid | No | - | FK to bank_accounts |
| transaction_date | date | No | - | Transaction date |
| description | text | No | - | Description |
| amount | numeric | No | - | Amount |
| balance | numeric | Yes | NULL | Running balance |
| category | text | Yes | NULL | Category |
| status | text | No | 'UNREVIEWED' | UNREVIEWED/CATEGORISED/MATCHED/EXCLUDED |
| currency | text | Yes | 'GBP' | Currency |
| provider | text | Yes | 'CSV' | Source provider |
| import_source | text | Yes | 'CSV' | Import source |
| import_batch_id | uuid | Yes | NULL | Import batch ID |
| truelayer_transaction_id | text | Yes | NULL | TrueLayer transaction ID |
| matched_ledger_entry_id | uuid | Yes | NULL | FK to ledger_entries |
| rule_id | uuid | Yes | NULL | FK to categorization_rules |
| raw_json | jsonb | Yes | NULL | Raw API response |
| created_at | timestamptz | Yes | now() | Created timestamp |
| updated_at | timestamptz | Yes | now() | Updated timestamp |

**Foreign Keys:**
- `bank_account_id` → `bank_accounts.id`
- `matched_ledger_entry_id` → `ledger_entries.id`
- `client_id` → `clients.id`
- `company_id` → `companies.id`
- `organization_id` → `organizations.id`

**RLS Policies:**
- `Users can manage bank transactions in their organization` (ALL)
- `Users can view bank transactions in their organization` (SELECT)
- `Portal clients can view their bank transactions` (SELECT)

---

#### `bank_connections` (TrueLayer/Open Banking)
| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| id | uuid | No | gen_random_uuid() | Primary key |
| organization_id | uuid | No | - | Tenant isolation |
| client_id | uuid | Yes | NULL | Entity scope |
| company_id | uuid | Yes | NULL | Entity scope |
| provider | text | No | 'TRUELAYER' | Provider name |
| provider_connection_id | text | Yes | NULL | External connection ID |
| bank_name | text | Yes | NULL | Bank name |
| bank_logo_url | text | Yes | NULL | Bank logo URL |
| access_token | text | Yes | NULL | OAuth access token |
| refresh_token | text | Yes | NULL | OAuth refresh token |
| scope | text | Yes | NULL | OAuth scope |
| consent_expires_at | timestamptz | Yes | NULL | Consent expiry |
| status | text | No | 'PENDING' | Connection status |
| last_synced_at | timestamptz | Yes | NULL | Last sync timestamp |
| last_error | text | Yes | NULL | Last error message |
| created_at | timestamptz | Yes | now() | Created timestamp |
| updated_at | timestamptz | Yes | now() | Updated timestamp |

**RLS Policies:**
- `org_users_can_manage_bank_connections` (ALL)

---

#### `categorization_rules`
| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| id | uuid | No | gen_random_uuid() | Primary key |
| organization_id | uuid | No | - | Tenant isolation |
| client_id | uuid | Yes | NULL | Entity-specific rule |
| company_id | uuid | Yes | NULL | Entity-specific rule |
| name | text | No | - | Rule name |
| conditions | jsonb | No | {} | Matching conditions |
| default_account_id | uuid | No | - | FK to bookkeeping_accounts |
| default_vat_code_id | uuid | Yes | NULL | FK to vat_codes |
| description_template | text | Yes | NULL | Description template |
| priority | int | Yes | 0 | Rule priority |
| times_applied | int | Yes | 0 | Application count |
| is_active | boolean | Yes | true | Active status |
| created_at | timestamptz | Yes | now() | Created timestamp |
| updated_at | timestamptz | Yes | now() | Updated timestamp |

**Foreign Keys:**
- `default_account_id` → `bookkeeping_accounts.id`
- `default_vat_code_id` → `vat_codes.id`

---

### 1.3 Trial Balance & Snapshot Tables

#### `trial_balance_snapshots`
| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| id | uuid | No | gen_random_uuid() | Primary key |
| organization_id | uuid | No | - | Tenant isolation |
| client_id | uuid | Yes | NULL | Entity scope |
| company_id | uuid | Yes | NULL | Entity scope |
| job_id | uuid | Yes | NULL | FK to jobs |
| period_start | date | No | - | Period start date |
| period_end | date | No | - | Period end date |
| snapshot_date | date | No | now() | Snapshot creation date |
| source_type | text | No | 'native' | native/xero/quickbooks/sage/freeagent/manual_import/manual |
| status | text | No | 'draft' | draft/finalised/used_in_workpaper |
| locked | boolean | No | false | Lock status |
| balances | jsonb | No | {} | Account balances array |
| total_debit | numeric | Yes | NULL | Total debits |
| total_credit | numeric | Yes | NULL | Total credits |
| is_balanced | boolean | Yes | NULL | Balanced flag |
| notes | text | Yes | NULL | Notes |
| metadata | jsonb | Yes | NULL | Additional metadata |
| created_by | uuid | Yes | NULL | Creator |
| finalised_at | timestamptz | Yes | NULL | Finalised timestamp |
| finalised_by | uuid | Yes | NULL | Finaliser |
| created_at | timestamptz | No | now() | Created timestamp |
| updated_at | timestamptz | No | now() | Updated timestamp |

**Foreign Keys:**
- `job_id` → `jobs.id`
- `client_id` → `clients.id`
- `company_id` → `companies.id`
- `organization_id` → `organizations.id`

---

#### `tb_account_mappings` (Import Template Mappings)
| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| id | uuid | No | gen_random_uuid() | Primary key |
| organization_id | uuid | No | - | Tenant isolation |
| client_id | uuid | Yes | NULL | Entity-specific mapping |
| company_id | uuid | Yes | NULL | Entity-specific mapping |
| template_name | text | No | - | Template name |
| source_type | text | No | - | xero/quickbooks/sage/etc |
| mappings | jsonb | No | {} | Account code mappings |
| column_config | jsonb | Yes | NULL | CSV column configuration |
| is_default | boolean | Yes | false | Default template flag |
| is_global | boolean | No | false | Global template flag |
| created_at | timestamptz | No | now() | Created timestamp |
| updated_at | timestamptz | No | now() | Updated timestamp |

---

### 1.4 VAT Tables

#### `vat_codes`
| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| id | uuid | No | gen_random_uuid() | Primary key |
| organization_id | uuid | No | - | Tenant isolation |
| client_id | uuid | Yes | NULL | Entity-specific code |
| company_id | uuid | Yes | NULL | Entity-specific code |
| code | text | No | - | VAT code (e.g., "S20") |
| description | text | No | - | Description |
| rate | numeric | No | - | VAT rate (e.g., 20.00) |
| vat_type | text | No | - | OUTPUT/INPUT/ZERO/EXEMPT |
| is_active | boolean | Yes | true | Active status |
| created_at | timestamptz | Yes | now() | Created timestamp |
| updated_at | timestamptz | Yes | now() | Updated timestamp |

---

#### `vat_returns`
| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| id | uuid | No | gen_random_uuid() | Primary key |
| organization_id | uuid | No | - | Tenant isolation |
| client_id | uuid | Yes | NULL | Entity scope |
| company_id | uuid | Yes | NULL | Entity scope |
| period_start | date | No | - | Period start |
| period_end | date | No | - | Period end |
| due_date | date | No | - | Due date |
| status | text | No | 'draft' | draft/submitted/filed |
| box_1_vat_due_sales | numeric | No | 0 | VAT due on sales |
| box_2_vat_due_acquisitions | numeric | No | 0 | VAT on acquisitions |
| box_3_total_vat_due | numeric | No | 0 | Total VAT due |
| box_4_vat_reclaimed | numeric | No | 0 | VAT reclaimed |
| box_5_net_vat | numeric | No | 0 | Net VAT payable/refundable |
| box_6_total_sales | numeric | No | 0 | Total sales ex VAT |
| box_7_total_purchases | numeric | No | 0 | Total purchases ex VAT |
| box_8_total_supplies_eu | numeric | No | 0 | EU supplies |
| box_9_total_acquisitions_eu | numeric | No | 0 | EU acquisitions |
| notes | text | Yes | NULL | Notes |
| submitted_at | timestamptz | Yes | NULL | Submitted timestamp |
| submitted_by | uuid | Yes | NULL | Submitter |
| hmrc_receipt | jsonb | Yes | NULL | HMRC receipt data |
| created_at | timestamptz | Yes | now() | Created timestamp |
| updated_at | timestamptz | Yes | now() | Updated timestamp |

---

### 1.5 Invoice Tables

#### `invoices`
| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| id | uuid | No | gen_random_uuid() | Primary key |
| organization_id | uuid | No | - | Tenant isolation |
| client_id | uuid | Yes | NULL | Entity scope |
| company_id | uuid | Yes | NULL | Entity scope |
| invoice_type | text | No | - | SALES/PURCHASE |
| invoice_number | text | Yes | NULL | Invoice number |
| reference | text | Yes | NULL | Reference |
| contact_name | text | No | - | Contact name |
| contact_email | text | Yes | NULL | Contact email |
| contact_address | text | Yes | NULL | Contact address |
| issue_date | date | No | - | Issue date |
| due_date | date | No | - | Due date |
| status | text | No | 'DRAFT' | DRAFT/AWAITING_PAYMENT/PART_PAID/PAID/VOID |
| total_net | numeric | No | 0 | Net total |
| total_vat | numeric | No | 0 | VAT total |
| total_gross | numeric | No | 0 | Gross total |
| amount_paid | numeric | No | 0 | Amount paid |
| notes | text | Yes | NULL | Notes |
| is_posted | boolean | Yes | false | Posted to ledger |
| posted_at | timestamptz | Yes | NULL | Posted timestamp |
| posted_by | uuid | Yes | NULL | Posted by |
| document_id | uuid | Yes | NULL | FK to job_documents |
| created_at | timestamptz | Yes | now() | Created timestamp |
| updated_at | timestamptz | Yes | now() | Updated timestamp |

---

#### `invoice_lines`
| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| id | uuid | No | gen_random_uuid() | Primary key |
| invoice_id | uuid | No | - | FK to invoices |
| line_number | int | No | - | Line number |
| account_id | uuid | No | - | FK to bookkeeping_accounts |
| description | text | No | - | Description |
| quantity | numeric | No | 1 | Quantity |
| unit_price | numeric | No | - | Unit price |
| net_amount | numeric | No | - | Net amount |
| vat_code_id | uuid | Yes | NULL | FK to vat_codes |
| vat_rate | numeric | No | 0 | VAT rate |
| vat_amount | numeric | No | 0 | VAT amount |
| gross_amount | numeric | No | - | Gross amount |
| created_at | timestamptz | Yes | now() | Created timestamp |

---

#### `invoice_payments`
| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| id | uuid | No | gen_random_uuid() | Primary key |
| invoice_id | uuid | No | - | FK to invoices |
| payment_date | date | No | - | Payment date |
| amount | numeric | No | - | Payment amount |
| payment_method | text | Yes | NULL | Payment method |
| reference | text | Yes | NULL | Reference |
| bank_transaction_id | uuid | Yes | NULL | FK to bank_transactions |
| ledger_entry_id | uuid | Yes | NULL | FK to ledger_entries |
| created_by | uuid | Yes | NULL | Creator |
| created_at | timestamptz | Yes | now() | Created timestamp |

---

### 1.6 Period Lock Tables

#### `period_locks`
| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| id | uuid | No | gen_random_uuid() | Primary key |
| organization_id | uuid | No | - | Tenant isolation |
| client_id | uuid | Yes | NULL | Entity scope |
| company_id | uuid | Yes | NULL | Entity scope |
| lock_date | date | No | - | Lock date |
| reason | text | Yes | NULL | Lock reason |
| locked_by | uuid | Yes | NULL | User who locked |
| locked_at | timestamptz | No | now() | Lock timestamp |

**Foreign Keys:**
- `client_id` → `clients.id`
- `company_id` → `companies.id`
- `organization_id` → `organizations.id`

**⚠️ GAP IDENTIFIED:** Period lock is stored but NOT enforced at RPC level. No trigger/function blocks inserts to `ledger_entries` for dates before lock_date.

---

### 1.7 Workpaper Integration Tables

#### `workpaper_instances`
| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| id | uuid | No | gen_random_uuid() | Primary key |
| organization_id | uuid | No | - | Tenant isolation |
| client_id | uuid | Yes | NULL | Entity scope |
| company_id | uuid | Yes | NULL | Entity scope |
| job_id | uuid | No | - | FK to jobs |
| template_id | uuid | Yes | NULL | FK to templates |
| trial_balance_snapshot_id | uuid | Yes | NULL | FK to trial_balance_snapshots |
| questionnaire_instance_id | uuid | Yes | NULL | FK to questionnaire_instances |
| name | text | No | - | Workpaper name |
| service_type | text | No | - | accounts/ct600/self_assessment/vat_return |
| period_start | date | Yes | NULL | Period start |
| period_end | date | Yes | NULL | Period end |
| period_label | text | Yes | NULL | Period label |
| status | text | No | 'draft' | draft/in_progress/ready_for_review/in_review/finalised |
| data_source | text | Yes | NULL | trial_balance/questionnaire/hybrid |
| source_type | text | Yes | NULL | native/xero/quickbooks/etc |
| field_values | jsonb | No | {} | Field values |
| field_overrides | jsonb | Yes | {} | Manual overrides |
| field_notes | jsonb | Yes | {} | Field notes |
| source_data | jsonb | Yes | NULL | Source data reference |
| computed_data | jsonb | Yes | NULL | Computed/calculated fields |
| locked | boolean | No | false | Lock status |
| last_data_sync_at | timestamptz | Yes | NULL | Last sync from TB |
| prepared_by | uuid | Yes | NULL | Preparer |
| prepared_at | timestamptz | Yes | NULL | Preparation timestamp |
| reviewed_by | uuid | Yes | NULL | Reviewer |
| reviewed_at | timestamptz | Yes | NULL | Review timestamp |
| finalised_by | uuid | Yes | NULL | Finaliser |
| finalised_at | timestamptz | Yes | NULL | Finalisation timestamp |
| owner_user_id | uuid | Yes | NULL | Owner |
| created_at | timestamptz | Yes | now() | Created timestamp |
| updated_at | timestamptz | Yes | now() | Updated timestamp |

**Foreign Keys:**
- `job_id` → `jobs.id`
- `template_id` → `templates.id`
- `trial_balance_snapshot_id` → `trial_balance_snapshots.id`
- `questionnaire_instance_id` → `questionnaire_instances.id`
- `client_id` → `clients.id`
- `company_id` → `companies.id`
- `organization_id` → `organizations.id`

---

#### `workpaper_category_mappings`
| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| id | uuid | No | gen_random_uuid() | Primary key |
| organization_id | uuid | No | - | Tenant isolation |
| workpaper_category | text | No | - | Category name |
| workpaper_subcategory | text | Yes | NULL | Subcategory |
| mapping_type | text | No | - | account_type/account_code/account_subtype |
| account_type | text | Yes | NULL | Account type filter |
| account_subtype | text | Yes | NULL | Account subtype filter |
| account_code_pattern | text | Yes | NULL | Account code pattern |
| priority | int | Yes | NULL | Mapping priority |
| is_default | boolean | Yes | false | Default mapping |
| created_at | timestamptz | No | now() | Created timestamp |

---

### 1.8 TrueLayer Authentication

#### `truelayer_auth_states`
| Column | Type | Nullable | Default | Purpose |
|--------|------|----------|---------|---------|
| id | uuid | No | gen_random_uuid() | Primary key |
| organization_id | uuid | No | - | Tenant isolation |
| client_id | uuid | Yes | NULL | Entity scope |
| company_id | uuid | Yes | NULL | Entity scope |
| state | text | No | - | OAuth state |
| redirect_path | text | Yes | NULL | Redirect path |
| expires_at | timestamptz | Yes | NULL | Expiry |
| created_at | timestamptz | Yes | now() | Created timestamp |

---

## 2. Service/RPC Inventory

### 2.1 TypeScript Services

#### `src/lib/trial-balance-service.ts`
**Functions:**
| Function | Purpose | Lines |
|----------|---------|-------|
| `validateTBBalances()` | Validate debits = credits | 46-62 |
| `createSnapshotFromNativeLedger()` | Create TB snapshot from native ledger | 67-152 |
| `createManualSnapshot()` | Create TB snapshot from manual/import data | 157-185 |
| `createSnapshot()` | Core snapshot creation | 190-231 |
| `finaliseSnapshot()` | Finalise and lock snapshot | 236-264 |
| `reopenSnapshot()` | Reopen finalised snapshot | 269-293 |
| `findExistingSnapshot()` | Check for existing snapshot (idempotent) | 298-329 |

**Interfaces:**
- `TBSnapshotBalance` - Balance structure per account
- `CreateSnapshotParams` - Snapshot creation parameters
- `SnapshotResult` - Snapshot operation result

---

#### `src/lib/workpaper-from-tb.ts`
**Functions:**
| Function | Purpose | Lines |
|----------|---------|-------|
| `mapTBToWorkpaperLines()` | Map TB balances to workpaper lines | 126-228 |
| `calculateWorkpaperFields()` | Calculate computed fields | 233-278 |
| `createWorkpaperFromSnapshot()` | Create workpaper from TB snapshot (idempotent) | 308-441 |
| `updateWorkpaperFromSnapshot()` | Update existing workpaper from TB | 446-514 |
| `refreshWorkpaperFromTB()` | Refresh workpaper from linked TB | 519-566 |

**Constants:**
- `UK_WORKPAPER_CATEGORIES` - Category mappings for company_accounts, ct600, self_assessment, vat_return

---

#### `src/lib/bookkeeping-kpi.ts`
**Functions:**
| Function | Purpose | Lines |
|----------|---------|-------|
| `getPeriodDates()` | Calculate period dates with financial year support | 112-171 |
| `calculateRevenue()` | Calculate revenue from ledger | 173-200 |
| `calculateNetProfit()` | Calculate net profit from ledger | 202-238 |
| `calculateCashAtBank()` | Calculate cash balance | 240-263 |
| `calculateVATPosition()` | Get VAT position from vat_returns | 265-285 |
| `getCTEstimate()` | Get CT estimate from finalised workpaper | 287-311 |
| `getUnreconciledCount()` | Count unreconciled transactions | 313-329 |
| `getAgedReceivables()` | Calculate aged receivables | 331-370 |
| `getAgedPayables()` | Calculate aged payables | 372-411 |
| `getRecentBankTransactions()` | Get recent bank transactions | 413-492 |
| `getEntityDeadlinesAndJobs()` | Get deadlines and jobs for entity | 494-521 |

**Types:**
- `PeriodOption` - Period selection options including `last_financial_quarter`, `last_financial_year`, `tax_year`
- `EntityFinancialDates` - Year-end configuration

---

#### `src/lib/bookkeeping-utils.ts`
**Functions:**
| Function | Purpose | Lines |
|----------|---------|-------|
| `calculateTrialBalance()` | Calculate TB from ledger entries | 34-84 |
| `formatCurrency()` | Format as GBP | 89-95 |
| `getAccountTypeLabel()` | Get account type label | 100-109 |
| `getJournalTypeLabel()` | Get journal type label | 114-123 |
| `validateJournalBalance()` | Validate journal lines balance | 128-139 |

---

### 2.2 Database Functions

| Function | Purpose | Security |
|----------|---------|----------|
| `seed_default_chart_of_accounts()` | Seed default UK CoA for entity | SECURITY DEFINER |
| `seed_default_vat_codes()` | Seed default UK VAT codes | SECURITY DEFINER |
| `update_invoice_totals()` | Trigger: update invoice totals from lines | SECURITY DEFINER |
| `update_invoice_payment_status()` | Trigger: update invoice status from payments | SECURITY DEFINER |
| `can_finalise()` | Check if user can finalise workpapers | SECURITY DEFINER |
| `get_portal_kpis_for_entity()` | Get portal KPIs from ledger | SECURITY DEFINER |
| `get_portal_bank_accounts_for_entity()` | Get portal bank accounts | SECURITY DEFINER |

---

### 2.3 Edge Functions (TrueLayer)

| Function | Purpose | Path |
|----------|---------|------|
| `truelayer-auth` | Initiate TrueLayer OAuth | `/functions/v1/truelayer-auth` |
| `truelayer-callback` | Handle OAuth callback | `/functions/v1/truelayer-callback` |
| `truelayer-sync` | Sync transactions from TrueLayer | `/functions/v1/truelayer-sync` |

---

## 3. UI Component Inventory

### 3.1 Main Bookkeeping Page
**File:** `src/pages/Bookkeeping.tsx`

**Tabs:**
| Tab | Component | Purpose |
|-----|-----------|---------|
| Overview | `BusinessOverviewTab` | KPI dashboard |
| Trial Balance | `TrialBalanceTab` | TB view/export |
| General Ledger | `GeneralLedgerTab` | Ledger entries view |
| Chart of Accounts | `ChartOfAccountsTab` | Account management |
| Journals | `JournalsTab` | Journal management |
| Bank Accounts | `BankAccountsTab` | Bank account management |
| Bank Feeds | `BankFeedsTab` | Transaction feeds |
| Bank Reconciliation | `BankReconciliationTab` | Reconciliation UI |
| Invoices | `InvoicesTab` | Invoice management |
| Receipts | `ReceiptsTab` | Receipt capture |
| VAT Returns | `VATReturnsTab` | VAT return management |
| Period Lock | `PeriodLockTab` | Period lock settings |

---

### 3.2 Component Inventory (25 components)

| Component | Purpose | Key Features |
|-----------|---------|--------------|
| `EntitySelector.tsx` | Select client/company entity | Unified dropdown |
| `BusinessOverviewTab.tsx` | KPI dashboard | Revenue, profit, cash, VAT, CT |
| `ChartOfAccountsTab.tsx` | Account list and management | CRUD, filtering |
| `GeneralLedgerTab.tsx` | Ledger entries view | Date filtering, account details |
| `TrialBalanceTab.tsx` | TB view and snapshot | Period selection, export |
| `JournalsTab.tsx` | Journal list | Create, edit, post |
| `JournalEditor.tsx` | Journal entry editor | Multi-line, balance validation |
| `BankAccountsTab.tsx` | Bank account list | Add, edit, sync, toggle active |
| `BankFeedsTab.tsx` | Bank transaction list | Import, categorize, exclude |
| `BankReconciliationTab.tsx` | Reconciliation interface | Match, unmatch |
| `InvoicesTab.tsx` | Invoice list | CRUD, posting |
| `InvoiceEditorDialog.tsx` | Invoice editor | Lines, VAT calculation |
| `VATReturnsTab.tsx` | VAT return list | Create, submit |
| `ReceiptsTab.tsx` | Receipt capture | Upload, matching |
| `PeriodLockTab.tsx` | Period lock UI | Set, remove lock |
| `AddAccountDialog.tsx` | Add/edit account | Form with types |
| `AddBankAccountDialog.tsx` | Add/edit bank account | Form with linked account |
| `ConnectBankDialog.tsx` | TrueLayer connection | OAuth flow |
| `ImportBankTransactionsDialog.tsx` | CSV import | Column mapping |
| `ImportTrialBalanceDialog.tsx` | TB import wizard | Source selection, mapping |
| `CategorizeBankTransactionDialog.tsx` | Categorize transaction | Account + VAT selection |
| `CreateSnapshotDialog.tsx` | Create TB snapshot | Period selection |
| `CreateWorkpaperFromSnapshotDialog.tsx` | Create workpaper from TB | Type selection |
| `LedgerEntryPanel.tsx` | Entry detail panel | Full entry view |
| `SnapshotHistoryPanel.tsx` | Snapshot history | List, actions |

---

## 4. Integration Pipeline Mapping

### 4.1 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DATA SOURCE LAYER                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐  │
│  │   Native     │   │    Xero/     │   │    CSV/      │   │   Manual     │  │
│  │   Ledger     │   │  QuickBooks  │   │   Excel      │   │   Entry      │  │
│  │  (journals)  │   │    (API)     │   │  (import)    │   │              │  │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘  │
│         │                  │                  │                  │          │
│         └──────────────────┴──────────────────┴──────────────────┘          │
│                                    │                                         │
│                                    ▼                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                         LEDGER LAYER                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        ledger_entries                                 │   │
│  │  (account_id, transaction_date, debit, credit, source_type)          │   │
│  └───────────────────────────────┬──────────────────────────────────────┘   │
│                                  │                                           │
│                                  ▼                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                         TRIAL BALANCE LAYER                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                    trial_balance_snapshots                            │   │
│  │  (balances JSONB, source_type, status, locked)                        │   │
│  └───────────────────────────────┬──────────────────────────────────────┘   │
│                                  │                                           │
│                                  ▼ createWorkpaperFromSnapshot()            │
├─────────────────────────────────────────────────────────────────────────────┤
│                         WORKPAPER LAYER                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                      workpaper_instances                              │   │
│  │  (field_values, field_overrides, trial_balance_snapshot_id)           │   │
│  │  + questionnaire_instance_id (hybrid data)                            │   │
│  └───────────────────────────────┬──────────────────────────────────────┘   │
│                                  │                                           │
│                                  ▼ (when status = 'finalised')              │
├─────────────────────────────────────────────────────────────────────────────┤
│                         FILING LAYER                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                          filings                                      │   │
│  │  (filing_data, workpaper_instance_id, status, tax_due)                │   │
│  └───────────────────────────────┬──────────────────────────────────────┘   │
│                                  │                                           │
│                                  ▼ (PDF generation, client approval)        │
├─────────────────────────────────────────────────────────────────────────────┤
│                         OUTPUT LAYER                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐  │
│  │  CT600 PDF   │   │   SA100 PDF  │   │   iXBRL      │   │  VAT Return  │  │
│  │              │   │              │   │  Accounts    │   │              │  │
│  └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘  │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Pipeline Status

| Stage | Status | Notes |
|-------|--------|-------|
| Native Ledger → TB Snapshot | ✅ Complete | `createSnapshotFromNativeLedger()` |
| Imported TB → TB Snapshot | ✅ Complete | `createManualSnapshot()` with source_type |
| TB Snapshot → Workpaper | ✅ Complete | `createWorkpaperFromSnapshot()` (idempotent) |
| Questionnaire → Workpaper | ✅ Complete | `process_questionnaire_submission()` RPC |
| Workpaper → Filing | ✅ Complete | Filing creation from finalised workpaper |
| Filing → PDF Generation | ⚠️ Partial | Edge function stubbed |
| Filing → Client Approval | ✅ Complete | Status workflow implemented |
| Filing → Submission | ⚠️ Stubbed | API abstraction ready |

---

## 5. Gap Analysis

### 5.1 Critical Gaps

#### GAP-001: Period Lock NOT Enforced at Database Level
**Severity:** HIGH  
**Impact:** Transactions can be posted to locked periods  
**Current State:** `period_locks` table exists, UI works, but no trigger/RPC blocks inserts  
**Required Fix:** 
- Add trigger on `ledger_entries` INSERT/UPDATE to check `period_locks`
- Add trigger on `journals` INSERT/UPDATE to check `period_locks`
- Return clear error message when blocked
- Add audit log entry for attempted violations

#### GAP-002: Multi-Currency Support Missing
**Severity:** MEDIUM  
**Impact:** Cannot handle non-GBP transactions correctly  
**Current State:** `bank_transactions.currency` exists but `ledger_entries` has no currency columns  
**Required Fix:** Add to `ledger_entries`:
- `currency` (text, default 'GBP')
- `base_currency` (text, default 'GBP')
- `fx_rate` (numeric, default 1.0)
- `base_amount_debit` (numeric, nullable)
- `base_amount_credit` (numeric, nullable)

#### GAP-003: Reversal Journal UI Missing
**Severity:** MEDIUM  
**Impact:** Accountants cannot easily reverse journals  
**Current State:** `journals.reversed_from_id` exists, but no UI to create reversals  
**Required Fix:** Add "Reverse Journal" button in JournalEditor that:
- Creates new journal with swapped debits/credits
- Links via `reversed_from_id`
- Optionally schedules for future date

---

### 5.2 Minor Gaps

#### GAP-004: Document Linking on Journal Entries
**Severity:** LOW  
**Impact:** Audit trail incomplete  
**Current State:** `ledger_entries.document_id` exists but JournalEditor has no document upload  
**Required Fix:** Add document attachment in JournalEditor

#### GAP-005: Workpaper Field Override Audit Trail
**Severity:** LOW  
**Impact:** Cannot track individual field changes  
**Current State:** `field_overrides` is a flat JSONB  
**Required Fix:** Enhance structure to include `override_by`, `override_at`, `original_value`

#### GAP-006: FX Gain/Loss Auto-Posting
**Severity:** MEDIUM (depends on GAP-002)  
**Impact:** No automatic FX tracking  
**Required Fix:** After GAP-002, add logic to auto-post FX gain/loss journals on settlement

---

### 5.3 Confirmed Working

| Feature | Status | Evidence |
|---------|--------|----------|
| Chart of Accounts | ✅ | CRUD UI, default seeding function |
| Ledger Entries | ✅ | Query, display, balance validation |
| Journal Entry | ✅ | Create, edit, post, multi-line |
| Trial Balance Generation | ✅ | `calculateTrialBalance()` |
| TB Snapshot Creation | ✅ | Native + manual/import |
| TB → Workpaper Pipeline | ✅ | Idempotent creation |
| Bank Accounts | ✅ | CRUD, TrueLayer ready |
| Bank Transactions | ✅ | Import, categorize, exclude |
| TrueLayer Integration | ✅ | Auth, callback, sync functions |
| VAT Codes | ✅ | Seeding, CRUD |
| VAT Returns | ✅ | Create, calculate, submit |
| Invoices (AR/AP) | ✅ | CRUD, lines, payments, posting |
| Period Lock UI | ✅ | Set, update, remove |
| Business Overview KPIs | ✅ | Revenue, profit, cash, VAT, CT |
| Entity Scoping | ✅ | client_id/company_id on all tables |
| RLS Policies | ✅ | Organization-based isolation |
| Portal Visibility | ✅ | Visibility settings per entity |

---

## 6. Proposed Extensions (No New Tables)

### 6.1 Schema Extensions

#### Extension 1: Period Lock Enforcement Trigger
```sql
CREATE OR REPLACE FUNCTION check_period_lock()
RETURNS TRIGGER AS $$
DECLARE
  lock_date date;
BEGIN
  SELECT pl.lock_date INTO lock_date
  FROM period_locks pl
  WHERE pl.organization_id = NEW.organization_id
    AND (
      (NEW.client_id IS NOT NULL AND pl.client_id = NEW.client_id) OR
      (NEW.company_id IS NOT NULL AND pl.company_id = NEW.company_id)
    )
  LIMIT 1;

  IF lock_date IS NOT NULL AND NEW.transaction_date <= lock_date THEN
    RAISE EXCEPTION 'Cannot post to locked period. Lock date: %', lock_date;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_period_lock
BEFORE INSERT OR UPDATE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION check_period_lock();
```

#### Extension 2: Multi-Currency Columns
```sql
ALTER TABLE ledger_entries
ADD COLUMN IF NOT EXISTS currency text DEFAULT 'GBP',
ADD COLUMN IF NOT EXISTS base_currency text DEFAULT 'GBP',
ADD COLUMN IF NOT EXISTS fx_rate numeric DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS base_debit numeric,
ADD COLUMN IF NOT EXISTS base_credit numeric;
```

#### Extension 3: Enhanced Workpaper Override Tracking
```sql
-- No schema change, just document the expected JSONB structure
-- field_overrides: {
--   "field_key": {
--     "original_value": number,
--     "override_value": number,
--     "override_by": "user_id",
--     "override_at": "timestamp",
--     "reason": "string"
--   }
-- }
```

---

### 6.2 Indexes to Add

```sql
-- Performance indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ledger_entries_entity_date 
ON ledger_entries(organization_id, client_id, company_id, transaction_date);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_status 
ON bank_transactions(organization_id, bank_account_id, status);

CREATE INDEX IF NOT EXISTS idx_tb_snapshots_period 
ON trial_balance_snapshots(organization_id, client_id, company_id, period_end);
```

---

## 7. Confirmation Checklist

Before proceeding with Phase 4 implementation:

- [x] **No duplicate tables will be created** - All required tables exist
- [x] **Single ledger architecture confirmed** - `ledger_entries` is the single source
- [x] **TB → Workpaper → Filing pipeline exists** - Services implemented
- [x] **Entity scoping implemented** - client_id/company_id on all tables
- [x] **RLS policies in place** - Organization-based isolation
- [x] **TrueLayer ready** - Edge functions deployed
- [ ] **Period lock enforcement** - REQUIRES IMPLEMENTATION (GAP-001)
- [ ] **Multi-currency support** - REQUIRES IMPLEMENTATION (GAP-002)
- [ ] **Reversal journal UI** - REQUIRES IMPLEMENTATION (GAP-003)

---

## 8. Recommended Phase 4 Actions

Based on this audit, Phase 4 should focus on:

1. **Implement Period Lock Enforcement** (GAP-001)
   - Add trigger function
   - Test with UI
   - Add audit logging for violations

2. **Add Multi-Currency Columns** (GAP-002)
   - Extend `ledger_entries` schema
   - Update journal creation to handle FX
   - Update KPI calculations to use base amounts

3. **Add Reversal Journal UI** (GAP-003)
   - Button in JournalEditor
   - Reversal creation logic
   - Optional scheduled reversal

4. **Add Performance Indexes**
   - As documented in 6.2

5. **Verify End-to-End Flow**
   - Native Ledger → TB → Workpaper → Filing
   - Imported TB → Workpaper → Filing
   - Client Portal visibility

---

**Document End**
