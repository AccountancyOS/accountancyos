-- Phase 3 Slice 5: Recurring invoice posting + locked-period write audit helper

-- ============================================================
-- generate_recurring_invoice: atomically create next invoice from schedule
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_recurring_invoice(
  p_schedule_id uuid,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sched RECORD;
  v_uid uuid := COALESCE(p_user_id, auth.uid());
  v_invoice_id uuid := gen_random_uuid();
  v_client RECORD;
  v_account_id uuid;
  v_vat_rate numeric := 0;
  v_vat_code_id uuid := NULL;
  v_net numeric;
  v_vat numeric;
  v_gross numeric;
  v_issue_date date := CURRENT_DATE;
  v_due_date date;
  v_next_run timestamptz;
  v_approve_result jsonb := NULL;
BEGIN
  SELECT * INTO v_sched FROM recurring_invoice_schedules
   WHERE id = p_schedule_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code','not_found','error_message','Schedule not found');
  END IF;
  IF v_sched.status <> 'active' THEN
    RETURN jsonb_build_object('success', false, 'error_code','inactive','error_message','Schedule not active');
  END IF;
  IF v_sched.end_date IS NOT NULL AND v_issue_date > v_sched.end_date THEN
    UPDATE recurring_invoice_schedules SET status='completed', updated_at=now() WHERE id = p_schedule_id;
    RETURN jsonb_build_object('success', false, 'error_code','ended','error_message','Schedule end date reached');
  END IF;

  SELECT * INTO v_client FROM clients WHERE id = v_sched.client_id;
  IF v_client IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code','missing_client','error_message','Client not found');
  END IF;

  -- Resolve a default revenue account: prefer metadata.account_id, else first SALES account
  v_account_id := NULLIF(v_sched.metadata->>'account_id','')::uuid;
  IF v_account_id IS NULL THEN
    SELECT id INTO v_account_id FROM bookkeeping_accounts
     WHERE organization_id = v_sched.organization_id
       AND client_id = v_sched.client_id
       AND is_active = true
       AND account_subtype IN ('SALES','REVENUE','SERVICE_REVENUE','TRADING_INCOME')
     ORDER BY created_at ASC LIMIT 1;
  END IF;
  IF v_account_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code','missing_revenue_account',
                              'error_message','No revenue account configured for this client');
  END IF;

  -- Optional VAT code from metadata
  v_vat_code_id := NULLIF(v_sched.metadata->>'vat_code_id','')::uuid;
  IF v_vat_code_id IS NOT NULL THEN
    SELECT rate INTO v_vat_rate FROM vat_codes WHERE id = v_vat_code_id;
    v_vat_rate := COALESCE(v_vat_rate, 0);
  END IF;

  v_net   := COALESCE(v_sched.amount, 0);
  v_vat   := ROUND(v_net * v_vat_rate / 100.0, 2);
  v_gross := v_net + v_vat;
  v_due_date := v_issue_date + (COALESCE(v_sched.payment_terms_days, 30) || ' days')::interval;

  INSERT INTO invoices (
    id, organization_id, client_id, customer_id, invoice_type, contact_name,
    invoice_number, reference, issue_date, due_date, currency, exchange_rate,
    status, is_posted, total_net, total_vat, total_gross, remaining_balance, amount_paid,
    notes
  ) VALUES (
    v_invoice_id, v_sched.organization_id, v_sched.client_id, NULL, 'SALES',
    COALESCE(v_client.company_name, v_client.first_name || ' ' || v_client.last_name, 'Customer'),
    NULL, 'REC-' || substr(p_schedule_id::text,1,8) || '-' || to_char(v_issue_date,'YYYYMMDD'),
    v_issue_date, v_due_date, v_sched.currency, 1.0,
    'DRAFT', false, v_net, v_vat, v_gross, v_gross, 0,
    'Auto-generated from recurring schedule ' || p_schedule_id::text
  );

  INSERT INTO invoice_lines (
    invoice_id, line_number, description, quantity, unit_price,
    account_id, vat_code_id, vat_rate, net_amount, vat_amount, gross_amount
  ) VALUES (
    v_invoice_id, 1,
    COALESCE(v_sched.metadata->>'description', 'Recurring services'),
    1, v_net, v_account_id, v_vat_code_id, v_vat_rate, v_net, v_vat, v_gross
  );

  -- Advance next_run_at by cadence
  v_next_run := CASE v_sched.cadence
    WHEN 'weekly'       THEN COALESCE(v_sched.next_run_at, now()) + interval '7 days'
    WHEN 'fortnightly'  THEN COALESCE(v_sched.next_run_at, now()) + interval '14 days'
    WHEN 'monthly'      THEN COALESCE(v_sched.next_run_at, now()) + interval '1 month'
    WHEN 'quarterly'    THEN COALESCE(v_sched.next_run_at, now()) + interval '3 months'
    WHEN 'semi_annual'  THEN COALESCE(v_sched.next_run_at, now()) + interval '6 months'
    WHEN 'annual'       THEN COALESCE(v_sched.next_run_at, now()) + interval '1 year'
    ELSE COALESCE(v_sched.next_run_at, now()) + interval '1 month'
  END;

  UPDATE recurring_invoice_schedules SET
    last_run_at = now(),
    last_invoice_id = v_invoice_id,
    next_run_at = v_next_run,
    failure_count = 0,
    status = CASE WHEN v_sched.end_date IS NOT NULL AND v_next_run::date > v_sched.end_date
                  THEN 'completed' ELSE status END,
    updated_at = now()
   WHERE id = p_schedule_id;

  -- Optional auto-post when configured
  IF v_sched.create_draft_only = false THEN
    v_approve_result := public.approve_invoice(v_invoice_id, v_uid);
    IF NOT COALESCE((v_approve_result->>'success')::boolean, false) THEN
      -- Roll back schedule advancement on post failure
      UPDATE recurring_invoice_schedules SET
        failure_count = COALESCE(failure_count,0) + 1,
        status = CASE WHEN COALESCE(failure_count,0) + 1 >= 3 THEN 'failed' ELSE status END,
        updated_at = now()
       WHERE id = p_schedule_id;
      RETURN jsonb_build_object('success', false, 'error_code','post_failed',
                                'error_message', v_approve_result->>'error_message',
                                'invoice_id', v_invoice_id);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice_id,
    'auto_posted', v_sched.create_draft_only = false,
    'next_run_at', v_next_run
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error_code','exception','error_message', SQLERRM);
END $$;

REVOKE ALL ON FUNCTION public.generate_recurring_invoice(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_recurring_invoice(uuid, uuid) TO authenticated, service_role;

-- ============================================================
-- process_due_recurring_invoices: batch helper for cron / manual run
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_due_recurring_invoices(
  p_organization_id uuid DEFAULT NULL,
  p_limit int DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_result jsonb;
  v_processed int := 0;
  v_failed int := 0;
  v_details jsonb := '[]'::jsonb;
BEGIN
  FOR v_row IN
    SELECT id FROM recurring_invoice_schedules
     WHERE status = 'active'
       AND next_run_at IS NOT NULL
       AND next_run_at <= now()
       AND (p_organization_id IS NULL OR organization_id = p_organization_id)
     ORDER BY next_run_at ASC
     LIMIT p_limit
  LOOP
    v_result := public.generate_recurring_invoice(v_row.id, NULL);
    IF COALESCE((v_result->>'success')::boolean, false) THEN
      v_processed := v_processed + 1;
    ELSE
      v_failed := v_failed + 1;
    END IF;
    v_details := v_details || jsonb_build_array(jsonb_build_object('schedule_id', v_row.id, 'result', v_result));
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'processed', v_processed,
    'failed', v_failed,
    'details', v_details
  );
END $$;

REVOKE ALL ON FUNCTION public.process_due_recurring_invoices(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_due_recurring_invoices(uuid, int) TO authenticated, service_role;

-- ============================================================
-- assert_no_locked_period_write: shared guard helper for future RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION public.assert_no_locked_period_write(
  p_organization_id uuid,
  p_client_id uuid,
  p_company_id uuid,
  p_date date
) RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_period_locked(p_organization_id, p_client_id, p_company_id, p_date) THEN
    RAISE EXCEPTION 'Date % is in a locked period', p_date USING ERRCODE = 'check_violation';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.assert_no_locked_period_write(uuid, uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_no_locked_period_write(uuid, uuid, uuid, date) TO authenticated, service_role;
