-- Add missing fields to trial_balance_snapshots
ALTER TABLE public.trial_balance_snapshots 
ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES public.jobs(id),
ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS finalised_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS finalised_by UUID,
ADD COLUMN IF NOT EXISTS total_debit NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_credit NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS is_balanced BOOLEAN DEFAULT true;

-- Add prepared_by and reviewed_by to workpaper_instances
ALTER TABLE public.workpaper_instances
ADD COLUMN IF NOT EXISTS prepared_by UUID,
ADD COLUMN IF NOT EXISTS prepared_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reviewed_by UUID,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS finalised_by UUID,
ADD COLUMN IF NOT EXISTS finalised_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT false;

-- Add is_global flag to tb_account_mappings for global templates
ALTER TABLE public.tb_account_mappings
ADD COLUMN IF NOT EXISTS is_global BOOLEAN NOT NULL DEFAULT false;

-- Create index for faster snapshot lookups
CREATE INDEX IF NOT EXISTS idx_tb_snapshots_entity ON public.trial_balance_snapshots(organization_id, client_id, company_id, period_end);
CREATE INDEX IF NOT EXISTS idx_tb_snapshots_status ON public.trial_balance_snapshots(status);

-- Create index for workpaper lookups by snapshot
CREATE INDEX IF NOT EXISTS idx_workpaper_snapshot ON public.workpaper_instances(trial_balance_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_workpaper_entity_type ON public.workpaper_instances(organization_id, client_id, company_id, service_type);