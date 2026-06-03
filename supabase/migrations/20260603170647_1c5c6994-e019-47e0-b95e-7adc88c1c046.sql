CREATE OR REPLACE FUNCTION public.generate_quote_number(org_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_year_suffix text := TO_CHAR(NOW(), 'YY');
  v_prefix text;
  v_max_seq integer;
  v_candidate text;
  v_attempt integer := 0;
BEGIN
  v_prefix := 'Q-' || v_year_suffix || '-';

  LOOP
    SELECT COALESCE(MAX(
      NULLIF(regexp_replace(substring(quote_number FROM length(v_prefix) + 1), '\D', '', 'g'), '')::integer
    ), 0)
    INTO v_max_seq
    FROM public.quotes
    WHERE organization_id = org_id
      AND quote_number LIKE v_prefix || '%';

    v_candidate := v_prefix || LPAD((v_max_seq + 1 + v_attempt)::text, 4, '0');

    IF NOT EXISTS (
      SELECT 1 FROM public.quotes
      WHERE organization_id = org_id AND quote_number = v_candidate
    ) THEN
      RETURN v_candidate;
    END IF;

    v_attempt := v_attempt + 1;
    IF v_attempt > 50 THEN
      RAISE EXCEPTION 'Unable to generate unique quote number after % attempts', v_attempt;
    END IF;
  END LOOP;
END;
$function$;