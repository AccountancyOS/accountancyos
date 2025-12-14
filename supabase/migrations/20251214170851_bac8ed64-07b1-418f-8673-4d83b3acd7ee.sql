-- Phase 3D: VAT Control Reconciliation (Warning-Only, Never Blocking)
-- Classification: INFO (immaterial) or WARNING (material, requires acknowledgement)

-- Create vat_reconciliations table
CREATE TABLE IF NOT EXISTS public.vat_reconciliations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  vat_period_id UUID NOT NULL REFERENCES public.vat_periods(id) ON DELETE CASCADE,
  model_snapshot_id UUID REFERENCES public.filing_model_snapshots(id),
  
  -- Reconciliation values
  expected_vat NUMERIC(15,2) NOT NULL DEFAULT 0,
  actual_vat NUMERIC(15,2) NOT NULL DEFAULT 0,
  difference NUMERIC(15,2) NOT NULL DEFAULT 0,
  absolute_difference NUMERIC(15,2) NOT NULL DEFAULT 0,
  
  -- Classification: INFO or WARNING only (no ERROR)
  classification TEXT NOT NULL DEFAULT 'INFO' CHECK (classification IN ('INFO', 'WARNING')),
  tolerance_amount NUMERIC(15,2) NOT NULL DEFAULT 1.00,
  
  -- Acknowledgement (required for WARNING before submission)
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_by_user_id UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ,
  acknowledgement_note TEXT,
  
  -- Metadata
  control_account_ids UUID[] DEFAULT '{}',
  calculation_details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Constraints
  CONSTRAINT chk_entity CHECK ((company_id IS NOT NULL AND client_id IS NULL) OR (client_id IS NOT NULL AND company_id IS NULL)),
  CONSTRAINT unique_period_snapshot UNIQUE (vat_period_id, model_snapshot_id)
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_vat_reconciliations_org ON public.vat_reconciliations(organization_id);
CREATE INDEX IF NOT EXISTS idx_vat_reconciliations_period ON public.vat_reconciliations(vat_period_id);
CREATE INDEX IF NOT EXISTS idx_vat_reconciliations_snapshot ON public.vat_reconciliations(model_snapshot_id);

-- Enable RLS
ALTER TABLE public.vat_reconciliations ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view reconciliations in their organization"
  ON public.vat_reconciliations FOR SELECT
  USING (public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Users can create reconciliations in their organization"
  ON public.vat_reconciliations FOR INSERT
  WITH CHECK (public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Users can update reconciliations in their organization"
  ON public.vat_reconciliations FOR UPDATE
  USING (public.user_in_organization(auth.uid(), organization_id));

-- Add tolerance setting to organizations
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS vat_reconciliation_tolerance NUMERIC(15,2) DEFAULT 1.00;

-- Create RPC for acknowledging reconciliation
CREATE OR REPLACE FUNCTION public.acknowledge_vat_reconciliation(
  p_reconciliation_id UUID,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reconciliation RECORD;
  v_user_id UUID;
  v_org_role TEXT;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  -- Fetch reconciliation
  SELECT * INTO v_reconciliation FROM vat_reconciliations WHERE id = p_reconciliation_id;
  
  IF v_reconciliation.id IS NULL THEN
    RAISE EXCEPTION 'Reconciliation not found';
  END IF;
  
  -- Check user has org access and is at least staff
  SELECT role INTO v_org_role FROM organization_users 
  WHERE user_id = v_user_id AND organization_id = v_reconciliation.organization_id;
  
  IF v_org_role IS NULL THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  IF v_org_role NOT IN ('owner', 'admin', 'staff') THEN
    RAISE EXCEPTION 'Only accountants can acknowledge reconciliation differences';
  END IF;
  
  -- Only WARNING classification requires acknowledgement
  IF v_reconciliation.classification != 'WARNING' THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Reconciliation is INFO classification, no acknowledgement required'
    );
  END IF;
  
  -- Already acknowledged?
  IF v_reconciliation.acknowledged THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Reconciliation already acknowledged',
      'acknowledged_by', v_reconciliation.acknowledged_by_user_id,
      'acknowledged_at', v_reconciliation.acknowledged_at
    );
  END IF;
  
  -- Acknowledge
  UPDATE vat_reconciliations
  SET 
    acknowledged = true,
    acknowledged_by_user_id = v_user_id,
    acknowledged_at = now(),
    acknowledgement_note = p_note,
    updated_at = now()
  WHERE id = p_reconciliation_id;
  
  -- Audit log
  INSERT INTO audit_log (
    organization_id, entity_type, entity_id, action, user_id, metadata
  ) VALUES (
    v_reconciliation.organization_id,
    'vat_reconciliation',
    p_reconciliation_id,
    'VAT_RECONCILIATION_ACKNOWLEDGED',
    v_user_id,
    jsonb_build_object(
      'difference', v_reconciliation.difference,
      'classification', v_reconciliation.classification,
      'vat_period_id', v_reconciliation.vat_period_id,
      'model_snapshot_id', v_reconciliation.model_snapshot_id,
      'note', p_note
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'acknowledged_at', now(),
    'acknowledged_by', v_user_id
  );
END;
$$;

-- Create trigger for updated_at
CREATE TRIGGER update_vat_reconciliations_updated_at
  BEFORE UPDATE ON public.vat_reconciliations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();