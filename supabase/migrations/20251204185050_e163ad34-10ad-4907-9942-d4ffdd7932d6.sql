-- Filing Events table for automation engine compatibility
-- Stores all filing events (submitted, accepted, rejected) for processing by automation rules

CREATE TABLE IF NOT EXISTS public.filing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  filing_id UUID NOT NULL REFERENCES filings(id) ON DELETE CASCADE,
  filing_type TEXT NOT NULL,
  status TEXT NOT NULL,
  emitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX idx_filing_events_organization ON filing_events(organization_id);
CREATE INDEX idx_filing_events_filing ON filing_events(filing_id);
CREATE INDEX idx_filing_events_type ON filing_events(event_type);
CREATE INDEX idx_filing_events_emitted ON filing_events(emitted_at DESC);
CREATE INDEX idx_filing_events_unprocessed ON filing_events(organization_id) WHERE processed_at IS NULL;

-- Enable RLS
ALTER TABLE public.filing_events ENABLE ROW LEVEL SECURITY;

-- RLS policies - only organization users can view/insert events
CREATE POLICY "Org users can view filing events" 
  ON filing_events FOR SELECT 
  USING (user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Org users can insert filing events" 
  ON filing_events FOR INSERT 
  WITH CHECK (user_in_organization(auth.uid(), organization_id));

-- Add comment
COMMENT ON TABLE public.filing_events IS 'Stores filing events for automation engine processing - RTI/CIS/SA/CT/VAT submissions';