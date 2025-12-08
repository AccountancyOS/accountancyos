-- Create template_blocks table (was missing)
CREATE TABLE IF NOT EXISTS template_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  block_name TEXT NOT NULL,
  block_type TEXT NOT NULL CHECK (block_type IN ('task_group', 'records_request', 'deadline_block')),
  content JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID
);

-- Enable RLS
ALTER TABLE template_blocks ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view template blocks for their org"
  ON template_blocks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_users ou
      WHERE ou.organization_id = template_blocks.organization_id
      AND ou.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage template blocks"
  ON template_blocks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM organization_users ou
      WHERE ou.organization_id = template_blocks.organization_id
      AND ou.user_id = auth.uid()
      AND ou.role IN ('owner', 'admin')
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_template_blocks_org_id ON template_blocks(organization_id);
CREATE INDEX IF NOT EXISTS idx_template_blocks_type ON template_blocks(block_type);