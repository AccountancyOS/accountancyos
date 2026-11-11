-- Add VAT-specific columns and enhancements for full MTD VAT filing support

-- Add vat_obligations cache table for storing fetched obligations
CREATE TABLE IF NOT EXISTS public.vat_obligations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  vrn TEXT NOT NULL,
  period_key TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL, -- 'O' = open, 'F' = fulfilled
  received_date TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_response JSONB,
  CONSTRAINT chk_vat_obligation_entity CHECK (
    (company_id IS NOT NULL AND client_id IS NULL) OR
    (company_id IS NULL AND client_id IS NOT NULL)
  )
);

-- Unique constraint on period per VRN
CREATE UNIQUE INDEX IF NOT EXISTS idx_vat_obligations_unique 
ON vat_obligations (vrn, period_key);

-- Add filing_validations table for structured validation results
CREATE TABLE IF NOT EXISTS public.filing_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id UUID NOT NULL REFERENCES public.filings(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  validation_type TEXT NOT NULL, -- 'pre_submission', 'schema', 'business_rules'
  status TEXT NOT NULL, -- 'pass', 'fail', 'warning'
  validated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  validator_version TEXT NOT NULL DEFAULT '1.0.0',
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- results array: [{severity: 'error'|'warn', code: string, message: string, field: string}]
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_filing_validations_filing ON filing_validations(filing_id);

-- Add filing_provider_events table for complete HMRC API audit trail
CREATE TABLE IF NOT EXISTS public.filing_provider_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id UUID REFERENCES public.filings(id) ON DELETE SET NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'HMRC', 'COMPANIES_HOUSE'
  event_type TEXT NOT NULL, -- 'obligations_fetch', 'submit', 'status_check'
  endpoint TEXT NOT NULL,
  environment TEXT NOT NULL, -- 'sandbox', 'production'
  correlation_id TEXT,
  request_summary JSONB, -- redacted request metadata
  response_status INTEGER,
  response_summary JSONB, -- redacted response metadata  
  duration_ms INTEGER,
  payload_artifact_path TEXT, -- storage path if payload too large
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_filing_provider_events_filing ON filing_provider_events(filing_id);
CREATE INDEX IF NOT EXISTS idx_filing_provider_events_created ON filing_provider_events(created_at DESC);

-- Add filing_payload_artifacts table for storing generated payloads
CREATE TABLE IF NOT EXISTS public.filing_payload_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filing_id UUID NOT NULL REFERENCES public.filings(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  snapshot_id UUID REFERENCES public.filing_model_snapshots(id),
  artifact_type TEXT NOT NULL, -- 'vat_return_json', 'cs01_xml', 'accounts_ixbrl'
  content_type TEXT NOT NULL, -- 'application/json', 'application/xml', etc.
  payload_data JSONB, -- for small payloads (< 1MB)
  storage_path TEXT, -- for large payloads stored in storage
  sha256_hash TEXT NOT NULL,
  generator_version TEXT NOT NULL DEFAULT '1.0.0',
  schema_version TEXT NOT NULL, -- e.g., 'HMRC_MTD_VAT_1.0'
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_filing_payload_artifacts_unique 
ON filing_payload_artifacts(filing_id, artifact_type);

-- Extend filings table with VAT-specific fields
ALTER TABLE public.filings 
ADD COLUMN IF NOT EXISTS vrn TEXT,
ADD COLUMN IF NOT EXISTS obligation_id UUID REFERENCES public.vat_obligations(id);

-- Enable RLS on new tables
ALTER TABLE public.vat_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.filing_validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.filing_provider_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.filing_payload_artifacts ENABLE ROW LEVEL SECURITY;

-- RLS policies for vat_obligations
CREATE POLICY "Users can view their org VAT obligations" ON public.vat_obligations
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert VAT obligations for their org" ON public.vat_obligations
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their org VAT obligations" ON public.vat_obligations
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
    )
  );

-- RLS policies for filing_validations
CREATE POLICY "Users can view their org filing validations" ON public.filing_validations
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert filing validations for their org" ON public.filing_validations
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
    )
  );

-- RLS policies for filing_provider_events
CREATE POLICY "Users can view their org provider events" ON public.filing_provider_events
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert provider events for their org" ON public.filing_provider_events
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
    )
  );

-- RLS policies for filing_payload_artifacts
CREATE POLICY "Users can view their org payload artifacts" ON public.filing_payload_artifacts
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert payload artifacts for their org" ON public.filing_payload_artifacts
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
    )
  );