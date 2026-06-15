-- Critical Remediation Programme - Phase 2 & 3
-- Phase 2: Jobs ↔ Services Schema Fix
-- Phase 3: Questionnaire → Job Flow Fix

-- ============================================================================
-- PHASE 2: Add missing engagement_id and service_id columns to jobs table
-- ============================================================================

-- Add engagement_id FK to jobs (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'engagement_id'
  ) THEN
    ALTER TABLE public.jobs ADD COLUMN engagement_id UUID REFERENCES public.engagements(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_jobs_engagement_id ON public.jobs(engagement_id);
    COMMENT ON COLUMN public.jobs.engagement_id IS 'Links job to its parent engagement for reporting and lifecycle tracking';
  END IF;
END $$;

-- Add service_id FK to jobs (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'service_id'
  ) THEN
    ALTER TABLE public.jobs ADD COLUMN service_id UUID REFERENCES public.services_catalog(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_jobs_service_id ON public.jobs(service_id);
    COMMENT ON COLUMN public.jobs.service_id IS 'Direct reference to service definition for reporting and validation';
  END IF;
END $$;

-- ============================================================================
-- PHASE 2: Backfill existing jobs with service_id based on service_type
-- ============================================================================

-- Backfill service_id for existing jobs by matching service_type to services_catalog.code
UPDATE public.jobs j
SET service_id = (
  SELECT sc.id
  FROM public.services_catalog sc
  WHERE sc.organization_id = j.organization_id
    AND sc.code = j.service_type
  LIMIT 1
)
WHERE j.service_id IS NULL
  AND j.service_type IS NOT NULL;

-- ============================================================================
-- PHASE 2: Update create_job_from_template to use correct columns
-- ============================================================================

-- Fix create_job_from_template function that was referencing nonexistent columns
CREATE OR REPLACE FUNCTION public.create_job_from_template(
  p_organization_id UUID,
  p_template_id UUID,
  p_client_id UUID DEFAULT NULL,
  p_company_id UUID DEFAULT NULL,
  p_engagement_id UUID DEFAULT NULL,
  p_service_id UUID DEFAULT NULL,
  p_period_start DATE DEFAULT NULL,
  p_period_end DATE DEFAULT NULL,
  p_filing_deadline DATE DEFAULT NULL,
  p_job_name TEXT DEFAULT NULL,
  p_automation_source TEXT DEFAULT 'template'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template RECORD;
  v_job_id UUID;
  v_final_job_name TEXT;
  v_service_type TEXT;
BEGIN
  -- Fetch template
  SELECT * INTO v_template
  FROM templates
  WHERE id = p_template_id
    AND organization_id = p_organization_id
    AND type = 'job';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found or not a job template';
  END IF;

  -- Determine job name
  v_final_job_name := COALESCE(
    p_job_name,
    (v_template.content->>'job_name'),
    v_template.name
  );

  -- Determine service type
  v_service_type := (v_template.content->>'service_type');

  -- Create the job
  INSERT INTO jobs (
    organization_id,
    client_id,
    company_id,
    engagement_id,
    service_id,
    job_name,
    service_type,
    status,
    priority,
    period_start,
    period_end,
    filing_deadline,
    source_template_id,
    template_version,
    automation_source,
    is_auto_generated,
    auto_generated_at
  ) VALUES (
    p_organization_id,
    p_client_id,
    p_company_id,
    p_engagement_id,
    p_service_id,
    v_final_job_name,
    v_service_type,
    'not_started',
    COALESCE((v_template.content->>'priority'), 'normal'),
    p_period_start,
    p_period_end,
    p_filing_deadline,
    p_template_id,
    v_template.version,
    p_automation_source,
    TRUE,
    NOW()
  )
  RETURNING id INTO v_job_id;

  -- Log audit event
  INSERT INTO audit_log (
    organization_id,
    entity_type,
    entity_id,
    action,
    metadata
  ) VALUES (
    p_organization_id,
    'job',
    v_job_id,
    'created_from_template',
    jsonb_build_object(
      'template_id', p_template_id,
      'engagement_id', p_engagement_id,
      'service_id', p_service_id,
      'automation_source', p_automation_source
    )
  );

  RETURN v_job_id;
END;
$$;

-- ============================================================================
-- PHASE 3: Fix questionnaire submission to call process_questionnaire_submission
-- ============================================================================

-- Update submit_questionnaire_by_token to call process_questionnaire_submission
CREATE OR REPLACE FUNCTION public.submit_questionnaire_by_token(
  p_token TEXT,
  p_responses JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link RECORD;
  v_instance_id UUID;
  v_result JSONB;
  v_process_result JSONB;
BEGIN
  -- Find and validate the link
  SELECT * INTO v_link
  FROM questionnaire_public_links
  WHERE access_token = p_token
    AND is_active = TRUE
    AND (expires_at IS NULL OR expires_at > NOW());

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Invalid or expired token'
    );
  END IF;

  v_instance_id := v_link.instance_id;

  -- Check if already submitted
  IF EXISTS (
    SELECT 1 FROM questionnaire_instances
    WHERE id = v_instance_id AND status = 'submitted'
  ) THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Questionnaire already submitted'
    );
  END IF;

  -- Save responses if provided
  IF jsonb_array_length(p_responses) > 0 THEN
    INSERT INTO questionnaire_responses (instance_id, question_id, answer, metadata)
    SELECT
      v_instance_id,
      (r->>'question_id')::UUID,
      r->'answer',
      COALESCE(r->'metadata', '{}'::jsonb)
    FROM jsonb_array_elements(p_responses) r
    ON CONFLICT (instance_id, question_id) DO UPDATE
    SET answer = EXCLUDED.answer,
        metadata = EXCLUDED.metadata,
        updated_at = NOW();
  END IF;

  -- Update questionnaire status
  UPDATE questionnaire_instances
  SET status = 'submitted',
      submitted_at = COALESCE(submitted_at, NOW()),
      updated_at = NOW()
  WHERE id = v_instance_id;

  -- Log access
  INSERT INTO questionnaire_access_log (link_id, action, ip_address)
  VALUES (v_link.id, 'submitted', NULL);

  -- Deactivate the link after submission
  UPDATE questionnaire_public_links
  SET is_active = FALSE
  WHERE id = v_link.id;

  -- CRITICAL FIX: Call process_questionnaire_submission to update job status
  -- and merge responses into workpaper
  BEGIN
    SELECT process_questionnaire_submission(v_instance_id) INTO v_process_result;
  EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail the submission
    INSERT INTO audit_log (
      organization_id,
      entity_type,
      entity_id,
      action,
      metadata
    )
    SELECT
      qi.organization_id,
      'questionnaire_instance',
      v_instance_id,
      'process_submission_error',
      jsonb_build_object('error', SQLERRM)
    FROM questionnaire_instances qi
    WHERE qi.id = v_instance_id;
  END;

  RETURN jsonb_build_object(
    'success', TRUE,
    'instance_id', v_instance_id,
    'submitted_at', NOW(),
    'process_result', COALESCE(v_process_result, '{}'::jsonb)
  );
END;
$$;

-- ============================================================================
-- PHASE 3: Add automation event type for questionnaire_submitted
-- ============================================================================

-- Add trigger to emit automation event when questionnaire is submitted
CREATE OR REPLACE FUNCTION public.emit_questionnaire_submitted_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id UUID;
  v_client_id UUID;
  v_company_id UUID;
BEGIN
  -- Only fire when status changes to 'submitted'
  IF NEW.status = 'submitted' AND (OLD.status IS NULL OR OLD.status != 'submitted') THEN
    -- Get linked job info
    SELECT jqi.job_id INTO v_job_id
    FROM job_questionnaire_instances jqi
    WHERE jqi.questionnaire_instance_id = NEW.id
    LIMIT 1;

    -- Get entity info
    v_client_id := NEW.client_id;
    v_company_id := NEW.company_id;

    -- Create automation event
    INSERT INTO automation_events (
      organization_id,
      event_type,
      entity_type,
      entity_id,
      old_value,
      new_value,
      metadata
    ) VALUES (
      NEW.organization_id,
      'questionnaire_submitted',
      'questionnaire_instance',
      NEW.id,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status),
      jsonb_build_object(
        'job_id', v_job_id,
        'client_id', v_client_id,
        'company_id', v_company_id,
        'template_id', NEW.template_id,
        'submitted_at', NEW.submitted_at
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger if not exists
DROP TRIGGER IF EXISTS trg_questionnaire_submitted ON questionnaire_instances;
CREATE TRIGGER trg_questionnaire_submitted
  AFTER UPDATE ON questionnaire_instances
  FOR EACH ROW
  EXECUTE FUNCTION emit_questionnaire_submitted_event();
