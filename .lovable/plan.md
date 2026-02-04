

# Plan: AccountancyOS Master System Specification (As-Built) - PDF Document

## Overview

This plan outlines the creation of a comprehensive "Source of Truth" document that maps the entire AccountancyOS product - covering application structure, database schema, data lineage, integrations, workflows, and permissions. The document will be generated as a **downloadable PDF**.

---

## Deliverable Format

### PDF Generation Approach

1. **Create specification content** as structured data/markdown in `docs/master-system-specification.md`
2. **Create a dedicated page** at `/ops/system-specification` that renders the specification with print-optimized styling
3. **Add PDF export functionality** using browser print-to-PDF with proper `@media print` styles
4. **Include a "Download PDF" button** that triggers `window.print()` for clean PDF output

---

## Document Structure

The specification will be organized into **10 major sections**:

### Section 1: Application Surface Area (Routes & Pages)

Document every page/route with:
- URL path
- Authentication requirements  
- Layout component used
- Primary components rendered
- Purpose

**43 routes identified** including:
- Core: `/overview`, `/clients`, `/jobs`, `/deadlines`
- Bookkeeping: `/bookkeeping` (full module)
- Payroll: `/payroll`, `/payroll/pay-runs/:id`, `/payroll/employees/:id`
- Filing: `/filings`, `/filings/:id`
- Settings: `/settings/*` (6 sub-routes)

---

### Section 2: Page-Level Specification

For each major page:
- Purpose and description
- User roles with access
- Entry points (navigation paths)
- Exit points (where users go next)
- Key state management

---

### Section 3: Database Entity Map

**100+ tables organized by domain:**

| Domain | Tables | Examples |
|--------|--------|----------|
| Core Entities | 5 | organizations, clients, companies, leads |
| Jobs & Workflow | 5 | jobs, job_tasks, job_documents, deadlines |
| Bookkeeping | 25+ | ledger_entries, invoices, bills, bank_transactions |
| Filing & Tax | 10+ | filings, filing_submissions, hmrc_authorisations |
| Payroll | 10+ | paye_schemes, employees, pay_runs, rti_submissions |
| CIS | 4 | cis_contractors, cis_subcontractors, cis_payments, cis_returns |
| Company Secretary | 6 | company_officers, company_pscs, share_classes |
| Templates & Automation | 6 | templates, automation_rules, workpaper_instances |
| Email & Communication | 5 | connected_mailboxes, email_messages, client_messages |
| Portal & Access | 4 | portal_access, onboardings, engagement_letters |

Each table documented with: Primary key, Foreign keys, Business meaning, RLS policies

---

### Section 4: Data Lineage

Field-level data provenance for key entities:

**Example - Companies Table:**
| Field | Source | Sync Method |
|-------|--------|-------------|
| company_name | User input OR Companies House API | CH sync |
| company_number | User input OR CH lookup | CH sync |
| sic_codes | Companies House API | CH sync |
| trading_status | User input | Manual |
| utr | User input | Manual |
| partner_in_charge | User selection | FK to organization_users |

---

### Section 5: Integrations

| Provider | Purpose | Edge Functions | Token Storage |
|----------|---------|----------------|---------------|
| HMRC | VAT, CT600, RTI, CIS | 6 functions | organization_integrations_hmrc |
| Companies House | Company sync, filings | 2 functions | organization_integrations_companies_house |
| Gmail | Email sync & send | 5 functions | connected_mailboxes |
| Outlook | Email sync & send | 5 functions | connected_mailboxes |
| TrueLayer | Open Banking | 3 functions | bank_connections |
| Stripe | Payments | 4 functions | Stripe-managed |

---

### Section 6: Workflows & State Machines

**Job Lifecycle:**
```
not_started → in_progress → awaiting_info → review → complete
```

**Filing Lifecycle:**
```
not_started → draft → in_progress → awaiting_approval → ready_to_file → filed
```

**Onboarding Workflow:**
```
lead_created → quote_sent → quote_accepted → aml_pending → aml_verified → engagement_sent → engagement_signed → active
```

**Invoice Lifecycle:**
```
DRAFT → ISSUED → SENT → AWAITING_PAYMENT → PART_PAID → PAID
```

---

### Section 7: Permissions & Access Control

**Roles Hierarchy:** `viewer < staff < manager < admin < owner`

**Permission Matrix (excerpt):**
| Permission | Owner | Admin | Manager | Staff | Viewer |
|------------|:-----:|:-----:|:-------:|:-----:|:------:|
| Manage practice settings | ✓ | ✓ | - | - | - |
| Manage team | ✓ | ✓ | - | - | - |
| Approve filings | ✓ | ✓ | ✓ | - | - |
| Submit filings | ✓ | ✓ | ✓ | - | - |
| Create jobs | ✓ | ✓ | ✓ | ✓ | - |
| Issue invoices | ✓ | ✓ | ✓ | - | - |

---

### Section 8: Edge Functions Inventory

~30 Deno-based edge functions documented with:
- JWT requirements
- Purpose
- Input/output
- Error handling

---

### Section 9: Technical Architecture

**Frontend:** React 18, Vite, TypeScript, Tailwind CSS, TanStack Query, React Router v6

**Backend:** Supabase (PostgreSQL + Auth + Storage + Edge Functions), Deno Edge Functions, Row-Level Security

**Component Organization:** 200+ components across 15+ domains

---

### Section 10: Known Gaps & TODOs

**Partially Implemented:**
- Self-Assessment Filing (UI exists, HMRC API pending)
- MTD for Income Tax (not yet implemented)
- Client Portal App (schema ready, separate app pending)
- Multi-currency Bookkeeping (FX columns exist, full support incomplete)

**Stubbed/Mocked:**
- Companies House Live Filing (sandbox only)
- HMRC CT600 Live (sandbox mode)
- TrueLayer Live (sandbox credentials)

**Technical Debt:**
- Client type mismatch (`ltd` vs `limited_company`)
- Some RLS policies need tightening

---

## Implementation

### Files to Create

| File | Purpose |
|------|---------|
| `docs/master-system-specification.md` | Source content in markdown |
| `src/pages/SystemSpecification.tsx` | Rendered view with print styles |

### Files to Modify

| File | Change |
|------|--------|
| `src/App.tsx` | Add route `/ops/system-specification` |

### PDF Export Implementation

The page will include:
1. Print-optimized CSS with `@media print` rules
2. Proper page breaks between sections
3. Table of contents with page numbers
4. Header/footer with document title and date
5. "Download as PDF" button triggering `window.print()`

### Estimated Document Size

- **15,000-20,000 words**
- **~50-70 pages** when rendered as PDF
- **10 major sections** with subsections

---

## Summary

This creates a professional PDF document serving as the canonical "source of truth" for the entire AccountancyOS product. The document will be accessible from the Operations menu and can be downloaded/printed as a PDF for offline reference or stakeholder sharing.

