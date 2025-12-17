-- Composite index for user_has_organization_access function
-- This index is critical for RLS performance as the function is called on every row check
-- Order: (user_id, organization_id) matches the function's lookup pattern
CREATE INDEX IF NOT EXISTS idx_organization_users_user_org_lookup 
ON public.organization_users(user_id, organization_id);

-- Analyse the table to update statistics
ANALYZE public.organization_users;

-- Add a comment explaining why this index exists
COMMENT ON INDEX idx_organization_users_user_org_lookup IS 
'Composite index for RLS policy checks via user_has_organization_access function. Do not remove.';