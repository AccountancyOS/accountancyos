
-- ============================================================
-- ACCOUNTANCYOS SECURITY HARDENING MIGRATION
-- Fixes 17 adversarial audit failures
-- ============================================================

-- ============================================================
-- A1: Fix organization_users role constraint + RLS
-- ============================================================

ALTER TABLE public.organization_users DROP CONSTRAINT IF EXISTS organization_users_role_check;
ALTER TABLE public.organization_users ADD CONSTRAINT organization_users_role_check 
  CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text, 'staff'::text, 'viewer'::text]));

DROP POLICY IF EXISTS "Users can create their own membership" ON public.organization_users;
DROP POLICY IF EXISTS "Users can insert organization membership" ON public.organization_users;
DROP POLICY IF EXISTS "Admins can add members" ON public.organization_users;

CREATE POLICY "Safe org membership insert" ON public.organization_users
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      user_id = auth.uid()
      AND NOT EXISTS (
        SELECT 1 FROM public.organization_users ou 
        WHERE ou.organization_id = organization_users.organization_id
      )
    )
    OR
    (
      user_has_org_role(auth.uid(), organization_id, 'owner')
      OR user_has_org_role(auth.uid(), organization_id, 'admin')
    )
  );

CREATE POLICY "Owners and admins can update members" ON public.organization_users
  FOR UPDATE TO authenticated
  USING (
    user_has_org_role(auth.uid(), organization_id, 'owner')
    OR user_has_org_role(auth.uid(), organization_id, 'admin')
  )
  WITH CHECK (
    user_has_org_role(auth.uid(), organization_id, 'owner')
    OR user_has_org_role(auth.uid(), organization_id, 'admin')
  );

CREATE POLICY "Owners admins can remove members or self-leave" ON public.organization_users
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR user_has_org_role(auth.uid(), organization_id, 'owner')
    OR user_has_org_role(auth.uid(), organization_id, 'admin')
  );

-- ============================================================
-- A2: Fix Journals RLS
-- ============================================================

DROP POLICY IF EXISTS "journals_no_direct_insert" ON public.journals;
DROP POLICY IF EXISTS "journals_no_direct_update" ON public.journals;
DROP POLICY IF EXISTS "journals_no_direct_delete" ON public.journals;
DROP POLICY IF EXISTS "Users can manage journals in their organization" ON public.journals;
DROP POLICY IF EXISTS "View journals" ON public.journals;

-- ============================================================
-- A3: filing_artefacts immutability
-- ============================================================

DROP POLICY IF EXISTS "Users can manage filing artefacts in their organization" ON public.filing_artefacts;

CREATE POLICY "Org members can view filing artefacts" ON public.filing_artefacts
  FOR SELECT TO authenticated
  USING (user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Org members can create filing artefacts" ON public.filing_artefacts
  FOR INSERT TO authenticated
  WITH CHECK (user_in_organization(auth.uid(), organization_id));

-- ============================================================
-- A4: Engagement letter signature protection
-- ============================================================

DROP POLICY IF EXISTS "org_users_can_manage_engagement_letters" ON public.engagement_letters;

CREATE POLICY "Org members can view engagement letters" ON public.engagement_letters
  FOR SELECT TO authenticated
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Managers can create engagement letters" ON public.engagement_letters
  FOR INSERT TO authenticated
  WITH CHECK (
    user_has_organization_access(organization_id) 
    AND user_has_role_at_least(auth.uid(), organization_id, 'manager')
  );

CREATE POLICY "Managers can update engagement letters" ON public.engagement_letters
  FOR UPDATE TO authenticated
  USING (
    user_has_organization_access(organization_id) 
    AND user_has_role_at_least(auth.uid(), organization_id, 'manager')
  );

CREATE OR REPLACE FUNCTION public.protect_engagement_letter_signatures()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'signed' AND (
    OLD.signed_at IS DISTINCT FROM NEW.signed_at OR
    OLD.signature_data IS DISTINCT FROM NEW.signature_data OR
    OLD.signature_ip IS DISTINCT FROM NEW.signature_ip
  ) THEN
    RAISE EXCEPTION 'Cannot modify signature fields on a signed engagement letter';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER protect_engagement_signatures
  BEFORE UPDATE ON public.engagement_letters
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_engagement_letter_signatures();

-- ============================================================
-- A5: Filing status transition enforcement
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_filing_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  valid_transitions jsonb := '{
    "draft": ["in_progress", "ready_for_review"],
    "in_progress": ["ready_for_review", "draft"],
    "ready_for_review": ["approved", "draft", "in_progress"],
    "approved": ["ready_to_file", "draft"],
    "ready_to_file": ["submitted", "approved"],
    "submitted": ["accepted", "rejected", "error"],
    "accepted": [],
    "rejected": ["ready_to_file", "draft"],
    "error": ["ready_to_file", "submitted"],
    "sent_to_client": ["client_approved", "client_rejected", "draft"],
    "client_approved": ["ready_to_file", "submitted"],
    "client_rejected": ["draft", "in_progress"]
  }'::jsonb;
  allowed_next jsonb;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  allowed_next := valid_transitions -> COALESCE(OLD.status, 'draft');
  IF allowed_next IS NOT NULL AND jsonb_typeof(allowed_next) = 'array' THEN
    IF NOT (allowed_next ? NEW.status) THEN
      RAISE EXCEPTION 'Invalid filing status transition: % -> % is not allowed', COALESCE(OLD.status, 'draft'), NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER filing_status_transition_check
  BEFORE UPDATE ON public.filings
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.validate_filing_status_transition();

-- ============================================================
-- A6: Audit log - prevent fabrication
-- ============================================================

DROP POLICY IF EXISTS "org_users_can_insert_audit_log" ON public.audit_log;

CREATE POLICY "Audit log insert must match caller" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    user_has_organization_access(organization_id)
    AND user_id = auth.uid()
  );

CREATE OR REPLACE FUNCTION public.enforce_audit_log_actor_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT role INTO NEW.actor_role
  FROM organization_users WHERE user_id = NEW.user_id AND organization_id = NEW.organization_id LIMIT 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_audit_actor_role
  BEFORE INSERT ON public.audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_audit_log_actor_role();

-- ============================================================
-- A7: Add journal_id to ledger_entries
-- ============================================================

ALTER TABLE public.ledger_entries ADD COLUMN IF NOT EXISTS journal_id uuid REFERENCES public.journals(id) ON DELETE RESTRICT;
ALTER TABLE public.ledger_entries ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE public.ledger_entries ADD COLUMN IF NOT EXISTS entry_date date;
CREATE INDEX IF NOT EXISTS idx_ledger_entries_journal_id ON public.ledger_entries(journal_id);

-- ============================================================
-- A8: Fix filing_model_snapshots conflicting policies
-- ============================================================

DROP POLICY IF EXISTS "filing_model_snapshots_no_direct_insert" ON public.filing_model_snapshots;
DROP POLICY IF EXISTS "filing_model_snapshots_no_direct_update" ON public.filing_model_snapshots;
DROP POLICY IF EXISTS "filing_model_snapshots_no_direct_delete" ON public.filing_model_snapshots;
DROP POLICY IF EXISTS "Snapshots are immutable - no updates" ON public.filing_model_snapshots;
DROP POLICY IF EXISTS "Snapshots are immutable - no deletes" ON public.filing_model_snapshots;

-- ============================================================
-- A9: pending_practice_signups visibility
-- ============================================================

DROP POLICY IF EXISTS "Anyone can view pending signups by email" ON public.pending_practice_signups;

CREATE POLICY "Users can view their own pending signups" ON public.pending_practice_signups
  FOR SELECT TO authenticated
  USING (accountant_email = auth.email());

-- ============================================================
-- A11: connected_mailboxes safe view (hide tokens)
-- Uses only columns that actually exist on the table
-- ============================================================

CREATE OR REPLACE VIEW public.connected_mailboxes_safe AS
  SELECT 
    id, organization_id, user_id, provider, email_address, 
    status, last_sync_at, mailbox_type, 
    sync_enabled, error_message, created_at, updated_at
  FROM public.connected_mailboxes;

-- ============================================================
-- A14: Job status transition enforcement
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_job_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  valid_transitions jsonb := '{
    "not_started": ["in_progress", "on_hold", "cancelled"],
    "in_progress": ["waiting_on_client", "in_review", "on_hold", "cancelled", "records_received", "client_queries", "blank"],
    "records_received": ["in_progress", "client_queries", "waiting_on_client", "in_review", "on_hold"],
    "client_queries": ["records_received", "in_progress", "waiting_on_client", "on_hold"],
    "blank": ["in_progress", "not_started"],
    "waiting_on_client": ["in_progress", "records_received", "on_hold", "cancelled"],
    "in_review": ["completed", "in_progress", "on_hold"],
    "on_hold": ["in_progress", "not_started", "cancelled"],
    "completed": ["in_progress"],
    "cancelled": ["not_started"]
  }'::jsonb;
  allowed_next jsonb;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  allowed_next := valid_transitions -> COALESCE(OLD.status, 'not_started');
  IF allowed_next IS NOT NULL AND jsonb_typeof(allowed_next) = 'array' THEN
    IF NOT (allowed_next ? NEW.status) THEN
      RAISE EXCEPTION 'Invalid job status transition: % -> % is not allowed', COALESCE(OLD.status, 'not_started'), NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER job_status_transition_check
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.validate_job_status_transition();

-- ============================================================
-- Atomic ledger posting RPC (Failure 17)
-- ============================================================

CREATE OR REPLACE FUNCTION public.post_to_ledger(
  p_organization_id uuid, p_client_id uuid, p_company_id uuid,
  p_journal_date date, p_reference text, p_description text,
  p_journal_type text, p_source_type text, p_source_id uuid,
  p_currency text DEFAULT 'GBP', p_fx_rate numeric DEFAULT 1.0,
  p_created_by uuid DEFAULT NULL, p_entries jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_journal_id uuid; v_total_debit numeric := 0; v_total_credit numeric := 0;
  v_entry jsonb; v_line_number int := 0; v_ledger_ids uuid[] := '{}'; v_ledger_id uuid; v_lock_date date;
BEGIN
  IF jsonb_array_length(p_entries) = 0 THEN RAISE EXCEPTION 'At least one entry is required'; END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    v_total_debit := v_total_debit + COALESCE((v_entry->>'debit')::numeric, 0);
    v_total_credit := v_total_credit + COALESCE((v_entry->>'credit')::numeric, 0);
  END LOOP;

  IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
    RAISE EXCEPTION 'Journal is unbalanced: debits (%) != credits (%)', v_total_debit, v_total_credit;
  END IF;

  SELECT lock_date INTO v_lock_date FROM period_locks
  WHERE organization_id = p_organization_id
    AND ((p_client_id IS NOT NULL AND client_id = p_client_id) OR (p_company_id IS NOT NULL AND company_id = p_company_id))
  ORDER BY lock_date DESC LIMIT 1;

  IF v_lock_date IS NOT NULL AND p_journal_date <= v_lock_date THEN
    RAISE EXCEPTION 'Period is locked until %', v_lock_date;
  END IF;

  INSERT INTO journals (organization_id, client_id, company_id, journal_date, reference, description, journal_type, total_debit, total_credit, transaction_currency, fx_rate_to_base, is_posted, created_by)
  VALUES (p_organization_id, p_client_id, p_company_id, p_journal_date, p_reference, p_description, p_journal_type, v_total_debit, v_total_credit, p_currency, p_fx_rate, true, COALESCE(p_created_by, auth.uid()))
  RETURNING id INTO v_journal_id;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries) LOOP
    v_line_number := v_line_number + 1;
    INSERT INTO journal_lines (journal_id, line_number, account_id, debit, credit, description)
    VALUES (v_journal_id, v_line_number, (v_entry->>'account_id')::uuid, COALESCE((v_entry->>'debit')::numeric, NULL), COALESCE((v_entry->>'credit')::numeric, NULL), v_entry->>'description');

    INSERT INTO ledger_entries (organization_id, client_id, company_id, transaction_date, entry_date, account_id, debit, credit, description, reference, journal_id, source_type, source_id, vat_code_id, transaction_currency, transaction_debit, transaction_credit, fx_rate_to_base, base_currency, created_by)
    VALUES (p_organization_id, p_client_id, p_company_id, p_journal_date, p_journal_date, (v_entry->>'account_id')::uuid, COALESCE((v_entry->>'debit')::numeric * p_fx_rate, NULL), COALESCE((v_entry->>'credit')::numeric * p_fx_rate, NULL), v_entry->>'description', p_reference, v_journal_id, p_source_type, p_source_id, (v_entry->>'vat_code_id')::uuid, p_currency, COALESCE((v_entry->>'debit')::numeric, NULL), COALESCE((v_entry->>'credit')::numeric, NULL), p_fx_rate, 'GBP', COALESCE(p_created_by, auth.uid()))
    RETURNING id INTO v_ledger_id;
    v_ledger_ids := v_ledger_ids || v_ledger_id;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id, 'ledger_entry_ids', to_jsonb(v_ledger_ids));
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_to_ledger TO authenticated;
