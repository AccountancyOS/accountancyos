CREATE OR REPLACE FUNCTION public.tg_job_completed_rollover()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year       int;
  v_next_start date;
  v_next_end   date;
  v_next_label text;
  v_svc_name   text;
  v_new_job    uuid;
BEGIN
  IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  IF NEW.service_type IN ('sa_mtd','sa_non_mtd') THEN
    v_year := NULLIF(split_part(COALESCE(NEW.period_label,''), '/', 1), '')::int;
    IF v_year IS NULL AND NEW.period_start IS NOT NULL THEN
      v_year := EXTRACT(YEAR FROM NEW.period_start)::int;
    END IF;
    IF v_year IS NULL THEN RETURN NEW; END IF;
    v_next_start := make_date(v_year + 1, 4, 6);
    v_next_end   := make_date(v_year + 2, 4, 5);
    v_next_label := (v_year + 1)::text || '/' || substr((v_year + 2)::text, 3, 2);

  ELSIF NEW.service_type IN ('company_accounts','corporation_tax','confirmation_statement')
        AND NEW.period_start IS NOT NULL AND NEW.period_end IS NOT NULL THEN
    v_next_start := (NEW.period_start + INTERVAL '1 year')::date;
    v_next_end   := (NEW.period_end + INTERVAL '1 year')::date;
    v_next_label := to_char(v_next_end, 'YYYY') || ' Year-End';

  ELSE
    RETURN NEW;
  END IF;

  v_svc_name := COALESCE(
    (SELECT name FROM public.services_catalog WHERE code = NEW.service_type LIMIT 1),
    NEW.service_type);

  v_new_job := public.lifecycle_upsert_job_with_deadlines(
    NEW.organization_id, NEW.client_id, NEW.company_id, NULL,
    NEW.service_type, v_svc_name, v_next_start, v_next_end, v_next_label,
    'rollover:' || NEW.id::text);

  UPDATE public.jobs
     SET source_job_id = NEW.id,
         assigned_to = COALESCE(assigned_to, NEW.assigned_to)
   WHERE id = v_new_job AND source_job_id IS NULL AND id <> NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_job_completed_rollover ON public.jobs;
CREATE TRIGGER tg_job_completed_rollover
AFTER UPDATE OF status ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.tg_job_completed_rollover();