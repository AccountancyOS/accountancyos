-- =====================================================================================
-- Money vocabulary: a quote line can be ONE-OFF, MONTHLY or ANNUAL.
-- =====================================================================================
-- APPLY AFTER 20260727160000_quote_token_returns_onboarding_token.sql — both re-issue
-- public_get_quote_by_token, and this one is based on that migration's body.
--
-- The problem this fixes. A quote line could only be 'now' or 'monthly'
-- (quote_lines_billing_frequency_check, from 20251125203624), yet the proposal UI labels
-- the price box "Annual Price". An accountant pricing Company Accounts at £960/year had
-- to store it as 'monthly', and the dialog divided by 12 for display only — so the figure
-- SAVED was the annual one while its frequency said monthly. Everything downstream reads
-- subtotal on a monthly line as the monthly amount, so an accepted proposal totalling
-- £2,520/year produced accepted_snapshot.total_monthly = 2520 and an engagement letter
-- promising £2,520 PER MONTH. Twelve times the fee, in the document that is the contract.
--
-- The rule, per the owner: the stored unit price is exactly what the accountant quoted,
-- and the frequency says what period it covers. Nothing divides or multiplies it, and the
-- engagement letter states what the quote states.
--
-- This migration establishes the vocabulary and the totals. The engagement-letter wording
-- (which still describes everything non-monthly as "one-off fees due now") and the
-- proposal UI (which still divides by 12 for display) follow as their own increments —
-- neither can be corrected until 'annual' is a legal value, which is what this does.
--
--   (A) quote_lines.billing_frequency gains 'annual'. Widening only.
--   (B) public_get_quote_by_token: accepted_snapshot gains total_annual, and total_now
--       stops absorbing anything that is not one-off.
-- =====================================================================================

-- (A) Vocabulary -------------------------------------------------------------------------
-- Located by the column it constrains, not by name, so a differently-named live
-- constraint is replaced rather than left behind to reject the new value. Widening only:
-- every value previously allowed is still allowed, so no existing row can be invalidated.
DO $$
DECLARE
  v_attnum smallint;
  v_con    record;
BEGIN
  SELECT attnum INTO v_attnum
    FROM pg_attribute
   WHERE attrelid = 'public.quote_lines'::regclass
     AND attname  = 'billing_frequency'
     AND NOT attisdropped;

  IF v_attnum IS NULL THEN
    RAISE EXCEPTION 'public.quote_lines.billing_frequency not found — aborting rather than guessing';
  END IF;

  FOR v_con IN
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
      FROM pg_constraint c
     WHERE c.conrelid = 'public.quote_lines'::regclass
       AND c.contype  = 'c'
       AND c.conkey   = ARRAY[v_attnum]
  LOOP
    RAISE NOTICE 'Replacing quote_lines billing_frequency CHECK %: %', v_con.conname, v_con.def;
    EXECUTE format('ALTER TABLE public.quote_lines DROP CONSTRAINT %I', v_con.conname);
  END LOOP;

  ALTER TABLE public.quote_lines
    ADD CONSTRAINT quote_lines_billing_frequency_check
    CHECK (billing_frequency IN ('now', 'monthly', 'annual'));
END $$;

COMMENT ON COLUMN public.quote_lines.billing_frequency IS
  'What period this line''s unit_price covers: now = one-off charge at acceptance, '
  'monthly = per month, annual = per year. unit_price is ALWAYS the amount the '
  'accountant quoted for that period — never divide or annualise it downstream.';

-- (B) Totals -----------------------------------------------------------------------------
-- Based on 20260727160000_quote_token_returns_onboarding_token.sql (itself reproduced
-- from the live body 4e250dfdaccaa30a12e33f5b52cbd6cc), changed only where marked.
CREATE OR REPLACE FUNCTION public.public_get_quote_by_token(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tok record; v_quote record; v_practice_name text; v_recipient_name text; v_lines jsonb;
  v_onboarding_id uuid;
  v_access_token text;
  v_lead record;
  v_app_type text;
  v_first_name text;
  v_last_name text;
  v_preferred text;
  v_email text;
  v_phone text;
  v_company_name text;
  v_company_number text;
  v_has_company boolean;
  v_snapshot jsonb;
  v_total_now numeric;
  v_total_monthly numeric;
  v_total_annual numeric;
BEGIN
  SELECT * INTO v_tok FROM quote_acceptance_tokens WHERE token = p_token;
  IF v_tok.token IS NULL THEN RETURN jsonb_build_object('error', 'invalid'); END IF;
  IF v_tok.expires_at <= now() THEN RETURN jsonb_build_object('error', 'expired'); END IF;

  SELECT * INTO v_quote FROM quotes WHERE id = v_tok.quote_id;

  SELECT COALESCE(NULLIF(ob.trading_name, ''), NULLIF(ob.legal_name, ''), o.name)
    INTO v_practice_name
  FROM organizations o LEFT JOIN organization_branding ob ON ob.organization_id = o.id
  WHERE o.id = v_quote.organization_id;

  -- Resolve recipient_name: preferred_name -> first+last -> company_name
  IF v_quote.lead_id IS NOT NULL THEN
    SELECT NULLIF(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '')
      INTO v_recipient_name FROM leads WHERE id = v_quote.lead_id;
  ELSIF v_quote.client_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(trim(preferred_name), ''),
                    NULLIF(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), ''))
      INTO v_recipient_name FROM clients WHERE id = v_quote.client_id;
  END IF;

  IF v_recipient_name IS NULL AND v_quote.company_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(trim(c.preferred_name), ''),
                    NULLIF(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), ''))
      INTO v_recipient_name
    FROM clients c
    WHERE c.company_id = v_quote.company_id
    ORDER BY c.created_at ASC LIMIT 1;

    IF v_recipient_name IS NULL THEN
      SELECT company_name INTO v_recipient_name FROM companies WHERE id = v_quote.company_id;
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'service_id', ql.service_id,
    'service_code', sc.code,
    'service_name', COALESCE(NULLIF(ql.description_override, ''), sc.name),
    'quantity', ql.quantity, 'unit_price', ql.unit_price,
    'subtotal', ql.subtotal, 'billing_frequency', ql.billing_frequency
  ) ORDER BY ql.line_order, ql.created_at), '[]'::jsonb)
    INTO v_lines
  FROM quote_lines ql JOIN services_catalog sc ON sc.id = ql.service_id
  WHERE ql.quote_id = v_quote.id;

  SELECT id, access_token INTO v_onboarding_id, v_access_token
  FROM onboarding_applications
  WHERE quote_id = v_quote.id
    AND status <> 'cancelled'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_onboarding_id IS NULL AND v_quote.status = 'accepted' THEN
    IF v_quote.lead_id IS NOT NULL THEN
      SELECT * INTO v_lead FROM leads WHERE id = v_quote.lead_id;
      v_first_name := v_lead.first_name;
      v_last_name := v_lead.last_name;
      v_email := v_lead.email;
      v_phone := v_lead.phone;
    ELSIF v_quote.client_id IS NOT NULL THEN
      SELECT first_name, last_name, email, phone
        INTO v_first_name, v_last_name, v_email, v_phone
        FROM clients WHERE id = v_quote.client_id;
    END IF;

    v_has_company := v_quote.company_id IS NOT NULL;
    IF v_has_company THEN
      SELECT company_name, company_number INTO v_company_name, v_company_number
        FROM companies WHERE id = v_quote.company_id;
    END IF;

    v_app_type := CASE WHEN v_has_company THEN 'company' ELSE 'individual' END;

    INSERT INTO onboarding_applications (
      organization_id, lead_id, quote_id, application_type, status,
      first_name, last_name, email, phone,
      company_name, company_number, client_id, company_id
    ) VALUES (
      v_quote.organization_id, v_quote.lead_id, v_quote.id, v_app_type, 'in_progress',
      v_first_name, v_last_name, v_email, v_phone,
      v_company_name, v_company_number, v_quote.client_id, v_quote.company_id
    )
    RETURNING id, access_token INTO v_onboarding_id, v_access_token;
  END IF;

  IF v_quote.status <> 'accepted' THEN
    v_access_token := NULL;

  ELSIF v_onboarding_id IS NOT NULL AND (v_access_token IS NULL OR v_access_token = '') THEN
    UPDATE onboarding_applications
       SET access_token = public.gen_onboarding_access_token(),
           access_token_expires_at = COALESCE(access_token_expires_at, now() + interval '90 days')
     WHERE id = v_onboarding_id
    RETURNING access_token INTO v_access_token;
  END IF;

  IF v_quote.status = 'accepted' AND (v_quote.accepted_snapshot IS NULL OR v_quote.accepted_snapshot = 'null'::jsonb) THEN
    -- CHANGED: three buckets, one per billing period. total_now previously absorbed
    -- EVERYTHING that was not monthly, which silently reported an annual fee as due now.
    -- Each total is a plain sum of the quoted amounts — nothing is annualised or divided.
    SELECT
      COALESCE(SUM(CASE WHEN COALESCE(billing_frequency,'one_off') NOT IN ('monthly','annual') THEN COALESCE(subtotal,0) ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN COALESCE(billing_frequency,'one_off') = 'monthly' THEN COALESCE(subtotal,0) ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN COALESCE(billing_frequency,'one_off') = 'annual'  THEN COALESCE(subtotal,0) ELSE 0 END), 0)
      INTO v_total_now, v_total_monthly, v_total_annual
    FROM jsonb_to_recordset(v_lines)
      AS x(subtotal numeric, billing_frequency text);

    v_snapshot := jsonb_build_object(
      'lines', v_lines,
      'currency', COALESCE(v_quote.currency, 'GBP'),
      'quote_number', v_quote.quote_number,
      'accepted_at', COALESCE(v_quote.accepted_at, now()),
      'valid_until', v_quote.valid_until,
      'total_now', v_total_now,
      'total_monthly', v_total_monthly,
      -- CHANGED: new key. Existing keys keep their names and meaning.
      'total_annual', v_total_annual,
      'total_amount', COALESCE(v_quote.total_amount, v_total_now + v_total_monthly + v_total_annual)
    );

    UPDATE quotes SET accepted_snapshot = v_snapshot WHERE id = v_quote.id;
    v_quote.accepted_snapshot := v_snapshot;
  END IF;

  RETURN jsonb_build_object(
    'quote_id', v_quote.id, 'quote_number', v_quote.quote_number, 'status', v_quote.status,
    'currency', v_quote.currency, 'total_amount', v_quote.total_amount,
    'valid_until', v_quote.valid_until, 'sent_at', v_quote.sent_at,
    'accepted_at', v_quote.accepted_at, 'rejected_at', v_quote.rejected_at,
    'notes', v_quote.notes, 'practice_name', v_practice_name,
    'recipient_name', v_recipient_name, 'lines', v_lines,
    'used', v_tok.used_at IS NOT NULL,
    'onboarding_application_id', v_onboarding_id,
    'onboarding_access_token', v_access_token
  );
END;
$function$;
