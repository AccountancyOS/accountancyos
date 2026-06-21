-- Phase C: Enforce canonical mapping on quote_lines
-- Auto-derive canonical_service_code from services_catalog whenever a quote line is created/updated.
-- This prevents free-form drift: every line that points at a catalogue service will carry the
-- canonical code if (and only if) the catalogue row is mapped to a canonical service.

CREATE OR REPLACE FUNCTION public.quote_lines_stamp_canonical_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canonical TEXT;
BEGIN
  IF NEW.service_id IS NOT NULL THEN
    SELECT canonical_service_code
      INTO v_canonical
      FROM public.services_catalog
     WHERE id = NEW.service_id;

    -- Always sync to whatever the catalogue row says (including NULL for custom services)
    NEW.canonical_service_code := v_canonical;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quote_lines_stamp_canonical ON public.quote_lines;
CREATE TRIGGER trg_quote_lines_stamp_canonical
BEFORE INSERT OR UPDATE OF service_id
ON public.quote_lines
FOR EACH ROW
EXECUTE FUNCTION public.quote_lines_stamp_canonical_code();

-- Backfill any existing draft/sent quote lines that are missing a canonical code
UPDATE public.quote_lines ql
   SET canonical_service_code = sc.canonical_service_code
  FROM public.services_catalog sc
 WHERE ql.service_id = sc.id
   AND ql.canonical_service_code IS DISTINCT FROM sc.canonical_service_code
   AND EXISTS (
     SELECT 1 FROM public.quotes q
      WHERE q.id = ql.quote_id
        AND q.status IN ('draft','sent')
   );