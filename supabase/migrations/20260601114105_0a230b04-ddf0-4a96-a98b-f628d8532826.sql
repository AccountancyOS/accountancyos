CREATE OR REPLACE FUNCTION public.apply_ch_diff(p_diff_id uuid, p_decision text, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_diff record;
BEGIN
  SELECT * INTO v_diff FROM public.companies_house_diff_staging WHERE id = p_diff_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Diff not found'; END IF;
  IF NOT user_has_organization_access(v_diff.organization_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF v_diff.status <> 'pending' THEN RAISE EXCEPTION 'Diff already decided'; END IF;
  IF p_decision NOT IN ('accept','reject') THEN RAISE EXCEPTION 'Invalid decision'; END IF;

  IF p_decision = 'accept' AND v_diff.company_id IS NOT NULL THEN
    CASE v_diff.field_path
      WHEN 'registered_office_address' THEN
        UPDATE public.companies
          SET registered_office_address = v_diff.incoming_value
          WHERE id = v_diff.company_id;
      WHEN 'sic_codes' THEN
        UPDATE public.companies
          SET sic_codes = CASE
            WHEN v_diff.incoming_value IS NULL OR jsonb_typeof(v_diff.incoming_value) = 'null' THEN NULL
            ELSE ARRAY(SELECT jsonb_array_elements_text(v_diff.incoming_value))
          END
          WHERE id = v_diff.company_id;
      WHEN 'company_type' THEN
        UPDATE public.companies
          SET company_type = NULLIF(v_diff.incoming_value #>> '{}', '')
          WHERE id = v_diff.company_id;
      WHEN 'confirmation_statement_made_up_to' THEN
        UPDATE public.companies
          SET confirmation_statement_made_up_to = NULLIF(v_diff.incoming_value #>> '{}', '')::date
          WHERE id = v_diff.company_id;
      WHEN 'confirmation_statement_next_due' THEN
        UPDATE public.companies
          SET confirmation_statement_next_due = NULLIF(v_diff.incoming_value #>> '{}', '')::date
          WHERE id = v_diff.company_id;
      ELSE
        -- Unknown field path: record but do not write
        NULL;
    END CASE;
  END IF;

  UPDATE public.companies_house_diff_staging
    SET status = CASE WHEN p_decision = 'accept' THEN 'accepted' ELSE 'rejected' END,
        decided_by = auth.uid(),
        decided_at = now(),
        decision_notes = p_notes
  WHERE id = p_diff_id;
END;
$function$;