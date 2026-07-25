-- =====================================================================================
-- ONE-OFF PILOT RESET — wipe ALL client / prospect data for a single tenant
-- Verbatim re-apply from git HEAD 5b9f81d, source sha256 a57e91e4baca6326813b36c8fe6dc54bc982e6dbc259e09f2e57b6212891a425
-- File: supabase/migrations/20260724150000_reset_bluetick_test_client_data.sql
-- =====================================================================================
SET session_replication_role = replica;

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

DELETE FROM public.reconciliation_lines
  WHERE reconciliation_id IN (SELECT id FROM public.reconciliations WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');
DELETE FROM public.matching_candidates
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.bank_rule_executions
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

DELETE FROM public.receipts
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

DELETE FROM public.vat_transaction_links
  WHERE vat_period_id IN (SELECT id FROM public.vat_periods WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');
DELETE FROM public.vat_period_lines
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.vat_adjustments
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.vat_reconciliations
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

DELETE FROM public.journal_lines
  WHERE journal_id IN (SELECT id FROM public.journals WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');

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
DELETE FROM public.approval_revocation_log
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.filing_approvals
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.filing_queue
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

DELETE FROM public.email_attachments
  WHERE email_message_id IN (SELECT id FROM public.email_messages WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');
DELETE FROM public.email_send_log
  WHERE message_id IN (SELECT id::text FROM public.email_messages WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');
DELETE FROM public.message_entity_links
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
    AND ( entity_id IN (SELECT id FROM _subjects)
       OR email_message_id IN (SELECT id FROM public.email_messages WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467')
       OR client_message_id IN (SELECT id FROM public.client_messages WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467') );

DELETE FROM public.payslips
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.employee_absences
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.employee_benefits
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

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

DELETE FROM public.cis_payments
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

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

DELETE FROM public.crm_activities
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.lead_activities
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.lead_activity_summary
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

DELETE FROM public.filing_model_snapshots
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.partnership_allocations
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.rti_submissions
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.cis_returns
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

DELETE FROM public.filings
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

DELETE FROM public.cis_subcontractors
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.cis_contractors
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

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

DELETE FROM public.pay_runs
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.employees
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.pension_schemes
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.paye_schemes
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

DELETE FROM public.ledger_entries
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.journals
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

DELETE FROM public.credit_notes
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.invoices
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.bills
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

DELETE FROM public.customers
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.suppliers
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

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

DELETE FROM public.vat_periods
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.vat_returns
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.vat_obligations
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.vat_registrations
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

DELETE FROM public.workpaper_instances
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.job_workpaper_instances
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.trial_balance_snapshots
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.questionnaire_instances
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

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

DELETE FROM public.kyc_pack_subjects
  WHERE kyc_pack_id IN (SELECT id FROM public.kyc_packs WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467');
DELETE FROM public.kyc_packs
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

DELETE FROM public.client_tax_authorisations
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.hmrc_authorisations
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

DELETE FROM public.data_change_requests
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
    AND subject_id IN (SELECT id FROM _subjects);
DELETE FROM public.data_point_state
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
    AND subject_id IN (SELECT id FROM _subjects);

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

DELETE FROM public.recurring_invoice_schedules
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

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

DELETE FROM public.notifications
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
    AND entity_id IN (SELECT id FROM _subjects);
DELETE FROM public.sla_instances
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
    AND entity_id IN (SELECT id FROM _subjects);

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
DELETE FROM public.bookkeeping_accounts
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467'
    AND ( client_id IN (SELECT id FROM public.clients   WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467')
       OR company_id IN (SELECT id FROM public.companies WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467') );
DELETE FROM public.period_locks
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.document_folders
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

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

DELETE FROM public.companies
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.clients
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';
DELETE FROM public.leads
  WHERE organization_id = 'a857a12c-a125-41de-bb45-9eb556d5b467';

SET session_replication_role = DEFAULT;

DROP TABLE IF EXISTS _subjects;
