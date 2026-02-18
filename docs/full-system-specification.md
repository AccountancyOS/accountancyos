# AccountancyOS — Full Technical System Specification (As-Built)

**Generated:** 2026-02-18  
**Scope:** Everything implemented in code and schema. No speculative features.

---

## 1️⃣ FULL SYSTEM MAP (Bird's-Eye Architecture)

### Applications

1. **AccountancyOS Accountant App** (`accountancyOS-accountant`) — SPA for practice staff. React + Vite + Tailwind + TypeScript. 45 routes. Full CRM, bookkeeping, jobs, filings, payroll, automations, email, settings.

2. **AccountancyOS Client Portal** (`accountancyOS-client`) — Separate Lovable project sharing the same backend. Read-only for clients. White-labelable. Deployed independently.

3. **Supabase Edge Functions** — 40 serverless functions handling OAuth, webhooks, HMRC/CH submissions, email sending, automation processing, Stripe, TrueLayer, and scheduled workflows.

4. **Background Workers (Cron-Triggered Edge Functions):**
   - `workflow-tick` — Advances workflow instances on schedule
   - `process-automation-events` — Processes legacy automation event queue
   - `process-email-queue` — Sends queued emails via Postmark
   - `sla-check` — Checks SLA breaches
   - `session-cleanup` — Purges expired user sessions
   - `hmrc-ct-poll` — Polls HMRC for CT submission status

### Runtime Environments

| Environment | Technology | Purpose |
|---|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS | SPA rendering |
| Database | PostgreSQL (Supabase) | 177 tables, 553 RLS policies |
| Auth | Supabase Auth | Email/password, password recovery |
| Storage | Supabase Storage | Documents, receipts, onboarding files |
| Edge Functions | Deno (Supabase Edge) | Server-side logic, API integrations |
| External APIs | Stripe, HMRC, Companies House, TrueLayer, Gmail, Outlook, Postmark | Payments, filings, banking, email |

### ASCII Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    BROWSER (React SPA)                       │
│  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌─────────────────┐  │
│  │Accountant│ │  Client   │ │ Public │ │  OAuth Callbacks │  │
│  │  App     │ │  Portal   │ │Questn. │ │ Gmail/Outlook/  │  │
│  │(45 routes│ │(separate  │ │Response│ │ HMRC/TrueLayer  │  │
│  │ )        │ │ project)  │ │        │ │                  │  │
│  └────┬─────┘ └────┬─────┘ └───┬────┘ └──────┬──────────┘  │
│       │             │           │              │              │
└───────┼─────────────┼───────────┼──────────────┼──────────────┘
        │             │           │              │
        ▼             ▼           ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│                   SUPABASE (Shared Backend)                  │
│                                                              │
│  ┌──────────────┐  ┌────────────────────────────────────┐   │
│  │ Auth         │  │ PostgreSQL (177 tables)             │   │
│  │ (email/pass) │  │ 553 RLS policies                    │   │
│  │              │  │ DB Functions (emit_automation_event, │   │
│  │              │  │   generate_filing_approval_token,    │   │
│  │              │  │   user_has_organization_access, etc) │   │
│  └──────────────┘  └────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Edge Functions (40 functions)                         │   │
│  │                                                       │   │
│  │  Integrations:        Background:     Submissions:    │   │
│  │  ├─ gmail-auth        ├─ workflow-tick ├─ ch-submit    │   │
│  │  ├─ gmail-callback    ├─ process-auto  ├─ rti-submit   │   │
│  │  ├─ gmail-send        ├─ process-email ├─ cis-submit   │   │
│  │  ├─ gmail-sync        ├─ sla-check     ├─ hmrc-vat-sub │   │
│  │  ├─ gmail-exchange    ├─ session-clean  ├─ hmrc-ct-sub  │   │
│  │  ├─ outlook-*         │                ├─ hmrc-ct-poll │   │
│  │  ├─ truelayer-*       Payments:        ├─ hmrc-ct-del  │   │
│  │  ├─ hmrc-auth         ├─ stripe-webhook│                │   │
│  │  ├─ hmrc-callback     ├─ stripe-checkout                │   │
│  │  ├─ companies-house-* ├─ stripe-connect-*               │   │
│  │  │                    ├─ customer-portal                 │   │
│  │  │                    ├─ check-subscription              │   │
│  │  Utility:                                                │   │
│  │  ├─ send-email        ├─ fx-rates                       │   │
│  │  ├─ send-engagement   ├─ generate-filing-pdf            │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌───────────┐                                               │
│  │ Storage   │ Buckets: onboarding-documents,                │
│  │           │ job-documents, receipts, avatars               │
│  └───────────┘                                               │
└─────────────────────────────────────────────────────────────┘
        │               │              │
        ▼               ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌──────────────┐
│   Stripe    │ │    HMRC     │ │ Companies    │
│ Payments,   │ │ SA, VAT,    │ │ House        │
│ Connect,    │ │ CT, RTI,    │ │ Filings,     │
│ Webhooks    │ │ CIS         │ │ Officer Sync │
└─────────────┘ └─────────────┘ └──────────────┘
┌─────────────┐ ┌─────────────┐ ┌──────────────┐
│ TrueLayer   │ │   Gmail     │ │   Outlook    │
│ Bank feeds  │ │   OAuth     │ │   OAuth      │
│ Transactions│ │   Sync/Send │ │   Sync/Send  │
└─────────────┘ └─────────────┘ └──────────────┘
┌─────────────┐
│  Postmark   │
│  Email      │
│  Delivery   │
└─────────────┘
```

### Data Flow

1. **Frontend → Database:** All reads/writes go through `@supabase/supabase-js` client. RLS policies enforce tenant isolation. The client uses the anon key; user JWT provides identity.

2. **Frontend → Edge Functions:** Called via `supabase.functions.invoke()`. JWT is automatically forwarded. Functions use service role key for admin operations.

3. **Edge Functions → External APIs:**
   - HMRC: OAuth2 flow via `hmrc-auth`/`hmrc-callback`. XML submission for SA/CT/RTI/CIS. REST for VAT MTD.
   - Companies House: REST API for officer sync, CS01 filing via XML.
   - Stripe: Webhooks received at `stripe-webhook`. Checkout sessions created by `stripe-checkout`. Connect onboarding via `stripe-connect-onboard`.
   - TrueLayer: OAuth2 for bank connections. Transaction sync via `truelayer-sync`.
   - Gmail/Outlook: OAuth2 for mailbox connection. Sync via `gmail-sync`/`outlook-sync`. Send via `gmail-send`/`outlook-send`.
   - Postmark: Direct API calls from `send-email` and `process-email-queue`.

### Auth Boundaries

| Boundary | Mechanism |
|---|---|
| Accountant vs other orgs | `organization_users` table + `user_has_organization_access(org_id)` RLS function |
| Client vs accountant | `portal_access` table + `client_has_portal_access(user_id, client_id, company_id)` RLS function |
| Role-based within org | `organization_users.role` column + `user_has_role_at_least(uid, org_id, role)` DB function |
| Public questionnaire access | `questionnaire_public_links` with hashed tokens, no auth required |
| Filing approval tokens | Time-limited `approval_token` on `filings` table |

---

## 2️⃣ DATABASE SCHEMA — TABLE-BY-TABLE BREAKDOWN

### Domain Groupings (177 tables total)

The database is organized into 13 domains:

#### A. Organization & Auth (8 tables)

**`organizations`** — Core tenant record.
- Columns: id (uuid PK), name (text), logo_url, address_line_1/2, city, postcode, country (default 'UK'), stripe_customer_id, stripe_subscription_id, stripe_connect_account_id, billing_status (enum: pending_payment, active, etc.), onboarding_completed (bool), setup_dismissed (bool), timezone, email_domain, firm_code, practice_description, payment_required_before_onboarding, vat_reconciliation_tolerance, is_public_listed, pending_checkout_session_id, created_at, updated_at.
- RLS: SELECT via `user_has_organization_access(id)`. UPDATE restricted to owner/admin roles. INSERT allowed for any authenticated user (org creation during signup).
- Populated by: Onboarding wizard, settings page.
- Dependents: Every other table references this. Removing it breaks everything.

**`organization_users`** — Maps users to organizations with roles.
- Columns: id, user_id (uuid FK → auth.users), organization_id (uuid FK → organizations), role (text: owner/admin/manager/staff/viewer), created_at, updated_at.
- RLS: Multiple RESTRICTIVE policies. INSERT requires owner/admin or self-insert (during signup). SELECT via `user_in_organization()`.
- Critical: This is the primary tenant isolation mechanism. Every RLS policy ultimately chains through this table.

**`organization_billing`** — Restricted billing data (separated from organizations for security).
- Columns: organization_id (PK FK), stripe_customer_id, stripe_subscription_id, stripe_connect_account_id, billing_status, pending_checkout_session_id, created_at, updated_at.

**`organization_branding`** — Practice branding for invoices, portal, emails.
- Columns: organization_id (PK), trading_name, legal_name, phone, website, vat_number, company_registration_number, address fields, logo_light_url, logo_dark_url, accent_color, invoice_footer_notes, email_footer_html, portal_theme (jsonb).

**`org_settings`** — Practice-wide configuration.
- Columns: organization_id (PK), automation_max_actions_per_rule_hour/day, automation_max_actions_org_hour/day, invoice/bill_number_next/prefix/padding, email_default_mode, shared_mailbox_enabled, business_hours_start/end, business_days, deadline_buffer_days_vat/sa/ct, sla_email/portal/internal/task_response_hours, automation_rule_management_mode.

**`organization_settings`** — Generic key-value settings store.
- Columns: id, organization_id, setting_key (text), setting_value (jsonb), created_at, updated_at.

**`team_invitations`** — Pending team member invites.
- Columns: id, organization_id, email, role, invited_by, invited_at, expires_at (7 days), accepted_at.
- RLS: INSERT/DELETE restricted to owner/admin. SELECT for org members.

**`user_sessions`** — Active session tracking for security.
- Columns: id, user_id, organization_id, session_token, ip_address, user_agent, device_info (jsonb), created_at, last_activity_at, expires_at, invalidated_at, invalidated_reason.

#### B. CRM & Leads (4 tables)

**`leads`** — Sales pipeline.
- Columns: id, organization_id, first_name, last_name, email, phone, source, pipeline_stage (text: new, qualified, proposal_sent, chasing, won, lost), lead_type (text: limited_company, sole_trader, etc.), estimated_monthly_value, tags (jsonb), assigned_to, notes, lost_reason, ch_company_profile (jsonb from Companies House lookup), qualified_at, proposal_sent_at, chasing_started_at, won_at, lost_at, converted_at.
- Status machine: new → qualified → proposal_sent → chasing → won → (converted) | lost
- Populated by: CRM page, lead import.
- Conversion: `lead-conversion-service.ts` creates client/company records.

**`lead_activities`** — CRM activity log (calls, emails, notes).
- Columns: id, organization_id, lead_id, activity_type, description, created_by, created_at.

**`quotes`** — Proposals/quotes sent to leads.
- Columns: id, organization_id, lead_id, client_id, company_id, quote_number, issue_date, valid_until, total_amount, total_recurring, currency, status (draft, sent, accepted, rejected, expired), accepted_at, notes, created_at, updated_at.

**`quote_lines`** — Line items on quotes.
- Columns: id, organization_id, quote_id, service_id (FK → services_catalog), description_override, quantity, unit_price, subtotal, billing_frequency (now, monthly, quarterly, annually), line_order.

#### C. Onboarding & Client Management (12 tables)

**`onboarding_applications`** — Client/company onboarding workflow.
- Columns: id, organization_id, lead_id, quote_id, application_type, status (pending, in_progress, aml_pending, contracts_sent, contracts_signed, approved, rejected), first_name, last_name, email, phone, national_insurance_number, company_name, company_number, vat_number, address fields, date_of_birth, incorporation_date, id_document_uploaded, proof_of_address_uploaded, additional_documents_uploaded, aml_status, aml_notes, aml_verified_at, aml_submitted_at, aml_expiry_date, contracts_sent_at, contracts_signed_at, signature_data (jsonb), documents_requested_at, previous_accountant_required, previous_accountant_firm_name/email, clearance_received, clearance_received_at, clearance_notes, client_id, company_id, approved_at, approved_by, onboarding_questionnaire_instance_id, questionnaire_submitted_at, rejection_reason, aml_documents_migrated.

**`onboarding_documents`** — Documents uploaded during onboarding (ID, proof of address).
- Columns: id, organization_id, onboarding_application_id, document_type, file_name, file_path, status, uploaded_at, verified_at, verified_by, notes.

**`engagement_letters`** — E-signature engagement letters.
- Columns: id, organization_id, onboarding_application_id, template_id, content (jsonb), status (draft, sent, viewed, signed, expired), sent_at, viewed_at, signed_at, signature_data (jsonb), signature_ip, user_agent, token, token_expires_at.

**`clients`** — Individual client records.
- Columns: id, organization_id, first_name, last_name, preferred_name, email, phone, mobile_number, address fields, date_of_birth, national_insurance_number, nino, utr, client_type (sole_trader, sa_mtd, partnership, cgt, other), status (pending, active, disengaged, archived), tags (jsonb), activated_at, disengaged_at, archived_at, aml_verified_at, aml_expiry_date, aml_verified_by, notes.

**`companies`** — Company/entity records.
- Columns: id, organization_id, company_name, company_number, email, phone, address fields, company_type, vat_number, vat_scheme, vat_frequency, utr, auth_code, companies_house_auth_code, ch_personal_code, incorporation_date, year_end_month, year_end_day, vat_stagger_group, trading_status, status (pending, active, disengaged, archived), tags, registered_office_address (jsonb), trading_address (jsonb), sic_codes (jsonb), ch_company_profile (jsonb), ch_last_synced_at, confirmation_statement_made_up_to, confirmation_statement_next_due, partner_in_charge, staff_in_charge, director_nationality, internal_reference, activated_at, disengaged_at, archived_at, aml_verified_at, aml_expiry_date, aml_verified_by, notes.

**`client_detail_sa`** — Self Assessment-specific fields.
- Columns: id, client_id, organization_id, is_mtd, mtd_quarters (jsonb), mtd_final_declaration_deadline, payment_on_account_jan/jul, refund_expected.

**`client_detail_partnership`** — Partnership-specific fields.
- Columns: id, client_id, organization_id, partnership details.

**`client_detail_cgt`** — Capital Gains Tax-specific fields.
- Columns: id, client_id, organization_id, cgt_number, home_address (jsonb), property_address (jsonb), disposal_date.

**`client_detail_charity`** — Charity-specific fields.
- Columns: id, client_id, organization_id, charity_number, charity_status, trading_as, charity_year_end, gift_aid_claim_expiry.

**`contacts`** — Additional contacts for clients/companies.
- Columns: id, organization_id, client_id, company_id, name, email, phone, role, is_primary, can_sign.

**`accountant_client_links`** — Links between practices and clients (for multi-practice support).
- Columns: id, practice_id, client_id, company_id, client_user_id, status (enum), initiated_by (enum), activated_at, ended_at, decline_reason, notes.

**`pending_practice_signups`** — Clients seeking to connect to a practice.
- Columns: id, accountant_email, proposed_practice_name, client_id, company_id, status, created_at, completed_at.

#### D. Services & Engagements (3 tables)

**`services_catalog`** — Service definitions (Corporation Tax, VAT, Payroll, etc.).
- Columns: id, organization_id, code, name, description, default_price, billing_model, is_bookkeeping_related, active, is_recurring, trigger_date_type, trigger_date_offset_days, information_request_template_id, default_job_template_id, records_request_template_id, workpaper_template_id.

**`client_services`** — Services assigned to a client/company.
- Columns: id, organization_id, client_id, company_id, service_id, custom_price, status, billing_frequency, notes, engagement_start, period_start, period_end, next_billing_date.

**`engagements`** — Active engagement records (not fully exposed in UI, used by automation).

#### E. Jobs & Tasks (8 tables)

**`jobs`** — Core work items.
- Columns: id, organization_id, client_id, company_id, job_name, service_type, status (not_started, in_progress, info_requested, info_received, ready_for_review, under_review, awaiting_approval, completed), priority, period_start/end, period_label, assigned_to, filing_deadline, internal_target_date, tags, progress, template_id, source_template_id, template_version, is_recurring, recurrence_rule, workpaper_instance_id, is_auto_generated, source_job_id, auto_generated_at, can_undo_until, automation_source, generation_reason, info_requested_at, info_received_at, completed_at, last_activity_at.
- Status machine: not_started → in_progress → info_requested ↔ info_received → ready_for_review → under_review → awaiting_approval → completed

**`job_tasks`** — Checklist items within jobs.
- Columns: id, organization_id, job_id, title, description, status, assigned_to, due_date, completed_at, task_order, is_required.

**`job_documents`** — Files attached to jobs.
- Columns: id, organization_id, job_id, task_id, file_name, file_path, mime_type, file_size, tags (jsonb), uploaded_by, uploaded_at, version, client_visible, signature_required, signed_at, signed_by, signature_typed_name, signature_ip, scroll_verified, auto_archive_at, archived, archived_at.

**`job_timeline`** — Activity feed for jobs.
- Columns: id, organization_id, job_id, task_id, event_type, event_data (jsonb), user_id, created_at.

**`job_artifacts`** — Generated artifacts (iXBRL, PDFs, XML submissions).
- Columns: id, organization_id, client_id, company_id, job_id, artifact_type, title, period_label, status, source_document_id, source_questionnaire_id, version, metadata (jsonb), locked_at, locked_by, created_by, created_at, updated_at.

**`job_templates`** — Reusable job templates.
- Columns: id, organization_id, template_name, service_type, description, default_status, default_priority, frequency, trigger_type, default_tasks_json (jsonb), deadline_offset_days, internal_target_offset_days, workpaper_template_id, questionnaire_template_id, records_requests_template (jsonb), entity_filters (jsonb), skip_if_no_activity, auto_close_if_no_work, ui_category.

**`job_questionnaire_instances`** — Links jobs to questionnaire instances.

**`client_tasks`** — Portal-visible tasks for clients.
- Columns: id, organization_id, client_id, company_id, title, description, status, visibility, due_date.

#### F. Bookkeeping & Ledger (20 tables)

**`bookkeeping_accounts`** — Chart of Accounts.
- Columns: id, organization_id, client_id, company_id, code, name, account_type (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE), account_subtype, is_bank_account, is_control_account, is_system_account, is_revenue_account, is_active, tax_mapping (jsonb), tax_allowability, ct_addback_category, vat_treatment.

**`journals`** — Journal entries (posted double-entry transactions).
- Columns: id, organization_id, client_id, company_id, journal_date, reference, description, journal_type (MANUAL, SYSTEM), total_debit, total_credit, transaction_currency, fx_rate_to_base, is_posted, posted_at, created_by, is_reversed, reverses_journal_id, reverse_date, reversal_date.
- RLS: Multiple policies. `journals_no_direct_insert/update/delete` (set to `false`) exist alongside role-based policies, creating a **conflicting RLS situation** (see Section 10 Failure Modes).

**`journal_lines`** — Individual lines within journals.
- Columns: id, journal_id, line_number, account_id, debit, credit, description, vat_code_id.

**`ledger_entries`** — Materialized ledger (denormalized from journal lines for querying).
- Columns: id, organization_id, client_id, company_id, entry_date, transaction_date, account_id, debit, credit, description, reference, vat_code_id, journal_id, source_type, source_id, transaction_currency, transaction_debit, transaction_credit, fx_rate_to_base, base_currency.

**`invoices`** — Sales invoices.
- Columns: id, organization_id, client_id, company_id, customer_id, invoice_type (SALES), contact_name, contact_email, invoice_number, reference, issue_date, due_date, currency, exchange_rate, status (DRAFT, AWAITING_PAYMENT, PART_PAID, PAID, VOIDED, OVERDUE), is_posted, posted_at, posted_by, total_net, total_vat, total_gross, amount_paid, remaining_balance, notes, locked_fields, override_history.

**`invoice_lines`** — Line items on invoices.

**`invoice_payments`** — Payment records against invoices.

**`bills`** — Purchase bills/expenses.
- Status: DRAFT, APPROVED, AWAITING_PAYMENT, PART_PAID, PAID, VOIDED.
- Has approved_at/approved_by, voided_at/voided_by, void_reason, receipt_path, locked_fields, override_history.

**`bill_lines`** — Line items on bills.

**`bill_payments`** — Payment records against bills.

**`credit_notes`** — Credit notes (sales and purchase).

**`credit_note_lines`** — Line items on credit notes.

**`credit_note_allocations`** — Credit note allocations against invoices/bills.

**`suppliers`** — Supplier/vendor records.

**`customers`** — Customer records for invoicing.

**`vat_codes`** — VAT code definitions with HMRC box mappings.
- Columns: id, organization_id, client_id, company_id, code, description, vat_type, rate, scheme_type, is_active, hmrc_box_mapping (jsonb), net_included_in_boxes (int[]), vat_included_in_boxes (int[]), is_reclaimable, reverse_charge, partial_exemption_applicable, is_common, jurisdiction, supply_category.

**`period_locks`** — Accounting period locks preventing changes.
- Columns: id, organization_id, client_id, company_id, lock_date, locked_by, locked_at, reason.
- RLS: Only owner/admin can manage locks.

**`bank_accounts`** — Bank account records linked to bookkeeping accounts.

**`bank_transactions`** — Individual bank transactions (from TrueLayer or manual import).

**`bank_connections`** — OAuth connections to bank providers (TrueLayer).

**`bank_rules`** — Auto-categorization rules for bank transactions.

**`bank_rule_executions`** — Audit trail of rule executions.

**`matching_candidates`** — Payment matching candidates (bank tx → invoice/bill).

**`categorization_rules`** — Auto-categorization rules for transaction descriptions.

**`reconciliations`** — Bank reconciliation sessions.

**`reconciliation_lines`** — Individual reconciliation line items.

**`receipts`** — Uploaded receipt images with OCR metadata.

**`fx_rates`** — Foreign exchange rates (populated by `fx-rates` edge function).

#### G. VAT (5 tables)

**`vat_registrations`** — VAT registration details per entity.
- Columns: id, organization_id, company_id, client_id, vrn, scheme (STANDARD, FLAT_RATE, CASH), flat_rate_percentage, flat_rate_first_year_discount, flat_rate_trade_sector, cash_scheme_joined_at, cash_scheme_threshold, annual_accounting_joined_at, annual_accounting_payment_schedule, partial_exemption_applicable, partial_exemption_rate, partial_exemption_method, effective_from, effective_to, notes.

**`vat_periods`** — VAT return periods with computed box values.
- Columns: id, organization_id, company_id, client_id, vrn, period_start/end, period_key, vat_scheme, status (OPEN, DRAFT, FINALISED, SUBMITTED), scheme_parameters (jsonb), computed_box1-9, control_account_balance, reconciliation_difference, reconciliation_status, cash_accounting_enabled, cash_excluded_vat, cash_included_vat, vat_registration_id, flat_rate_percentage/category, partial_exemption fields, finalised_at/by, filing_id, workpaper_instance_id.

**`vat_period_lines`** — Individual transaction-level VAT breakdown per period.

**`vat_transaction_links`** — Links VAT period lines to source transactions.

**`vat_returns`** — Submitted VAT returns with HMRC receipt.

#### H. Filings & Submissions (10 tables)

**`filings`** — Central filing record.
- Columns: id, organization_id, job_id, workpaper_instance_id, client_id, company_id, filing_type, filing_body, tax_year, period_start/end, status (draft, in_progress, ready_for_review, sent_to_client, client_changes_requested, awaiting_approval, approved, ready_to_file, submitted, accepted, filed, rejected), filing_data (jsonb), draft_schedule_data_json (jsonb — SSOT for current draft), generated_documents, tax_due, tax_refund, payment_deadline, second_payment_date, approval_requested_at, approved_at, approved_by, approval_token, approval_token_expires_at, filed_at, filed_by, filing_receipt, filing_reference, is_locked, locked_at, locked_by, submission_payload, api_response, api_submission_id, environment, hmrc_correlation_id, ch_transaction_id, model_snapshot_id, accounts_snapshot_id, ct_snapshot_id, accounts_approval_id, ct_approval_id, current_snapshot_id, current_version, idempotency_key, error_code, error_detail, last_submission_error, retry_count, next_retry_at, poll_count, last_poll_at, vrn, is_amendment, original_filing_id, amendment_reason, next_year_job_id, obligation_id, partnership_allocation_id.

**`filing_model_snapshots`** — Immutable snapshots of filing data at lock time.
- Columns: id, filing_id, organization_id, version_number, snapshot_hash, schedule_data_json (jsonb), trial_balance_snapshot (jsonb), coa_mapping_snapshot (jsonb), metadata, created_at, created_by, locked_at, locked_by, lock_reason.

**`filing_approvals`** — Scoped approval records (accounts, CT computation, overall).

**`filing_artefacts`** — Generated iXBRL, XML, PDF content.
- Columns: id, organization_id, filing_id, artefact_type, content (text — the full iXBRL/XML), content_hash, taxonomy_version, generator_version.

**`filing_payload_artifacts`** — Submission payloads with SHA256 hash for audit.

**`filing_documents`** — Documents attached to filings.

**`filing_events`** — Filing lifecycle events (status changes).

**`filing_provider_events`** — Raw API interaction log with HMRC/CH.

**`filing_validations`** — Pre-submission validation results.

**`filing_queue`** — Queued filings with retry logic (attempts, max_attempts, idempotency_key, snapshot_hash).

**`approval_revocation_log`** — When filing data changes after approval, the approval is revoked and logged here.

#### I. Accounts Production (4 tables)

**`accounts_model_snapshots`** — FRS105 balance sheet snapshots.
- Columns: id, organization_id, company_id, workpaper_instance_id, period_start/end, balance_sheet (jsonb), notes (jsonb), director_approval (jsonb), snapshot_hash, taxonomy_version, generator_version, status (draft, approved), approved_by, approved_at.

**`ct_computation_snapshots`** — Corporation Tax computation snapshots.
- Columns: id, organization_id, company_id, accounts_snapshot_id, cap_period_id, period_start/end, accounting_profit, add_backs (jsonb), deductions (jsonb), total_capital_allowances, balancing_charges, taxable_total_profits, corporation_tax_rate, marginal_relief, marginal_relief_fraction, marginal_relief_amount, corporation_tax_due, associated_companies_count, adjusted_lower/upper_limit, short_period_factor, pools_summary (jsonb), claims_summary (jsonb), snapshot_hash, generator_version, status.

**`trial_balance_snapshots`** — Point-in-time TB captures.
- Columns: id, organization_id, client_id, company_id, job_id, period_start/end, source_type (native, xero, quickbooks, sage, freeagent, manual_import, manual), balances (jsonb array), total_debit, total_credit, is_balanced, status (draft, finalised), locked, finalised_at, finalised_by, notes, metadata.

**`tb_account_mappings`** — Maps TB account codes to workpaper categories.

#### J. Workpapers (5 tables)

**`workpaper_templates`** — Schema definitions for workpapers by job type.
- Columns: id, organization_id, job_type, name, description, schema_json (jsonb containing sections/fields), is_default, is_system, version, is_active.

**`workpaper_instances`** — Instantiated workpapers for specific jobs.
- Columns: id, organization_id, job_id, client_id, company_id, template_id, name, service_type, period_label, status (draft, in_progress, finalised), field_values (jsonb — the actual data), field_overrides (jsonb), field_notes (jsonb), source_data (jsonb), computed_data (jsonb), data_source, source_type, trial_balance_snapshot_id, questionnaire_instance_id, period_start/end, prepared_by/at, reviewed_by/at, finalised_at/by, locked, owner_user_id, last_data_sync_at.

**`workpaper_category_mappings`** — Maps account codes to workpaper categories for auto-population.

**`workpaper_from_tb_mappings`** — Direct TB → workpaper field mappings (for the `workpaper-from-tb.ts` auto-populator).

#### K. Payroll & CIS (9 tables)

**`paye_schemes`** — PAYE scheme registrations.
- Columns: id, organization_id, company_id, client_id, employer_paye_reference, accounts_office_reference, name, default_pay_frequency, default_pay_day, default_pay_day_of_week, tax_year_start, rti_test_mode, rti_sender_id, rti_password_hash, is_active.

**`employees`** — Employee records with full HMRC-compliant fields.
- 50+ columns covering personal details, address, tax code, NIC category, student loan plan, bank details, pension, P45 data, directorship.

**`payslips`** — Individual payslip calculations.
- 40+ columns covering every pay component (basic, overtime, bonus, statutory pay, deductions, NIC, pension, student loan) plus YTD cumulative values and calculation_breakdown (jsonb).

**`pay_runs`** — Batch payroll processing.
- Columns: id, organization_id, paye_scheme_id, tax_year, pay_frequency, tax_period, period_start/end, payment_date, status (draft, calculated, approved, submitted), totals for all components, employee_count, prepared_by/at, approved_by/at, fps_filing_id, journal_id.

**`pension_schemes`** — Workplace pension scheme configuration.

**`employee_absences`** — Absence records for statutory pay calculations.

**`employee_benefits`** — Benefits in kind records.

**`rti_submissions`** — RTI filing records (FPS/EPS).

**`cis_contractors`** / **`cis_subcontractors`** / **`cis_payments`** / **`cis_returns`** — Construction Industry Scheme records.

#### L. Capital Allowances & Fixed Assets (4 tables)

**`fixed_assets`** — Asset register.
- Columns: id, organization_id, company_id, asset_name, asset_category, acquisition_date, brought_into_use_date, disposal_date, cost, disposal_proceeds, is_car, car_co2_g_km, car_list_price, car_is_electric, business_use_percentage, default_pool_type (MAIN, SPECIAL, FYA, ZERO_EMISSION), supplier, invoice_reference, attachment_path, notes.

**`capital_allowance_periods`** — CA computation periods.

**`capital_allowance_pools`** — Pool balances (Main, Special, FYA).

**`capital_allowance_claims`** — Individual CA claims (AIA, WDA, FYA, Full Expensing, Balancing).

#### M. Tax Rate Tables (3 tables)

**`sa_rate_tables`** — Self Assessment tax rates by year (income tax bands, NIC rates, student loan thresholds).

**`ct_rate_tables`** — Corporation Tax rates (main rate, small profits rate, limits, marginal relief fraction).

**`ca_rate_tables`** — Capital Allowance rates (AIA limit, WDA rates, car emission thresholds, full expensing).

All rate tables are readable by any authenticated user (RLS: `true` for SELECT).

#### N. Email & Notifications (8 tables)

**`connected_mailboxes`** — OAuth-connected email accounts (Gmail/Outlook).
- Columns: id, organization_id, user_id, provider, email_address, display_name, access_token, refresh_token, token_expires_at, status, sync_state, last_synced_at, is_shared.

**`email_messages`** — Synced email messages.
- Full text search via `search_vector` tsvector column.

**`email_threads`** — Email conversation threads.

**`email_attachments`** — Email file attachments.

**`email_push_subscriptions`** — Webhook subscriptions for real-time email sync.

**`email_queue`** — Outbound email queue processed by `process-email-queue`.
- Status: queued, pending, sent, failed, acknowledged.
- RLS: INSERT/UPDATE/DELETE restricted to RPC context (`is_rpc_context()`).

**`message_entity_links`** — Links email/messages to entities (clients, jobs).

**`notifications`** — In-app notifications.

**`client_messages`** — Portal messaging between accountant and client.
- RLS: Portal clients can only see `client_visible` messages. Accountants see all within org.

#### O. Templates & Questionnaires (8 tables)

**`templates`** — Multi-purpose templates (email, engagement letter, job).
- Columns: id, organization_id, name, type, service, description, content (jsonb), status, version_number, tags, created_by.
- RLS: Global templates (org_id IS NULL) readable by all. Org templates require membership. Create/update/delete requires owner/admin.

**`template_versions`** — Version history for templates.

**`template_merge_fields`** — Available merge field definitions.

**`message_templates`** — Email/notification message templates with variables schema.

**`questionnaire_instances`** — Instantiated questionnaires sent to clients.
- Columns: id, organization_id, template_id, client_id, company_id, job_id, task_id, questions (jsonb), period_start/end, sent_at, started_at, submitted_at, reviewed_at, reviewed_by, status.

**`questionnaire_responses`** — Individual question answers.

**`questionnaire_public_links`** — Public access tokens for questionnaires.
- token_hash (hashed for security), expires_at, revoked_at.

**`questionnaire_access_log`** — Audit trail of public link access.

#### P. Automation Engine (10 tables)

**`automation_trigger_contracts`** — Immutable trigger definitions.
- Columns: id, key (unique: JOB_STATUS_CHANGED, DEADLINE_APPROACHING, CLIENT_CREATED, etc.), name, description, payload_schema (jsonb), is_active.
- RLS: Readable by all authenticated users. Cannot be modified by practices.

**`automation_workflow_templates`** — Multi-step workflow definitions.
- Columns: id, key, name, description, org_id (null=global), library_set_id, service_type, applies_to_client_types, default_enabled.

**`automation_workflow_steps`** — Steps within workflow templates.
- Columns: id, template_id, step_key, step_type (SEND_EMAIL, CREATE_JOB, CREATE_TASK, SEND_NOTIFICATION, WAIT_UNTIL, WAIT_FOR_EVENT, SET_SLA_TIMER, UPDATE_STATUS, CONDITION), step_order, config (jsonb), is_blocking, is_optional.

**`automation_workflow_trigger_map`** — Links triggers to templates with filter conditions.
- Columns: id, workflow_template_id, trigger_contract_id, filter_config (jsonb — AND logic).

**`automation_org_overrides`** — Per-org customization of workflows.
- Columns: id, org_id, template_id, enabled, timing_overrides (jsonb), message_template_overrides (jsonb), channel_overrides (jsonb), assignment_overrides (jsonb), optional_step_toggles (jsonb).

**`automation_workflow_instances`** — Running workflow instances.
- Columns: id, org_id, template_id, client_id, company_id, service_id, period_key, status (QUEUED, running, waiting, completed, failed, cancelled), current_step_id, next_run_at, waiting_for_event_key, context (jsonb), triggering_event_key, triggering_event_id, error_message.
- Idempotency: Unique constraint on (template_id, org_id, client_id, company_id, period_key) prevents duplicate instances.

**`automation_workflow_events`** — Step execution log.
- Columns: id, instance_id, org_id, step_id, event_type (instance_created, step_completed, step_failed, condition_gate_skipped, event_received, instance_completed, instance_cancelled), payload (jsonb).

**`automation_library_sets`** — Versioned sets of workflow templates.

**`automation_events`** — Legacy automation event queue.

**`automation_rules`** — Legacy per-org automation rules.

**`automation_executions`** — Legacy automation execution log.

**`automation_rule_templates`** — Legacy rule templates.

**`automation_rate_limits`** — Rate limiting for automation actions.

#### Q. Company Secretary (CoSec) (7 tables)

**`company_persons`** — Natural persons associated with companies.
**`company_officers`** — Director/secretary appointments.
**`company_pscs`** — Persons with Significant Control.
**`company_share_classes`** — Share class definitions.
**`company_shareholders`** — Shareholding records.
**`company_share_allotments`** — Share allotment events.
**`company_share_transfers`** — Share transfer records.
**`company_register_events`** — Statutory register event log.

#### R. Crypto & CGT (3 tables)

**`crypto_transactions`** — Crypto buy/sell/swap/transfer records.
**`crypto_token_pools`** — Section 104 pool tracking.
**`crypto_disposals`** — CGT disposal calculations.

#### S. SLA & Compliance (3 tables)

**`sla_definitions`** — SLA timer definitions.
**`sla_instances`** — Active SLA timers with breach tracking.
**`api_rate_limits`** — API rate limiting records.

#### T. Portal (3 tables)

**`portal_access`** — Portal user → entity access mapping.
- Constraint: Exactly one of client_id or company_id must be non-null.
- RLS: `client_has_portal_access(user_id, client_id, company_id)` function.

**`portal_visibility_settings`** — What data clients can see (revenue, net profit, cash balance, etc.).

**`user_roles`** — Portal role assignments.

#### U. HMRC & Auth States (4 tables)

**`hmrc_authorisations`** — HMRC agent authorisations per client.
**`hmrc_auth_states`** — OAuth2 state tokens for HMRC flow.
**`gmail_auth_states`** — OAuth2 state tokens for Gmail.
**`outlook_auth_states`** — OAuth2 state tokens for Outlook.
**`truelayer_auth_states`** — OAuth2 state tokens for TrueLayer.
**`external_credentials`** — Generic credential store for integrations.

#### V. Partnership (1 table)

**`partnership_allocations`** — Partner profit share allocations.
- Columns: id, organization_id, filing_id, partner_name, partner_client_id, allocation_method, percentage, fixed_amount, special_allocation_json (jsonb), computed_profit_share, computed_tax_adjustments.

---

## 3️⃣ DATA SPINE: CANONICAL DATA MODEL

### Source of Truth Declarations

| Domain Object | Authoritative Source | Derived Representations |
|---|---|---|
| Client identity | `clients` table | `onboarding_applications` (pre-conversion), `portal_access` (derived access) |
| Company identity | `companies` table | `onboarding_applications` (pre-conversion) |
| Financial transactions | `ledger_entries` table | `trial_balance_snapshots` (point-in-time), `vat_periods` (aggregated) |
| Chart of Accounts | `bookkeeping_accounts` table | `tb_account_mappings`, `workpaper_category_mappings` |
| Invoice amounts | `invoices` + `invoice_lines` | `ledger_entries` (posted copy), `journals` (posted copy) |
| Bill amounts | `bills` + `bill_lines` | `ledger_entries` (posted copy) |
| Workpaper data (draft) | `workpaper_instances.field_values` | None — this IS the live draft |
| Filing data (draft) | `filings.draft_schedule_data_json` | `filing_model_snapshots` (frozen at lock) |
| Filing data (submitted) | `filing_model_snapshots` | `filing_artefacts` (rendered iXBRL/XML) |
| FRS105 accounts | `accounts_model_snapshots` | `filing_artefacts` (rendered iXBRL) |
| CT computation | `ct_computation_snapshots` | `filings.filing_data` (merged) |
| Tax rates | `sa_rate_tables`, `ct_rate_tables`, `ca_rate_tables` | In-memory calculation engines |
| Workflow state | `automation_workflow_instances` | `automation_workflow_events` (audit log) |
| Email content | `email_messages` (synced from provider) | `message_entity_links` (indexed) |

### Data Propagation: Ledger → Workpapers → Accounts → iXBRL

```
Ledger Entries
    │
    ▼ (trial-balance-service.ts: createSnapshotFromNativeLedger)
Trial Balance Snapshot
    │
    ▼ (workpaper-from-tb.ts: auto-populate workpaper fields)
Workpaper Instance (field_values)
    │
    ▼ (frs105-accounts-model.ts: mapTrialBalanceToFRS105)
FRS105 Accounts Model (balance_sheet + disclosures)
    │
    ▼ (accounts-model-mapper.ts → saveFRS105AccountsSnapshot)
Accounts Model Snapshot (immutable, SHA-256 hashed)
    │
    ▼ (ixbrl-generator.ts: generateFRS105iXBRL)
iXBRL HTML Document
    │
    ▼ (stored in filing_artefacts.content)
Filing Artefact
```

### Data Propagation: Jobs → Filings

```
Job (status: not_started)
    │
    ▼ (user creates workpaper via job detail page)
Workpaper Instance
    │
    ▼ (filing-service.ts: createFilingFromWorkpaper)
Filing (status: draft)
    │
    ▼ (user finalizes → filing-snapshot-service creates immutable snapshot)
Filing Model Snapshot
    │
    ▼ (user sends for approval → filing-service.ts: sendFilingForApproval)
Filing (status: awaiting_approval)
    │
    ▼ (client approves via token link)
Filing (status: ready_to_file)
    │
    ▼ (accountant submits → edge function hmrc-vat-submit/hmrc-ct-submit/ch-submit)
Filing (status: submitted → accepted/rejected)
    │
    ▼ (auto-rollover-service.ts: executeAutoRollover creates next year's job)
Next Year Job
```

### Validation Layers

| Layer | Location | What it validates |
|---|---|---|
| TB balance check | `trial-balance-service.ts: validateTBBalances` | Total debits = total credits (±0.01) |
| Ledger posting balance | `posting-service.ts: validateBalance` | DR = CR before posting |
| Period lock check | `posting-service.ts: isPeriodLocked` | Transaction date not in locked period |
| FRS105 balance sheet | `frs105-accounts-model.ts: validateFRS105BalanceSheet` | Net assets = total equity |
| iXBRL disclosure gate | `ixbrl-generator.ts: generateFRS105iXBRL` | Hard-fails if any required disclosure is `required_missing` |
| Filing pre-submission | `filing-validations` table | Filing type-specific validation rules |
| Invoice status guard | `invoice-service.ts: updateDraftInvoice` | Only DRAFT invoices can be edited |
| Formula safety | `formula-evaluator.ts` | Uses math.js sandbox (prevents RCE via eval) |
| HTML sanitization | `sanitizeHtml.ts` | DOMPurify for email rendering |

### Where Human Input Is Allowed vs Blocked

| Data | Human Input | Blocked |
|---|---|---|
| Workpaper field_values | ✅ Editable during draft | ❌ After finalisation (locked=true) |
| Filing draft data | ✅ Via draft_schedule_data_json | ❌ After snapshot lock |
| TB snapshot balances | ✅ Manual import/edit in draft | ❌ After finalisation |
| Invoice lines | ✅ In DRAFT status | ❌ After posting (is_posted=true) |
| Tax rates | ❌ System-managed | ❌ Always read-only |
| Trigger contracts | ❌ System-managed | ❌ Practices cannot modify |

---

## 4️⃣ FEATURE-BY-FEATURE FUNCTIONAL SPECIFICATION

### 4.1 CRM (Leads Pipeline)

**Route:** `/crm`  
**Page:** `src/pages/CRM.tsx`

**User Flow:**
1. User views Kanban board of leads by pipeline_stage
2. Creates new lead (form: name, email, phone, type, source)
3. Moves leads through stages: new → qualified → proposal_sent → chasing → won → lost
4. Can look up company via Companies House (`companies-house-lookup.ts`)
5. From "won" stage, can create a Quote

**Database writes:** `leads` INSERT/UPDATE, `lead_activities` INSERT  
**Automations triggered:** None directly from CRM  
**External APIs:** Companies House REST API (for company lookup only)

### 4.2 Quotes

**Route:** `/quotes`, `/quotes/:id`  
**Pages:** `Quotes.tsx`, `QuoteDetail.tsx`

**User Flow:**
1. Create quote from lead or standalone
2. Add services from `services_catalog` as line items
3. Set billing frequency per line (one-off, monthly, quarterly, annually)
4. Send quote to client (changes status to "sent")
5. Client accepts → triggers `emitQuoteAccepted()` automation event

**Database writes:** `quotes`, `quote_lines`  
**Automations triggered:** `quote_accepted` → routes to workflow engine  

### 4.3 Onboarding & AML

**Route:** `/onboarding`, `/onboarding/:id`  
**Pages:** `Onboarding.tsx`, `OnboardingDetail.tsx`

**User Flow:**
1. Create onboarding application (from lead conversion or standalone)
2. Upload AML documents (ID, proof of address) → stored in Supabase Storage
3. Send engagement letter for e-signature
4. Client signs via token link → `engagement_letters.signed_at` set
5. AML verification by accountant
6. Approval → creates client/company record via `convertLeadToClient()`
7. Triggers `emitOnboardingApproved()` and `emitClientOnboarded()`

**Database writes:** `onboarding_applications`, `onboarding_documents`, `engagement_letters`, `clients`/`companies`, `client_detail_*`  
**External APIs:** None  
**Automations triggered:** `onboarding_approved`, `client_onboarded`

### 4.4 Bookkeeping

**Route:** `/bookkeeping`  
**Page:** `Bookkeeping.tsx`

**User Flow:**
1. Manage Chart of Accounts (`bookkeeping_accounts`)
2. Create/post journals (manual double-entry)
3. Create/issue invoices (DRAFT → AWAITING_PAYMENT via `approveInvoice()`)
4. Create/approve bills
5. Record payments (auto-creates ledger entries via `postToLedger()`)
6. Bank reconciliation (match bank transactions to invoices/bills)
7. Connect bank via TrueLayer for auto-feed

**Key Service Functions:**
- `posting-service.ts: postToLedger()` — Central posting function. Creates journal + journal_lines + ledger_entries atomically. Validates DR=CR. Checks period locks. Handles FX conversion.
- `invoice-service.ts: approveInvoice()` — Posts DR Trade Debtors / CR Sales+VAT to ledger
- `invoice-service.ts: recordInvoicePayment()` — Posts DR Bank / CR Trade Debtors
- `bills-service.ts` — Mirror of invoice service for purchase side

**Automations triggered:** `invoice_issued`, `payment_received`

### 4.5 Jobs & Deadlines

**Route:** `/jobs`, `/jobs/:jobId`, `/deadlines`  
**Pages:** `Jobs.tsx`, `JobDetail.tsx`, `Deadlines.tsx`

**User Flow:**
1. Jobs created manually, from templates, or auto-generated by automation
2. Job detail shows: tasks, documents, timeline, workpaper link, filing link
3. Status progression: not_started → in_progress → info_requested → ... → completed
4. Deadlines page shows filing/internal target dates across all jobs

**Key Services:**
- `job-template-engine.ts` — Instantiates jobs from templates with tasks
- `job-status-service.ts` — Manages status transitions with validation
- `deadline-engine.ts` — Calculates statutory deadlines based on service type and period
- `auto-rollover-service.ts` — Creates next-period job when current job completes

**Automations triggered:** `job_status_change` on every status update

### 4.6 Workpapers

**Route:** `/workpapers`  
**Page:** `Workpapers.tsx`

**User Flow:**
1. Created from job detail page, linked to a job
2. Can be questionnaire-based (client fills out) or TB-based (auto-populated from ledger)
3. Workpaper engine (`workpaper-engine.ts`) applies mappings from questionnaire responses or bookkeeping data
4. Tax calculations run in-workpaper via `tax-calculation-engine.ts`
5. Prepared/reviewed workflow (prepared_by/at, reviewed_by/at)
6. Finalisation locks the workpaper

**Key Data Flow:**
- `workpaper-from-tb.ts` — Auto-populates workpaper from trial balance snapshot
- `schema-field-engine.ts` — Renders schema-driven field sections
- `questionnaire-workpaper-service.ts` — Maps questionnaire answers to workpaper fields

### 4.7 Accounts Production & iXBRL

**Key Services:**
- `frs105-accounts-model.ts: mapTrialBalanceToFRS105()` — Maps TB balances to FRS105 balance sheet using account code prefix matching
- `frs105-accounts-model.ts: createFRS105AccountsModel()` — Builds complete model with disclosures, director approval, context definitions
- `frs105-disclosure-engine.ts` — Manages structured disclosures (average employees, directors' advances, RPTs, commitments, going concern, etc.)
- `ixbrl-generator.ts: generateFRS105iXBRL()` — Generates compliant FRS105 iXBRL HTML with inline XBRL tags, UK-GAAP taxonomy references, prior period comparatives

**iXBRL Generation Process:**
1. Hard gate: All required disclosures must be confirmed (not `required_missing`)
2. Generates XBRL contexts (current instant, duration, prior period)
3. Builds Statement of Financial Position table with tagged values
4. Appends disclosure notes with tagged fields
5. Adds director approval section
6. Output: Complete XHTML document with inline XBRL

### 4.8 Filings

**Route:** `/filings`, `/filings/:filingId`  
**Pages:** `Filings.tsx`, `FilingDetail.tsx`

**Filing Types Supported:**
- Self Assessment (SA100) — via HMRC XML API
- Corporation Tax (CT600) — via HMRC REST API (`hmrc-ct-submit`)
- VAT Return (MTD) — via HMRC REST API (`hmrc-vat-submit`)
- Annual Accounts (FRS105) — via Companies House XML API (`ch-submit`)
- Confirmation Statement (CS01) — via Companies House
- FPS/EPS (RTI) — via HMRC XML API (`rti-submit`)
- CIS Monthly Return — via HMRC XML API (`cis-submit`)

**Lifecycle:**
```
draft → in_progress → ready_for_review → sent_to_client → 
  → client_changes_requested (loop back)
  → awaiting_approval → approved/rejected → 
  → ready_to_file → submitted → accepted/rejected
```

**Key Service:** `filing-service.ts`
- `createFilingFromWorkpaper()` — Creates filing from workpaper data, extracts tax breakdown
- `sendFilingForApproval()` — Generates approval token, sends email via connected mailbox or queue
- `approveFilingByClient()` — Client approves via token link
- `submitFiling()` — Triggers appropriate edge function for submission

### 4.9 Payments (Stripe)

**Edge Functions:** `stripe-checkout`, `stripe-webhook`, `stripe-connect-onboard`, `stripe-connect-charge`, `customer-portal`, `check-subscription`

**Flows:**
1. **Practice subscription:** `stripe-checkout` creates Checkout Session → `stripe-webhook` handles `checkout.session.completed` → updates `organizations.billing_status`
2. **Stripe Connect:** Practice connects Stripe account for client invoicing → `stripe-connect-onboard` creates Connect account → `stripe-connect-charge` processes payments
3. **Webhook events handled:** checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.updated/deleted

### 4.10 Email

**Route:** `/emails`  
**Page:** `Emails.tsx`

**Flow:**
1. Connect Gmail or Outlook mailbox via OAuth
2. `gmail-sync`/`outlook-sync` pulls messages → stores in `email_messages`
3. Auto-matching links emails to clients/companies based on email address
4. Send via `gmail-send`/`outlook-send` edge functions
5. Fallback: `email_queue` → `process-email-queue` → Postmark

**Email Queue:** `process-email-queue` edge function processes pending items, calls Postmark API, updates status.

### 4.11 Banking (TrueLayer)

**Edge Functions:** `truelayer-auth`, `truelayer-callback`, `truelayer-sync`

**Flow:**
1. `truelayer-auth` redirects to TrueLayer's OAuth consent screen
2. `truelayer-callback` exchanges code for tokens → stores in `bank_connections`
3. `truelayer-sync` fetches transactions → upserts into `bank_transactions`
4. Frontend shows transactions for matching/categorization

### 4.12 Automations

**Route:** `/automations`  
**Page:** `Automations.tsx`

Two systems coexist:
1. **Legacy automation rules** (`automation_rules` + `automation_executions`) — simple trigger→action
2. **Workflow engine** (`automation_workflow_*` tables) — multi-step stateful workflows

---

## 5️⃣ WORKFLOW ENGINE — EXACT EXECUTION MODEL

### How Triggers Are Emitted

`src/lib/automation-triggers.ts: emitAutomationEvent()`:
1. Calls `supabase.rpc('emit_automation_event')` — inserts into `automation_events` table
2. Maps event type to trigger contract key (e.g., `job_status_change` → `JOB_STATUS_CHANGED`)
3. Calls `routeTriggerEvent()` from `workflow-trigger-router.ts`

### How Events Are Stored

`automation_events` table stores the raw event with entity_id, entity_type, old/new values, metadata.

### How Rules Are Matched (routeTriggerEvent)

`src/lib/workflow-trigger-router.ts: findMatchingWorkflows()`:
1. Lookup `automation_trigger_contracts` by key
2. Find all `automation_workflow_trigger_map` entries for that contract
3. Apply `filter_config` against payload context (AND logic: all conditions must match)
4. Fetch matching `automation_workflow_templates`
5. Check `automation_org_overrides` for enabled/disabled status per org
6. Skip org-specific templates that don't belong to this org
7. Return template IDs to instantiate

### How Instances Are Created

`createWorkflowInstance()`:
1. Finds first step of template (ordered by step_order)
2. Inserts `automation_workflow_instances` with status "running", current_step_id, context
3. Unique constraint prevents duplicates (template_id + org_id + client_id + company_id + period_key)
4. Logs `instance_created` event

### How Steps Are Executed

`src/lib/workflow-step-executor.ts: executeStep()`:
- **CONDITION** — Evaluates condition (e.g., JOB_STATUS_NOT_IN). If fails, returns `{skipped: true, conditionFailed: true}` → orchestrator skips to next WAIT_UNTIL or end.
- **WAIT_UNTIL** — Resolves base date from `context.anchors[anchor_key]`, applies offset_days and time_of_day. If future, pauses instance.
- **WAIT_FOR_EVENT** — Sets `waiting_for_event_key` to composite key `{event_key}:{org_id}:{client_id}:{company_id}`.
- **SEND_EMAIL** — Resolves recipient, fetches message template, queues via `email_queue`.
- **CREATE_JOB** — Creates job with `is_auto_generated: true`.
- **CREATE_TASK** — Creates `client_tasks` entry.
- **SEND_NOTIFICATION** — Creates `notifications` entries for target users.
- **SET_SLA_TIMER** — Informational only, logged and continues.
- **UPDATE_STATUS** — Updates entity status (e.g., job status).

### How the Orchestrator Advances

`src/lib/workflow-orchestrator.ts: advanceInstance()`:
1. Resolves steps with org overrides (`resolveStepsWithOverrides()`)
2. Finds current step index
3. Executes step via `executeStep()`
4. Logs step event
5. If failed → marks instance as `failed`
6. If condition gate failed → skips forward to next WAIT_UNTIL or end
7. If shouldWait → pauses instance (sets next_run_at or waiting_for_event_key)
8. If completed → advances to next enabled step (skipping disabled optional steps)
9. If no more steps → completes instance

### Tick Function

`workflow-tick` edge function calls `tickWorkflows()`:
1. Fetches instances with `status=running`, `next_run_at <= now`, `waiting_for_event_key IS NULL`
2. Processes up to 50 instances per tick
3. Calls `advanceInstance()` for each

### Lifecycle Diagram of a Single Workflow

```
TRIGGER EVENT
    │
    ▼
findMatchingWorkflows() ──► No matches → EXIT
    │
    ▼ (for each matching template)
createWorkflowInstance()
    │ (duplicate? → skip)
    ▼
Instance status: RUNNING
    │
    ▼ [workflow-tick picks up]
advanceInstance()
    │
    ├──► CONDITION step
    │       ├── passes → continue
    │       └── fails → skip to next WAIT_UNTIL or END
    │
    ├──► WAIT_UNTIL step
    │       ├── target in past → continue immediately
    │       └── target in future → set next_run_at, pause
    │
    ├──► WAIT_FOR_EVENT step
    │       └── set waiting_for_event_key, status=WAITING
    │           (resumed by resumeWaitingInstances())
    │
    ├──► SEND_EMAIL step → queue email → continue
    ├──► CREATE_JOB step → create job → continue
    ├──► CREATE_TASK step → create task → continue
    ├──► SEND_NOTIFICATION step → create notifications → continue
    ├──► UPDATE_STATUS step → update entity → continue
    │
    ▼ (no more steps)
completeInstance() → status: COMPLETED
```

---

## 6️⃣ FILING & ACCOUNTS ENGINE — TECHNICAL INTERNALS

### Trial Balance → FRS105 Mapping

`frs105-accounts-model.ts: mapTrialBalanceToFRS105()`:
- Uses prefix-based account code mapping:
  - `10xx` → Cash at bank
  - `11xx`, `12xx` → Debtors  
  - `15xx` → Tangible assets
  - `20xx-23xx` → Creditors within one year
  - `25xx` → Creditors after one year
  - `30xx` → Share capital
  - `31xx` → Retained earnings
- Applies account_type to determine sign convention (ASSET: dr-cr, LIABILITY/EQUITY: cr-dr)
- Calculates derived values: net_current_assets, total_assets_less_current_liabilities, net_assets, total_equity

### How Disclosures Are Stored

`FRS105StructuredDisclosures` type (defined in `types/filing-schemas.ts`):
```typescript
{
  statement_of_compliance: { text: string; locked: true },
  average_employees: { count: number; confirmed: boolean; status: string },
  directors_advances: { entries: DirectorAdvanceEntry[]; confirmed_none: boolean },
  dividends: { entries: DividendEntry[] },
  related_party_transactions: { entries: RPTEntry[] },
  commitments: { entries: CommitmentEntry[]; confirmed_none: boolean },
  off_balance_sheet: { narrative: string; confirmed_none: boolean },
  going_concern: { flagged: boolean; narrative: string },
  prior_period_adjustments: { flagged: boolean; description: string; amount: number },
}
```

### iXBRL Generator Internals

`ixbrl-generator.ts: generateFRS105iXBRL()`:
1. **Hard gate:** Validates all required disclosures are complete
2. **Context generation:** Creates `<xbrli:context>` elements for current instant, duration, and prior period
3. **Unit definition:** GBP currency unit + pure unit for employee count
4. **Hidden header:** Entity name, company number, period dates, standards applied
5. **Balance sheet table:** Each value wrapped in `<ix:nonFraction>` with correct contextRef, name, unitRef, decimals
6. **Disclosure notes:** Generated HTML with inline XBRL tags
7. **Director approval:** Signature section with tagged approval elements
8. **Output:** Complete XHTML document, stored in `filing_artefacts.content`

### Submission Payload Construction

**VAT (MTD):** `vat-payload-generator.ts` builds JSON payload matching HMRC MTD VAT API schema (9 boxes).

**CT600:** `ct600-xml-builder.ts` constructs HMRC GovTalk XML envelope with CT600 form data from `ct_computation_snapshots`.

**SA100:** `sa-schedule-engine.ts` builds SA100 XML from workpaper field_values.

**Companies House (CS01):** `ch-cs01-xml-builder.ts` builds XML from company register data.

**RTI (FPS/EPS):** `rti-submission-engine.ts` builds HMRC XML from payroll data.

### Failure Modes

| Failure | Handling |
|---|---|
| iXBRL disclosure missing | Hard throw — prevents generation |
| Balance sheet doesn't balance | Warning returned, not blocking |
| HMRC API rejection | Status set to `rejected`, error stored in `last_submission_error` |
| HMRC API timeout | Retry via `filing_queue` with exponential backoff (max 3 attempts) |
| CT polling pending | `hmrc-ct-poll` re-checks periodically |
| Duplicate submission | `idempotency_key` on filings prevents re-submission |

---

## 7️⃣ PERMISSIONS, ROLES & SECURITY MODEL

### Role Hierarchy

```
viewer < staff < manager < admin < owner
```

### Permission Matrix (from `src/lib/permissions.ts`)

| Permission | Owner | Admin | Manager | Staff | Viewer |
|---|:---:|:---:|:---:|:---:|:---:|
| manage_practice_settings | ✅ | ✅ | | | |
| manage_integrations | ✅ | ✅ | | | |
| manage_billing | ✅ | | | | |
| manage_team | ✅ | ✅ | | | |
| manage_automation_rules | ✅ | ✅ | ✅ | | |
| finalize_workpapers | ✅ | ✅ | ✅ | | |
| approve_filings | ✅ | ✅ | ✅ | | |
| submit_filings | ✅ | ✅ | ✅ | | |
| issue_invoices | ✅ | ✅ | ✅ | | |
| void_paid_invoices | ✅ | ✅ | | | |
| post_journals | ✅ | ✅ | ✅ | | |
| lock_periods | ✅ | ✅ | | | |
| override_locked_records | ✅ | ✅ | | | |
| delete_records | ✅ | ✅ | | | |
| create_invoices | ✅ | ✅ | ✅ | ✅ | |
| send_emails | ✅ | ✅ | ✅ | ✅ | |
| create_jobs | ✅ | ✅ | ✅ | ✅ | |
| record_payments | ✅ | ✅ | ✅ | ✅ | |

### RLS Enforcement

**Tenant isolation:** Every table with `organization_id` has RLS policies using `user_has_organization_access(organization_id)` which checks `organization_users` membership.

**Role-based write restrictions:**
- `journals`: Has `journals_no_direct_insert/update/delete` policies set to `false` alongside role-based policies. **This creates conflicting RESTRICTIVE policies** — see Failure Modes.
- `period_locks`: Only owner/admin can manage
- `templates`: Only owner/admin can create/update/delete org templates
- `team_invitations`: Only owner/admin can create/delete

**Portal isolation:** `client_has_portal_access()` function checks `portal_access` table for client/company-level access.

**Public access:** Questionnaire responses via hashed token links (no auth required).

---

## 8️⃣ INTEGRATION LAYER

### Stripe

- **Auth:** API key (stored as edge function secret)
- **Webhooks:** `stripe-webhook` (verify_jwt=false)
- **Events handled:** checkout.session.completed, invoice.paid/payment_failed, customer.subscription.updated/deleted
- **Source of truth:** Stripe is SoT for subscription status. `organizations.billing_status` is a cache updated by webhook.
- **If disabled:** No new subscriptions, no payment processing. Existing data remains.

### HMRC

- **Auth:** OAuth2 via `hmrc-auth`/`hmrc-callback`. Tokens stored in `hmrc_authorisations`.
- **APIs used:** SA XML submission, CT600 REST, VAT MTD REST, RTI XML, CIS XML, VAT obligations
- **Source of truth:** HMRC is SoT for submission status. Filing status updated after HMRC response.
- **If disabled:** No filing submissions. Workpapers and filings still function locally.

### Companies House

- **Auth:** API key for lookups, XML submission credentials for filings
- **Sync:** `companies-house-sync` pulls officer/PSC data → updates `company_officers`, `company_pscs`
- **Filings:** `ch-submit` sends CS01/annual accounts XML
- **If disabled:** No auto-sync of company data, no CH filings. Manual data entry still works.

### TrueLayer

- **Auth:** OAuth2 via `truelayer-auth`/`truelayer-callback`
- **Sync:** `truelayer-sync` fetches transactions → upserts `bank_transactions`
- **Source of truth:** Bank provider is SoT. TrueLayer is intermediary. `bank_transactions` is a copy.
- **If disabled:** No bank feed. Manual transaction import still works.

### Gmail / Outlook

- **Auth:** OAuth2 via respective auth/callback edge functions
- **Sync:** Pulls messages → stores in `email_messages`
- **Send:** Sends via provider API (not SMTP)
- **If disabled:** No email sync/send via connected mailbox. Fallback to Postmark via `email_queue`.

### Postmark

- **Auth:** API key (edge function secret)
- **Used by:** `send-email`, `process-email-queue`, `send-engagement-letter`
- **If disabled:** No fallback email delivery. Connected mailbox sending still works.

---

## 9️⃣ END-TO-END USER JOURNEYS

### Journey 1: Lead → Client

```
1. CRM: INSERT leads (pipeline_stage='new')
2. CRM: UPDATE leads SET pipeline_stage='won'
3. Quotes: INSERT quotes + quote_lines
4. Quotes: UPDATE quotes SET status='accepted'
   → emitQuoteAccepted() → automation_events INSERT + routeTriggerEvent()
5. Onboarding: INSERT onboarding_applications
6. Onboarding: INSERT engagement_letters (send for e-signature)
7. Client signs → UPDATE engagement_letters SET signed_at, signature_data
8. AML: Upload documents → INSERT onboarding_documents
9. Approve: convertLeadToClient() →
   a. INSERT clients OR INSERT companies
   b. INSERT client_detail_* (type-specific)
   c. UPDATE leads SET converted_at
   d. emitOnboardingApproved()
   e. emitClientOnboarded() → triggers workflow instances
```

### Journey 2: Bank Feed → iXBRL

```
1. truelayer-sync: UPSERT bank_transactions
2. Bookkeeping: User matches/categorizes transactions
3. posting-service.ts: postToLedger() →
   a. INSERT journals
   b. INSERT journal_lines  
   c. INSERT ledger_entries
4. trial-balance-service.ts: createSnapshotFromNativeLedger() →
   a. Query ledger_entries by period
   b. INSERT trial_balance_snapshots
5. workpaper-from-tb.ts: Auto-populate →
   a. UPDATE workpaper_instances SET field_values
6. frs105-accounts-model.ts: createFRS105AccountsModel() →
   a. mapTrialBalanceToFRS105()
   b. createDefaultDisclosures()
   c. Generate snapshot_hash
7. saveFRS105AccountsSnapshot() →
   a. INSERT accounts_model_snapshots
8. ixbrl-generator.ts: generateFRS105iXBRL() →
   a. Validate disclosures
   b. Generate iXBRL HTML
   c. INSERT filing_artefacts
```

### Journey 3: Job → Filing → Submission

```
1. Job created (manually or via automation):
   INSERT jobs (status='not_started')
   → emitJobStatusChange()
2. Workpaper created:
   INSERT workpaper_instances
3. Filing created from workpaper:
   filing-service.ts: createFilingFromWorkpaper()
   → INSERT filings (status='draft')
4. User sends for approval:
   sendFilingForApproval()
   → UPDATE filings SET status='awaiting_approval', approval_token
   → INSERT email_queue (approval email)
   → INSERT client_tasks
5. Client approves:
   approveFilingByClient()
   → UPDATE filings SET status='ready_to_file', approved_at
6. Accountant submits:
   supabase.functions.invoke('hmrc-vat-submit') 
   → UPDATE filings SET status='submitted', submitted_at
   → INSERT filing_provider_events
7. HMRC responds:
   → UPDATE filings SET status='accepted'/'rejected'
   → emitFilingStatusChange()
8. Auto-rollover:
   executeAutoRollover()
   → INSERT jobs (next year, is_auto_generated=true)
```

---

## 🔟 FAILURE MODES, TECHNICAL DEBT & KNOWN CONSTRAINTS

### Critical Issues

1. **Conflicting RLS policies on `journals` table.** Both `journals_no_direct_insert` (WITH CHECK: false) and `Managers create journals` (WITH CHECK: org access) exist as RESTRICTIVE policies. In PostgreSQL, ALL RESTRICTIVE policies must pass. Since `false` never passes, **no one can insert journals via direct Supabase client calls**. The system works only because `postToLedger()` uses the client library which somehow bypasses this (likely the SYSTEM journal type and service role usage in edge functions). This is fragile and confusing.

2. **Workflow engine runs on client-side.** `workflow-trigger-router.ts` and `workflow-orchestrator.ts` import `supabase` from `@/integrations/supabase/client` — this is the **anon key client**. The workflow-tick edge function exists but it's unclear if it calls these same functions or has its own implementation. Running workflow logic client-side means it's subject to RLS policies and user session availability.

3. **No transactional consistency for ledger posting.** `postToLedger()` creates journal, journal_lines, and ledger_entries as three separate INSERT calls. If the second or third fails, manual rollback is attempted (`supabase.from().delete()`), but this is not atomic. A crash between inserts creates orphaned records.

4. **Control account lookup by name pattern.** `getControlAccount()` finds accounts by string matching ("Trade Debtors", "Accounts Receivable", "Debtors"). If a practice names their account differently (e.g., "Sundry Debtors"), the lookup fails silently and returns null, causing invoice posting to fail with "Trade Debtors control account not found."

5. **`convertLeadToClient()` stores company name in `first_name` field.** When a lead is company-type, the lead's `first_name` field holds the company name, which is then used as `company_name` on insert. This is semantically misleading.

6. **Invoice void doesn't reverse ledger entries.** `voidInvoice()` has a comment "If posted, we should post reversing entries. For now, just mark as voided." This means voiding a posted invoice leaves the ledger entries intact, creating a permanent imbalance.

7. **`pullPayrollData()` is a placeholder.** Returns `{ success: false, message: "Payroll integration coming soon" }`. Payroll workpapers cannot auto-populate from pay run data.

8. **Prior period balance sheet in iXBRL.** `createFRS105AccountsModel()` always sets `prior_period_balance_sheet: null`. Prior period comparatives are not populated from the previous year's snapshot.

9. **Automation event processing is dual-path.** Events go to both legacy `automation_events` table AND the new workflow engine simultaneously. Both execute independently. There's no deduplication between the two systems — a single event can trigger actions from both engines.

10. **Email queue RLS requires `is_rpc_context()`.** Direct client-side inserts to `email_queue` will be blocked by RLS unless via an RPC call. The `filing-service.ts` attempts direct inserts from the client side when mailbox send fails.

### Hard-Coded Assumptions

- UK tax year starts April 6 (in `generatePeriodKey()`)
- Base currency is always GBP (in `postToLedger()`: `base_currency: "GBP"`)
- FRS105 taxonomy version is `FRS105-2022`
- iXBRL schema reference: `https://xbrl.frc.org.uk/FRS-105/2022-01-01/FRS-105-2022-01-01.xsd`
- SA payment deadline: January 31 following tax year
- CT payment deadline: 9 months + 1 day after period end
- VAT payment deadline: 1 month + 7 days after quarter end
- Default tax code for employees: `1257L`
- Default NIC category: `A`

### Schema Inconsistencies

- `organizations` has `stripe_customer_id` AND `organization_billing` has `stripe_customer_id` — duplicated
- `filings.approved_by` is `text` type, not `uuid` — inconsistent with other tables
- `automation_workflow_instances.status` defaults to `'QUEUED'` in schema but code sets it to `'running'` on creation
- `jobs` has both `name` and `job_name` columns

---

## 1️⃣1️⃣ DEPENDENCY GRAPH — "IF I DELETE THIS, WHAT BREAKS?"

### Blast Radius Analysis

**If you delete `ledger_entries`:**
- Trial balance snapshots cannot be generated from native ledger
- Workpaper auto-population from TB breaks
- Bank reconciliation breaks (matching references ledger entries)
- All financial reporting breaks
- VAT period computation breaks
- Affected services: posting-service, trial-balance-service, workpaper-engine, vat-ledger-aggregator, bookkeeping-kpi
- **Blast radius: CATASTROPHIC** — entire bookkeeping and filing pipeline stops

**If you delete `automation_workflow_*` tables:**
- All multi-step workflow automation stops
- Workflow monitoring dashboard empty
- No auto-generated jobs from triggers
- No automated email sequences
- Legacy automation_rules still work independently
- **Blast radius: HIGH** — automation stops, but core app functions

**If you delete `workpaper_instances`:**
- No workpapers for any jobs
- Filing creation from workpapers breaks
- No tax calculations in workpaper context
- Jobs lose their primary work output
- **Blast radius: HIGH** — filing pipeline from workpaper→filing breaks

**If you delete `filings`:**
- No filing management
- No HMRC/CH submissions
- Filing artefacts orphaned
- Auto-rollover breaks (references next_year_job_id)
- Approval flow breaks
- **Blast radius: HIGH** — submissions stop, but bookkeeping/jobs still work

**If you delete `portal_access`:**
- Client portal shows nothing (all RLS checks fail)
- Client messages inaccessible
- Portal visibility settings orphaned
- **Blast radius: CONTAINED** — only portal affected, accountant app unaffected

---

## 1️⃣2️⃣ SOURCE-OF-TRUTH DECLARATION

| Domain | Single Source | Synchronized To | Duplication/Denormalization |
|---|---|---|---|
| Organization billing status | `organizations.billing_status` | Updated by Stripe webhook | Duplicated in `organization_billing.billing_status` |
| Client identity | `clients` row | Cached in `onboarding_applications` pre-conversion | No sync after conversion |
| Ledger balances | `ledger_entries` | Denormalized from `journals` + `journal_lines` | Three-way write on every posting |
| Invoice status | `invoices.status` | None | — |
| Filing status | `filings.status` | `filing_events` (event log), `filing_provider_events` (API log) | Event tables are append-only logs |
| Filing content (draft) | `filings.draft_schedule_data_json` | — | — |
| Filing content (locked) | `filing_model_snapshots` | `filing_artefacts` (rendered), `filing_payload_artifacts` (submission) | Snapshots are immutable; artefacts are generated from snapshots |
| Bank transactions | Bank provider (via TrueLayer) | `bank_transactions` (copy) | `truelayer_transaction_id` for dedup |
| Email content | Gmail/Outlook provider | `email_messages` (copy) | `message_id` for dedup |
| Tax rates | `sa_rate_tables`, `ct_rate_tables`, `ca_rate_tables` | In-memory during calculation | Never duplicated |
| Workflow instance state | `automation_workflow_instances` | `automation_workflow_events` (append-only log) | Events are audit trail, not derived |
| Company officers | Companies House (via API) | `company_officers` (synced copy) | `ch_appointment_id` for dedup |
| User role | `organization_users.role` | Checked in RLS via `user_has_role_at_least()` | Not duplicated |

---

*End of specification. 177 tables, 553 RLS policies, 40 edge functions, 90+ service files, 45 routes documented.*
