
-- =========================================================================
-- 1. Schema: source_template_id link + uniqueness
-- =========================================================================
ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS source_template_id uuid REFERENCES public.templates(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS templates_org_source_unique
  ON public.templates (organization_id, source_template_id)
  WHERE source_template_id IS NOT NULL AND organization_id IS NOT NULL;

-- =========================================================================
-- 2. Seed new system templates (idempotent via stable IDs)
-- =========================================================================
INSERT INTO public.templates (id, organization_id, name, description, type, service, status, content, tags, version_number)
VALUES
('00000000-0000-0000-0000-000000000a02', NULL, 'Quote Reminder', 'Polite reminder that a proposal is awaiting acceptance.', 'email', NULL, 'active',
 jsonb_build_object(
   'category','Quotes',
   'subject','Reminder: Your Quote from {{organization.name}}',
   'body', E'Dear {{client.first_name}},\n\nThis is a friendly reminder that your quote from {{organization.name}} is still awaiting review.\n\nYou can review and accept it using the link below:\n{{accept_link}}\n\nPlease let us know if you have any questions before accepting.\n\nKind regards,\n{{organization.name}}',
   'htmlBody', '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;"><p>Dear {{client.first_name}},</p><p>This is a friendly reminder that your quote from <strong>{{organization.name}}</strong> is still awaiting review.</p><p style="margin:24px 0;"><a href="{{accept_link}}" style="background-color:#0f766e;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">Review and accept your quote</a></p><p>Please let us know if you have any questions before accepting.</p><p>Kind regards,<br/>{{organization.name}}</p></div>'
 ),
 '["system_default","quote_reminder"]'::jsonb, 1),
('00000000-0000-0000-0000-000000000a03', NULL, 'Quote Final Reminder', 'Final reminder before a proposal expires.', 'email', NULL, 'active',
 jsonb_build_object(
   'category','Quotes',
   'subject','Final Reminder: Your Quote from {{organization.name}}',
   'body', E'Dear {{client.first_name}},\n\nThis is a final reminder that your quote from {{organization.name}} is still awaiting review.\n\nYou can review and accept it here:\n{{accept_link}}\n\nIf you would still like to proceed, please accept the quote or reply to this email and we will be happy to help.\n\nKind regards,\n{{organization.name}}',
   'htmlBody', '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;"><p>Dear {{client.first_name}},</p><p>This is a final reminder that your quote from <strong>{{organization.name}}</strong> is still awaiting review.</p><p style="margin:24px 0;"><a href="{{accept_link}}" style="background-color:#0f766e;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">Review and accept your quote</a></p><p>If you would still like to proceed, please accept the quote or reply to this email and we will be happy to help.</p><p>Kind regards,<br/>{{organization.name}}</p></div>'
 ),
 '["system_default","quote_final_reminder"]'::jsonb, 1),
('00000000-0000-0000-0000-000000000b0e', NULL, 'Welcome / Onboarding Started', 'Initial welcome email for a newly engaged client.', 'email', NULL, 'active',
 jsonb_build_object(
   'category','Onboarding',
   'subject','Welcome to {{organization.name}}',
   'body', E'Dear {{client.first_name}},\n\nWelcome to {{organization.name}}. We are pleased to be working with you.\n\nTo get started, please complete your onboarding steps in the client portal:\n{{client.portal_link}}\n\nThis may include confirming your details, completing identity checks, signing your engagement letter and providing any information we need to begin work.\n\nKind regards,\n{{organization.name}}',
   'htmlBody', '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;"><p>Dear {{client.first_name}},</p><p>Welcome to <strong>{{organization.name}}</strong>. We are pleased to be working with you.</p><p>To get started, please complete your onboarding steps in the client portal:</p><p style="margin:24px 0;"><a href="{{client.portal_link}}" style="background-color:#0f766e;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">Open client portal</a></p><p>This may include confirming your details, completing identity checks, signing your engagement letter and providing any information we need to begin work.</p><p>Kind regards,<br/>{{organization.name}}</p></div>'
 ),
 '["system_default","welcome_onboarding"]'::jsonb, 1),
('00000000-0000-0000-0000-000000000b0f', NULL, 'Engagement Letter Ready', 'Letter is ready to review and sign in the portal.', 'email', NULL, 'active',
 jsonb_build_object(
   'category','Onboarding',
   'subject','Your Engagement Letter Is Ready to Sign',
   'body', E'Dear {{client.first_name}},\n\nYour engagement letter with {{organization.name}} is ready to review and sign.\n\nPlease open the client portal using the link below:\n{{engagement.sign_link}}\n\nOnce signed, we can continue with the next stage of your onboarding.\n\nKind regards,\n{{organization.name}}',
   'htmlBody', '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;"><p>Dear {{client.first_name}},</p><p>Your engagement letter with <strong>{{organization.name}}</strong> is ready to review and sign.</p><p style="margin:24px 0;"><a href="{{engagement.sign_link}}" style="background-color:#0f766e;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">Review and sign engagement letter</a></p><p>Once signed, we can continue with the next stage of your onboarding.</p><p>Kind regards,<br/>{{organization.name}}</p></div>'
 ),
 '["system_default","engagement_letter_ready"]'::jsonb, 1),
('00000000-0000-0000-0000-000000000b10', NULL, 'Records Request', 'Initial request for client records or information.', 'email', NULL, 'active',
 jsonb_build_object(
   'category','Records',
   'subject','Information Needed for {{job.name}}',
   'body', E'Dear {{client.first_name}},\n\nWe need some information from you so that we can complete {{job.name}}.\n\nPlease provide the requested information using the secure client portal:\n{{records_request.link}}\n\nThis helps us keep everything in one place and ensures we have the information needed to progress your work.\n\nKind regards,\n{{organization.name}}',
   'htmlBody', '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;"><p>Dear {{client.first_name}},</p><p>We need some information from you so that we can complete <strong>{{job.name}}</strong>.</p><p style="margin:24px 0;"><a href="{{records_request.link}}" style="background-color:#0f766e;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">Open records request</a></p><p>This helps us keep everything in one place and ensures we have the information needed to progress your work.</p><p>Kind regards,<br/>{{organization.name}}</p></div>'
 ),
 '["system_default","records_request"]'::jsonb, 1),
('00000000-0000-0000-0000-000000000b11', NULL, 'Records Request Final Reminder', 'Final reminder before records affect a deadline.', 'email', NULL, 'active',
 jsonb_build_object(
   'category','Records',
   'subject','Final Reminder: Information Needed for {{job.name}}',
   'body', E'Dear {{client.first_name}},\n\nThis is a final reminder that we are still waiting for information from you for {{job.name}}.\n\nPlease provide the information here:\n{{records_request.link}}\n\nWithout this information, we may not be able to complete the work before the relevant deadline.\n\nKind regards,\n{{organization.name}}',
   'htmlBody', '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;"><p>Dear {{client.first_name}},</p><p>This is a final reminder that we are still waiting for information from you for <strong>{{job.name}}</strong>.</p><p style="margin:24px 0;"><a href="{{records_request.link}}" style="background-color:#0f766e;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">Open records request</a></p><p>Without this information, we may not be able to complete the work before the relevant deadline.</p><p>Kind regards,<br/>{{organization.name}}</p></div>'
 ),
 '["system_default","records_request_final"]'::jsonb, 1),
('00000000-0000-0000-0000-000000000b12', NULL, 'Questionnaire Sent', 'Initial dispatch of a questionnaire to the client.', 'email', NULL, 'active',
 jsonb_build_object(
   'category','Questionnaires',
   'subject','Please Complete Your Questionnaire',
   'body', E'Dear {{client.first_name}},\n\nPlease complete your questionnaire in the client portal.\n\nYou can access it here:\n{{questionnaire.link}}\n\nPlease answer the questions as fully as possible and upload any supporting documents where requested.\n\nKind regards,\n{{organization.name}}',
   'htmlBody', '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;"><p>Dear {{client.first_name}},</p><p>Please complete your questionnaire in the client portal.</p><p style="margin:24px 0;"><a href="{{questionnaire.link}}" style="background-color:#0f766e;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">Open questionnaire</a></p><p>Please answer the questions as fully as possible and upload any supporting documents where requested.</p><p>Kind regards,<br/>{{organization.name}}</p></div>'
 ),
 '["system_default","questionnaire_sent"]'::jsonb, 1),
('00000000-0000-0000-0000-000000000b13', NULL, 'Payment Reminder', 'Reminder that a tax or HMRC payment is due.', 'email', NULL, 'active',
 jsonb_build_object(
   'category','Deadlines',
   'subject','Payment Reminder: {{payment.name}}',
   'body', E'Dear {{client.first_name}},\n\nThis is a reminder that a payment is due.\n\nPayment: {{payment.name}}\nAmount: {{payment.amount}}\nDue date: {{payment.due_date}}\n\nPlease ensure payment is made by the deadline to avoid interest or penalties. If you have already made the payment, no further action is needed.\n\nKind regards,\n{{organization.name}}',
   'htmlBody', '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;"><p>Dear {{client.first_name}},</p><p>This is a reminder that a payment is due.</p><table style="border-collapse:collapse;margin:16px 0;"><tr><td style="padding:6px 12px 6px 0;"><strong>Payment</strong></td><td style="padding:6px 0;">{{payment.name}}</td></tr><tr><td style="padding:6px 12px 6px 0;"><strong>Amount</strong></td><td style="padding:6px 0;">{{payment.amount}}</td></tr><tr><td style="padding:6px 12px 6px 0;"><strong>Due date</strong></td><td style="padding:6px 0;">{{payment.due_date}}</td></tr></table><p>Please ensure payment is made by the deadline to avoid interest or penalties. If you have already made the payment, no further action is needed.</p><p>Kind regards,<br/>{{organization.name}}</p></div>'
 ),
 '["system_default","payment_reminder"]'::jsonb, 1),
('00000000-0000-0000-0000-000000000b14', NULL, 'Approval Required', 'Asks the client to approve a job in the portal.', 'email', NULL, 'active',
 jsonb_build_object(
   'category','Workflows',
   'subject','Approval Needed for {{job.name}}',
   'body', E'Dear {{client.first_name}},\n\nPlease review and approve {{job.name}} in the client portal.\n\nYou can access it here:\n{{approval.link}}\n\nOnce approved, we will proceed with the next step.\n\nKind regards,\n{{organization.name}}',
   'htmlBody', '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;"><p>Dear {{client.first_name}},</p><p>Please review and approve <strong>{{job.name}}</strong> in the client portal.</p><p style="margin:24px 0;"><a href="{{approval.link}}" style="background-color:#0f766e;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">Review and approve</a></p><p>Once approved, we will proceed with the next step.</p><p>Kind regards,<br/>{{organization.name}}</p></div>'
 ),
 '["system_default","approval_required"]'::jsonb, 1),
('00000000-0000-0000-0000-000000000b15', NULL, 'Filing Submitted', 'Confirms a successful filing submission.', 'email', NULL, 'active',
 jsonb_build_object(
   'category','Workflows',
   'subject','{{filing.name}} Has Been Submitted',
   'body', E'Dear {{client.first_name}},\n\nWe have submitted {{filing.name}}.\n\nSubmission reference: {{filing.submission_reference}}\nSubmission date: {{filing.submission_date}}\n\nWe will let you know if any further action is needed.\n\nKind regards,\n{{organization.name}}',
   'htmlBody', '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;"><p>Dear {{client.first_name}},</p><p>We have submitted <strong>{{filing.name}}</strong>.</p><table style="border-collapse:collapse;margin:16px 0;"><tr><td style="padding:6px 12px 6px 0;"><strong>Submission reference</strong></td><td style="padding:6px 0;">{{filing.submission_reference}}</td></tr><tr><td style="padding:6px 12px 6px 0;"><strong>Submission date</strong></td><td style="padding:6px 0;">{{filing.submission_date}}</td></tr></table><p>We will let you know if any further action is needed.</p><p>Kind regards,<br/>{{organization.name}}</p></div>'
 ),
 '["system_default","filing_submitted"]'::jsonb, 1),
('00000000-0000-0000-0000-000000000b16', NULL, 'Job Completed', 'Confirms a job has been completed.', 'email', NULL, 'active',
 jsonb_build_object(
   'category','Workflows',
   'subject','{{job.name}} Has Been Completed',
   'body', E'Dear {{client.first_name}},\n\nWe have completed {{job.name}}.\n\nYou can view the relevant documents and status in your client portal:\n{{client.portal_link}}\n\nKind regards,\n{{organization.name}}',
   'htmlBody', '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;"><p>Dear {{client.first_name}},</p><p>We have completed <strong>{{job.name}}</strong>.</p><p>You can view the relevant documents and status in your client portal:</p><p style="margin:24px 0;"><a href="{{client.portal_link}}" style="background-color:#0f766e;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;">Open client portal</a></p><p>Kind regards,<br/>{{organization.name}}</p></div>'
 ),
 '["system_default","job_completed"]'::jsonb, 1)
ON CONFLICT (id) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  content     = EXCLUDED.content,
  tags        = EXCLUDED.tags,
  status      = EXCLUDED.status,
  updated_at  = now();

-- =========================================================================
-- 3. Merge field rows for the new tokens (idempotent via field_key UNIQUE)
-- =========================================================================
INSERT INTO public.template_merge_fields (field_key, field_label, field_category, description, example_value, template_types)
VALUES
  ('client.portal_link',          'Client Portal Link',     'client',       'Link to the client portal home', 'https://portal.example.com/...', '{all}'),
  ('engagement.sign_link',        'Engagement Sign Link',   'engagement',   'Link to sign the engagement letter', 'https://portal.example.com/sign/...', '{all}'),
  ('records_request.link',        'Records Request Link',   'records',      'Link to the active records request', 'https://portal.example.com/records/...', '{all}'),
  ('questionnaire.link',          'Questionnaire Link',     'questionnaire','Link to complete the questionnaire', 'https://portal.example.com/q/...', '{all}'),
  ('approval.link',               'Approval Link',          'workflow',     'Link to approve work in the portal', 'https://portal.example.com/approve/...', '{all}'),
  ('payment.name',                'Payment Name',           'payment',      'Description of the payment', 'Self Assessment 2024/25', '{all}'),
  ('payment.amount',              'Payment Amount',         'payment',      'Amount due', '£1,234.00', '{all}'),
  ('payment.due_date',            'Payment Due Date',       'payment',      'Payment deadline', '31/01/2026', '{all}'),
  ('filing.name',                 'Filing Name',            'filing',       'Display name of the filing', 'Annual Accounts FY2024', '{all}'),
  ('filing.submission_reference', 'Submission Reference',   'filing',       'Reference returned by HMRC or Companies House', 'HMRC-REF-12345', '{all}'),
  ('filing.submission_date',      'Submission Date',        'filing',       'Date the filing was submitted', '01/06/2026', '{all}'),
  ('job.name',                    'Job Name',               'job',          'Display name of the job', 'Annual Accounts 2024', '{all}'),
  ('organization.email',          'Practice Email',         'organization', 'Primary contact email for the practice', 'hello@smithco.co.uk', '{all}'),
  ('organization.phone',          'Practice Phone',         'organization', 'Primary contact phone for the practice', '020 1234 5678', '{all}')
ON CONFLICT (field_key) DO UPDATE SET
  field_label    = EXCLUDED.field_label,
  field_category = EXCLUDED.field_category,
  description    = COALESCE(EXCLUDED.description, public.template_merge_fields.description),
  example_value  = COALESCE(EXCLUDED.example_value, public.template_merge_fields.example_value),
  template_types = EXCLUDED.template_types;

-- =========================================================================
-- 4. ensure_default_templates_for_org — idempotent backfill function
-- =========================================================================
CREATE OR REPLACE FUNCTION public.ensure_default_templates_for_org(_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count integer := 0;
BEGIN
  IF _org_id IS NULL THEN
    RETURN 0;
  END IF;

  WITH ins AS (
    INSERT INTO public.templates (
      organization_id, name, description, type, service, status,
      tags, content, requires_unsubscribe_link, required_merge_fields,
      recipient_rule, source_template_id, version_number
    )
    SELECT
      _org_id,
      sys.name,
      sys.description,
      sys.type,
      sys.service,
      'inactive',
      sys.tags,
      sys.content,
      sys.requires_unsubscribe_link,
      sys.required_merge_fields,
      sys.recipient_rule,
      sys.id,
      1
    FROM public.templates sys
    WHERE sys.organization_id IS NULL
    ON CONFLICT (organization_id, source_template_id)
      WHERE source_template_id IS NOT NULL AND organization_id IS NOT NULL
      DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO inserted_count FROM ins;

  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_default_templates_for_org(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.ensure_default_templates_for_org(uuid) TO authenticated, service_role;

-- =========================================================================
-- 5. Trigger so new organizations automatically receive the library
-- =========================================================================
CREATE OR REPLACE FUNCTION public.trg_seed_default_templates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_default_templates_for_org(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_seed_default_templates ON public.organizations;
CREATE TRIGGER organizations_seed_default_templates
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_seed_default_templates();

-- =========================================================================
-- 6. One-shot backfill for existing practices
-- =========================================================================
DO $$
DECLARE
  org_row record;
BEGIN
  FOR org_row IN SELECT id FROM public.organizations LOOP
    PERFORM public.ensure_default_templates_for_org(org_row.id);
  END LOOP;
END $$;
