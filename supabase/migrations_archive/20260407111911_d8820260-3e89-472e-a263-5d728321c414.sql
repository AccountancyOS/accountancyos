
-- Fix CGT trigger to use correct column name: disposal_date
DROP TRIGGER IF EXISTS trg_cgt_deadline ON public.client_detail_cgt;

CREATE OR REPLACE FUNCTION public.on_cgt_disposal_date_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_client_id uuid;
  v_deadline_date date;
BEGIN
  IF NEW.disposal_date IS NOT NULL AND (OLD.disposal_date IS NULL OR OLD.disposal_date != NEW.disposal_date) THEN
    v_deadline_date := NEW.disposal_date::date + INTERVAL '60 days';
    
    SELECT c.organization_id, c.id INTO v_org_id, v_client_id
    FROM public.clients c
    WHERE c.id = NEW.client_id;
    
    IF v_org_id IS NOT NULL THEN
      INSERT INTO public.deadlines (
        organization_id, client_id, service_code, deadline_type,
        due_date, title, status, created_at
      ) VALUES (
        v_org_id, v_client_id, 'CGT', 'filing',
        v_deadline_date, 'CGT Return - 60 Day Deadline',
        CASE WHEN v_deadline_date < CURRENT_DATE THEN 'overdue' ELSE 'upcoming' END,
        now()
      )
      ON CONFLICT (organization_id, client_id, service_code, deadline_type)
      DO UPDATE SET
        due_date = EXCLUDED.due_date,
        title = EXCLUDED.title,
        status = CASE WHEN EXCLUDED.due_date < CURRENT_DATE THEN 'overdue' ELSE 'upcoming' END,
        updated_at = now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cgt_deadline
  AFTER INSERT OR UPDATE OF disposal_date ON public.client_detail_cgt
  FOR EACH ROW
  EXECUTE FUNCTION public.on_cgt_disposal_date_changed();
