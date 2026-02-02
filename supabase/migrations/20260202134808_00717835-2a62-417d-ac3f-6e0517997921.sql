-- Phase 6.3: Session Management - Create user_sessions table
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL,
  device_info JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_activity_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  invalidated_at TIMESTAMPTZ,
  invalidated_reason TEXT
);

-- Index for session lookups
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id, invalidated_at) WHERE invalidated_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token) WHERE invalidated_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at) WHERE invalidated_at IS NULL;

-- RLS for user_sessions
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sessions" ON user_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Org admins can manage sessions" ON user_sessions
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  );

-- Phase 6.5: HMRC Authorisations Tracking
CREATE TABLE IF NOT EXISTS hmrc_authorisations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  auth_type TEXT NOT NULL CHECK (auth_type IN ('personal', 'company', 'paye', 'vat', 'ct')),
  authorised_at DATE,
  expires_at DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'revoked')),
  reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT hmrc_auth_entity_check CHECK (client_id IS NOT NULL OR company_id IS NOT NULL)
);

-- Index for HMRC auth lookups
CREATE INDEX IF NOT EXISTS idx_hmrc_auth_client ON hmrc_authorisations(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hmrc_auth_company ON hmrc_authorisations(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hmrc_auth_org ON hmrc_authorisations(organization_id);

-- RLS for hmrc_authorisations
ALTER TABLE hmrc_authorisations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org users can view HMRC authorisations" ON hmrc_authorisations
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Org users can manage HMRC authorisations" ON hmrc_authorisations
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  );