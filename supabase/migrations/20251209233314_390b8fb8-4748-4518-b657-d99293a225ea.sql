-- Allow NULL organization_id for system templates
ALTER TABLE templates ALTER COLUMN organization_id DROP NOT NULL;

-- Update RLS policy to handle system templates (where organization_id IS NULL)
DROP POLICY IF EXISTS "Users can view templates in their organization" ON templates;
CREATE POLICY "Users can view templates in their organization or system templates"
  ON templates FOR SELECT
  USING (
    organization_id IS NULL 
    OR organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can manage templates in their organization" ON templates;
CREATE POLICY "Users can manage templates in their organization"
  ON templates FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_users WHERE user_id = auth.uid()
    )
  );

-- Insert system email templates
INSERT INTO templates (organization_id, name, type, status, service, content)
VALUES
  (NULL, 'Records Request', 'email', 'active', 'general', '{"subject": "Records Required - {{job.name}}", "body": "Hi {{client.first_name}},\n\nWe need the following records to complete your {{job.service_type}}.\n\nPlease upload them to your client portal at your earliest convenience.\n\nBest regards,\n{{organization.name}}", "htmlBody": "<p>Hi {{client.first_name}},</p><p>We need the following records to complete your {{job.service_type}}.</p><p>Please upload them to your client portal at your earliest convenience.</p><p>Best regards,<br>{{organization.name}}</p>", "category": "records", "placeholders_used": ["client.first_name", "job.name", "job.service_type", "organization.name"]}'::jsonb),
  
  (NULL, 'Deadline Reminder', 'email', 'active', 'general', '{"subject": "Reminder: {{deadline.name}} due {{deadline.due_date}}", "body": "Hi {{client.first_name}},\n\nThis is a friendly reminder that {{deadline.name}} is due on {{deadline.due_date}}.\n\nPlease get in touch if you have any questions.\n\nBest regards,\n{{organization.name}}", "htmlBody": "<p>Hi {{client.first_name}},</p><p>This is a friendly reminder that <strong>{{deadline.name}}</strong> is due on <strong>{{deadline.due_date}}</strong>.</p><p>Please get in touch if you have any questions.</p><p>Best regards,<br>{{organization.name}}</p>", "category": "chasing", "placeholders_used": ["client.first_name", "deadline.name", "deadline.due_date", "organization.name"]}'::jsonb),
  
  (NULL, 'Welcome Email', 'email', 'active', 'general', '{"subject": "Welcome to {{organization.name}}", "body": "Hi {{client.first_name}},\n\nWelcome aboard! We are excited to have you as a client.\n\nYou can access your client portal to view documents, complete tasks, and communicate with us.\n\nIf you have any questions, please do not hesitate to reach out.\n\nBest regards,\n{{organization.name}}", "htmlBody": "<p>Hi {{client.first_name}},</p><p>Welcome aboard! We are excited to have you as a client.</p><p>You can access your client portal to view documents, complete tasks, and communicate with us.</p><p>If you have any questions, please do not hesitate to reach out.</p><p>Best regards,<br>{{organization.name}}</p>", "category": "onboarding", "placeholders_used": ["client.first_name", "organization.name"]}'::jsonb),
  
  (NULL, 'Filing Approval Request', 'email', 'active', 'general', '{"subject": "{{filing.type}} Ready for Your Approval", "body": "Hi {{client.first_name}},\n\nYour {{filing.type}} for the period {{period}} is now ready for your review and approval.\n\nPlease log in to your client portal to review the documents and approve the filing.\n\nBest regards,\n{{organization.name}}", "htmlBody": "<p>Hi {{client.first_name}},</p><p>Your <strong>{{filing.type}}</strong> for the period {{period}} is now ready for your review and approval.</p><p>Please log in to your client portal to review the documents and approve the filing.</p><p>Best regards,<br>{{organization.name}}</p>", "category": "filing", "placeholders_used": ["client.first_name", "filing.type", "period", "organization.name"]}'::jsonb),
  
  (NULL, 'Payment Reminder', 'email', 'active', 'general', '{"subject": "Payment Reminder: Invoice Due", "body": "Hi {{client.first_name}},\n\nThis is a friendly reminder that you have an outstanding invoice due for payment.\n\nPlease log in to your client portal to view and pay your invoice.\n\nBest regards,\n{{organization.name}}", "htmlBody": "<p>Hi {{client.first_name}},</p><p>This is a friendly reminder that you have an outstanding invoice due for payment.</p><p>Please log in to your client portal to view and pay your invoice.</p><p>Best regards,<br>{{organization.name}}</p>", "category": "billing", "placeholders_used": ["client.first_name", "organization.name"]}'::jsonb),
  
  (NULL, 'Thank You', 'email', 'active', 'general', '{"subject": "Thank You - {{job.name}} Complete", "body": "Hi {{client.first_name}},\n\nThank you for your cooperation. Your {{job.name}} has been successfully completed and filed.\n\nIf you have any questions, please do not hesitate to reach out.\n\nBest regards,\n{{organization.name}}", "htmlBody": "<p>Hi {{client.first_name}},</p><p>Thank you for your cooperation. Your <strong>{{job.name}}</strong> has been successfully completed and filed.</p><p>If you have any questions, please do not hesitate to reach out.</p><p>Best regards,<br>{{organization.name}}</p>", "category": "general", "placeholders_used": ["client.first_name", "job.name", "organization.name"]}'::jsonb)
ON CONFLICT DO NOTHING;