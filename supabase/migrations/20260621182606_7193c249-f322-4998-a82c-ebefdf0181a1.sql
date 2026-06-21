-- Phase E: trigger lifecycle_activate_client_services on quote acceptance.
-- Safe + idempotent: only fires when status transitions to 'accepted' AND the org has the flag on.

CREATE OR REPLACE FUNCTION public.tg_quote_accepted_activate_canonical()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_result  jsonb;
BEGIN
  IF NEW.status = 'accepted'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN

    SELECT COALESCE(canonical_spine_v1, false) INTO v_enabled
      FROM public.org_settings WHERE organization_id = NEW.organization_id LIMIT 1;

    IF COALESCE(v_enabled, false) THEN
      BEGIN
        v_result := public.lifecycle_activate_client_services(NEW.id);
        INSERT INTO public.audit_log (organization_id, action, resource_type, resource_id, metadata)
        VALUES (NEW.organization_id, 'canonical_lifecycle_activate', 'quote', NEW.id, v_result);
      EXCEPTION WHEN OTHERS THEN
        -- Never block acceptance on a lifecycle error
        INSERT INTO public.audit_log (organization_id, action, resource_type, resource_id, metadata)
        VALUES (NEW.organization_id, 'canonical_lifecycle_activate_error', 'quote', NEW.id,
                jsonb_build_object('error', SQLERRM));
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quote_accepted_activate_canonical ON public.quotes;
CREATE TRIGGER trg_quote_accepted_activate_canonical
AFTER INSERT OR UPDATE OF status ON public.quotes
FOR EACH ROW
EXECUTE FUNCTION public.tg_quote_accepted_activate_canonical();