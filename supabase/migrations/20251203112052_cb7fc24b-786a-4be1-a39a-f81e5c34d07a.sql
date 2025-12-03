-- Add RLS policy to allow users to delete email queue records in their organization
CREATE POLICY "Users can delete email queue in their organization"
ON email_queue FOR DELETE
USING (user_has_organization_access(organization_id));