-- Phase 3A: Immutable Filing Model Snapshots + Idempotency

-- 1. Create filing_model_snapshots table (immutable)
CREATE TABLE IF NOT EXISTS public.filing_model_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  company_id UUID REFERENCES public.companies(id),
  client_id UUID REFERENCES public.clients(id),
  snapshot_type TEXT NOT NULL, -- 'cs01', 'accounts_frs105', 'accounts_frs102_1a', 'vat_return', 'ct600', 'sa100'
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  snapshot_data JSONB NOT NULL, -- The complete normalised model
  snapshot_hash TEXT NOT NULL, -- SHA256 of snapshot_data for integrity
  source_workpaper_id UUID REFERENCES public.workpaper_instances(id),
  source_ledger_version TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generator_version TEXT NOT NULL DEFAULT '1.0.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT chk_snapshot_entity CHECK (
    (company_id IS NOT NULL AND client_id IS NULL) OR
    (company_id IS NULL AND client_id IS NOT NULL) OR
    (company_id IS NULL AND client_id IS NULL) -- Allow org-level snapshots for some types
  )
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_filing_model_snapshots_org ON public.filing_model_snapshots(organization_id);
CREATE INDEX IF NOT EXISTS idx_filing_model_snapshots_company ON public.filing_model_snapshots(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_filing_model_snapshots_client ON public.filing_model_snapshots(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_filing_model_snapshots_hash ON public.filing_model_snapshots(snapshot_hash);

-- Enable RLS
ALTER TABLE public.filing_model_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS policies: org-scoped read, insert only (no update/delete)
CREATE POLICY "Users can view their org snapshots"
  ON public.filing_model_snapshots FOR SELECT
  USING (public.user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Users can insert snapshots for their org"
  ON public.filing_model_snapshots FOR INSERT
  WITH CHECK (public.user_in_organization(auth.uid(), organization_id));

-- Explicit block on update (RLS enforces immutability)
CREATE POLICY "Snapshots are immutable - no updates"
  ON public.filing_model_snapshots FOR UPDATE
  USING (false);

-- Explicit block on delete (RLS enforces immutability)
CREATE POLICY "Snapshots are immutable - no deletes"
  ON public.filing_model_snapshots FOR DELETE
  USING (false);

-- Trigger to prevent any updates at database level (belt and suspenders)
CREATE OR REPLACE FUNCTION public.prevent_snapshot_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'filing_model_snapshots is immutable - modifications not allowed';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_prevent_snapshot_update
  BEFORE UPDATE ON public.filing_model_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.prevent_snapshot_modification();

CREATE TRIGGER trg_prevent_snapshot_delete
  BEFORE DELETE ON public.filing_model_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.prevent_snapshot_modification();

-- 2. Extend filings table with idempotency and retry fields
ALTER TABLE public.filings
  ADD COLUMN IF NOT EXISTS model_snapshot_id UUID REFERENCES public.filing_model_snapshots(id),
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS error_detail JSONB;

-- Unique constraint for idempotency: org + provider + type + company + period + snapshot
CREATE UNIQUE INDEX IF NOT EXISTS idx_filings_idempotency_key
  ON public.filings (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND status NOT IN ('cancelled', 'rejected');

-- Index for retry processing
CREATE INDEX IF NOT EXISTS idx_filings_retry ON public.filings(next_retry_at) 
  WHERE next_retry_at IS NOT NULL AND status IN ('pending', 'submitted', 'failed');

-- 3. Add provider_events to filing_submissions for full audit trail
ALTER TABLE public.filing_submissions
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS correlation_id TEXT,
  ADD COLUMN IF NOT EXISTS snapshot_id UUID REFERENCES public.filing_model_snapshots(id),
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;