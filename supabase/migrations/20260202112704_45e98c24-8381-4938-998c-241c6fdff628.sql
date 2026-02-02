-- Phase 1.1: Add client_type to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_type TEXT NOT NULL DEFAULT 'other';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS preferred_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS mobile_number TEXT;

-- Phase 1.1: Enhance companies table (Limited Company detail schema)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS auth_code TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS trading_status TEXT DEFAULT 'active';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS trading_address JSONB;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS ch_personal_code TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS director_nationality TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS partner_in_charge UUID REFERENCES organization_users(id);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS staff_in_charge UUID REFERENCES organization_users(id);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS internal_reference TEXT;

-- Phase 1.1: Create Self-Assessment detail table
CREATE TABLE IF NOT EXISTS client_detail_sa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  is_mtd BOOLEAN NOT NULL DEFAULT false,
  mtd_quarters JSONB,
  mtd_final_declaration_deadline DATE,
  payment_on_account_jan DECIMAL(12,2),
  payment_on_account_jul DECIMAL(12,2),
  refund_expected BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id)
);

-- Phase 1.1: Create Partnership detail table
CREATE TABLE IF NOT EXISTS client_detail_partnership (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  partnership_utr TEXT,
  partnership_address JSONB,
  partners JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id)
);

-- Phase 1.1: Create CGT detail table
CREATE TABLE IF NOT EXISTS client_detail_cgt (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cgt_number TEXT,
  home_address JSONB,
  property_address JSONB,
  disposal_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id)
);

-- Phase 1.1: Create Charity detail table
CREATE TABLE IF NOT EXISTS client_detail_charity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  charity_number TEXT,
  charity_status TEXT DEFAULT 'active',
  trading_as TEXT,
  charity_year_end DATE,
  gift_aid_claim_expiry DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id)
);

-- Phase 1.2: Add lead_type to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_type TEXT NOT NULL DEFAULT 'other';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ch_company_profile JSONB;

-- Enable RLS on new tables
ALTER TABLE client_detail_sa ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_detail_partnership ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_detail_cgt ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_detail_charity ENABLE ROW LEVEL SECURITY;

-- RLS Policies for client_detail_sa
CREATE POLICY "Users can view SA details for their org" ON client_detail_sa
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert SA details for their org" ON client_detail_sa
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update SA details for their org" ON client_detail_sa
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete SA details for their org" ON client_detail_sa
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for client_detail_partnership
CREATE POLICY "Users can view partnership details for their org" ON client_detail_partnership
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert partnership details for their org" ON client_detail_partnership
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update partnership details for their org" ON client_detail_partnership
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete partnership details for their org" ON client_detail_partnership
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for client_detail_cgt
CREATE POLICY "Users can view CGT details for their org" ON client_detail_cgt
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert CGT details for their org" ON client_detail_cgt
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update CGT details for their org" ON client_detail_cgt
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete CGT details for their org" ON client_detail_cgt
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for client_detail_charity
CREATE POLICY "Users can view charity details for their org" ON client_detail_charity
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert charity details for their org" ON client_detail_charity
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update charity details for their org" ON client_detail_charity
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete charity details for their org" ON client_detail_charity
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_client_detail_sa_client ON client_detail_sa(client_id);
CREATE INDEX IF NOT EXISTS idx_client_detail_sa_org ON client_detail_sa(organization_id);
CREATE INDEX IF NOT EXISTS idx_client_detail_partnership_client ON client_detail_partnership(client_id);
CREATE INDEX IF NOT EXISTS idx_client_detail_partnership_org ON client_detail_partnership(organization_id);
CREATE INDEX IF NOT EXISTS idx_client_detail_cgt_client ON client_detail_cgt(client_id);
CREATE INDEX IF NOT EXISTS idx_client_detail_cgt_org ON client_detail_cgt(organization_id);
CREATE INDEX IF NOT EXISTS idx_client_detail_charity_client ON client_detail_charity(client_id);
CREATE INDEX IF NOT EXISTS idx_client_detail_charity_org ON client_detail_charity(organization_id);
CREATE INDEX IF NOT EXISTS idx_clients_type ON clients(client_type);
CREATE INDEX IF NOT EXISTS idx_leads_type ON leads(lead_type);