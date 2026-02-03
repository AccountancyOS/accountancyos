-- Add setup_dismissed column to organizations table
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS setup_dismissed boolean DEFAULT false;