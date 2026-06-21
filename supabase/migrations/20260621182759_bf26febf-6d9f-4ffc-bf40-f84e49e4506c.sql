-- Phase F: when a job is created by the canonical lifecycle,
-- automatically attempt to generate its deadlines.

CREATE OR REPLACE FUNCTION public.tg_job_canonical_generate_deadlines()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_facts   jsonb;
  v_result  jsonb;
BEGIN
  IF NEW.automation_source IS DISTINCT FROM 'canonical_spine_v1'
     OR NEW.job_template_code IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(canonical_spine_v1, false) INTO v_enabled
    FROM public.org_settings WHERE organization_id = NEW.organization_id LIMIT 1;
  IF NOT COALESCE(v_enabled, false) THEN
    RETURN NEW;
  END IF;

  -- Map job period to the fact keys deadline rules expect.
  v_facts := jsonb_build_object();
  IF NEW.period_start IS NOT NULL THEN
    v_facts := v_facts
      || jsonb_build_object('accounting_period_start', NEW.period_start)
      || jsonb_build_object('vat_period_start', NEW.period_start);
  END IF;
  IF NEW.period_end IS NOT NULL THEN
    v_facts := v_facts
      || jsonb_build_object('accounting_period_end', NEW.period_end)
      || jsonb_build_object('vat_period_end', NEW.period_end)
      || jsonb_build_object('cis_period_end', NEW.period_end)
      || jsonb_build_object('tax_month_end', NEW.period_end)
      || jsonb_build_object('financial_year_end', NEW.period_end);
  END IF;

  BEGIN
    v_result := public.lifecycle_generate_deadlines_for_job(NEW.id, v_facts);
    INSERT INTO public.audit_log (organization_id, action, resource_type, resource_id, metadata)
    VALUES (NEW.organization_id, 'canonical_lifecycle_generate_deadlines', 'job', NEW.id, v_result);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.audit_log (organization_id, action, resource_type, resource_id, metadata)
    VALUES (NEW.organization_id, 'canonical_lifecycle_generate_deadlines_error', 'job', NEW.id,
            jsonb_build_object('error', SQLERRM));
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_canonical_generate_deadlines ON public.jobs;
CREATE TRIGGER trg_job_canonical_generate_deadlines
AFTER INSERT ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.tg_job_canonical_generate_deadlines();