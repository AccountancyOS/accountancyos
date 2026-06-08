
-- =============================================================
-- A. Settings: mode + per-surface review flags
-- =============================================================
DO $$ BEGIN
  CREATE TYPE public.bk_mode AS ENUM ('operational','review_required','accountant_only');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.bk_review_status AS ENUM ('not_required','pending_review','approved','queried','rejected','edited_by_accountant');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.portal_visibility_settings
  ADD COLUMN IF NOT EXISTS client_bookkeeping_mode public.bk_mode NOT NULL DEFAULT 'operational',
  ADD COLUMN IF NOT EXISTS require_review_for_transaction_explanations boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_review_for_invoice_sending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_review_for_bill_approval boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS require_review_for_receipt_matching boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_vat_client_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_client_reconcile boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_client_post_to_ledger boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_customer_create boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_supplier_create boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_receipt_match boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_query_respond boolean NOT NULL DEFAULT true;

-- =============================================================
-- B. Review layer columns on operational tables
-- =============================================================
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS review_status public.bk_review_status NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_action text,
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'accountant',
  ADD COLUMN IF NOT EXISTS created_by_contact_id uuid,
  ADD COLUMN IF NOT EXISTS created_by_portal boolean NOT NULL DEFAULT false;

ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS review_status public.bk_review_status NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_action text,
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'accountant',
  ADD COLUMN IF NOT EXISTS created_by_contact_id uuid,
  ADD COLUMN IF NOT EXISTS created_by_portal boolean NOT NULL DEFAULT false;

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS review_status public.bk_review_status NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_action text,
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'accountant',
  ADD COLUMN IF NOT EXISTS created_by_contact_id uuid,
  ADD COLUMN IF NOT EXISTS updated_by_portal boolean NOT NULL DEFAULT false;

ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS review_status public.bk_review_status NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_action text,
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'accountant',
  ADD COLUMN IF NOT EXISTS created_by_contact_id uuid,
  ADD COLUMN IF NOT EXISTS created_by_portal boolean NOT NULL DEFAULT false;

ALTER TABLE public.vat_returns
  ADD COLUMN IF NOT EXISTS review_status public.bk_review_status NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_action text,
  ADD COLUMN IF NOT EXISTS review_notes text;

CREATE INDEX IF NOT EXISTS idx_invoices_review_status ON public.invoices(review_status) WHERE review_status <> 'not_required';
CREATE INDEX IF NOT EXISTS idx_bills_review_status ON public.bills(review_status) WHERE review_status <> 'not_required';
CREATE INDEX IF NOT EXISTS idx_bank_tx_review_status ON public.bank_transactions(review_status) WHERE review_status <> 'not_required';
CREATE INDEX IF NOT EXISTS idx_receipts_review_status ON public.receipts(review_status) WHERE review_status <> 'not_required';
CREATE INDEX IF NOT EXISTS idx_vat_returns_review_status ON public.vat_returns(review_status) WHERE review_status <> 'not_required';

-- =============================================================
-- C. Provenance + review-mode default trigger
-- =============================================================
CREATE OR REPLACE FUNCTION public.stamp_portal_provenance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_portal boolean := public.is_portal_user();
  v_contact uuid;
  v_require boolean := false;
  v_mode public.bk_mode;
BEGIN
  IF NOT v_is_portal THEN
    -- Accountant write: keep defaults
    RETURN NEW;
  END IF;

  -- Resolve contact id (best effort)
  SELECT contact_id INTO v_contact FROM public.portal_access
   WHERE user_id = auth.uid() AND is_active = true
   LIMIT 1;

  IF TG_TABLE_NAME = 'bank_transactions' THEN
    NEW.updated_by_portal := true;
    NEW.source := 'portal';
    NEW.created_by_contact_id := COALESCE(NEW.created_by_contact_id, v_contact);
  ELSE
    IF TG_OP = 'INSERT' THEN
      NEW.created_by_portal := true;
      NEW.source := 'portal';
      NEW.created_by_contact_id := COALESCE(NEW.created_by_contact_id, v_contact);
    END IF;
  END IF;

  -- Resolve review mode from portal_visibility_settings
  SELECT client_bookkeeping_mode,
         CASE TG_TABLE_NAME
           WHEN 'invoices' THEN require_review_for_invoice_sending
           WHEN 'bills' THEN require_review_for_bill_approval
           WHEN 'bank_transactions' THEN require_review_for_transaction_explanations
           WHEN 'receipts' THEN require_review_for_receipt_matching
           ELSE false
         END
  INTO v_mode, v_require
  FROM public.portal_visibility_settings
  WHERE (NEW.client_id IS NOT NULL AND client_id = NEW.client_id)
     OR (NEW.company_id IS NOT NULL AND company_id = NEW.company_id)
  LIMIT 1;

  IF v_mode = 'review_required' OR v_require THEN
    IF TG_OP = 'INSERT' THEN
      NEW.review_status := 'pending_review';
    END IF;
  END IF;

  -- Audit log
  INSERT INTO public.bookkeeping_audit_log(
    organization_id, entity_type, entity_id, action, actor_id, actor_role,
    before_state, after_state, metadata
  ) VALUES (
    NEW.organization_id,
    TG_TABLE_NAME,
    NEW.id,
    TG_OP,
    auth.uid(),
    'portal',
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW),
    jsonb_build_object('source','portal','contact_id', v_contact)
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_portal_provenance_invoices ON public.invoices;
CREATE TRIGGER trg_portal_provenance_invoices
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.stamp_portal_provenance();

DROP TRIGGER IF EXISTS trg_portal_provenance_bills ON public.bills;
CREATE TRIGGER trg_portal_provenance_bills
  BEFORE INSERT OR UPDATE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.stamp_portal_provenance();

DROP TRIGGER IF EXISTS trg_portal_provenance_bank_tx ON public.bank_transactions;
CREATE TRIGGER trg_portal_provenance_bank_tx
  BEFORE INSERT OR UPDATE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.stamp_portal_provenance();

DROP TRIGGER IF EXISTS trg_portal_provenance_receipts ON public.receipts;
CREATE TRIGGER trg_portal_provenance_receipts
  BEFORE INSERT OR UPDATE ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.stamp_portal_provenance();

-- =============================================================
-- D. Accountant-only trigger guards
-- =============================================================
CREATE OR REPLACE FUNCTION public.block_portal_writes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_portal_user() THEN
    RAISE EXCEPTION 'Portal users cannot modify %', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DO $$ BEGIN
  IF to_regclass('public.period_locks') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_block_portal_period_locks ON public.period_locks;
    CREATE TRIGGER trg_block_portal_period_locks
      BEFORE INSERT OR UPDATE OR DELETE ON public.period_locks
      FOR EACH ROW EXECUTE FUNCTION public.block_portal_writes();
  END IF;
  IF to_regclass('public.journals') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_block_portal_journals ON public.journals;
    CREATE TRIGGER trg_block_portal_journals
      BEFORE INSERT OR UPDATE OR DELETE ON public.journals
      FOR EACH ROW EXECUTE FUNCTION public.block_portal_writes();
  END IF;
  IF to_regclass('public.journal_lines') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_block_portal_journal_lines ON public.journal_lines;
    CREATE TRIGGER trg_block_portal_journal_lines
      BEFORE INSERT OR UPDATE OR DELETE ON public.journal_lines
      FOR EACH ROW EXECUTE FUNCTION public.block_portal_writes();
  END IF;
END $$;

-- VAT submission fields: block portal updates to submission-only columns
CREATE OR REPLACE FUNCTION public.block_portal_vat_submit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_portal_user() THEN
    IF NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
       OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
       OR NEW.hmrc_receipt IS DISTINCT FROM OLD.hmrc_receipt
       OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('submitted','accepted','filed')) THEN
      RAISE EXCEPTION 'Portal users cannot submit VAT returns' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_block_portal_vat_submit ON public.vat_returns;
CREATE TRIGGER trg_block_portal_vat_submit
  BEFORE UPDATE ON public.vat_returns
  FOR EACH ROW EXECUTE FUNCTION public.block_portal_vat_submit();

-- =============================================================
-- E. Extend portal_has_perm with new keys + accountant-only hard-blocks
-- =============================================================
CREATE OR REPLACE FUNCTION public.portal_has_perm(_client_id uuid, _company_id uuid, _permission text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE v boolean; v_master boolean; v_settings_col text;
BEGIN
  -- Hard accountant-only — never granted to portal regardless of settings
  IF _permission IN (
    'vat.submit','filings.submit','periods.close','lock_dates.manage',
    'journals.create','workpapers.finalise','org.settings'
  ) THEN
    RETURN false;
  END IF;

  -- Known permissions (legacy + new)
  IF _permission NOT IN (
    'allow_bank_connect','allow_transaction_explain','allow_receipt_upload',
    'allow_invoice_create','allow_invoice_send','show_bills','allow_bill_create',
    'show_vat_returns','allow_vat_approval',
    'show_reports_summary','show_reports_detail','allow_reports_download',
    'show_bank_accounts','show_transactions','show_invoices','show_trial_balance',
    'show_detailed_ledger','full_bookkeeping',
    'allow_customer_create','allow_supplier_create','allow_receipt_match','allow_query_respond',
    'allow_client_reconcile','allow_client_post_to_ledger'
  ) THEN RETURN false; END IF;

  IF NOT public.portal_can_access_bookkeeping(_client_id, _company_id) THEN RETURN false; END IF;

  IF _client_id IS NOT NULL THEN
    SELECT COALESCE(full_bookkeeping_access, false) INTO v_master
      FROM public.portal_visibility_settings WHERE client_id = _client_id LIMIT 1;
  ELSIF _company_id IS NOT NULL THEN
    SELECT COALESCE(full_bookkeeping_access, false) INTO v_master
      FROM public.portal_visibility_settings WHERE company_id = _company_id LIMIT 1;
  END IF;

  IF COALESCE(v_master, false) THEN RETURN true; END IF;
  IF _permission = 'full_bookkeeping' THEN RETURN false; END IF;

  IF _client_id IS NOT NULL THEN
    EXECUTE format('SELECT COALESCE(%I, false) FROM public.portal_visibility_settings WHERE client_id = $1 LIMIT 1', _permission)
      INTO v USING _client_id;
  ELSIF _company_id IS NOT NULL THEN
    EXECUTE format('SELECT COALESCE(%I, false) FROM public.portal_visibility_settings WHERE company_id = $1 LIMIT 1', _permission)
      INTO v USING _company_id;
  ELSE RETURN false; END IF;

  RETURN COALESCE(v, false);
END $$;

-- =============================================================
-- F. Bookkeeping queries
-- =============================================================
CREATE TABLE IF NOT EXISTS public.bookkeeping_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  client_id uuid,
  company_id uuid,
  object_type text NOT NULL,
  object_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'open',
  priority text DEFAULT 'normal',
  question text NOT NULL,
  response text,
  attachment_path text,
  asked_by uuid,
  asked_at timestamptz NOT NULL DEFAULT now(),
  answered_by uuid,
  answered_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid,
  job_id uuid,
  task_id uuid,
  deadline_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('open','answered','resolved','closed')),
  CHECK ((client_id IS NOT NULL) <> (company_id IS NOT NULL))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookkeeping_queries TO authenticated;
GRANT ALL ON public.bookkeeping_queries TO service_role;
ALTER TABLE public.bookkeeping_queries ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_bkq_org_status ON public.bookkeeping_queries(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_bkq_object ON public.bookkeeping_queries(object_type, object_id);

CREATE POLICY "Accountants manage org queries"
  ON public.bookkeeping_queries FOR ALL TO authenticated
  USING (public.user_has_organization_access(organization_id))
  WITH CHECK (public.user_has_organization_access(organization_id));

CREATE POLICY "Portal users view their queries"
  ON public.bookkeeping_queries FOR SELECT TO authenticated
  USING (public.portal_can_access_bookkeeping(client_id, company_id));

CREATE POLICY "Portal users respond to queries"
  ON public.bookkeeping_queries FOR UPDATE TO authenticated
  USING (public.portal_can_access_bookkeeping(client_id, company_id)
         AND public.portal_has_perm(client_id, company_id, 'allow_query_respond'))
  WITH CHECK (public.portal_can_access_bookkeeping(client_id, company_id));

CREATE OR REPLACE TRIGGER trg_bkq_updated_at
  BEFORE UPDATE ON public.bookkeeping_queries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
