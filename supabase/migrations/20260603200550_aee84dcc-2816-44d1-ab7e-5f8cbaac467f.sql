CREATE OR REPLACE FUNCTION public.tg_quote_sent_update_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'sent' AND COALESCE(OLD.status, '') <> 'sent' AND NEW.lead_id IS NOT NULL THEN
    UPDATE public.leads
       SET pipeline_stage = 'proposal_sent',
           proposal_sent_at = COALESCE(proposal_sent_at, now()),
           updated_at = now()
     WHERE id = NEW.lead_id
       AND pipeline_stage NOT IN ('won', 'lost');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quote_sent_update_lead ON public.quotes;
CREATE TRIGGER quote_sent_update_lead
AFTER UPDATE OF status ON public.quotes
FOR EACH ROW
EXECUTE FUNCTION public.tg_quote_sent_update_lead();