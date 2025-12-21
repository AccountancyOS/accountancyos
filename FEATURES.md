# AccountancyOS - Feature Documentation

This document provides a comprehensive overview of all features in AccountancyOS with links to their implementation files.

**Last Updated:** 2025-01-27  
**Status:** Active Development

---

## Table of Contents

1. [Core Platform Features](#core-platform-features)
2. [Client & Company Management](#client--company-management)
3. [Bookkeeping & Accounting](#bookkeeping--accounting)
4. [Tax & Compliance](#tax--compliance)
5. [Payroll](#payroll)
6. [Jobs & Workflow](#jobs--workflow)
7. [Templates & Questionnaires](#templates--questionnaires)
8. [Automation](#automation)
9. [Integrations](#integrations)
10. [Settings & Configuration](#settings--configuration)
11. [Reporting & Analytics](#reporting--analytics)
12. [Data Import/Export](#data-importexport)

---

## Core Platform Features

### 1. Multi-Tenant Architecture

**Description:** Organization-based isolation with Row Level Security (RLS) policies.

**Implementation:**
- **Organization Context:** [`src/lib/organization-context.tsx`](src/lib/organization-context.tsx)
- **Auth Context:** [`src/lib/auth-context.tsx`](src/lib/auth-context.tsx)
- **Permissions System:** [`src/lib/permissions.ts`](src/lib/permissions.ts)
- **Permission Guard Component:** [`src/components/ui/permission-guard.tsx`](src/components/ui/permission-guard.tsx)

### 2. Authentication & Onboarding

**Description:** User authentication, email confirmation, and guided onboarding wizard.

**Implementation:**
- **Auth Page:** [`src/pages/Auth.tsx`](src/pages/Auth.tsx)
- **Email Confirmation:** [`src/pages/ConfirmEmail.tsx`](src/pages/ConfirmEmail.tsx)
- **Onboarding Wizard:** [`src/pages/OnboardingWizard.tsx`](src/pages/OnboardingWizard.tsx)
- **Onboarding Components:**
  - Practice Profile: [`src/components/onboarding-wizard/PracticeProfileStep.tsx`](src/components/onboarding-wizard/PracticeProfileStep.tsx)
  - Practice Setup: [`src/components/onboarding-wizard/PracticeSetupStep.tsx`](src/components/onboarding-wizard/PracticeSetupStep.tsx)
  - Compliance Setup: [`src/components/onboarding-wizard/ComplianceSetupStep.tsx`](src/components/onboarding-wizard/ComplianceSetupStep.tsx)
  - Team Setup: [`src/components/onboarding-wizard/TeamSetupStep.tsx`](src/components/onboarding-wizard/TeamSetupStep.tsx)
  - CRM Setup: [`src/components/onboarding-wizard/CRMSetupStep.tsx`](src/components/onboarding-wizard/CRMSetupStep.tsx)
  - Data Import: [`src/components/onboarding-wizard/DataImportStep.tsx`](src/components/onboarding-wizard/DataImportStep.tsx)

### 3. Dashboard & Overview

**Description:** Main dashboard with KPIs, job pipeline, deadlines, and automation activity.

**Implementation:**
- **Overview Page:** [`src/pages/Overview.tsx`](src/pages/Overview.tsx)
- **Welcome Dashboard:** [`src/pages/WelcomeDashboard.tsx`](src/pages/WelcomeDashboard.tsx)
- **Index/Routing:** [`src/pages/Index.tsx`](src/pages/Index.tsx)
- **Dashboard Components:**
  - KPI Cards: [`src/components/dashboard/DashboardKPICards.tsx`](src/components/dashboard/DashboardKPICards.tsx)
  - Job Pipeline Chart: [`src/components/dashboard/JobPipelineChart.tsx`](src/components/dashboard/JobPipelineChart.tsx)
  - Deadline Widget: [`src/components/dashboard/DeadlineWidget.tsx`](src/components/dashboard/DeadlineWidget.tsx)
  - Automation Activity Feed: [`src/components/dashboard/AutomationActivityFeed.tsx`](src/components/dashboard/AutomationActivityFeed.tsx)
- **Dashboard Layout:** [`src/components/DashboardLayout.tsx`](src/components/DashboardLayout.tsx)

### 4. Payment & Subscription

**Description:** Stripe integration for subscription management and payment processing.

**Implementation:**
- **Subscription Page:** [`src/pages/Subscription.tsx`](src/pages/Subscription.tsx)
- **Complete Payment:** [`src/pages/CompletePayment.tsx`](src/pages/CompletePayment.tsx)
- **Stripe Edge Functions:**
  - Checkout: [`supabase/functions/stripe-checkout/index.ts`](supabase/functions/stripe-checkout/index.ts)
  - Webhook: [`supabase/functions/stripe-webhook/index.ts`](supabase/functions/stripe-webhook/index.ts)
  - Connect Onboard: [`supabase/functions/stripe-connect-onboard/index.ts`](supabase/functions/stripe-connect-onboard/index.ts)
  - Connect Charge: [`supabase/functions/stripe-connect-charge/index.ts`](supabase/functions/stripe-connect-charge/index.ts)
- **Subscription Check:** [`supabase/functions/check-subscription/index.ts`](supabase/functions/check-subscription/index.ts)

---

## Client & Company Management

### 5. CRM

**Description:** Client and company relationship management.

**Implementation:**
- **CRM Page:** [`src/pages/CRM.tsx`](src/pages/CRM.tsx)
- **Clients Page:** [`src/pages/Clients.tsx`](src/pages/Clients.tsx)
- **Company Detail:** [`src/pages/CompanyDetail.tsx`](src/pages/CompanyDetail.tsx)
- **Client Components:**
  - Add Client Dialog: [`src/components/clients/AddClientDialog.tsx`](src/components/clients/AddClientDialog.tsx)
  - Contacts List: [`src/components/contacts/ContactsList.tsx`](src/components/contacts/ContactsList.tsx)
- **Accountant Linking:**
  - Link Dialog: [`src/components/accountant-linking/LinkToExistingClientDialog.tsx`](src/components/accountant-linking/LinkToExistingClientDialog.tsx)
  - Linked Clients Tab: [`src/components/accountant-linking/LinkedClientsTab.tsx`](src/components/accountant-linking/LinkedClientsTab.tsx)
  - Add Accountant Dialog: [`src/components/accountant-linking/AddAccountantDialog.tsx`](src/components/accountant-linking/AddAccountantDialog.tsx)

### 6. Client Portal

**Description:** Client-facing portal with configurable visibility settings.

**Implementation:**
- **Client Portal Page:** [`src/pages/ClientPortal.tsx`](src/pages/ClientPortal.tsx)
- **Portal Preview:** [`src/pages/portal/Preview.tsx`](src/pages/portal/Preview.tsx)
- **Portal Components:**
  - Portal Tab: [`src/components/client-portal/ClientPortalTab.tsx`](src/components/client-portal/ClientPortalTab.tsx)
  - Jobs Tab: [`src/components/client-portal/ClientJobsTab.tsx`](src/components/client-portal/ClientJobsTab.tsx)
  - Documents Tab: [`src/components/client-portal/ClientDocumentsTab.tsx`](src/components/client-portal/ClientDocumentsTab.tsx)
  - Conversations Tab: [`src/components/client-portal/ConversationsTab.tsx`](src/components/client-portal/ConversationsTab.tsx)
  - Questionnaires Tab: [`src/components/client-portal/ClientQuestionnairesTab.tsx`](src/components/client-portal/ClientQuestionnairesTab.tsx)
  - Workpapers Tab: [`src/components/client-portal/ClientWorkpapersTab.tsx`](src/components/client-portal/ClientWorkpapersTab.tsx)
- **Portal Edge Function:** [`supabase/functions/customer-portal/index.ts`](supabase/functions/customer-portal/index.ts)
- **Portal RPC Functions:** See `docs/portal-schema-audit.md` for RPC function details

---

## Bookkeeping & Accounting

### 7. Core Bookkeeping

**Description:** Chart of accounts, general ledger, trial balance, and journal entries.

**Implementation:**
- **Bookkeeping Page:** [`src/pages/Bookkeeping.tsx`](src/pages/Bookkeeping.tsx)
- **Entity Selector:** [`src/components/bookkeeping/EntitySelector.tsx`](src/components/bookkeeping/EntitySelector.tsx)
- **Chart of Accounts Tab:** [`src/components/bookkeeping/ChartOfAccountsTab.tsx`](src/components/bookkeeping/ChartOfAccountsTab.tsx)
- **General Ledger Tab:** [`src/components/bookkeeping/GeneralLedgerTab.tsx`](src/components/bookkeeping/GeneralLedgerTab.tsx)
- **Trial Balance Tab:** [`src/components/bookkeeping/TrialBalanceTab.tsx`](src/components/bookkeeping/TrialBalanceTab.tsx)
- **Journals Tab:** [`src/components/bookkeeping/JournalsTab.tsx`](src/components/bookkeeping/JournalsTab.tsx)
- **Journal Editor:** [`src/components/bookkeeping/JournalEditor.tsx`](src/components/bookkeeping/JournalEditor.tsx)
- **Reverse Journal Dialog:** [`src/components/bookkeeping/ReverseJournalDialog.tsx`](src/components/bookkeeping/ReverseJournalDialog.tsx)
- **Business Overview Tab:** [`src/components/bookkeeping/BusinessOverviewTab.tsx`](src/components/bookkeeping/BusinessOverviewTab.tsx)
- **Ledger Entry Panel:** [`src/components/bookkeeping/LedgerEntryPanel.tsx`](src/components/bookkeeping/LedgerEntryPanel.tsx)
- **Create Snapshot Dialog:** [`src/components/bookkeeping/CreateSnapshotDialog.tsx`](src/components/bookkeeping/CreateSnapshotDialog.tsx)

**Service Files:**
- **Trial Balance Service:** [`src/lib/trial-balance-service.ts`](src/lib/trial-balance-service.ts)
- **Bookkeeping Utils:** [`src/lib/bookkeeping-utils.ts`](src/lib/bookkeeping-utils.ts)
- **Bookkeeping KPIs:** [`src/lib/bookkeeping-kpi.ts`](src/lib/bookkeeping-kpi.ts)
- **Posting Service:** [`src/lib/posting-service.ts`](src/lib/posting-service.ts)

**Database Schema:** See `docs/bookkeeping-infrastructure-inventory.md` for complete table structure

### 8. Banking

**Description:** Bank account management, transaction feeds, reconciliation, and Open Banking integration.

**Implementation:**
- **Banking Tab:** [`src/components/bookkeeping/BankingTab.tsx`](src/components/bookkeeping/BankingTab.tsx)
- **Bank Rules Tab:** [`src/components/bookkeeping/BankRulesTab.tsx`](src/components/bookkeeping/BankRulesTab.tsx)
- **Import Bank Transactions Dialog:** [`src/components/bookkeeping/ImportBankTransactionsDialog.tsx`](src/components/bookkeeping/ImportBankTransactionsDialog.tsx)
- **Categorize Transaction Dialog:** [`src/components/bookkeeping/CategorizeBankTransactionDialog.tsx`](src/components/bookkeeping/CategorizeBankTransactionDialog.tsx)
- **Matching Suggestions Panel:** [`src/components/bookkeeping/MatchingSuggestionsPanel.tsx`](src/components/bookkeeping/MatchingSuggestionsPanel.tsx)

**Service Files:**
- **Bank Rules Service:** [`src/lib/bank-rules-service.ts`](src/lib/bank-rules-service.ts)
- **Matching Service:** [`src/lib/matching-service.ts`](src/lib/matching-service.ts)

**TrueLayer Integration (Open Banking):**
- **Auth:** [`supabase/functions/truelayer-auth/index.ts`](supabase/functions/truelayer-auth/index.ts)
- **Callback:** [`supabase/functions/truelayer-callback/index.ts`](supabase/functions/truelayer-callback/index.ts)
- **Sync:** [`supabase/functions/truelayer-sync/index.ts`](supabase/functions/truelayer-sync/index.ts)

### 9. Sales & Purchases

**Description:** Invoice management, bills, receipts, and payment tracking.

**Implementation:**
- **Sales Module:** [`src/components/bookkeeping/SalesModule.tsx`](src/components/bookkeeping/SalesModule.tsx)
- **Purchases Module:** [`src/components/bookkeeping/PurchasesModule.tsx`](src/components/bookkeeping/PurchasesModule.tsx)
- **Receipts Tab:** [`src/components/bookkeeping/ReceiptsTab.tsx`](src/components/bookkeeping/ReceiptsTab.tsx)
- **Credit Notes Tab:** [`src/components/bookkeeping/CreditNotesTab.tsx`](src/components/bookkeeping/CreditNotesTab.tsx)
- **Credit Note Editor:** [`src/components/bookkeeping/CreditNoteEditorDialog.tsx`](src/components/bookkeeping/CreditNoteEditorDialog.tsx)
- **Allocate Credit Dialog:** [`src/components/bookkeeping/AllocateCreditDialog.tsx`](src/components/bookkeeping/AllocateCreditDialog.tsx)
- **Customer Selector:** [`src/components/bookkeeping/CustomerSelector.tsx`](src/components/bookkeeping/CustomerSelector.tsx)
- **Customer Editor:** [`src/components/bookkeeping/CustomerEditorDialog.tsx`](src/components/bookkeeping/CustomerEditorDialog.tsx)
- **Bill Editor:** [`src/components/bookkeeping/BillEditorDialog.tsx`](src/components/bookkeeping/BillEditorDialog.tsx)
- **Record Bill Payment:** [`src/components/bookkeeping/RecordBillPaymentDialog.tsx`](src/components/bookkeeping/RecordBillPaymentDialog.tsx)
- **Aged Receivables Report:** [`src/components/bookkeeping/AgedReceivablesReport.tsx`](src/components/bookkeeping/AgedReceivablesReport.tsx)

**Service Files:**
- **Invoice Service:** [`src/lib/invoice-service.ts`](src/lib/invoice-service.ts)
- **Invoice Safe Service:** [`src/lib/invoice-safe-service.ts`](src/lib/invoice-safe-service.ts)
- **Invoice Draft Service:** [`src/lib/invoice-draft-service.ts`](src/lib/invoice-draft-service.ts)
- **Bills Service:** [`src/lib/bills-service.ts`](src/lib/bills-service.ts)
- **Bills Safe Service:** [`src/lib/bills-safe-service.ts`](src/lib/bills-safe-service.ts)
- **Bill Draft Service:** [`src/lib/bill-draft-service.ts`](src/lib/bill-draft-service.ts)

### 10. VAT Management

**Description:** VAT codes, VAT returns, and HMRC VAT submission.

**Implementation:**
- **VAT Returns Tab:** [`src/components/bookkeeping/VATReturnsTab.tsx`](src/components/bookkeeping/VATReturnsTab.tsx)
- **VAT Periods Tab:** [`src/components/bookkeeping/VATPeriodsTab.tsx`](src/components/bookkeeping/VATPeriodsTab.tsx)
- **VAT Registration Settings:** [`src/components/bookkeeping/VATRegistrationSettings.tsx`](src/components/bookkeeping/VATRegistrationSettings.tsx)
- **VAT Adjustments Panel:** [`src/components/bookkeeping/VATAdjustmentsPanel.tsx`](src/components/bookkeeping/VATAdjustmentsPanel.tsx)

**Service Files:**
- **VAT Scheme Service:** [`src/lib/vat-scheme-service.ts`](src/lib/vat-scheme-service.ts)
- **VAT Period Generator:** [`src/lib/vat-period-generator.ts`](src/lib/vat-period-generator.ts)
- **VAT Payload Generator:** [`src/lib/vat-payload-generator.ts`](src/lib/vat-payload-generator.ts)
- **VAT Validator:** [`src/lib/vat-validator.ts`](src/lib/vat-validator.ts)
- **VAT Reconciliation Service:** [`src/lib/vat-reconciliation-service.ts`](src/lib/vat-reconciliation-service.ts)
- **VAT Ledger Aggregator:** [`src/lib/vat-ledger-aggregator.ts`](src/lib/vat-ledger-aggregator.ts)
- **VAT Model Mapper:** [`src/lib/vat-model-mapper.ts`](src/lib/vat-model-mapper.ts)

**HMRC VAT Integration:**
- **VAT Submit:** [`supabase/functions/hmrc-vat-submit/index.ts`](supabase/functions/hmrc-vat-submit/index.ts)
- **VAT Obligations:** [`supabase/functions/hmrc-vat-obligations/index.ts`](supabase/functions/hmrc-vat-obligations/index.ts)

### 11. Reports

**Description:** Financial reports including trial balance, general ledger, and custom reports.

**Implementation:**
- **Reports Tab:** [`src/components/bookkeeping/ReportsTab.tsx`](src/components/bookkeeping/ReportsTab.tsx)
- **Balance Sheet Report:** [`src/components/bookkeeping/BalanceSheetReport.tsx`](src/components/bookkeeping/BalanceSheetReport.tsx)

### 12. Period Locking

**Description:** Lock accounting periods to prevent modifications.

**Implementation:**
- **Period Lock Tab:** [`src/components/bookkeeping/PeriodLockTab.tsx`](src/components/bookkeeping/PeriodLockTab.tsx)

**Note:** Period lock enforcement at database level is pending (see `docs/bookkeeping-infrastructure-inventory.md` GAP-001)

---

## Tax & Compliance

### 13. Corporation Tax

**Description:** CT600 workpapers, computation engine, and HMRC submission.

**Implementation:**
- **CT Computation Engine:** [`src/lib/ct-computation-engine.ts`](src/lib/ct-computation-engine.ts)
- **CT600 XML Builder:** [`src/lib/ct600-xml-builder.ts`](src/lib/ct600-xml-builder.ts)
- **Accounts Model Mapper:** [`src/lib/accounts-model-mapper.ts`](src/lib/accounts-model-mapper.ts)
- **FRS105 Accounts Model:** [`src/lib/frs105-accounts-model.ts`](src/lib/frs105-accounts-model.ts)

**HMRC CT Integration:**
- **CT Submit:** [`supabase/functions/hmrc-ct-submit/index.ts`](supabase/functions/hmrc-ct-submit/index.ts)
- **CT Poll:** [`supabase/functions/hmrc-ct-poll/index.ts`](supabase/functions/hmrc-ct-poll/index.ts)
- **CT Delete:** [`supabase/functions/hmrc-ct-delete/index.ts`](supabase/functions/hmrc-ct-delete/index.ts)

**CT600 Artefacts:**
- **CT600 Schema:** [`src/hmrc/ct600/artefacts/v3_2025/README.md`](src/hmrc/ct600/artefacts/v3_2025/README.md)
- **CT600 Fixture Generator:** [`scripts/generate-ct600-fixture.ts`](scripts/generate-ct600-fixture.ts)
- **CT600 XSD Validator:** [`scripts/validate-ct600-xsd.ts`](scripts/validate-ct600-xsd.ts)

### 14. Self Assessment

**Description:** Self assessment workpapers and SA100 filing support.

**Implementation:**
- Workpapers system handles self assessment (see Workpapers section)

### 15. Companies House

**Description:** Companies House sync and filing submission.

**Implementation:**
- **Companies House Sync:** [`supabase/functions/companies-house-sync/index.ts`](supabase/functions/companies-house-sync/index.ts)
- **CH Submit:** [`supabase/functions/ch-submit/index.ts`](supabase/functions/ch-submit/index.ts)
- **CH Sync Service:** [`src/lib/ch-sync-service.ts`](src/lib/ch-sync-service.ts)
- **CH Filing Service:** [`src/lib/ch-filing-service.ts`](src/lib/ch-filing-service.ts)
- **CH CS01 XML Builder:** [`src/lib/ch-cs01-xml-builder.ts`](src/lib/ch-cs01-xml-builder.ts)
- **CoSec Components:**
  - CoSec Jobs Tab: [`src/components/cosec/CompanyCoSecJobsTab.tsx`](src/components/cosec/CompanyCoSecJobsTab.tsx)
  - Officers Section: [`src/components/cosec/OfficersSection.tsx`](src/components/cosec/OfficersSection.tsx)
  - PSCs Section: [`src/components/cosec/PSCsSection.tsx`](src/components/cosec/PSCsSection.tsx)
  - Allot Shares Dialog: [`src/components/cosec/AllotSharesDialog.tsx`](src/components/cosec/AllotSharesDialog.tsx)
  - Add Share Class Dialog: [`src/components/cosec/AddShareClassDialog.tsx`](src/components/cosec/AddShareClassDialog.tsx)
  - Transfer Shares Dialog: [`src/components/cosec/TransferSharesDialog.tsx`](src/components/cosec/TransferSharesDialog.tsx)
- **CoSec Filing Service:** [`src/lib/cosec-filing-service.ts`](src/lib/cosec-filing-service.ts)

**Settings:**
- **Companies House Settings:** [`src/pages/settings/CompaniesHouseSettings.tsx`](src/pages/settings/CompaniesHouseSettings.tsx)

---

## Payroll

### 16. Payroll Management

**Description:** Employee management, pay run creation, RTI submission, and payroll calculations.

**Implementation:**
- **Payroll Page:** [`src/pages/Payroll.tsx`](src/pages/Payroll.tsx) (redirects to bookkeeping)
- **Payroll Module:** [`src/components/payroll/PayrollModule.tsx`](src/components/payroll/PayrollModule.tsx)
- **Payroll Overview Tab:** [`src/components/payroll/PayrollOverviewTab.tsx`](src/components/payroll/PayrollOverviewTab.tsx)
- **Pay Run Detail:** [`src/pages/PayRunDetail.tsx`](src/pages/PayRunDetail.tsx)
- **Employee Detail:** [`src/pages/EmployeeDetail.tsx`](src/pages/EmployeeDetail.tsx)
- **Payslip View Dialog:** [`src/components/payroll/PayslipViewDialog.tsx`](src/components/payroll/PayslipViewDialog.tsx)
- **PAYE Scheme Selector:** [`src/components/payroll/PayeSchemeSelector.tsx`](src/components/payroll/PayeSchemeSelector.tsx)

**Service Files:**
- **Payrun Service:** [`src/lib/payrun-service.ts`](src/lib/payrun-service.ts)
- **Payroll Calculation Engine:** [`src/lib/payroll-calculation-engine.ts`](src/lib/payroll-calculation-engine.ts)
- **Payroll Constants:** [`src/lib/payroll-constants.ts`](src/lib/payroll-constants.ts)
- **RTI Submission Engine:** [`src/lib/rti-submission-engine.ts`](src/lib/rti-submission-engine.ts)

**RTI Integration:**
- **RTI Submit:** [`supabase/functions/rti-submit/index.ts`](supabase/functions/rti-submit/index.ts)

### 17. CIS (Construction Industry Scheme)

**Description:** CIS return management and HMRC submission.

**Implementation:**
- **CIS Page:** [`src/pages/CIS.tsx`](src/pages/CIS.tsx) (redirects to bookkeeping)
- **CIS Module:** [`src/components/cis/CISModule.tsx`](src/components/cis/CISModule.tsx)
- **CIS Returns Tab:** [`src/components/cis/CISReturnsTab.tsx`](src/components/cis/CISReturnsTab.tsx)
- **CIS Contractors Tab:** [`src/components/cis/CISContractorsTab.tsx`](src/components/cis/CISContractorsTab.tsx)
- **CIS Return Detail:** [`src/pages/CISReturnDetail.tsx`](src/pages/CISReturnDetail.tsx)

**Service Files:**
- **CIS Service:** [`src/lib/cis-service.ts`](src/lib/cis-service.ts)
- **CIS Submission Engine:** [`src/lib/cis-submission-engine.ts`](src/lib/cis-submission-engine.ts)

**CIS Integration:**
- **CIS Submit:** [`supabase/functions/cis-submit/index.ts`](supabase/functions/cis-submit/index.ts)

---

## Jobs & Workflow

### 18. Job Management

**Description:** Job creation, status tracking, assignment, and filtering.

**Implementation:**
- **Jobs Page:** [`src/pages/Jobs.tsx`](src/pages/Jobs.tsx)
- **Job Detail:** [`src/pages/JobDetail.tsx`](src/pages/JobDetail.tsx)
- **Create Job Dialog:** [`src/components/jobs/CreateJobDialog.tsx`](src/components/jobs/CreateJobDialog.tsx)
- **Job Components:**
  - Documents Tab: [`src/components/jobs/JobDocumentsTab.tsx`](src/components/jobs/JobDocumentsTab.tsx)
  - Conversation Tab: [`src/components/jobs/JobConversationTab.tsx`](src/components/jobs/JobConversationTab.tsx)
  - Timeline Tab: [`src/components/jobs/JobTimelineTab.tsx`](src/components/jobs/JobTimelineTab.tsx)
  - Settings Tab: [`src/components/jobs/JobSettingsTab.tsx`](src/components/jobs/JobSettingsTab.tsx)
  - Audit Trail: [`src/components/jobs/JobAuditTrail.tsx`](src/components/jobs/JobAuditTrail.tsx)
  - Filing Pipeline Status: [`src/components/jobs/FilingPipelineStatus.tsx`](src/components/jobs/FilingPipelineStatus.tsx)
  - Records Request Manager: [`src/components/jobs/RecordsRequestManager.tsx`](src/components/jobs/RecordsRequestManager.tsx)
- **Job Filters:** [`src/components/jobs/JobsQuickFilters.tsx`](src/components/jobs/JobsQuickFilters.tsx)
- **Saved Views:** [`src/components/jobs/SavedViewsDropdown.tsx`](src/components/jobs/SavedViewsDropdown.tsx)

**Service Files:**
- **Job Status Service:** [`src/lib/job-status-service.ts`](src/lib/job-status-service.ts)
- **Job Exception Handler:** [`src/lib/job-exception-handler.ts`](src/lib/job-exception-handler.ts)
- **Jobs Filter Service:** [`src/lib/jobs-filter-service.ts`](src/lib/jobs-filter-service.ts)
- **Job Template Engine:** [`src/lib/job-template-engine.ts`](src/lib/job-template-engine.ts)
- **Job Template Types:** [`src/lib/job-template-types.ts`](src/lib/job-template-types.ts)

**Hooks:**
- **Job Filters Hook:** [`src/hooks/useJobFilters.tsx`](src/hooks/useJobFilters.tsx)

### 19. Workpapers

**Description:** Workpaper instances, trial balance integration, and field management.

**Implementation:**
- **Workpapers Page:** [`src/pages/Workpapers.tsx`](src/pages/Workpapers.tsx)
- **Workpaper Components:**
  - Add Adjustment Dialog: [`src/components/workpaper/AddAdjustmentDialog.tsx`](src/components/workpaper/AddAdjustmentDialog.tsx)
  - Workpaper Diff View: [`src/components/workpaper/WorkpaperDiffView.tsx`](src/components/workpaper/WorkpaperDiffView.tsx)

**Service Files:**
- **Workpaper Engine:** [`src/lib/workpaper-engine.ts`](src/lib/workpaper-engine.ts)
- **Workpaper from TB:** [`src/lib/workpaper-from-tb.ts`](src/lib/workpaper-from-tb.ts)
- **Questionnaire Workpaper Service:** [`src/lib/questionnaire-workpaper-service.ts`](src/lib/questionnaire-workpaper-service.ts)

### 20. Filings

**Description:** Filing management, approval workflow, and submission to HMRC/Companies House.

**Implementation:**
- **Filings Page:** [`src/pages/Filings.tsx`](src/pages/Filings.tsx)
- **Filing Detail:** [`src/pages/FilingDetail.tsx`](src/pages/FilingDetail.tsx)

**Service Files:**
- **Filing Service:** [`src/lib/filing-service.ts`](src/lib/filing-service.ts)
- **Filing API Provider:** [`src/lib/filing-api-provider.ts`](src/lib/filing-api-provider.ts)
- **Filing Approval Service:** [`src/lib/filing-approval-service.ts`](src/lib/filing-approval-service.ts)
- **Filing Snapshot Service:** [`src/lib/filing-snapshot-service.ts`](src/lib/filing-snapshot-service.ts)
- **Filing Event Service:** [`src/lib/filing-event-service.ts`](src/lib/filing-event-service.ts)
- **Amended Filing Service:** [`src/lib/amended-filing-service.ts`](src/lib/amended-filing-service.ts)

**PDF Generation:**
- **Generate Filing PDF:** [`supabase/functions/generate-filing-pdf/index.ts`](supabase/functions/generate-filing-pdf/index.ts)

### 21. Deadlines

**Description:** Deadline tracking and management.

**Implementation:**
- **Deadlines Page:** [`src/pages/Deadlines.tsx`](src/pages/Deadlines.tsx)
- **Deadline Filters:** [`src/components/deadlines/DeadlineFilters.tsx`](src/components/deadlines/DeadlineFilters.tsx)

**Service Files:**
- **Deadline Engine:** [`src/lib/deadline-engine.ts`](src/lib/deadline-engine.ts)

### 22. Onboarding (Client)

**Description:** Client onboarding workflow and engagement letters.

**Implementation:**
- **Onboarding Page:** [`src/pages/Onboarding.tsx`](src/pages/Onboarding.tsx)
- **Onboarding Detail:** [`src/pages/OnboardingDetail.tsx`](src/pages/OnboardingDetail.tsx)
- **Onboarding Status Stepper:** [`src/components/onboarding/OnboardingStatusStepper.tsx`](src/components/onboarding/OnboardingStatusStepper.tsx)
- **Engagement Letter Section:** [`src/components/onboarding/EngagementLetterSection.tsx`](src/components/onboarding/EngagementLetterSection.tsx)

**Service Files:**
- **Accountant Link Service:** [`src/lib/accountant-link-service.ts`](src/lib/accountant-link-service.ts)

**Engagement Letters:**
- **Send Engagement Letter:** [`supabase/functions/send-engagement-letter/index.ts`](supabase/functions/send-engagement-letter/index.ts)

---

## Templates & Questionnaires

### 23. Templates

**Description:** Template management for jobs, workpapers, and emails.

**Implementation:**
- **Templates Page:** [`src/pages/Templates.tsx`](src/pages/Templates.tsx)
- **Template Detail:** [`src/pages/TemplateDetail.tsx`](src/pages/TemplateDetail.tsx)
- **Job Templates Page:** [`src/pages/JobTemplates.tsx`](src/pages/JobTemplates.tsx)
- **Template Components:**
  - Job Template Editor: [`src/components/templates/JobTemplateEditorFullscreen.tsx`](src/components/templates/JobTemplateEditorFullscreen.tsx)
  - Workpaper Template Editor: [`src/components/templates/WorkpaperTemplateEditor.tsx`](src/components/templates/WorkpaperTemplateEditor.tsx)
  - Questionnaire Template Editor: [`src/components/templates/QuestionnaireTemplateEditor.tsx`](src/components/templates/QuestionnaireTemplateEditor.tsx)
  - Questionnaire Flow Builder: [`src/components/templates/QuestionnaireFlowBuilder.tsx`](src/components/templates/QuestionnaireFlowBuilder.tsx)
  - Email Template Editor: [`src/components/templates/EmailTemplateEditor.tsx`](src/components/templates/EmailTemplateEditor.tsx)
  - Dynamic Placeholders Preview: [`src/components/templates/DynamicPlaceholdersPreview.tsx`](src/components/templates/DynamicPlaceholdersPreview.tsx)
  - Reusable Blocks Panel: [`src/components/templates/ReusableBlocksPanel.tsx`](src/components/templates/ReusableBlocksPanel.tsx)

**Service Files:**
- **Placeholder Resolver:** [`src/lib/placeholder-resolver.ts`](src/lib/placeholder-resolver.ts)

### 24. Questionnaires

**Description:** Questionnaire instances and public response pages.

**Implementation:**
- **Questionnaire Response Page:** [`src/pages/QuestionnaireResponse.tsx`](src/pages/QuestionnaireResponse.tsx)

**Service Files:**
- **Questionnaire Workpaper Service:** [`src/lib/questionnaire-workpaper-service.ts`](src/lib/questionnaire-workpaper-service.ts) (see Workpapers section)

### 25. Quotes & Services

**Description:** Service catalog, quote management, and service configuration.

**Implementation:**
- **Services Page:** [`src/pages/Services.tsx`](src/pages/Services.tsx)
- **Quotes Page:** [`src/pages/Quotes.tsx`](src/pages/Quotes.tsx)
- **Quote Detail:** [`src/pages/QuoteDetail.tsx`](src/pages/QuoteDetail.tsx)

**Service Files:**
- **Services Utils:** [`src/lib/services-utils.ts`](src/lib/services-utils.ts)

---

## Automation

### 26. Automation Engine

**Description:** Rule-based automation with triggers and actions.

**Implementation:**
- **Automations Page:** [`src/pages/Automations.tsx`](src/pages/Automations.tsx)
- **Automation Components:**
  - Rule Editor: [`src/components/automations/AutomationRuleEditor.tsx`](src/components/automations/AutomationRuleEditor.tsx)
  - Templates Panel: [`src/components/automations/AutomationTemplatesPanel.tsx`](src/components/automations/AutomationTemplatesPanel.tsx)
  - Template Builder: [`src/components/automations/AutomationTemplateBuilder.tsx`](src/components/automations/AutomationTemplateBuilder.tsx)
  - Action Config Builder: [`src/components/automations/ActionConfigBuilder.tsx`](src/components/automations/ActionConfigBuilder.tsx)
  - Rule Action Builder: [`src/components/bookkeeping/RuleActionBuilder.tsx`](src/components/bookkeeping/RuleActionBuilder.tsx)
  - Placeholder Picker: [`src/components/automations/PlaceholderPicker.tsx`](src/components/automations/PlaceholderPicker.tsx)

**Service Files:**
- **Automation Engine:** [`src/lib/automation-engine.ts`](src/lib/automation-engine.ts)
- **Automation Rule Service:** [`src/lib/automation-rule-service.ts`](src/lib/automation-rule-service.ts)
- **Automation Safe Service:** [`src/lib/automation-safe-service.ts`](src/lib/automation-safe-service.ts)
- **Automation Triggers:** [`src/lib/automation-triggers.ts`](src/lib/automation-triggers.ts)
- **Automation Actions:** [`src/lib/automation-actions.ts`](src/lib/automation-actions.ts)

**Event Processing:**
- **Process Automation Events:** [`supabase/functions/process-automation-events/index.ts`](supabase/functions/process-automation-events/index.ts)

---

## Integrations

### 27. HMRC Integration

**Description:** OAuth authentication and submission to HMRC for CT, VAT, and CIS.

**Implementation:**
- **HMRC Auth:** [`supabase/functions/hmrc-auth/index.ts`](supabase/functions/hmrc-auth/index.ts)
- **HMRC Callback:** [`supabase/functions/hmrc-callback/index.ts`](supabase/functions/hmrc-callback/index.ts)
- **HMRC Settings:** [`src/pages/settings/HMRCSettings.tsx`](src/pages/settings/HMRCSettings.tsx)

**CT Integration:** (see Corporation Tax section)
**VAT Integration:** (see VAT Management section)
**CIS Integration:** (see CIS section)

### 28. Companies House Integration

**Description:** Companies House sync and filing submission.

**Implementation:** (see Companies House section)

### 29. TrueLayer (Open Banking)

**Description:** Bank account connection and transaction sync via Open Banking.

**Implementation:** (see Banking section)

### 30. Email Integration

**Description:** Gmail and Outlook OAuth integration for email management.

**Implementation:**
- **Gmail Auth:** [`supabase/functions/gmail-auth/index.ts`](supabase/functions/gmail-auth/index.ts)
- **Gmail Callback:** [`supabase/functions/gmail-callback/index.ts`](supabase/functions/gmail-callback/index.ts)
- **Gmail Exchange:** [`supabase/functions/gmail-exchange/index.ts`](supabase/functions/gmail-exchange/index.ts)
- **Gmail Send:** [`supabase/functions/gmail-send/index.ts`](supabase/functions/gmail-send/index.ts)
- **Gmail Sync:** [`supabase/functions/gmail-sync/index.ts`](supabase/functions/gmail-sync/index.ts)
- **Outlook Auth:** [`supabase/functions/outlook-auth/index.ts`](supabase/functions/outlook-auth/index.ts)
- **Outlook Callback:** [`supabase/functions/outlook-callback/index.ts`](supabase/functions/outlook-callback/index.ts)
- **Outlook Exchange:** [`supabase/functions/outlook-exchange/index.ts`](supabase/functions/outlook-exchange/index.ts)
- **Outlook Send:** [`supabase/functions/outlook-send/index.ts`](supabase/functions/outlook-send/index.ts)
- **Outlook Sync:** [`supabase/functions/outlook-sync/index.ts`](supabase/functions/outlook-sync/index.ts)
- **Gmail Callback Page:** [`src/pages/GmailCallback.tsx`](src/pages/GmailCallback.tsx)
- **Outlook Callback Page:** [`src/pages/OutlookCallback.tsx`](src/pages/OutlookCallback.tsx)

**Email Management:**
- **Emails Page:** [`src/pages/Emails.tsx`](src/pages/Emails.tsx)
- **Email Components:**
  - Email List: [`src/components/email/EmailList.tsx`](src/components/email/EmailList.tsx)
  - Email Viewer: [`src/components/email/EmailViewer.tsx`](src/components/email/EmailViewer.tsx)
  - Email Search: [`src/components/email/EmailSearch.tsx`](src/components/email/EmailSearch.tsx)
  - Edit Queued Email: [`src/components/email/EditQueuedEmailDialog.tsx`](src/components/email/EditQueuedEmailDialog.tsx)
  - Template Picker: [`src/components/email/TemplatePickerDropdown.tsx`](src/components/email/TemplatePickerDropdown.tsx)

**Service Files:**
- **Email Service:** [`src/lib/email-service.ts`](src/lib/email-service.ts)
- **Email Safe Service:** [`src/lib/email-safe-service.ts`](src/lib/email-safe-service.ts)

**Email Processing:**
- **Send Email:** [`supabase/functions/send-email/index.ts`](supabase/functions/send-email/index.ts)
- **Process Email Queue:** [`supabase/functions/process-email-queue/index.ts`](supabase/functions/process-email-queue/index.ts)

**Email Templates:**
- **Email Templates Settings:** [`src/pages/settings/EmailTemplates.tsx`](src/pages/settings/EmailTemplates.tsx)

### 31. Stripe Integration

**Description:** Subscription management and payment processing.

**Implementation:** (see Payment & Subscription section)

### 32. FX Rates

**Description:** Foreign exchange rate service.

**Implementation:**
- **FX Rates:** [`supabase/functions/fx-rates/index.ts`](supabase/functions/fx-rates/index.ts)
- **FX Service:** [`src/lib/fx-service.ts`](src/lib/fx-service.ts)

---

## Settings & Configuration

### 33. Settings

**Description:** Organization settings, branding, integrations, and permissions.

**Implementation:**
- **Settings Page:** [`src/pages/Settings.tsx`](src/pages/Settings.tsx)
- **Branding Settings:** [`src/pages/settings/BrandingSettings.tsx`](src/pages/settings/BrandingSettings.tsx)
- **HMRC Settings:** [`src/pages/settings/HMRCSettings.tsx`](src/pages/settings/HMRCSettings.tsx)
- **Companies House Settings:** [`src/pages/settings/CompaniesHouseSettings.tsx`](src/pages/settings/CompaniesHouseSettings.tsx)
- **Permissions Settings:** [`src/pages/settings/PermissionsSettings.tsx`](src/pages/settings/PermissionsSettings.tsx)
- **Email Templates:** [`src/pages/settings/EmailTemplates.tsx`](src/pages/settings/EmailTemplates.tsx)

**Branding Components:**
- **Brand Preview Invoice:** [`src/components/branding/BrandPreviewInvoice.tsx`](src/components/branding/BrandPreviewInvoice.tsx)
- **Brand Preview Email:** [`src/components/branding/BrandPreviewEmail.tsx`](src/components/branding/BrandPreviewEmail.tsx)

**Service Files:**
- **Permission Service:** [`src/lib/permission-service.ts`](src/lib/permission-service.ts)

---

## Reporting & Analytics

### 34. Reports

**Description:** Financial reports and analytics.

**Implementation:** (see Bookkeeping Reports section)

### 35. Operations Health

**Description:** System health monitoring and diagnostics.

**Implementation:**
- **Ops Health Page:** [`src/pages/OpsHealth.tsx`](src/pages/OpsHealth.tsx)

---

## Data Import/Export

### 36. Data Import

**Description:** Import trial balances, bank transactions, and other data from various sources.

**Implementation:**
- **Import Trial Balance Dialog:** [`src/components/bookkeeping/ImportTrialBalanceDialog.tsx`](src/components/bookkeeping/ImportTrialBalanceDialog.tsx)
- **Import Bank Transactions Dialog:** [`src/components/bookkeeping/ImportBankTransactionsDialog.tsx`](src/components/bookkeeping/ImportBankTransactionsDialog.tsx)

**Service Files:**
- **Trial Balance Service:** [`src/lib/trial-balance-service.ts`](src/lib/trial-balance-service.ts) (includes import functions)

### 37. iXBRL Generation

**Description:** Generate iXBRL accounts for Companies House filing.

**Implementation:**
- **iXBRL Generator:** [`src/lib/ixbrl-generator.ts`](src/lib/ixbrl-generator.ts)

---

## Additional Features

### 38. Notifications

**Description:** In-app notifications and notification management.

**Implementation:**
- **Notification Bell:** [`src/components/notifications/NotificationBell.tsx`](src/components/notifications/NotificationBell.tsx)

### 39. Audit & Validation

**Description:** Audit trails, validation, and workflow integrity checks.

**Service Files:**
- **Audit Service:** [`src/lib/audit-service.ts`](src/lib/audit-service.ts)
- **Workflow Integrity Service:** [`src/lib/workflow-integrity-service.ts`](src/lib/workflow-integrity-service.ts)
- **Validation Schemas:** [`src/lib/validation-schemas.ts`](src/lib/validation-schemas.ts)
- **E2E Flow Validation:** [`src/lib/e2e-flow-validation.ts`](src/lib/e2e-flow-validation.ts)

### 40. Tax Calculations

**Description:** Tax calculation engines for various tax types.

**Service Files:**
- **Tax Calculation Engine:** [`src/lib/tax-calculation-engine.ts`](src/lib/tax-calculation-engine.ts)
- **Capital Allowances Engine:** [`src/lib/capital-allowances-engine.ts`](src/lib/capital-allowances-engine.ts)

### 41. Auto Rollover

**Description:** Automatic job and deadline rollover for recurring work.

**Service Files:**
- **Auto Rollover Service:** [`src/lib/auto-rollover-service.ts`](src/lib/auto-rollover-service.ts)

### 42. File Routing

**Description:** Intelligent file routing and organization.

**Service Files:**
- **File Routing Utils:** [`src/lib/file-routing-utils.ts`](src/lib/file-routing-utils.ts)

---

## Database Schema

### Migrations

All database schema changes are tracked in migration files:
- **Location:** [`supabase/migrations/`](supabase/migrations/)

### Key Documentation

- **Bookkeeping Infrastructure:** [`docs/bookkeeping-infrastructure-inventory.md`](docs/bookkeeping-infrastructure-inventory.md)
- **Portal Schema Audit:** [`docs/portal-schema-audit.md`](docs/portal-schema-audit.md)
- **Portal Demo Setup:** [`docs/portal-demo-setup.md`](docs/portal-demo-setup.md)

---

## App Configuration

### Main App File

- **App Router & Routes:** [`src/App.tsx`](src/App.tsx)

### Package Configuration

- **Dependencies:** [`package.json`](package.json)

---

## Utility & Helper Files

### Core Utilities

- **Utils:** [`src/lib/utils.ts`](src/lib/utils.ts)
- **Customer Safe Service:** [`src/lib/customer-safe-service.ts`](src/lib/customer-safe-service.ts)

### Error Handling

- **Error Boundary:** [`src/components/ui/error-boundary.tsx`](src/components/ui/error-boundary.tsx)

---

## Notes

- **Period Lock Enforcement:** Database-level enforcement is pending (see `docs/bookkeeping-infrastructure-inventory.md` GAP-001)
- **Multi-Currency Support:** Schema extensions needed (see `docs/bookkeeping-infrastructure-inventory.md` GAP-002)
- **Reversal Journal UI:** UI for creating reversal journals is pending (see `docs/bookkeeping-infrastructure-inventory.md` GAP-003)

---

**For detailed implementation status and gaps, refer to:**
- [`docs/bookkeeping-infrastructure-inventory.md`](docs/bookkeeping-infrastructure-inventory.md)
- [`docs/portal-schema-audit.md`](docs/portal-schema-audit.md)
