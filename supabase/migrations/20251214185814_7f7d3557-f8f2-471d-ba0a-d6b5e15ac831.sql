-- Phase 5B: Filing Engine Completion Schema

-- Filing approvals table (separate accounts & CT approvals)
CREATE TABLE public.filing_approvals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  filing_id UUID NOT NULL REFERENCES public.filings(id),
  approval_scope TEXT NOT NULL CHECK (approval_scope IN ('ACCOUNTS', 'CT600')),
  model_snapshot_id UUID NOT NULL,
  approved_by_role TEXT NOT NULL CHECK (approved_by_role IN ('CLIENT', 'ACCOUNTANT')),
  approval_method TEXT NOT NULL CHECK (approval_method IN ('PORTAL', 'EMAIL', 'OVERRIDE')),
  approval_reason TEXT,
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  revoked_at TIMESTAMP WITH TIME ZONE,
  revoked_by UUID,
  revocation_reason TEXT,
  snapshot_hash TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add indexes
CREATE INDEX idx_filing_approvals_filing ON public.filing_approvals(filing_id);
CREATE INDEX idx_filing_approvals_scope ON public.filing_approvals(approval_scope);
CREATE INDEX idx_filing_approvals_org ON public.filing_approvals(organization_id);
CREATE UNIQUE INDEX idx_filing_approvals_active ON public.filing_approvals(filing_id, approval_scope) 
  WHERE revoked_at IS NULL;

-- Enable RLS
ALTER TABLE public.filing_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "filing_approvals_org_access" ON public.filing_approvals
  FOR ALL USING (public.user_in_organization(auth.uid(), organization_id));

-- Filing queue table for submission workers
CREATE TABLE public.filing_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  filing_id UUID NOT NULL REFERENCES public.filings(id),
  filing_type TEXT NOT NULL CHECK (filing_type IN ('ACCOUNTS_CH', 'CT600_HMRC', 'VAT_HMRC')),
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  idempotency_key TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  approval_id UUID REFERENCES public.filing_approvals(id),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  next_attempt_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  error_message TEXT,
  error_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for queue processing
CREATE INDEX idx_filing_queue_status ON public.filing_queue(status, next_attempt_at);
CREATE INDEX idx_filing_queue_filing ON public.filing_queue(filing_id);
CREATE UNIQUE INDEX idx_filing_queue_idempotency ON public.filing_queue(idempotency_key);

-- Enable RLS
ALTER TABLE public.filing_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "filing_queue_org_access" ON public.filing_queue
  FOR ALL USING (public.user_in_organization(auth.uid(), organization_id));

-- Add amendment tracking to filings
ALTER TABLE public.filings 
ADD COLUMN IF NOT EXISTS is_amendment BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS original_filing_id UUID REFERENCES public.filings(id),
ADD COLUMN IF NOT EXISTS amendment_reason TEXT,
ADD COLUMN IF NOT EXISTS accounts_snapshot_id UUID,
ADD COLUMN IF NOT EXISTS ct_snapshot_id UUID,
ADD COLUMN IF NOT EXISTS accounts_approval_id UUID,
ADD COLUMN IF NOT EXISTS ct_approval_id UUID;

-- Function to revoke approvals when snapshot changes
CREATE OR REPLACE FUNCTION public.revoke_approvals_on_snapshot_change()
RETURNS TRIGGER AS $$
BEGIN
  -- If accounts snapshot changed, revoke both approvals
  IF OLD.accounts_snapshot_id IS DISTINCT FROM NEW.accounts_snapshot_id THEN
    UPDATE public.filing_approvals
    SET revoked_at = now(), revocation_reason = 'accounts_snapshot_changed'
    WHERE filing_id = NEW.id AND revoked_at IS NULL;
  -- If only CT snapshot changed, revoke CT approval only
  ELSIF OLD.ct_snapshot_id IS DISTINCT FROM NEW.ct_snapshot_id THEN
    UPDATE public.filing_approvals
    SET revoked_at = now(), revocation_reason = 'ct_snapshot_changed'
    WHERE filing_id = NEW.id AND approval_scope = 'CT600' AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for automatic revocation
CREATE TRIGGER trigger_revoke_approvals_on_snapshot_change
BEFORE UPDATE ON public.filings
FOR EACH ROW
EXECUTE FUNCTION public.revoke_approvals_on_snapshot_change();

-- Function to validate filing submission
CREATE OR REPLACE FUNCTION public.validate_filing_submission(
  p_filing_id UUID,
  p_filing_type TEXT,
  p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_filing RECORD;
  v_approval RECORD;
  v_errors TEXT[] := ARRAY[]::TEXT[];
  v_user_role TEXT;
BEGIN
  -- Get filing
  SELECT * INTO v_filing FROM public.filings WHERE id = p_filing_id;
  
  IF v_filing.id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'errors', ARRAY['Filing not found']);
  END IF;
  
  -- Check user role (must be accountant)
  SELECT role INTO v_user_role 
  FROM public.organization_users 
  WHERE user_id = p_user_id AND organization_id = v_filing.organization_id;
  
  IF v_user_role NOT IN ('owner', 'admin', 'staff') THEN
    v_errors := array_append(v_errors, 'Only accountants can submit filings');
  END IF;
  
  -- Check approval exists and is valid
  SELECT * INTO v_approval 
  FROM public.filing_approvals 
  WHERE filing_id = p_filing_id 
    AND approval_scope = CASE WHEN p_filing_type = 'ACCOUNTS_CH' THEN 'ACCOUNTS' ELSE 'CT600' END
    AND revoked_at IS NULL
  ORDER BY approved_at DESC
  LIMIT 1;
  
  IF v_approval.id IS NULL THEN
    v_errors := array_append(v_errors, 'Approval required before submission');
  ELSE
    -- Verify snapshot hash matches
    IF p_filing_type = 'ACCOUNTS_CH' THEN
      IF v_approval.snapshot_hash != (
        SELECT snapshot_hash FROM public.accounts_model_snapshots WHERE id = v_filing.accounts_snapshot_id
      ) THEN
        v_errors := array_append(v_errors, 'Snapshot hash mismatch - approval invalid');
      END IF;
    ELSE
      IF v_approval.snapshot_hash != (
        SELECT snapshot_hash FROM public.ct_computation_snapshots WHERE id = v_filing.ct_snapshot_id
      ) THEN
        v_errors := array_append(v_errors, 'Snapshot hash mismatch - approval invalid');
      END IF;
    END IF;
  END IF;
  
  RETURN jsonb_build_object(
    'valid', array_length(v_errors, 1) IS NULL,
    'errors', COALESCE(v_errors, ARRAY[]::TEXT[]),
    'approval_id', v_approval.id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to queue filing for submission
CREATE OR REPLACE FUNCTION public.queue_filing_for_submission(
  p_filing_id UUID,
  p_filing_type TEXT,
  p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_validation JSONB;
  v_filing RECORD;
  v_snapshot_hash TEXT;
  v_idempotency_key TEXT;
  v_queue_id UUID;
  v_existing_queue RECORD;
BEGIN
  -- Validate first
  v_validation := public.validate_filing_submission(p_filing_id, p_filing_type, p_user_id);
  
  IF NOT (v_validation->>'valid')::boolean THEN
    RETURN v_validation;
  END IF;
  
  -- Get filing and snapshot hash
  SELECT * INTO v_filing FROM public.filings WHERE id = p_filing_id;
  
  IF p_filing_type = 'ACCOUNTS_CH' THEN
    SELECT snapshot_hash INTO v_snapshot_hash 
    FROM public.accounts_model_snapshots WHERE id = v_filing.accounts_snapshot_id;
  ELSE
    SELECT snapshot_hash INTO v_snapshot_hash 
    FROM public.ct_computation_snapshots WHERE id = v_filing.ct_snapshot_id;
  END IF;
  
  -- Generate idempotency key
  v_idempotency_key := v_filing.organization_id || ':' || p_filing_type || ':' || 
    COALESCE(v_filing.company_id::text, v_filing.client_id::text) || ':' ||
    v_filing.period_start || ':' || v_filing.period_end || ':' || v_snapshot_hash;
  
  -- Check for existing queue entry
  SELECT * INTO v_existing_queue 
  FROM public.filing_queue 
  WHERE idempotency_key = v_idempotency_key AND status NOT IN ('failed', 'cancelled');
  
  IF v_existing_queue.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'valid', false,
      'errors', ARRAY['Filing already queued or submitted with this snapshot'],
      'existing_queue_id', v_existing_queue.id
    );
  END IF;
  
  -- Insert queue entry
  INSERT INTO public.filing_queue (
    organization_id, filing_id, filing_type, idempotency_key, snapshot_hash, 
    approval_id, status
  )
  VALUES (
    v_filing.organization_id, p_filing_id, p_filing_type, v_idempotency_key, 
    v_snapshot_hash, (v_validation->>'approval_id')::uuid, 'queued'
  )
  RETURNING id INTO v_queue_id;
  
  -- Update filing status
  UPDATE public.filings SET status = 'queued' WHERE id = p_filing_id;
  
  RETURN jsonb_build_object(
    'valid', true,
    'queue_id', v_queue_id,
    'idempotency_key', v_idempotency_key
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;