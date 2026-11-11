
-- 1. Update existing jobs with legacy statuses to canonical equivalents
UPDATE public.jobs SET status = 'blank' WHERE status IN ('not_started', 'cancelled');
UPDATE public.jobs SET status = 'accountant_review' WHERE status = 'in_review';
UPDATE public.jobs SET status = 'records_requested' WHERE status IN ('in_progress', 'waiting_on_client', 'on_hold');

-- 2. Change default status
ALTER TABLE public.jobs ALTER COLUMN status SET DEFAULT 'blank';

-- 3. Replace the job status transition trigger with canonical statuses
CREATE OR REPLACE FUNCTION public.validate_job_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  valid_transitions jsonb := '{
    "blank": ["records_requested"],
    "records_requested": ["records_received", "client_queries", "blank"],
    "records_received": ["accountant_queries", "client_queries", "accountant_review", "blank"],
    "accountant_queries": ["records_received", "client_queries", "accountant_review", "blank"],
    "client_queries": ["records_received", "accountant_queries", "accountant_review", "blank"],
    "accountant_review": ["client_review", "ready_to_file", "accountant_queries", "client_queries", "blank"],
    "client_review": ["accountant_review", "ready_to_file", "client_queries", "blank"],
    "ready_to_file": ["completed", "accountant_review", "client_review", "blank"],
    "completed": ["blank"]
  }'::jsonb;
  allowed_next jsonb;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  allowed_next := valid_transitions -> COALESCE(OLD.status, 'blank');
  IF allowed_next IS NOT NULL AND jsonb_typeof(allowed_next) = 'array' THEN
    IF NOT (allowed_next ? NEW.status) THEN
      RAISE EXCEPTION 'Invalid job status transition: % -> % is not allowed', COALESCE(OLD.status, 'blank'), NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 4. Add engagement_letter_required flag to engagements for service/fee change tracking
ALTER TABLE public.engagements 
ADD COLUMN IF NOT EXISTS engagement_letter_required boolean NOT NULL DEFAULT false;

-- 5. Create trigger to flag EL required on fee/service changes  
CREATE OR REPLACE FUNCTION public.flag_engagement_letter_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- If service_id or service_config (containing fees) changed, flag EL required
  IF (OLD.service_id IS DISTINCT FROM NEW.service_id) OR
     (OLD.service_config IS DISTINCT FROM NEW.service_config) THEN
    NEW.engagement_letter_required := true;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_flag_el_on_engagement_change ON public.engagements;
CREATE TRIGGER trg_flag_el_on_engagement_change
  BEFORE UPDATE ON public.engagements
  FOR EACH ROW
  EXECUTE FUNCTION public.flag_engagement_letter_on_change();
