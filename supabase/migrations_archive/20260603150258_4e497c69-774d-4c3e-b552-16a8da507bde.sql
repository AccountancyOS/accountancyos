-- Add client_id / company_id to onboarding_documents so they can be surfaced
-- in the Client Portal Documents tab after the application is approved.
ALTER TABLE public.onboarding_documents
  ADD COLUMN IF NOT EXISTS client_id  uuid REFERENCES public.clients(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_onboarding_documents_client_id
  ON public.onboarding_documents (client_id)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_onboarding_documents_company_id
  ON public.onboarding_documents (company_id)
  WHERE company_id IS NOT NULL;

-- Backfill historic rows from already-approved applications so the portal
-- shows AML docs for clients that were onboarded before this change.
UPDATE public.onboarding_documents od
   SET client_id  = oa.client_id,
       company_id = oa.company_id
  FROM public.onboarding_applications oa
 WHERE od.application_id = oa.id
   AND oa.status = 'approved'
   AND (od.client_id IS DISTINCT FROM oa.client_id
     OR od.company_id IS DISTINCT FROM oa.company_id);

-- Trigger: when an onboarding application is approved (and a client/company
-- has been created against it), copy that link onto every related
-- onboarding_documents row so the Client Portal can read them.
CREATE OR REPLACE FUNCTION public.link_onboarding_documents_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved'
     AND (TG_OP = 'INSERT'
          OR OLD.status IS DISTINCT FROM NEW.status
          OR OLD.client_id  IS DISTINCT FROM NEW.client_id
          OR OLD.company_id IS DISTINCT FROM NEW.company_id) THEN
    UPDATE public.onboarding_documents
       SET client_id  = NEW.client_id,
           company_id = NEW.company_id
     WHERE application_id = NEW.id
       AND (client_id  IS DISTINCT FROM NEW.client_id
         OR company_id IS DISTINCT FROM NEW.company_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_onboarding_documents_on_approval
  ON public.onboarding_applications;

CREATE TRIGGER trg_link_onboarding_documents_on_approval
AFTER INSERT OR UPDATE OF status, client_id, company_id
ON public.onboarding_applications
FOR EACH ROW
EXECUTE FUNCTION public.link_onboarding_documents_on_approval();