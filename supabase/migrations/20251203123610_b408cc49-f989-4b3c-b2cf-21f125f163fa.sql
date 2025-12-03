-- =====================================================
-- Phase 1: Contacts Table
-- =====================================================

CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT, -- e.g., "Director", "FD", "Bookkeeper", "Personal"
  email TEXT NOT NULL,
  phone TEXT,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- A contact must belong to at least one entity (can belong to both for director scenario)
  CONSTRAINT contact_has_entity CHECK (
    client_id IS NOT NULL OR company_id IS NOT NULL
  )
);

-- Indexes for efficient email lookups
CREATE INDEX idx_contacts_email ON contacts(LOWER(email));
CREATE INDEX idx_contacts_client_id ON contacts(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_contacts_company_id ON contacts(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX idx_contacts_organization_id ON contacts(organization_id);

-- RLS policies
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage contacts in their organization"
  ON contacts FOR ALL
  USING (user_has_organization_access(organization_id))
  WITH CHECK (user_has_organization_access(organization_id));

-- Trigger for updated_at
CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

-- =====================================================
-- Phase 2: Message Entity Links Table (generic linking)
-- =====================================================

CREATE TABLE message_entity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Message reference (exactly one must be set)
  email_message_id UUID REFERENCES email_messages(id) ON DELETE CASCADE,
  client_message_id UUID REFERENCES client_messages(id) ON DELETE CASCADE,
  
  -- Linked entity
  entity_type TEXT NOT NULL CHECK (entity_type IN ('job', 'filing', 'workpaper', 'engagement')),
  entity_id UUID NOT NULL,
  
  -- Audit
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tagged_by UUID,
  tagged_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT one_message_type CHECK (
    (email_message_id IS NOT NULL AND client_message_id IS NULL) OR
    (email_message_id IS NULL AND client_message_id IS NOT NULL)
  )
);

-- Indexes for efficient lookups
CREATE INDEX idx_mel_email_message ON message_entity_links(email_message_id) WHERE email_message_id IS NOT NULL;
CREATE INDEX idx_mel_client_message ON message_entity_links(client_message_id) WHERE client_message_id IS NOT NULL;
CREATE INDEX idx_mel_entity ON message_entity_links(entity_type, entity_id);
CREATE INDEX idx_mel_organization ON message_entity_links(organization_id);

-- Unique constraints to prevent duplicate links (partial indexes)
CREATE UNIQUE INDEX idx_mel_email_unique ON message_entity_links(email_message_id, entity_type, entity_id) WHERE email_message_id IS NOT NULL;
CREATE UNIQUE INDEX idx_mel_client_unique ON message_entity_links(client_message_id, entity_type, entity_id) WHERE client_message_id IS NOT NULL;

-- RLS policies
ALTER TABLE message_entity_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage message links in their organization"
  ON message_entity_links FOR ALL
  USING (user_has_organization_access(organization_id))
  WITH CHECK (user_has_organization_access(organization_id));

-- =====================================================
-- Phase 3: Find Entities By Email Function
-- =====================================================

CREATE OR REPLACE FUNCTION find_entities_by_email(
  _org_id UUID,
  _email TEXT
) RETURNS TABLE (
  entity_type TEXT,
  entity_id UUID,
  entity_name TEXT,
  match_source TEXT -- 'primary' or 'contact'
) 
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  -- Check client primary emails
  SELECT 
    'client'::TEXT as entity_type,
    c.id as entity_id,
    (c.first_name || ' ' || c.last_name)::TEXT as entity_name,
    'primary'::TEXT as match_source
  FROM clients c
  WHERE c.organization_id = _org_id
    AND LOWER(c.email) = LOWER(_email)
  
  UNION ALL
  
  -- Check company primary emails
  SELECT 
    'company'::TEXT,
    co.id,
    co.company_name::TEXT,
    'primary'::TEXT
  FROM companies co
  WHERE co.organization_id = _org_id
    AND LOWER(co.email) = LOWER(_email)
  
  UNION ALL
  
  -- Check contacts linked to clients
  SELECT DISTINCT
    'client'::TEXT,
    ct.client_id,
    (cl.first_name || ' ' || cl.last_name)::TEXT,
    'contact'::TEXT
  FROM contacts ct
  JOIN clients cl ON cl.id = ct.client_id
  WHERE ct.organization_id = _org_id
    AND LOWER(ct.email) = LOWER(_email)
    AND ct.client_id IS NOT NULL
  
  UNION ALL
  
  -- Check contacts linked to companies
  SELECT DISTINCT
    'company'::TEXT,
    ct.company_id,
    co.company_name::TEXT,
    'contact'::TEXT
  FROM contacts ct
  JOIN companies co ON co.id = ct.company_id
  WHERE ct.organization_id = _org_id
    AND LOWER(ct.email) = LOWER(_email)
    AND ct.company_id IS NOT NULL;
END;
$$;

-- =====================================================
-- Phase 4: Add matched_entities column to email_messages
-- =====================================================

ALTER TABLE email_messages 
ADD COLUMN IF NOT EXISTS matched_entities JSONB DEFAULT '[]'::jsonb;

-- Index for matched_entities queries
CREATE INDEX idx_email_messages_matched_entities ON email_messages USING GIN (matched_entities);

-- =====================================================
-- Phase 5: Backfill existing email_messages matched_entities
-- =====================================================

-- Update existing emails that have client_id to populate matched_entities
UPDATE email_messages em
SET matched_entities = jsonb_build_array(
  jsonb_build_object(
    'entity_type', 'client',
    'entity_id', em.client_id,
    'entity_name', (SELECT first_name || ' ' || last_name FROM clients WHERE id = em.client_id),
    'match_source', 'primary'
  )
)
WHERE em.client_id IS NOT NULL 
  AND (em.matched_entities IS NULL OR em.matched_entities = '[]'::jsonb);

-- Update existing emails that have company_id to populate matched_entities
UPDATE email_messages em
SET matched_entities = 
  CASE 
    WHEN em.matched_entities IS NULL OR em.matched_entities = '[]'::jsonb THEN
      jsonb_build_array(
        jsonb_build_object(
          'entity_type', 'company',
          'entity_id', em.company_id,
          'entity_name', (SELECT company_name FROM companies WHERE id = em.company_id),
          'match_source', 'primary'
        )
      )
    ELSE
      em.matched_entities || jsonb_build_array(
        jsonb_build_object(
          'entity_type', 'company',
          'entity_id', em.company_id,
          'entity_name', (SELECT company_name FROM companies WHERE id = em.company_id),
          'match_source', 'primary'
        )
      )
  END
WHERE em.company_id IS NOT NULL 
  AND NOT (em.matched_entities @> jsonb_build_array(jsonb_build_object('entity_type', 'company', 'entity_id', em.company_id)));