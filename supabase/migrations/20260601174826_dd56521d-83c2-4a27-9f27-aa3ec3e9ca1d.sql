-- Slice F3: expand chaser_run subject_type to cover all 13 categories
ALTER TABLE public.automation_chaser_runs
  DROP CONSTRAINT IF EXISTS chk_chaser_run_subject_type;

ALTER TABLE public.automation_chaser_runs
  ADD CONSTRAINT chk_chaser_run_subject_type CHECK (
    subject_type IS NULL OR subject_type = ANY (ARRAY[
      'lead','quote','engagement_letter','kyc_subject','hmrc_auth',
      'onboarding_subject','client_service','records_request',
      'questionnaire_response','workpaper','deadline',
      'signature_request','conversation','invoice'
    ])
  );

-- Slice F5: seed one default paused email template per category, per org,
-- and link the matching seeded chaser policy to it (only if policy currently
-- has no template). All templates are status='inactive' (paused) so they
-- never auto-send. Idempotent via NOT EXISTS guards.
DO $$
DECLARE
  org RECORD;
  v_template_id uuid;
  cat RECORD;
BEGIN
  FOR org IN SELECT id FROM public.organizations LOOP
    FOR cat IN
      SELECT * FROM (VALUES
        ('crm_sales',            'CRM follow-up reminder',         'A quick check-in on your enquiry'),
        ('engagement_letters',   'Engagement letter reminder',     'Reminder: please review and sign your engagement letter'),
        ('kyc_aml',              'KYC document reminder',          'Reminder: outstanding KYC / AML documents'),
        ('hmrc_authorisation',   'HMRC authorisation reminder',    'Reminder: HMRC authorisation pending'),
        ('onboarding',           'Onboarding reminder',            'Reminder: please complete your onboarding'),
        ('services',             'New service welcome',            'Your new service has been activated'),
        ('jobs_records',         'Records request reminder',       'Reminder: records still outstanding for {{job.name}}'),
        ('questionnaires',       'Questionnaire reminder',         'Reminder: please complete your questionnaire'),
        ('workpapers',           'Workpaper review reminder',      'A workpaper is ready for your review'),
        ('deadlines_payments',   'Deadline approaching',           'Reminder: an important deadline is approaching'),
        ('documents_signatures', 'Signature request reminder',     'Reminder: signature requested on a document'),
        ('messages_slas',        'Message follow-up',              'Following up on your recent message'),
        ('billing_revenue',      'Invoice payment reminder',       'Reminder: invoice payment outstanding')
      ) AS t(category, tpl_name, subject)
    LOOP
      -- Skip if a template already exists for this org+name
      SELECT id INTO v_template_id
      FROM public.templates
      WHERE organization_id = org.id AND name = cat.tpl_name AND type = 'email'
      LIMIT 1;

      IF v_template_id IS NULL THEN
        INSERT INTO public.templates (
          organization_id, name, type, status, content, recipient_rule,
          required_merge_fields, requires_unsubscribe_link
        ) VALUES (
          org.id,
          cat.tpl_name,
          'email',
          'inactive',
          jsonb_build_object(
            'subject', cat.subject,
            'body_html', '<p>Dear {{client.first_name}},</p><p>' || cat.subject || '.</p><p>Kind regards,<br/>The team</p>'
          ),
          'primary_contact',
          ARRAY['client.first_name'],
          true
        )
        RETURNING id INTO v_template_id;
      END IF;

      -- Link policies in this category that currently have no template
      UPDATE public.automation_chaser_policies
      SET email_template_id = v_template_id, updated_at = now()
      WHERE organization_id = org.id
        AND category = cat.category
        AND email_template_id IS NULL;
    END LOOP;
  END LOOP;
END $$;