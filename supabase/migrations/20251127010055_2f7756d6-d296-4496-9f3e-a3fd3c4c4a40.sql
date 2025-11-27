-- Add columns to workpaper_instances for enhanced functionality
ALTER TABLE workpaper_instances 
ADD COLUMN IF NOT EXISTS source_data JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS computed_data JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS owner_user_id UUID,
ADD COLUMN IF NOT EXISTS last_data_sync_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS data_source TEXT;

-- Create index for filtering by owner
CREATE INDEX IF NOT EXISTS idx_workpaper_instances_owner ON workpaper_instances(owner_user_id);

-- Create index for filtering by data source
CREATE INDEX IF NOT EXISTS idx_workpaper_instances_data_source ON workpaper_instances(data_source);

COMMENT ON COLUMN workpaper_instances.source_data IS 'Raw input data from questionnaire/bookkeeping/payroll';
COMMENT ON COLUMN workpaper_instances.computed_data IS 'Calculated fields and formulas results';
COMMENT ON COLUMN workpaper_instances.owner_user_id IS 'User assigned to this workpaper';
COMMENT ON COLUMN workpaper_instances.last_data_sync_at IS 'When upstream data was last pulled';
COMMENT ON COLUMN workpaper_instances.data_source IS 'Source type: questionnaire, bookkeeping, payroll, manual';