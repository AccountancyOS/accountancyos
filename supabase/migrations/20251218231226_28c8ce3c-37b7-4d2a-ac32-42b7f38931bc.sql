-- Phase 5: Database Indexes + Constraints + Integrity

-- =============================================
-- 5.1 RLS Performance Indexes
-- =============================================

-- Organization users lookup (critical for RLS performance)
CREATE INDEX IF NOT EXISTS idx_organization_users_lookup 
ON public.organization_users(user_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_organization_users_by_org 
ON public.organization_users(organization_id, user_id);

-- Jobs indexes for common queries
CREATE INDEX IF NOT EXISTS idx_jobs_org_status 
ON public.jobs(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_jobs_org_assignee 
ON public.jobs(organization_id, assigned_to);

CREATE INDEX IF NOT EXISTS idx_jobs_org_client 
ON public.jobs(organization_id, client_id);

CREATE INDEX IF NOT EXISTS idx_jobs_org_company 
ON public.jobs(organization_id, company_id);

-- Filings indexes
CREATE INDEX IF NOT EXISTS idx_filings_org_status 
ON public.filings(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_filings_org_company 
ON public.filings(organization_id, company_id);

CREATE INDEX IF NOT EXISTS idx_filings_org_type 
ON public.filings(organization_id, filing_type);

-- Deadlines indexes
CREATE INDEX IF NOT EXISTS idx_deadlines_org_status 
ON public.deadlines(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_deadlines_org_due_date 
ON public.deadlines(organization_id, due_date);

-- Clients indexes
CREATE INDEX IF NOT EXISTS idx_clients_org_email 
ON public.clients(organization_id, email);

-- Companies indexes  
CREATE INDEX IF NOT EXISTS idx_companies_org_number 
ON public.companies(organization_id, company_number);

-- Ledger entries indexes
CREATE INDEX IF NOT EXISTS idx_ledger_entries_org_date 
ON public.ledger_entries(organization_id, transaction_date);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_org_account 
ON public.ledger_entries(organization_id, account_id);

-- Invoices indexes
CREATE INDEX IF NOT EXISTS idx_invoices_org_status 
ON public.invoices(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_invoices_org_customer 
ON public.invoices(organization_id, customer_id);

-- Bank transactions indexes
CREATE INDEX IF NOT EXISTS idx_bank_transactions_org_status 
ON public.bank_transactions(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_org_account 
ON public.bank_transactions(organization_id, bank_account_id);

-- Email queue indexes
CREATE INDEX IF NOT EXISTS idx_email_queue_org_status 
ON public.email_queue(organization_id, status);

-- Automation events indexes
CREATE INDEX IF NOT EXISTS idx_automation_events_org_processed 
ON public.automation_events(organization_id, processed_at);

-- =============================================
-- 5.2 Uniqueness Constraints
-- =============================================

-- Clients: unique email per organization (case-insensitive)
-- Only if email is not null
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_org_email_unique 
ON public.clients(organization_id, lower(email)) 
WHERE email IS NOT NULL;

-- Companies: unique company number per organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_org_number_unique 
ON public.companies(organization_id, company_number) 
WHERE company_number IS NOT NULL;

-- Companies: unique UTR per organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_org_utr_unique 
ON public.companies(organization_id, utr) 
WHERE utr IS NOT NULL;

-- Companies: unique VAT number per organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_org_vat_unique 
ON public.companies(organization_id, vat_number) 
WHERE vat_number IS NOT NULL;

-- Idempotency keys: unique per org/scope/key
CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_keys_unique 
ON public.idempotency_keys(organization_id, scope, key);

-- =============================================
-- 5.3 Foreign Key Constraints (where safe)
-- =============================================

-- Note: Only adding FKs that don't exist and won't break existing data
-- These are added as NOT VALID initially to avoid locking tables

-- Jobs -> Clients (if not exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_jobs_client'
  ) THEN
    ALTER TABLE public.jobs 
    ADD CONSTRAINT fk_jobs_client 
    FOREIGN KEY (client_id) REFERENCES public.clients(id) 
    ON DELETE SET NULL
    NOT VALID;
  END IF;
END $$;

-- Jobs -> Companies (if not exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_jobs_company'
  ) THEN
    ALTER TABLE public.jobs 
    ADD CONSTRAINT fk_jobs_company 
    FOREIGN KEY (company_id) REFERENCES public.companies(id) 
    ON DELETE SET NULL
    NOT VALID;
  END IF;
END $$;

-- Deadlines -> Jobs (if not exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_deadlines_job'
  ) THEN
    ALTER TABLE public.deadlines 
    ADD CONSTRAINT fk_deadlines_job 
    FOREIGN KEY (job_id) REFERENCES public.jobs(id) 
    ON DELETE SET NULL
    NOT VALID;
  END IF;
END $$;

-- =============================================
-- 5.4 Status Check Constraints
-- =============================================

-- Filings status constraint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'chk_filings_status'
  ) THEN
    ALTER TABLE public.filings 
    ADD CONSTRAINT chk_filings_status 
    CHECK (status IN (
      'draft', 'ready_for_approval', 'awaiting_client_approval', 
      'approved_by_client', 'approved', 'queued', 'submitting', 
      'submitted', 'pending', 'accepted', 'filed', 
      'rejected', 'error', 'submission_failed', 'cancelled'
    ))
    NOT VALID;
  END IF;
END $$;

-- Jobs status constraint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'chk_jobs_status'
  ) THEN
    ALTER TABLE public.jobs 
    ADD CONSTRAINT chk_jobs_status 
    CHECK (status IN (
      'not_started', 'in_progress', 'waiting_on_client', 
      'in_review', 'complete', 'on_hold', 'cancelled'
    ))
    NOT VALID;
  END IF;
END $$;

-- Onboarding status constraint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'chk_onboarding_applications_status'
  ) THEN
    ALTER TABLE public.onboarding_applications 
    ADD CONSTRAINT chk_onboarding_applications_status 
    CHECK (status IN (
      'draft', 'sent', 'in_progress', 'contracts_signed', 
      'approved', 'rejected', 'cancelled'
    ))
    NOT VALID;
  END IF;
END $$;

-- Invoices status constraint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'chk_invoices_status'
  ) THEN
    ALTER TABLE public.invoices 
    ADD CONSTRAINT chk_invoices_status 
    CHECK (status IN (
      'draft', 'issued', 'sent', 'viewed', 
      'part_paid', 'paid', 'overdue', 'voided', 'cancelled'
    ))
    NOT VALID;
  END IF;
END $$;

-- Bills status constraint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'chk_bills_status'
  ) THEN
    ALTER TABLE public.bills 
    ADD CONSTRAINT chk_bills_status 
    CHECK (status IN (
      'draft', 'pending_approval', 'approved', 
      'part_paid', 'paid', 'voided', 'cancelled'
    ))
    NOT VALID;
  END IF;
END $$;

-- Email queue status constraint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'chk_email_queue_status'
  ) THEN
    ALTER TABLE public.email_queue 
    ADD CONSTRAINT chk_email_queue_status 
    CHECK (status IN (
      'draft', 'queued', 'pending', 'sending', 
      'sent', 'failed', 'cancelled', 'ignored'
    ))
    NOT VALID;
  END IF;
END $$;

-- Deadlines status constraint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'chk_deadlines_status'
  ) THEN
    ALTER TABLE public.deadlines 
    ADD CONSTRAINT chk_deadlines_status 
    CHECK (status IN (
      'pending', 'upcoming', 'due', 'overdue', 
      'complete', 'cancelled', 'waived'
    ))
    NOT VALID;
  END IF;
END $$;

-- =============================================
-- 5.5 Validate Constraints (background safe)
-- =============================================
-- Note: These run in background and don't lock tables

-- Validate foreign keys
ALTER TABLE public.jobs VALIDATE CONSTRAINT fk_jobs_client;
ALTER TABLE public.jobs VALIDATE CONSTRAINT fk_jobs_company;
ALTER TABLE public.deadlines VALIDATE CONSTRAINT fk_deadlines_job;