-- =====================================================================================
-- REPAIR: public_get_quote_by_token must return the onboarding ACCESS TOKEN.
-- =====================================================================================
-- Symptom: after accepting a proposal the client is stuck forever on
-- "Preparing your secure onboarding link…" and never reaches onboarding.
--
-- Root cause (confirmed live 2026-07-27, not inferred):
--   * public_accept_quote_by_token (live 4199627dad4b3e8d9c9e90f5872d0e72) returns only
--     {success, client_id, company_id, partnership_id}. It neither creates the onboarding
--     application nor returns a token.
--   * The application is created LAZILY by public_get_quote_by_token, which the client
--     then polls — but the live body (4e250dfdaccaa30a12e33f5b52cbd6cc) returns
--     'onboarding_application_id' and NO 'onboarding_access_token' key at all.
--   * src/pages/PublicQuoteView.tsx deliberately refuses to navigate without BOTH the id
--     and the token, because a tokenless /onboard/:id trips the strict
--     lifecycle_require_onboarding_token guard and fails with a worse, cryptic error.
--     So the client retries, never gets a token, and sits on the "preparing" message.
--
-- This is live-vs-git DRIFT, not a missing change: the repo's own definition of this
-- function (20260623215536) has returned onboarding_access_token since June. The live
-- copy diverged. The row is fine — the onboarding application created at 17:12 today has
-- a valid access_token and expiry, so the trigger/DEFAULT established by
-- 20260722160000 is working. Only the read path is broken.
--
-- Basis: the LIVE body (def-hash 4e250dfdaccaa30a12e33f5b52cbd6cc), fetched via MCP
-- catalog_functions(include_source: true) and reproduced verbatim EXCEPT:
--   1. v_access_token declared;
--   2. the existing-application lookup also selects access_token;
--   3. the lazy INSERT also RETURNS access_token (populated by the column DEFAULT /
--      trg_ensure_onboarding_access_token);
--   4. a self-heal for any pre-trigger row still missing a token;
--   5. 'onboarding_access_token' added to the returned payload.
-- Deliberately NOT re-pasted from git: git and live have diverged, and overwriting live
-- with the repo's copy would silently revert whatever else drifted.
--
-- Additive to the payload — every existing key keeps its name, type and meaning, so no
-- caller can break. No table, column, policy or trigger is touched.
-- =====================================================================================

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

  -- REPAIR (2): the access token travels with the id, or the client cannot proceed.
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

    -- REPAIR (3): capture the token the DEFAULT / trg_ensure_onboarding_access_token
    -- generates, so a freshly created application is immediately usable.
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

  -- REPAIR (4): least privilege. The onboarding token is handed back ONLY once the quote
  -- is accepted. Holding a proposal link is not consent to onboarding, and an onboarding
  -- application can exist against a quote that is not currently 'accepted' (staff-created,
  -- or a quote later superseded), so this is gated on quote status rather than on whether
  -- a row happens to exist.
  IF v_quote.status <> 'accepted' THEN
    v_access_token := NULL;

  -- Self-heal a row created before the token DEFAULT/trigger existed. Without this such
  -- an application can never be opened by its owner again. Only fires for an accepted
  -- quote, so it can never mint a secret for a proposal nobody has accepted.
  ELSIF v_onboarding_id IS NOT NULL AND (v_access_token IS NULL OR v_access_token = '') THEN
    UPDATE onboarding_applications
       SET access_token = public.gen_onboarding_access_token(),
           access_token_expires_at = COALESCE(access_token_expires_at, now() + interval '90 days')
     WHERE id = v_onboarding_id
    RETURNING access_token INTO v_access_token;
  END IF;

  IF v_quote.status = 'accepted' AND (v_quote.accepted_snapshot IS NULL OR v_quote.accepted_snapshot = 'null'::jsonb) THEN
    SELECT
      COALESCE(SUM(CASE WHEN COALESCE(billing_frequency,'one_off') <> 'monthly' THEN COALESCE(subtotal,0) ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN COALESCE(billing_frequency,'one_off') = 'monthly' THEN COALESCE(subtotal,0) ELSE 0 END), 0)
      INTO v_total_now, v_total_monthly
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
      'total_amount', COALESCE(v_quote.total_amount, v_total_now + v_total_monthly)
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
    -- REPAIR (5): the key the client has always read and live never sent.
    'onboarding_access_token', v_access_token
  );
END;
$function$;
