-- Remove duplicate overload with p_notes parameter
DROP FUNCTION IF EXISTS public.update_invoice_draft_safe(uuid, uuid, text, text, text, text, text, text, jsonb);

-- Verify only one overload remains
DO $$
DECLARE
  overload_count int;
BEGIN
  SELECT COUNT(*) INTO overload_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'update_invoice_draft_safe';
  
  IF overload_count != 1 THEN
    RAISE EXCEPTION 'GUARD FAILED: Expected 1 overload for update_invoice_draft_safe, found %', overload_count;
  END IF;
END $$;