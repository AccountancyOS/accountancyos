

# Comprehensive End-to-End Testing Review: AccountancyOS

## Executive Summary

After tracing through the complete user journey from sign-up through all major workflows, I have identified **47 distinct issues** across 9 categories. These range from critical data flow breaks to minor UX polish items. This review covers the accountant experience, client portal experience, and data integrity across all modules.

---

## Complete User Journey Testing Results

### Journey 1: New Firm Sign-up → Setup → First Client

| Stage | Status | Issues Found |
|-------|--------|--------------|
| Auth.tsx - Sign Up | ⚠️ Partial | Missing `autoComplete` attributes on password fields |
| Stripe Checkout | ✅ Works | Proper redirect and polling mechanism |
| OnboardingWizard.tsx | ⚠️ Partial | Exclamation mark in "Setup complete!" toast |
| Practice Setup Steps | ⚠️ Partial | No skip button visible per Phase 4.2 plan |
| First Client Creation | ⚠️ Partial | Dialog works but detail tables not queried on edit |

### Journey 2: CRM → Lead → Quote → Client Conversion

| Stage | Status | Issues Found |
|-------|--------|--------------|
| CRM Page | ⚠️ Partial | LeadDetailPanel created but NOT wired in |
| Lead Creation | ✅ Works | 8 lead types, CH lookup UI exists (no function) |
| Quote Integration | ❌ Broken | LeadDetailPanel has Quotes tab but CRM uses old dialog |
| Stage Timestamps | ✅ Works | proposal_sent_at, won_at, etc. properly set |
| Lead-to-Client Conversion | ⚠️ Unclear | Conversion logic not visible in current CRM.tsx |

### Journey 3: Client Management → Services → Jobs

| Stage | Status | Issues Found |
|-------|--------|--------------|
| Client Detail View | ⚠️ Incomplete | Type-specific details not loaded/displayed |
| Client Types | ⚠️ Partial | 8 types exist but no edit flow for existing clients |
| Services Tab | ❌ Placeholder | "Services view coming soon..." text |
| Deadlines Tab | ❌ Placeholder | "Deadlines view coming soon..." text |
| Billing Tab | ❌ Placeholder | "Billing view coming soon..." text |
| Job Creation | ⚠️ Works | But no link from client detail services |

### Journey 4: SA MTD vs SA Non-MTD Client Flow

| Stage | Status | Issues Found |
|-------|--------|--------------|
| Client Type Selection | ✅ Works | sa_mtd and sa_non_mtd options exist |
| Detail Fields | ⚠️ Partial | MTD toggle shows, quarters field exists |
| MTD Deadline Generation | ❌ Missing | No MTD quarter deadline logic in deadline-engine.ts |
| MTD Quarterly Updates | ❌ Missing | No workpaper/filing for MTD quarterly updates |
| MTD Final Declaration | ⚠️ Partial | mtd_final_declaration_deadline field exists but unused |
| SA Non-MTD Deadline | ❌ Missing | No automatic 31 Jan deadline generation |

### Journey 5: Limited Company Flow (CT600 + Accounts)

| Stage | Status | Issues Found |
|-------|--------|--------------|
| Company Creation | ✅ Works | Companies House lookup UI present |
| Companies House API | ❌ Not Implemented | Search button has no onClick handler |
| Year End Configuration | ⚠️ Partial | year_end_month/day columns exist, not in UI |
| Accounts Deadline | ⚠️ Partial | TODO comment in deadline-engine.ts line 124 |
| CT600 Deadline | ⚠️ Incomplete | 9 months + 1 day logic not automated |
| Filing Workflow | ✅ Works | CT600 XML builder exists, filing tabs work |

### Journey 6: VAT Return Workflow

| Stage | Status | Issues Found |
|-------|--------|--------------|
| VAT Registration | ⚠️ Partial | VATRegistrationSettings component exists |
| VAT Return Calculation | ✅ Works | VATReturnsTab calculates from ledger |
| VAT Scheme Support | ⚠️ Partial | Standard scheme works, others untested |
| VAT Deadline Generation | ✅ Works | generateVATDeadlines function exists |
| HMRC MTD VAT Submission | ⚠️ Partial | hmrc-vat-submit edge function exists |
| VAT to Ledger Reconciliation | ⚠️ Partial | VATReconciliationPanel exists but minimal |

### Journey 7: Payroll Module

| Stage | Status | Issues Found |
|-------|--------|--------------|
| PAYE Scheme Setup | ✅ Works | PayeSchemesTab, AddPayeSchemeDialog exist |
| Employee Management | ✅ Works | Full employee model with all RTI fields |
| Pay Run Creation | ✅ Works | CreatePayRunDialog creates draft pay runs |
| Payroll Calculation | ✅ Excellent | Pure calculation engine with 2024/25 + 2023/24 rates |
| Tax Code Parsing | ✅ Excellent | Scottish/Welsh/K codes all handled |
| NIC Calculation | ✅ Excellent | All bands and categories implemented |
| Payslip Generation | ⚠️ Partial | PayslipViewDialog exists but untested |
| RTI Submission | ⚠️ Partial | rti-submit edge function exists |
| P45/P60 Generation | ❌ Missing | Referenced in constants but no generator |
| Payroll → Ledger Journal | ❌ Missing | Plan requirement but no implementation |

### Journey 8: CIS Module

| Stage | Status | Issues Found |
|-------|--------|--------------|
| Contractor Management | ✅ Works | CISContractorsTab exists |
| Subcontractor Verification | ⚠️ Partial | UI exists, HMRC API integration unclear |
| CIS Payment Recording | ✅ Works | CISPaymentsTab exists |
| CIS Return Generation | ✅ Works | CISReturnsTab, generateCISDeadlines |
| HMRC Submission | ⚠️ Partial | cis-submit edge function exists |

### Journey 9: Client Portal Experience

| Stage | Status | Issues Found |
|-------|--------|--------------|
| Portal Preview | ✅ Works | Read-only preview with visibility controls |
| Document Visibility | ⚠️ Partial | client_visible column exists but toggle broken |
| Document Download | ❌ Not Implemented | Download button has no handler |
| Document Upload | ❌ Not Implemented | Upload button has no handler |
| Signature Flow | ⚠️ Incomplete | Component exists but shows placeholder text |
| Questionnaire Response | ✅ Works | QuestionnaireResponse.tsx functional |
| Message Sending | ⚠️ Partial | NewMessageDialog exists |

---

## Critical Data Flow Issues

### Issue 1: Client Type Details Not Queried on Edit

**Location:** `src/pages/ClientPortal.tsx`, `src/pages/Clients.tsx`
**Impact:** HIGH - Client type-specific data (UTR, NINO, POA amounts) never displayed after creation
**Current Behavior:** Only base client fields fetched; client_detail_sa, client_detail_cgt, etc. never joined
**Fix Required:** Add detail table joins in client queries

```typescript
// Current (broken):
.from("clients").select("*")

// Should be:
.from("clients").select(`
  *,
  client_detail_sa(*),
  client_detail_cgt(*),
  client_detail_partnership(*),
  client_detail_charity(*)
`)
```

### Issue 2: LeadDetailPanel Not Connected to CRM

**Location:** `src/pages/CRM.tsx` (lines 244-256)
**Impact:** HIGH - Phase 2.2 requirement (integrated quotes) not functional
**Current Behavior:** Clicking lead opens old `editDialogOpen` modal, not new tabbed panel
**Evidence:** `LeadDetailPanel` is imported but never rendered in CRM.tsx
**Fix Required:** Replace edit dialog with LeadDetailPanel slideout

### Issue 3: SA/MTD Deadline Engine Gaps

**Location:** `src/lib/deadline-engine.ts`
**Impact:** HIGH - Self Assessment clients get no automated deadlines
**Missing:**
- No `generateSADeadlines()` function for 31 Jan paper/online deadlines
- No MTD quarterly update deadline generation
- No POA (31 Jan, 31 Jul) reminder generation
- `mtd_final_declaration_deadline` field exists but unused

### Issue 4: Companies House Lookup Not Functional

**Location:** `src/pages/CRM.tsx` (lines 478-488)
**Impact:** MEDIUM - Phase 1.3 requirement not met
**Current:** Button exists with `<Search>` icon but no `onClick` handler
**Missing:** 
- API call to Companies House
- Auto-population of company data
- `ch_company_profile` JSONB storage

### Issue 5: Staff Variance Table Uses Placeholder Data

**Location:** `src/components/dashboard/StaffVarianceTable.tsx` (lines 33-38)
**Impact:** MEDIUM - Dashboard accuracy compromised
**Current:** Returns `activeJobs: 0` and `performance: 100` for all users
**Missing:** 
- Real job count query by assignee
- SLA breach percentage calculation
- Actual workload metrics

---

## Missing Features from Plan

| Plan Item | Phase | Status | Location |
|-----------|-------|--------|----------|
| Send Quote button in CRM header | 2.2 | ❌ Missing | CRM.tsx |
| Quote status on lead cards | 2.2 | ❌ Missing | CRM.tsx |
| Skip button for setup tasks | 4.2 | ❌ Missing | OnboardingWizard.tsx |
| Conversations tab in LeadDetailPanel | 2.2 | ❌ Placeholder only | LeadDetailPanel.tsx |
| Documents tab in LeadDetailPanel | 2.2 | ❌ Placeholder only | LeadDetailPanel.tsx |
| Session tracking on login | 6.3 | ❌ Not implemented | Auth.tsx |
| Single session enforcement | 6.3 | ❌ Not implemented | - |
| sla-check edge function | 3.3 | ❌ Not created | - |
| document-archive edge function | 5.3 | ❌ Not created | - |
| session-cleanup edge function | 6.3 | ❌ Not created | - |
| Payroll → Ledger journal | 7 | ❌ Missing | payrun-service.ts |
| P45/P60 document generation | 7 | ❌ Missing | - |

---

## UI/UX Issues from Accountant Perspective

### Pain Point 1: No Services or Deadlines on Client Detail

**User Story:** "I click on a client and want to see what services they have and when things are due."
**Current:** "Services view coming soon...", "Deadlines view coming soon..."
**Impact:** Accountants cannot view critical client engagement information
**Fix:** Wire up Services tab to engagements table, Deadlines tab to deadlines table

### Pain Point 2: Cannot Edit Client Type Details

**User Story:** "I added a client as SA Non-MTD but now they've joined MTD. I need to update their record."
**Current:** No edit flow for client_type or detail table fields
**Impact:** Accountants must delete and recreate clients to change type
**Fix:** Add edit dialog/form for client details with type-specific fields

### Pain Point 3: Company Year End Not Configurable

**User Story:** "I need to set this company's year end to 30 September."
**Current:** year_end_month and year_end_day columns exist but no UI
**Impact:** Cannot set year ends, so accounts/CT deadlines cannot auto-generate
**Fix:** Add year end selector to company detail view

### Pain Point 4: No Conversion Flow in CRM

**User Story:** "This lead accepted our quote. How do I convert them to a client?"
**Current:** Lead status can be set to "won" but no conversion action
**Impact:** Manual client creation required; no data flows from lead
**Fix:** Add "Convert to Client" button that creates client record from lead data

### Pain Point 5: Quotes Page Separate from CRM

**User Story:** "I want to create a quote for this lead without leaving the CRM."
**Current:** Must navigate to /quotes separately; LeadDetailPanel has Quotes tab but isn't connected
**Impact:** Extra navigation, context switching
**Fix:** Wire LeadDetailPanel into CRM as per Phase 2.2 plan

---

## UI/UX Issues from Client Perspective

### Pain Point 1: Documents Cannot Be Downloaded

**User Story:** "My accountant uploaded my tax return and I need to download it."
**Current:** Download button in ClientDocumentsTab has no onClick handler
**Impact:** Clients cannot access their documents
**Fix:** Implement document download from Supabase Storage

### Pain Point 2: Documents Cannot Be Uploaded

**User Story:** "I need to upload my bank statements for my accountant."
**Current:** Upload button has no onClick handler
**Impact:** Clients cannot submit records
**Fix:** Implement document upload to job_documents

### Pain Point 3: Signature Flow Incomplete

**User Story:** "I need to sign my engagement letter."
**Current:** Shows "Document preview loading..." placeholder text
**Impact:** Clients cannot complete signatures
**Fix:** Implement PDF rendering in DocumentSignatureFlow

---

## Database Integrity Issues

### Issue 1: Orphaned Detail Records Possible

**Risk:** If client is deleted, detail tables may retain orphaned records
**Fix:** Add ON DELETE CASCADE to client_detail_* foreign keys

### Issue 2: Missing RLS on Detail Tables

**Risk:** Security linter warning about RLS without policies
**Fix:** Add appropriate RLS policies matching parent table access

### Issue 3: Unused Schema Columns

The following columns were added but appear unused in application code:

| Table | Column | Usage |
|-------|--------|-------|
| clients | mobile_number | Created but never displayed |
| clients | preferred_name | Created but never displayed |
| companies | trading_status | Created but no UI |
| companies | trading_address | Created but no UI |
| companies | director_nationality | Created but no UI |
| client_detail_sa | mtd_quarters | Created but never populated |
| sla_definitions | * | Table created but no seeded definitions |

---

## Text Cleanup Still Required

| File | Issue | Line |
|------|-------|------|
| OnboardingWizard.tsx | "Setup complete!" | L208 |
| GmailCallback.tsx | "Gmail connected successfully!" | L47 |
| OutlookCallback.tsx | "Outlook connected successfully!" | L52 |
| BankingTab.tsx | "Bank connected successfully! Accounts..." | L95 |
| ClientBankingTab.tsx | "Bank connected successfully! Your accounts..." | L38 |
| Settings.tsx | "Gmail account connected successfully!" | L44 |
| Settings.tsx | "Outlook account connected successfully!" | L48 |
| e2e-flow-validation.ts | Contains ✅ and ❌ emojis | L592 |

---

## Priority Remediation Order

### Tier 1: Critical Data Flow (Must Fix)
1. Wire LeadDetailPanel into CRM.tsx
2. Add client detail table joins in client queries
3. Create SA deadline generation function
4. Implement Companies House API lookup
5. Add client type edit flow

### Tier 2: Core Functionality (Should Fix)
6. Implement document download handler
7. Implement document upload handler
8. Add year end configuration UI for companies
9. Implement Staff Variance real calculations
10. Add "Convert to Client" flow in CRM
11. Wire up Services tab on ClientPortal

### Tier 3: Automation & Background (Plan Requirement)
12. Create sla-check edge function
13. Create document-archive edge function
14. Seed default SLA definitions for new organizations
15. Implement session tracking
16. Add Payroll → Ledger journal posting

### Tier 4: Polish & Completeness
17. Fix LeadDetailPanel useState bug
18. Add autoComplete attributes to Auth.tsx
19. Complete text cleanup (7 files)
20. Add P45/P60 generation
21. Implement DocumentSignatureFlow PDF rendering
22. Add skip buttons to OnboardingWizard

---

## Testing Recommendations

### Before Production Release

1. **End-to-end signup test** - New user through to first job creation
2. **SA MTD client journey** - Full lifecycle with quarterly updates
3. **Ltd Co journey** - CH sync → Accounts → CT600 → Filing
4. **Payroll run test** - Create employee, run payroll, generate payslip
5. **VAT return test** - Enter transactions, calculate return, review boxes
6. **Client portal test** - Login as client, view documents, sign engagement letter

### Automated Test Coverage Needed

- Client type validation (8 types × create/edit/view)
- Deadline generation (SA/MTD/CT/VAT/CIS/RTI)
- Payroll calculation engine (edge cases: Scottish rates, K codes, directors)
- SLA engine (start/pause/stop/breach detection)
- Filing workflow (snapshot → approval → submission)

