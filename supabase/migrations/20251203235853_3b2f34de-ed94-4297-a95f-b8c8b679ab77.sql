
-- Phase 3: Job Templates, Auto-Gen & Records Requests

-- Add job template configuration to services_catalog
ALTER TABLE services_catalog 
ADD COLUMN IF NOT EXISTS default_job_template_id uuid REFERENCES templates(id),
ADD COLUMN IF NOT EXISTS records_request_template_id uuid REFERENCES templates(id),
ADD COLUMN IF NOT EXISTS workpaper_template_id uuid REFERENCES templates(id);

-- Extend job_tasks for template-based tasks
ALTER TABLE job_tasks
ADD COLUMN IF NOT EXISTS template_task_id text,
ADD COLUMN IF NOT EXISTS is_client_facing boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS relative_due_days integer,
ADD COLUMN IF NOT EXISTS dependency_task_ids text[];

-- Extend jobs for template tracking and info request workflow
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS source_template_id uuid REFERENCES templates(id),
ADD COLUMN IF NOT EXISTS info_requested_at timestamptz,
ADD COLUMN IF NOT EXISTS info_received_at timestamptz;

-- Add workpaper_instance_id to jobs for direct linking
ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS workpaper_instance_id uuid REFERENCES workpaper_instances(id);

-- Create job_questionnaire_instances to track which questionnaires are linked to jobs
CREATE TABLE IF NOT EXISTS job_questionnaire_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  questionnaire_instance_id uuid NOT NULL REFERENCES questionnaire_instances(id) ON DELETE CASCADE,
  questionnaire_type text NOT NULL DEFAULT 'records_request', -- records_request, onboarding, custom
  trigger_status text, -- job status that triggered this questionnaire
  feeds_workpaper boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(job_id, questionnaire_instance_id)
);

-- Enable RLS on job_questionnaire_instances
ALTER TABLE job_questionnaire_instances ENABLE ROW LEVEL SECURITY;

-- RLS policies for job_questionnaire_instances
CREATE POLICY "Users can view job questionnaires in their organization"
ON job_questionnaire_instances FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM jobs j 
    WHERE j.id = job_questionnaire_instances.job_id 
    AND user_has_organization_access(j.organization_id)
  )
);

CREATE POLICY "Users can insert job questionnaires in their organization"
ON job_questionnaire_instances FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM jobs j 
    WHERE j.id = job_questionnaire_instances.job_id 
    AND user_has_organization_access(j.organization_id)
  )
);

CREATE POLICY "Users can update job questionnaires in their organization"
ON job_questionnaire_instances FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM jobs j 
    WHERE j.id = job_questionnaire_instances.job_id 
    AND user_has_organization_access(j.organization_id)
  )
);

CREATE POLICY "Users can delete job questionnaires in their organization"
ON job_questionnaire_instances FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM jobs j 
    WHERE j.id = job_questionnaire_instances.job_id 
    AND user_has_organization_access(j.organization_id)
  )
);

-- Function to create job from template
CREATE OR REPLACE FUNCTION create_job_from_template(
  p_template_id uuid,
  p_organization_id uuid,
  p_client_id uuid DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_engagement_id uuid DEFAULT NULL,
  p_service_id uuid DEFAULT NULL,
  p_period_start date DEFAULT NULL,
  p_period_end date DEFAULT NULL,
  p_filing_deadline date DEFAULT NULL,
  p_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template templates%ROWTYPE;
  v_template_content jsonb;
  v_job_id uuid;
  v_task record;
  v_task_id uuid;
  v_job_name text;
  v_workpaper_instance_id uuid;
  v_service services_catalog%ROWTYPE;
BEGIN
  -- Get template
  SELECT * INTO v_template FROM templates WHERE id = p_template_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Template not found');
  END IF;
  
  v_template_content := v_template.content;
  
  -- Get service if provided
  IF p_service_id IS NOT NULL THEN
    SELECT * INTO v_service FROM services_catalog WHERE id = p_service_id;
  END IF;
  
  -- Determine job name
  v_job_name := COALESCE(p_name, v_template.name);
  
  -- Create the job
  INSERT INTO jobs (
    organization_id,
    client_id,
    company_id,
    engagement_id,
    service_id,
    name,
    status,
    priority,
    period_start,
    period_end,
    filing_deadline,
    source_template_id
  ) VALUES (
    p_organization_id,
    p_client_id,
    p_company_id,
    p_engagement_id,
    p_service_id,
    v_job_name,
    'not_started',
    'medium',
    p_period_start,
    p_period_end,
    p_filing_deadline,
    p_template_id
  ) RETURNING id INTO v_job_id;
  
  -- Create tasks from template
  IF v_template_content->'tasks' IS NOT NULL THEN
    FOR v_task IN SELECT * FROM jsonb_array_elements(v_template_content->'tasks')
    LOOP
      INSERT INTO job_tasks (
        job_id,
        organization_id,
        title,
        description,
        status,
        template_task_id,
        is_client_facing,
        relative_due_days,
        due_date,
        task_order
      ) VALUES (
        v_job_id,
        p_organization_id,
        v_task.value->>'name',
        v_task.value->>'description',
        'not_started',
        v_task.value->>'id',
        COALESCE((v_task.value->>'isClientFacing')::boolean, false),
        (v_task.value->>'relativeDueDays')::integer,
        CASE 
          WHEN (v_task.value->>'relativeDueDays')::integer IS NOT NULL AND p_filing_deadline IS NOT NULL
          THEN p_filing_deadline - ((v_task.value->>'relativeDueDays')::integer || ' days')::interval
          ELSE NULL
        END,
        (v_task.value->>'order')::integer
      );
    END LOOP;
  END IF;
  
  -- Create workpaper if service has workpaper template
  IF v_service.workpaper_template_id IS NOT NULL THEN
    INSERT INTO workpaper_instances (
      organization_id,
      template_id,
      job_id,
      client_id,
      company_id,
      status,
      field_values
    ) VALUES (
      p_organization_id,
      v_service.workpaper_template_id,
      v_job_id,
      p_client_id,
      p_company_id,
      'draft',
      '{}'::jsonb
    ) RETURNING id INTO v_workpaper_instance_id;
    
    -- Link workpaper to job
    UPDATE jobs SET workpaper_instance_id = v_workpaper_instance_id WHERE id = v_job_id;
  END IF;
  
  -- Log audit
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, metadata)
  VALUES (
    p_organization_id,
    'job',
    v_job_id,
    'created_from_template',
    jsonb_build_object('template_id', p_template_id, 'template_name', v_template.name)
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'job_id', v_job_id,
    'workpaper_instance_id', v_workpaper_instance_id
  );
END;
$$;

-- Function to trigger records request when job status changes to awaiting_info
CREATE OR REPLACE FUNCTION trigger_records_request(
  p_job_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job jobs%ROWTYPE;
  v_service services_catalog%ROWTYPE;
  v_template templates%ROWTYPE;
  v_questionnaire_instance_id uuid;
  v_client_email text;
  v_client_name text;
  v_access_token text;
BEGIN
  -- Get job
  SELECT * INTO v_job FROM jobs WHERE id = p_job_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Job not found');
  END IF;
  
  -- Get service
  IF v_job.service_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Job has no service assigned');
  END IF;
  
  SELECT * INTO v_service FROM services_catalog WHERE id = v_job.service_id;
  IF v_service.records_request_template_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Service has no records request template');
  END IF;
  
  -- Get template
  SELECT * INTO v_template FROM templates WHERE id = v_service.records_request_template_id;
  
  -- Get client email
  IF v_job.client_id IS NOT NULL THEN
    SELECT email, first_name || ' ' || last_name INTO v_client_email, v_client_name
    FROM clients WHERE id = v_job.client_id;
  ELSIF v_job.company_id IS NOT NULL THEN
    SELECT email, company_name INTO v_client_email, v_client_name
    FROM companies WHERE id = v_job.company_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'Job has no client or company');
  END IF;
  
  -- Generate access token
  v_access_token := encode(gen_random_bytes(32), 'hex');
  
  -- Create questionnaire instance
  INSERT INTO questionnaire_instances (
    organization_id,
    template_id,
    client_id,
    company_id,
    job_id,
    status,
    access_token,
    token_expires_at
  ) VALUES (
    v_job.organization_id,
    v_service.records_request_template_id,
    v_job.client_id,
    v_job.company_id,
    p_job_id,
    'sent',
    v_access_token,
    now() + interval '30 days'
  ) RETURNING id INTO v_questionnaire_instance_id;
  
  -- Link to job
  INSERT INTO job_questionnaire_instances (
    job_id,
    questionnaire_instance_id,
    questionnaire_type,
    trigger_status,
    feeds_workpaper
  ) VALUES (
    p_job_id,
    v_questionnaire_instance_id,
    'records_request',
    'awaiting_info',
    true
  );
  
  -- Update job
  UPDATE jobs SET info_requested_at = now() WHERE id = p_job_id;
  
  -- Queue email (will be sent via connected mailbox)
  INSERT INTO email_queue (
    organization_id,
    to_email,
    to_name,
    subject,
    body_html,
    status,
    entity_type,
    entity_id,
    job_id,
    client_id,
    company_id,
    context,
    merge_data
  ) VALUES (
    v_job.organization_id,
    v_client_email,
    v_client_name,
    'Information Request: ' || v_job.name,
    '<p>Dear ' || v_client_name || ',</p>' ||
    '<p>We need some information from you to complete your ' || v_job.name || '.</p>' ||
    '<p>Please click the link below to provide the required information:</p>' ||
    '<p><a href="{{questionnaire_url}}">Complete Information Request</a></p>' ||
    '<p>This link will expire in 30 days.</p>',
    'queued',
    'questionnaire',
    v_questionnaire_instance_id,
    p_job_id,
    v_job.client_id,
    v_job.company_id,
    'records_request',
    jsonb_build_object(
      'questionnaire_url', '{{BASE_URL}}/questionnaire/' || v_access_token,
      'job_name', v_job.name,
      'client_name', v_client_name
    )
  );
  
  -- Log audit
  INSERT INTO audit_log (organization_id, entity_type, entity_id, action, metadata)
  VALUES (
    v_job.organization_id,
    'job',
    p_job_id,
    'records_request_sent',
    jsonb_build_object('questionnaire_instance_id', v_questionnaire_instance_id)
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'questionnaire_instance_id', v_questionnaire_instance_id
  );
END;
$$;

-- Function to process questionnaire submission and merge into workpaper
CREATE OR REPLACE FUNCTION process_questionnaire_submission(
  p_questionnaire_instance_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instance questionnaire_instances%ROWTYPE;
  v_job_link job_questionnaire_instances%ROWTYPE;
  v_job jobs%ROWTYPE;
  v_workpaper workpaper_instances%ROWTYPE;
  v_response record;
  v_field_values jsonb;
  v_file record;
BEGIN
  -- Get questionnaire instance
  SELECT * INTO v_instance FROM questionnaire_instances WHERE id = p_questionnaire_instance_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Questionnaire instance not found');
  END IF;
  
  -- Get job link
  SELECT * INTO v_job_link FROM job_questionnaire_instances 
  WHERE questionnaire_instance_id = p_questionnaire_instance_id;
  
  IF FOUND AND v_job_link.feeds_workpaper THEN
    -- Get job
    SELECT * INTO v_job FROM jobs WHERE id = v_job_link.job_id;
    
    -- Get workpaper
    IF v_job.workpaper_instance_id IS NOT NULL THEN
      SELECT * INTO v_workpaper FROM workpaper_instances WHERE id = v_job.workpaper_instance_id;
      
      -- Merge questionnaire responses into workpaper field_values
      -- This is a simplified merge - the full implementation is in the TypeScript service
      v_field_values := COALESCE(v_workpaper.field_values, '{}'::jsonb);
      
      -- Mark as questionnaire source
      v_field_values := v_field_values || jsonb_build_object(
        '_questionnaire_merged', true,
        '_questionnaire_instance_id', p_questionnaire_instance_id,
        '_questionnaire_merged_at', now()
      );
      
      UPDATE workpaper_instances 
      SET field_values = v_field_values,
          updated_at = now()
      WHERE id = v_job.workpaper_instance_id;
    END IF;
    
    -- Update job status to info_received
    UPDATE jobs 
    SET status = 'in_progress',
        info_received_at = now(),
        updated_at = now()
    WHERE id = v_job_link.job_id;
    
    -- Log audit
    INSERT INTO audit_log (organization_id, entity_type, entity_id, action, metadata)
    VALUES (
      v_job.organization_id,
      'job',
      v_job_link.job_id,
      'questionnaire_submitted',
      jsonb_build_object('questionnaire_instance_id', p_questionnaire_instance_id)
    );
  END IF;
  
  -- Update questionnaire status
  UPDATE questionnaire_instances 
  SET status = 'submitted',
      submitted_at = now()
  WHERE id = p_questionnaire_instance_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'job_updated', v_job_link IS NOT NULL
  );
END;
$$;
