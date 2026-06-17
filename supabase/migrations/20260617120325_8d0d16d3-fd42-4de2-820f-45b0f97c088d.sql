-- Fix email_queue.status DEFAULT: 'queued' is not in email_queue_status_check
-- (pending/sent/failed/cancelled). Any INSERT that omits status currently fails.
-- Also defence-in-depth backfill trigger for quote_acceptance_tokens.organization_id.

ALTER TABLE public.email_queue
  ALTER COLUMN status SET DEFAULT 'pending';

-- Backfill any existing rows with the now-invalid 'queued' value to 'pending'.
UPDATE public.email_queue SET status = 'pending' WHERE status = 'queued';
UPDATE public.email_queue SET status = 'cancelled' WHERE status = 'ignored';

-- Defence-in-depth: ensure quote_acceptance_tokens.organization_id is always
-- backfilled from the parent quote when callers omit it.
CREATE OR REPLACE FUNCTION public.backfill_quote_token_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.quote_id IS NOT NULL THEN
    SELECT organization_id INTO NEW.organization_id
    FROM public.quotes
    WHERE id = NEW.quote_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_backfill_quote_token_org_id ON public.quote_acceptance_tokens;
CREATE TRIGGER trg_backfill_quote_token_org_id
  BEFORE INSERT ON public.quote_acceptance_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.backfill_quote_token_org_id();