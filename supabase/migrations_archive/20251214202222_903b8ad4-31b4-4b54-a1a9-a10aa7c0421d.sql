-- =====================================================
-- WORKFLOW INTEGRATION: APPROVAL REVOCATION & SNAPSHOT DEPENDENCY
-- Phase 5B - Data Integrity Engine
-- =====================================================

-- 1. Create approval_revocation_log table for detailed audit trail
CREATE TABLE IF NOT EXISTS public.approval_revocation_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  approval_id UUID NOT NULL,
  filing_id UUID NOT NULL REFERENCES public.filings(id) ON DELETE CASCADE,
  approval_scope TEXT NOT NULL CHECK (approval_scope IN ('ACCOUNTS', 'CT600')),
  old_snapshot_id UUID,
  old_snapshot_hash TEXT,
  new_snapshot_id UUID,
  new_snapshot_hash TEXT,
  revocation_reason TEXT NOT NULL CHECK (revocation_reason IN (
    'UNDERLYING_ACCOUNTS_CHANGED',
    'CT_COMPUTATION_CHANGED',
    'MANUAL_REVOCATION',
    'SNAPSHOT_SUPERSEDED',
    'FILING_AMENDED',
    'ENTITY_DATA_CHANGED'
  )),
  system_actor TEXT NOT NULL DEFAULT 'SYSTEM',
  revoked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

-- Enable RLS
ALTER TABLE public.approval_revocation_log ENABLE ROW LEVEL SECURITY;

-- RLS policy for approval_revocation_log
CREATE POLICY "Users can view revocation logs for their organization"
  ON public.approval_revocation_log
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
    )
  );

-- Index for efficient queries
CREATE INDEX idx_approval_revocation_log_filing ON public.approval_revocation_log(filing_id);
CREATE INDEX idx_approval_revocation_log_org ON public.approval_revocation_log(organization_id);

-- 2. Enhanced revocation function with complete audit trail
CREATE OR REPLACE FUNCTION public.revoke_approval_with_audit(
  p_approval_id UUID,
  p_old_snapshot_id UUID,
  p_old_snapshot_hash TEXT,
  p_new_snapshot_id UUID,
  p_new_snapshot_hash TEXT,
  p_revocation_reason TEXT,
  p_metadata JSONB DEFAULT '{}'
) RETURNS VOID AS $$
DECLARE
  v_approval RECORD;
BEGIN
  -- Get approval details
  SELECT * INTO v_approval 
  FROM public.filing_approvals 
  WHERE id = p_approval_id AND revoked_at IS NULL;
  
  IF v_approval.id IS NULL THEN
    RETURN; -- Already revoked or doesn't exist
  END IF;
  
  -- Revoke the approval
  UPDATE public.filing_approvals
  SET 
    revoked_at = now(),
    revocation_reason = p_revocation_reason
  WHERE id = p_approval_id AND revoked_at IS NULL;
  
  -- Log revocation with full audit trail
  INSERT INTO public.approval_revocation_log (
    organization_id,
    approval_id,
    filing_id,
    approval_scope,
    old_snapshot_id,
    old_snapshot_hash,
    new_snapshot_id,
    new_snapshot_hash,
    revocation_reason,
    system_actor,
    metadata
  ) VALUES (
    v_approval.organization_id,
    p_approval_id,
    v_approval.filing_id,
    v_approval.approval_scope,
    p_old_snapshot_id,
    p_old_snapshot_hash,
    p_new_snapshot_id,
    p_new_snapshot_hash,
    p_revocation_reason,
    'SYSTEM',
    p_metadata
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Function to regress filing status deterministically
CREATE OR REPLACE FUNCTION public.regress_filing_status(
  p_filing_id UUID,
  p_reason TEXT
) RETURNS VOID AS $$
DECLARE
  v_filing RECORD;
BEGIN
  SELECT * INTO v_filing FROM public.filings WHERE id = p_filing_id;
  
  IF v_filing.id IS NULL THEN
    RETURN;
  END IF;
  
  -- Only regress if in a state that can be regressed
  -- Never regress 'filed' or 'accepted' filings (they need amendments)
  IF v_filing.status IN ('approved', 'queued', 'ready_for_approval', 'draft') THEN
    UPDATE public.filings
    SET 
      status = 'ready_for_approval',
      updated_at = now()
    WHERE id = p_filing_id
    AND status NOT IN ('filed', 'accepted', 'submitted');
    
    -- Log audit event
    INSERT INTO public.audit_log (
      organization_id,
      entity_type,
      entity_id,
      action,
      old_value,
      new_value,
      metadata
    ) VALUES (
      v_filing.organization_id,
      'filing',
      p_filing_id,
      'status_regressed',
      v_filing.status,
      'ready_for_approval',
      jsonb_build_object('reason', p_reason, 'system_actor', 'SYSTEM')
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Enhanced trigger function for accounts snapshot changes
CREATE OR REPLACE FUNCTION public.handle_accounts_snapshot_change()
RETURNS TRIGGER AS $$
DECLARE
  v_filing RECORD;
  v_approval RECORD;
  v_ct_snapshot RECORD;
BEGIN
  -- Find all filings that reference this accounts snapshot
  FOR v_filing IN 
    SELECT f.* FROM public.filings f
    WHERE f.accounts_snapshot_id = OLD.id
  LOOP
    -- Revoke ACCOUNTS approval
    FOR v_approval IN 
      SELECT * FROM public.filing_approvals 
      WHERE filing_id = v_filing.id 
      AND approval_scope = 'ACCOUNTS' 
      AND revoked_at IS NULL
    LOOP
      PERFORM public.revoke_approval_with_audit(
        v_approval.id,
        OLD.id,
        OLD.snapshot_hash,
        NEW.id,
        NEW.snapshot_hash,
        'UNDERLYING_ACCOUNTS_CHANGED',
        jsonb_build_object('trigger', 'accounts_snapshot_update')
      );
    END LOOP;
    
    -- Revoke CT600 approval (CT depends on accounts)
    FOR v_approval IN 
      SELECT * FROM public.filing_approvals 
      WHERE filing_id = v_filing.id 
      AND approval_scope = 'CT600' 
      AND revoked_at IS NULL
    LOOP
      PERFORM public.revoke_approval_with_audit(
        v_approval.id,
        v_filing.ct_snapshot_id,
        NULL,
        NULL,
        NULL,
        'UNDERLYING_ACCOUNTS_CHANGED',
        jsonb_build_object('trigger', 'accounts_snapshot_update', 'cascade', true)
      );
    END LOOP;
    
    -- Regress filing status
    PERFORM public.regress_filing_status(v_filing.id, 'UNDERLYING_ACCOUNTS_CHANGED');
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Trigger on accounts_model_snapshots for updates
DROP TRIGGER IF EXISTS trg_accounts_snapshot_change ON public.accounts_model_snapshots;
CREATE TRIGGER trg_accounts_snapshot_change
  AFTER UPDATE ON public.accounts_model_snapshots
  FOR EACH ROW
  WHEN (OLD.snapshot_hash IS DISTINCT FROM NEW.snapshot_hash)
  EXECUTE FUNCTION public.handle_accounts_snapshot_change();

-- 6. Enhanced trigger for CT snapshot changes (on filings table when ct_snapshot_id changes)
CREATE OR REPLACE FUNCTION public.handle_filing_snapshot_change()
RETURNS TRIGGER AS $$
DECLARE
  v_approval RECORD;
  v_old_accounts_hash TEXT;
  v_new_accounts_hash TEXT;
  v_old_ct_hash TEXT;
  v_new_ct_hash TEXT;
BEGIN
  -- Get snapshot hashes for audit
  IF OLD.accounts_snapshot_id IS NOT NULL THEN
    SELECT snapshot_hash INTO v_old_accounts_hash 
    FROM public.accounts_model_snapshots WHERE id = OLD.accounts_snapshot_id;
  END IF;
  
  IF NEW.accounts_snapshot_id IS NOT NULL THEN
    SELECT snapshot_hash INTO v_new_accounts_hash 
    FROM public.accounts_model_snapshots WHERE id = NEW.accounts_snapshot_id;
  END IF;
  
  IF OLD.ct_snapshot_id IS NOT NULL THEN
    SELECT snapshot_hash INTO v_old_ct_hash 
    FROM public.ct_computation_snapshots WHERE id = OLD.ct_snapshot_id;
  END IF;
  
  IF NEW.ct_snapshot_id IS NOT NULL THEN
    SELECT snapshot_hash INTO v_new_ct_hash 
    FROM public.ct_computation_snapshots WHERE id = NEW.ct_snapshot_id;
  END IF;

  -- Case A: Accounts snapshot changed - revoke BOTH approvals
  IF OLD.accounts_snapshot_id IS DISTINCT FROM NEW.accounts_snapshot_id THEN
    -- Revoke ACCOUNTS approval
    FOR v_approval IN 
      SELECT * FROM public.filing_approvals 
      WHERE filing_id = NEW.id 
      AND approval_scope = 'ACCOUNTS' 
      AND revoked_at IS NULL
    LOOP
      PERFORM public.revoke_approval_with_audit(
        v_approval.id,
        OLD.accounts_snapshot_id,
        v_old_accounts_hash,
        NEW.accounts_snapshot_id,
        v_new_accounts_hash,
        'UNDERLYING_ACCOUNTS_CHANGED',
        jsonb_build_object('trigger', 'filing_snapshot_change')
      );
    END LOOP;
    
    -- Revoke CT600 approval (cascade)
    FOR v_approval IN 
      SELECT * FROM public.filing_approvals 
      WHERE filing_id = NEW.id 
      AND approval_scope = 'CT600' 
      AND revoked_at IS NULL
    LOOP
      PERFORM public.revoke_approval_with_audit(
        v_approval.id,
        OLD.ct_snapshot_id,
        v_old_ct_hash,
        NEW.ct_snapshot_id,
        v_new_ct_hash,
        'UNDERLYING_ACCOUNTS_CHANGED',
        jsonb_build_object('trigger', 'filing_snapshot_change', 'cascade', true)
      );
    END LOOP;
    
    -- Regress status
    PERFORM public.regress_filing_status(NEW.id, 'UNDERLYING_ACCOUNTS_CHANGED');
    
  -- Case B: Only CT snapshot changed - revoke CT approval only
  ELSIF OLD.ct_snapshot_id IS DISTINCT FROM NEW.ct_snapshot_id THEN
    FOR v_approval IN 
      SELECT * FROM public.filing_approvals 
      WHERE filing_id = NEW.id 
      AND approval_scope = 'CT600' 
      AND revoked_at IS NULL
    LOOP
      PERFORM public.revoke_approval_with_audit(
        v_approval.id,
        OLD.ct_snapshot_id,
        v_old_ct_hash,
        NEW.ct_snapshot_id,
        v_new_ct_hash,
        'CT_COMPUTATION_CHANGED',
        jsonb_build_object('trigger', 'filing_snapshot_change')
      );
    END LOOP;
    
    -- Regress status only if not already filed
    IF NEW.status NOT IN ('filed', 'accepted', 'submitted') THEN
      PERFORM public.regress_filing_status(NEW.id, 'CT_COMPUTATION_CHANGED');
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 7. Replace the old trigger with enhanced version
DROP TRIGGER IF EXISTS revoke_approvals_on_snapshot_change ON public.filings;
DROP TRIGGER IF EXISTS trg_filing_snapshot_change ON public.filings;

CREATE TRIGGER trg_filing_snapshot_change
  AFTER UPDATE ON public.filings
  FOR EACH ROW
  WHEN (
    OLD.accounts_snapshot_id IS DISTINCT FROM NEW.accounts_snapshot_id OR
    OLD.ct_snapshot_id IS DISTINCT FROM NEW.ct_snapshot_id
  )
  EXECUTE FUNCTION public.handle_filing_snapshot_change();

-- 8. Server-side validation function for submission guards
CREATE OR REPLACE FUNCTION public.validate_submission_integrity(
  p_filing_id UUID,
  p_filing_type TEXT -- 'ACCOUNTS_CH' or 'CT600_HMRC'
) RETURNS JSONB AS $$
DECLARE
  v_filing RECORD;
  v_approval RECORD;
  v_snapshot RECORD;
  v_errors TEXT[] := ARRAY[]::TEXT[];
  v_valid BOOLEAN := true;
  v_approval_scope TEXT;
  v_snapshot_id UUID;
  v_snapshot_hash TEXT;
BEGIN
  -- Determine approval scope
  v_approval_scope := CASE 
    WHEN p_filing_type = 'ACCOUNTS_CH' THEN 'ACCOUNTS'
    WHEN p_filing_type = 'CT600_HMRC' THEN 'CT600'
    ELSE NULL
  END;
  
  IF v_approval_scope IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'errors', ARRAY['Invalid filing type']);
  END IF;

  -- Get filing
  SELECT * INTO v_filing FROM public.filings WHERE id = p_filing_id;
  
  IF v_filing.id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'errors', ARRAY['Filing not found']);
  END IF;
  
  -- Check filing has not already been filed
  IF v_filing.status IN ('filed', 'accepted') AND NOT COALESCE(v_filing.is_amendment, false) THEN
    v_errors := array_append(v_errors, 'Filing already submitted - create amendment instead');
    v_valid := false;
  END IF;
  
  -- Get active approval
  SELECT * INTO v_approval 
  FROM public.filing_approvals 
  WHERE filing_id = p_filing_id 
  AND approval_scope = v_approval_scope 
  AND revoked_at IS NULL;
  
  IF v_approval.id IS NULL THEN
    v_errors := array_append(v_errors, v_approval_scope || ' approval required');
    v_valid := false;
  END IF;
  
  -- Get relevant snapshot
  IF p_filing_type = 'ACCOUNTS_CH' THEN
    v_snapshot_id := v_filing.accounts_snapshot_id;
    IF v_snapshot_id IS NOT NULL THEN
      SELECT id, snapshot_hash INTO v_snapshot 
      FROM public.accounts_model_snapshots WHERE id = v_snapshot_id;
      v_snapshot_hash := v_snapshot.snapshot_hash;
    END IF;
  ELSIF p_filing_type = 'CT600_HMRC' THEN
    v_snapshot_id := v_filing.ct_snapshot_id;
    IF v_snapshot_id IS NOT NULL THEN
      SELECT id, snapshot_hash INTO v_snapshot 
      FROM public.ct_computation_snapshots WHERE id = v_snapshot_id;
      v_snapshot_hash := v_snapshot.snapshot_hash;
    END IF;
  END IF;
  
  -- Validate snapshot exists
  IF v_snapshot_id IS NULL THEN
    v_errors := array_append(v_errors, 'No snapshot linked to filing');
    v_valid := false;
  ELSIF v_snapshot.id IS NULL THEN
    v_errors := array_append(v_errors, 'Linked snapshot not found');
    v_valid := false;
  END IF;
  
  -- Validate approval matches current snapshot
  IF v_approval.id IS NOT NULL AND v_snapshot_id IS NOT NULL THEN
    IF v_approval.model_snapshot_id != v_snapshot_id THEN
      v_errors := array_append(v_errors, 'Approval is for different snapshot - re-approval required');
      v_valid := false;
    END IF;
    
    IF v_snapshot_hash IS NOT NULL AND v_approval.snapshot_hash != v_snapshot_hash THEN
      v_errors := array_append(v_errors, 'Snapshot hash mismatch - data has changed since approval');
      v_valid := false;
    END IF;
  END IF;
  
  -- Check for superseding snapshot (newer snapshot exists for same entity/period)
  IF p_filing_type = 'ACCOUNTS_CH' AND v_filing.company_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.accounts_model_snapshots 
      WHERE company_id = v_filing.company_id 
      AND period_start = v_filing.period_start 
      AND period_end = v_filing.period_end
      AND created_at > (SELECT created_at FROM public.accounts_model_snapshots WHERE id = v_snapshot_id)
    ) THEN
      v_errors := array_append(v_errors, 'Snapshot has been superseded by newer version');
      v_valid := false;
    END IF;
  END IF;
  
  IF p_filing_type = 'CT600_HMRC' AND v_filing.company_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.ct_computation_snapshots 
      WHERE company_id = v_filing.company_id 
      AND period_start = v_filing.period_start 
      AND period_end = v_filing.period_end
      AND created_at > (SELECT created_at FROM public.ct_computation_snapshots WHERE id = v_snapshot_id)
    ) THEN
      v_errors := array_append(v_errors, 'CT snapshot has been superseded by newer version');
      v_valid := false;
    END IF;
  END IF;
  
  RETURN jsonb_build_object(
    'valid', v_valid,
    'errors', v_errors,
    'approval_id', v_approval.id,
    'snapshot_id', v_snapshot_id,
    'snapshot_hash', v_snapshot_hash
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 9. Function to auto-regenerate CT snapshot when accounts snapshot changes
CREATE OR REPLACE FUNCTION public.regenerate_ct_snapshot_on_accounts_change()
RETURNS TRIGGER AS $$
DECLARE
  v_filing RECORD;
BEGIN
  -- Find filings using this accounts snapshot
  FOR v_filing IN 
    SELECT f.* FROM public.filings f
    WHERE f.accounts_snapshot_id = NEW.id
    AND f.filing_type IN ('corporation_tax', 'CT600')
  LOOP
    -- Mark that CT snapshot needs regeneration
    -- The actual regeneration should be triggered by application code
    -- Here we just log the event
    INSERT INTO public.audit_log (
      organization_id,
      entity_type,
      entity_id,
      action,
      metadata
    ) VALUES (
      v_filing.organization_id,
      'filing',
      v_filing.id,
      'ct_snapshot_regeneration_required',
      jsonb_build_object(
        'accounts_snapshot_id', NEW.id,
        'old_hash', OLD.snapshot_hash,
        'new_hash', NEW.snapshot_hash
      )
    );
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for CT regeneration notification
DROP TRIGGER IF EXISTS trg_accounts_snapshot_ct_regen ON public.accounts_model_snapshots;
CREATE TRIGGER trg_accounts_snapshot_ct_regen
  AFTER UPDATE ON public.accounts_model_snapshots
  FOR EACH ROW
  WHEN (OLD.snapshot_hash IS DISTINCT FROM NEW.snapshot_hash)
  EXECUTE FUNCTION public.regenerate_ct_snapshot_on_accounts_change();

-- 10. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.revoke_approval_with_audit TO authenticated;
GRANT EXECUTE ON FUNCTION public.regress_filing_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_submission_integrity TO authenticated;