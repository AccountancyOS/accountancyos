-- =====================================================================================
-- ONE-OFF PILOT RESET — wipe ALL client / prospect data for a single tenant
-- =====================================================================================
-- Tenant : Blue Tick
-- organization_id : a857a12c-a125-41de-bb45-9eb556d5b467
--
-- PURPOSE
--   Clean-slate reset of a pilot tenant's TEST client/prospect data so the practice can
--   start onboarding real clients from zero. Every DELETE below is scoped to this single
--   organization — either directly via organization_id / org_id, or via a subquery into a
--   parent that carries the organization id, or (for polymorphic entity_id / subject_id
--   columns) via the _subjects id set built at the top. There is NO unscoped DELETE.
--
--   This migration is forward-only and IRREVERSIBLE. Run only once, against the pilot
--   tenant, after a backup. Deletes are naturally idempotent (a second run is a no-op).
--
-- WHAT IS DELETED (client/prospect data graph)
--   leads, clients, companies, company_persons, contacts, accountant_client_links and the
--   entire transactional graph hanging off them: quotes (+lines/tokens),
--   onboarding_applications (+snapshots/events/documents/engagement letters), engagements,
--   jobs (+tasks/timeline/documents/artifacts/conversations/questionnaires/workpapers),
--   deadlines, client_tasks, questionnaire_instances (+responses/files/links),
--   invoices/bills/credit_notes (+lines/payments/allocations), journals (+lines),
--   ledger_entries, receipts, revenue_events, customers/suppliers, bank_* (accounts,
--   connections, transactions, rules, reconciliations, sync logs), vat_* (periods, returns,
--   obligations, registrations, reconciliations, adjustments, lines, transaction links),
--   filings + all filing_* children, cis_*, rti_submissions, ct/accounts snapshots,
--   capital allowance + fixed asset + cgt + crypto data, payroll (paye_schemes, pay_runs,
--   payslips, employees, pensions), kyc packs, portal access, subject-scoped
--   conversations/messages/email, automation runtime (workflow instances, chaser runs,
--   events, executions, overrides), crm activity, subject-scoped notifications / SLA /
--   governance state, per-client config (chart of accounts, categorisation/bank rules,
--   invoice settings, tb mappings — see FLAGS).
--
-- WHAT IS PRESERVED (practice configuration — NOT touched by this migration)
--   organizations, org_settings, organization_settings, organization_users, profiles,
--   user_roles, organization_branding, organization_billing, organization_subscription_cache,
--   organization_integrations_hmrc, organization_integrations_companies_house,
--   services_catalog, canonical_services, canonical_job_templates, canonical_deadline_rules,
--   job_templates, workpaper_templates, workpaper_category_mappings, templates,
--   template_blocks, template_versions, template_merge_fields, message_templates,
--   chaser_message_templates, engagement_letter_template_variants, sla_definitions,
--   data_requirements, automation_rules, automation_rule_templates,
--   automation_trigger_contracts, automation_workflow_templates, automation_workflow_steps,
--   automation_workflow_trigger_map, automation_chaser_policies, automation_category_settings,
--   automation_engine_switches, automation_library_sets, automation_org_overrides,
--   ca_rate_tables, ct_rate_tables, sa_rate_tables, crm_followup_sequences,
--   crm_followup_steps, payroll_journal_mapping, email_suppressions, email_unsubscribe_tokens,
--   suppressed_emails, email_send_state, email_push_subscriptions, connected_mailboxes,
--   external_credentials, team_invitations, api_rate_limits, idempotency_keys,
--   user_sessions, user_saved_views, and all VERSION / cron / feature-flag rows.
--
-- AUDIT DECISION
--   audit_log is KEPT (regulatory). It, plus data_audit_log, bookkeeping_audit_log and
--   automation_audit_logs, use polymorphic entity_type/entity_id (subject_id) columns with
--   NO hard foreign key to clients/companies/filings, so keeping them does NOT block any
--   delete below. They are intentionally left intact as the historical record.
--   EXCEPTION: approval_revocation_log has a hard FK to filings and IS deleted (see FLAGS).
--
-- FLAGS — reviewed decisions worth a human double-check (see accompanying report):
--   * bookkeeping_accounts (per-company chart of accounts) IS deleted — all rows for this
--     org belong to a company being removed; scoped by client/company membership so any
--     org-level rows (none exist) would survive.
--   * per-client config tables (vat_codes, categorization_rules, bank_rules, invoice_settings,
--     tb_account_mappings) are scoped by client/company membership, so org-level/global
--     config rows are preserved; only client-tied rows are removed.
--   * approval_revocation_log rows for this org ARE deleted (forced by filings removal) —
--     this destroys the filing-approval-revocation audit trail for the pilot data.
--   * automation_pauses and payroll_journal_mapping are treated as org-level config and NOT
--     touched.
-- =====================================================================================
-- TRANSACTION / TEMP-TABLE NOTE:
--   No explicit BEGIN/COMMIT — the migration runner wraps each file in its own
--   transaction (repo convention: 0 of 466 migrations use explicit transactions; an
--   explicit block here risks mis-nesting / a premature COMMIT and a PARTIAL delete).
--   The _subjects temp table is created WITHOUT ON COMMIT DROP and dropped explicitly at
--   the end, so it survives across statements whether or not a surrounding transaction
--   exists. Every statement is idempotent, so the migration is safe to re-run.
-- =====================================================================================

-- ---------------------------------------------------------------------------------------
-- 0. Break circular / NO-ACTION cross-table FKs before deleting (all scoped to the org).
--    (jobs.workpaper_instance_id is ON DELETE SET NULL, but filings.model_snapshot_id and
--     the snapshot/approval refs are NO ACTION and form circular pairs with their children.)
-- ---------------------------------------------------------------------------------------
UPDATE public.filings SET
    model_snapshot_id = NULL, current_snapshot_id = NULL, accounts_snapshot_id = NULL,
    ct_snapshot_id = NULL, accounts_approval_id = NULL, ct_approval_id = NULL,
    partnership_allocation_id = NULL, obligation_id = NULL, original_filing_id = NULL,
    next_year_job_id = NULL, workpaper_instance_id = NULL
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

UPDATE public.jobs SET workpaper_instance_id = NULL, source_job_id = NULL
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

UPDATE public.vat_periods SET workpaper_instance_id = NULL, filing_id = NULL, vat_registration_id = NULL
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

UPDATE public.onboarding_applications SET onboarding_questionnaire_instance_id = NULL
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

UPDATE public.workpaper_instances SET trial_balance_snapshot_id = NULL, questionnaire_instance_id = NULL
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- ---------------------------------------------------------------------------------------
-- 1. Snapshot of every "subject" id for this org — used to scope polymorphic
--    entity_id / subject_id / target_id columns that have no hard FK.
-- ---------------------------------------------------------------------------------------
DROP TABLE IF EXISTS _subjects;
CREATE TEMP TABLE _subjects AS
  SELECT id FROM public.clients                 WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
  UNION SELECT id FROM public.companies         WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
  UNION SELECT id FROM public.leads             WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
  UNION SELECT id FROM public.jobs              WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
  UNION SELECT id FROM public.job_tasks         WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
  UNION SELECT id FROM public.quotes            WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
  UNION SELECT id FROM public.invoices          WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
  UNION SELECT id FROM public.bills             WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
  UNION SELECT id FROM public.credit_notes      WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
  UNION SELECT id FROM public.filings           WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
  UNION SELECT id FROM public.deadlines         WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
  UNION SELECT id FROM public.engagements       WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
  UNION SELECT id FROM public.onboarding_applications WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
  UNION SELECT id FROM public.vat_periods       WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
  UNION SELECT id FROM public.client_tasks      WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- =======================================================================================
-- 2. LEAF CHILDREN — delete deepest dependents first.
-- =======================================================================================

-- --- Sales / purchase ledger line items & payments & allocations ---------------------
DELETE FROM public.credit_note_allocations
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.credit_note_lines
  WHERE credit_note_id IN (SELECT id FROM public.credit_notes WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');
DELETE FROM public.invoice_payments
  WHERE invoice_id IN (SELECT id FROM public.invoices WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');
DELETE FROM public.invoice_lines
  WHERE invoice_id IN (SELECT id FROM public.invoices WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');
DELETE FROM public.bill_payments
  WHERE bill_id IN (SELECT id FROM public.bills WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');
DELETE FROM public.bill_lines
  WHERE bill_id IN (SELECT id FROM public.bills WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');
DELETE FROM public.revenue_events
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- --- Bank reconciliation / matching (before bank_transactions & ledger_entries) ------
DELETE FROM public.reconciliation_lines
  WHERE reconciliation_id IN (SELECT id FROM public.reconciliations WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');
DELETE FROM public.matching_candidates
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.bank_rule_executions
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- --- Receipts (ref invoice/bank_transaction/ledger_entry) ----------------------------
DELETE FROM public.receipts
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- --- VAT detail (before vat_periods) -------------------------------------------------
DELETE FROM public.vat_transaction_links
  WHERE vat_period_id IN (SELECT id FROM public.vat_periods WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');
DELETE FROM public.vat_period_lines
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.vat_adjustments
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.vat_reconciliations
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- --- Journal lines (before journals) -------------------------------------------------
DELETE FROM public.journal_lines
  WHERE journal_id IN (SELECT id FROM public.journals WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');

-- --- Questionnaire children (before questionnaire_instances) -------------------------
DELETE FROM public.questionnaire_responses
  WHERE questionnaire_instance_id IN (SELECT id FROM public.questionnaire_instances WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');
DELETE FROM public.questionnaire_files
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.questionnaire_access_log
  WHERE questionnaire_instance_id IN (SELECT id FROM public.questionnaire_instances WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');
DELETE FROM public.questionnaire_public_links
  WHERE questionnaire_instance_id IN (SELECT id FROM public.questionnaire_instances WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');
DELETE FROM public.job_questionnaire_instances
  WHERE questionnaire_instance_id IN (SELECT id FROM public.questionnaire_instances WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467')
     OR job_id IN (SELECT id FROM public.jobs WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');

-- --- Filing children (before filings) ------------------------------------------------
DELETE FROM public.filing_documents
  WHERE filing_id IN (SELECT id FROM public.filings WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');
DELETE FROM public.filing_payload_artifacts
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.filing_provider_events
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.filing_artefacts
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.filing_validations
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.filing_submissions
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.filing_events
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.approval_revocation_log   -- audit table but hard FK to filings; forced
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.filing_approvals
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.filing_queue
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- --- Email message children (before email_messages / client_messages) ----------------
DELETE FROM public.email_attachments
  WHERE email_message_id IN (SELECT id FROM public.email_messages WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');
-- email_send_log.message_id is TEXT (not uuid); email_messages.id is uuid → cast the subquery to text.
DELETE FROM public.email_send_log
  WHERE message_id IN (SELECT id::text FROM public.email_messages WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');
DELETE FROM public.message_entity_links
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
    AND ( entity_id IN (SELECT id FROM _subjects)
       OR email_message_id IN (SELECT id FROM public.email_messages WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467')
       OR client_message_id IN (SELECT id FROM public.client_messages WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467') );

-- --- Payroll leaves (before employees / pay_runs / paye_schemes) ---------------------
DELETE FROM public.payslips
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.employee_absences
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.employee_benefits
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- --- Capital allowances / fixed assets / cgt / crypto (leaves first) -----------------
DELETE FROM public.fixed_asset_transactions
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.capital_allowance_claims
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.crypto_transactions
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.cgt_disposals
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.crypto_token_pools
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- --- CIS payments (before cis_returns / subcontractors / contractors) ----------------
DELETE FROM public.cis_payments
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- --- Company statutory-register sub-entities (before company_persons / companies) ----
DELETE FROM public.company_register_events
  WHERE company_id IN (SELECT id FROM public.companies WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');
DELETE FROM public.company_share_transfers
  WHERE company_id IN (SELECT id FROM public.companies WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');
DELETE FROM public.company_share_allotments
  WHERE company_id IN (SELECT id FROM public.companies WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');
DELETE FROM public.company_shareholders
  WHERE company_id IN (SELECT id FROM public.companies WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');
DELETE FROM public.company_share_classes
  WHERE company_id IN (SELECT id FROM public.companies WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');
DELETE FROM public.company_officers
  WHERE company_id IN (SELECT id FROM public.companies WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');
DELETE FROM public.company_pscs
  WHERE company_id IN (SELECT id FROM public.companies WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');
DELETE FROM public.companies_house_diff_staging
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- --- CRM / lead activity (before leads/clients) --------------------------------------
DELETE FROM public.crm_activities
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.lead_activities
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.lead_activity_summary
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- =======================================================================================
-- 3. MID-LEVEL — accounting, bank, tax, filing, payroll parents.
-- =======================================================================================

-- --- Filing-linked snapshots / allocations (filings already pre-NULLed to decouple) ---
DELETE FROM public.filing_model_snapshots
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.partnership_allocations
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.rti_submissions
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.cis_returns
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- --- Filings themselves --------------------------------------------------------------
DELETE FROM public.filings
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- --- CIS subcontractors / contractors ------------------------------------------------
DELETE FROM public.cis_subcontractors
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.cis_contractors
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- --- CT / accounts / capital-allowance snapshots (after filings deref) ---------------
DELETE FROM public.ct_computation_snapshots
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.accounts_model_snapshots
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.capital_allowance_pools
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.capital_allowance_periods
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.fixed_assets
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- --- Payroll parents -----------------------------------------------------------------
DELETE FROM public.pay_runs
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.employees
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.pension_schemes
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.paye_schemes            -- company-linked config; removed with companies
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- --- Ledger / journals / subledger (after receipts, reconciliation_lines, jnl lines) --
DELETE FROM public.ledger_entries
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.journals
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- --- Credit notes / invoices / bills (after their lines/payments/allocations) --------
DELETE FROM public.credit_notes
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.invoices
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.bills
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- --- Customers / suppliers (after invoices/bills/credit_notes) -----------------------
DELETE FROM public.customers
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.suppliers
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- --- Bank (transactions -> reconciliations -> accounts -> connections) ---------------
DELETE FROM public.bank_transactions
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.reconciliations
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.bank_sync_logs
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.bank_accounts
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.bank_connections
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- --- VAT parents ---------------------------------------------------------------------
DELETE FROM public.vat_periods
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.vat_returns
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.vat_obligations
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.vat_registrations
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- =======================================================================================
-- 4. WORKPAPERS / TRIAL BALANCE / QUESTIONNAIRES (after filings & snapshots, before jobs)
-- =======================================================================================
DELETE FROM public.workpaper_instances
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.job_workpaper_instances
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.trial_balance_snapshots
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.questionnaire_instances
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- =======================================================================================
-- 5. JOB GRAPH (children -> job_tasks -> jobs) and deadlines / client tasks.
-- =======================================================================================
DELETE FROM public.job_timeline
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.job_conversations
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.job_artifacts
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.job_documents
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.record_request_items
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.client_approval_packs
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.bookkeeping_queries
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.chaser_job_periods
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.job_tasks
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.client_tasks
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.deadlines
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.jobs
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- =======================================================================================
-- 6. ENGAGEMENTS / ONBOARDING / QUOTES (before leads/clients/companies).
-- =======================================================================================
DELETE FROM public.engagement_letters
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.engagements
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

DELETE FROM public.onboarding_approval_snapshots
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.onboarding_documents
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.onboarding_events
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.onboarding_applications
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

DELETE FROM public.quote_acceptance_tokens
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.quote_lines
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.quotes
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- =======================================================================================
-- 7. SUBJECT-SCOPED COMMS / GOVERNANCE / KYC / PORTAL / AUTOMATION RUNTIME.
-- =======================================================================================

-- --- Email (messages -> threads; queue tied to subjects) -----------------------------
DELETE FROM public.email_messages
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.email_threads
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.client_messages
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.email_queue
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
    AND ( client_id IN (SELECT id FROM public.clients   WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467')
       OR company_id IN (SELECT id FROM public.companies WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467')
       OR job_id     IN (SELECT id FROM _subjects)
       OR entity_id  IN (SELECT id FROM _subjects) );

-- --- KYC (subjects -> packs) ---------------------------------------------------------
DELETE FROM public.kyc_pack_subjects
  WHERE kyc_pack_id IN (SELECT id FROM public.kyc_packs WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');
DELETE FROM public.kyc_packs
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- --- Client tax authorisations / HMRC authorisations ---------------------------------
DELETE FROM public.client_tax_authorisations
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.hmrc_authorisations
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- --- Governance state / change requests (polymorphic subject_id) ---------------------
DELETE FROM public.data_change_requests
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
    AND subject_id IN (SELECT id FROM _subjects);
DELETE FROM public.data_point_state
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
    AND subject_id IN (SELECT id FROM _subjects);

-- --- Portal access / visibility (client/company scoped) ------------------------------
DELETE FROM public.portal_access
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
    AND ( client_id IN (SELECT id FROM public.clients   WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467')
       OR company_id IN (SELECT id FROM public.companies WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467') );
DELETE FROM public.portal_visibility_settings
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
    AND ( client_id IN (SELECT id FROM public.clients   WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467')
       OR company_id IN (SELECT id FROM public.companies WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467') );
DELETE FROM public.truelayer_auth_states
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
    AND ( client_id IN (SELECT id FROM public.clients   WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467')
       OR company_id IN (SELECT id FROM public.companies WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467') );

-- --- Recurring invoice schedules (client scoped) -------------------------------------
DELETE FROM public.recurring_invoice_schedules
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- --- Automation runtime (workflow instances/events, chaser runs, events, overrides) --
DELETE FROM public.automation_workflow_events
  WHERE org_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.automation_workflow_instances
  WHERE org_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.automation_chaser_messages
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.automation_chaser_runs
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.automation_events
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
    AND entity_id IN (SELECT id FROM _subjects);
DELETE FROM public.automation_executions
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
    AND triggered_by_id IN (SELECT id FROM _subjects);
DELETE FROM public.automation_entity_link_suggestions
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
    AND ( source_entity_id IN (SELECT id FROM _subjects)
       OR suggested_entity_id IN (SELECT id FROM _subjects) );
DELETE FROM public.automation_job_overrides
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.automation_client_overrides
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- --- Notifications / SLA instances (polymorphic entity_id -> subjects) ----------------
DELETE FROM public.notifications
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
    AND entity_id IN (SELECT id FROM _subjects);
DELETE FROM public.sla_instances
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
    AND entity_id IN (SELECT id FROM _subjects);

-- =======================================================================================
-- 8. PER-CLIENT CONFIG (scoped by client/company membership so org-level config survives).
--    See FLAGS in header — these are treated as client data for the pilot reset.
-- =======================================================================================
DELETE FROM public.bank_rules
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
    AND ( client_id IN (SELECT id FROM public.clients   WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467')
       OR company_id IN (SELECT id FROM public.companies WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467') );
DELETE FROM public.categorization_rules
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
    AND ( client_id IN (SELECT id FROM public.clients   WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467')
       OR company_id IN (SELECT id FROM public.companies WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467') );
DELETE FROM public.tb_account_mappings
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
    AND ( client_id IN (SELECT id FROM public.clients   WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467')
       OR company_id IN (SELECT id FROM public.companies WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467') );
DELETE FROM public.invoice_settings
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
    AND ( client_id IN (SELECT id FROM public.clients   WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467')
       OR company_id IN (SELECT id FROM public.companies WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467') );
DELETE FROM public.vat_codes
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
    AND ( client_id IN (SELECT id FROM public.clients   WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467')
       OR company_id IN (SELECT id FROM public.companies WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467') );
-- Chart of accounts (per company). Scoped by client/company membership; org-level rows kept.
DELETE FROM public.bookkeeping_accounts
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
    AND ( client_id IN (SELECT id FROM public.clients   WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467')
       OR company_id IN (SELECT id FROM public.companies WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467') );
DELETE FROM public.period_locks
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.document_folders
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- =======================================================================================
-- 9. PEOPLE / LINKS (before the client & company roots).
-- =======================================================================================
DELETE FROM public.contacts
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.accountant_client_links
  WHERE client_id  IN (SELECT id FROM public.clients   WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467')
     OR company_id IN (SELECT id FROM public.companies WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');
DELETE FROM public.pending_practice_signups
  WHERE client_id  IN (SELECT id FROM public.clients   WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467')
     OR company_id IN (SELECT id FROM public.companies WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');
DELETE FROM public.client_detail_sa
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.client_detail_cgt
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.client_detail_charity
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.client_detail_partnership
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.company_persons
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

-- =======================================================================================
-- 10. ROOTS — companies, clients, leads (deleted last).
-- =======================================================================================
DELETE FROM public.companies
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.clients
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.leads
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

DROP TABLE IF EXISTS _subjects;

-- =====================================================================================
-- POST-APPLY VERIFICATION (run via the Lovable MCP db_select, each must return 0 rows):
--
--   db_select table=leads                    filters=[{organization_id eq a857a12c-a125-41de-bb45-9eb556d5b467}]
--   db_select table=clients                  filters=[{organization_id eq a857a12c-a125-41de-bb45-9eb556d5b467}]
--   db_select table=companies                filters=[{organization_id eq a857a12c-a125-41de-bb45-9eb556d5b467}]
--   db_select table=jobs                     filters=[{organization_id eq a857a12c-a125-41de-bb45-9eb556d5b467}]
--   db_select table=quotes                   filters=[{organization_id eq a857a12c-a125-41de-bb45-9eb556d5b467}]
--   db_select table=onboarding_applications  filters=[{organization_id eq a857a12c-a125-41de-bb45-9eb556d5b467}]
--   db_select table=engagements              filters=[{organization_id eq a857a12c-a125-41de-bb45-9eb556d5b467}]
--   db_select table=deadlines                filters=[{organization_id eq a857a12c-a125-41de-bb45-9eb556d5b467}]
--
-- And confirm config SURVIVES (each must still return rows):
--   db_select table=services_catalog         filters=[{organization_id eq a857a12c-a125-41de-bb45-9eb556d5b467}]
--   db_select table=automation_rules         filters=[{organization_id eq a857a12c-a125-41de-bb45-9eb556d5b467}]
--   db_select table=organization_users       filters=[{organization_id eq a857a12c-a125-41de-bb45-9eb556d5b467}]
-- =====================================================================================
