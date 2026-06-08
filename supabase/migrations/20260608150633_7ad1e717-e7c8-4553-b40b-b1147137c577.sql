
-- ============================================================
-- approve_credit_note: post a draft credit note to the ledger
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_credit_note(
  p_credit_note_id uuid,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cn record;
  v_org uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_control_subtypes text[];
  v_control_account uuid;
  v_vat_account uuid;
  v_entries jsonb := '[]'::jsonb;
  v_line record;
  v_post_result jsonb;
  v_journal_id uuid;
  v_membership boolean;
BEGIN
  SELECT * INTO v_cn FROM credit_notes WHERE id = p_credit_note_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'Credit note not found');
  END IF;

  IF v_cn.status <> 'DRAFT' OR v_cn.is_posted THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'Credit note is not in DRAFT status');
  END IF;

  v_org := v_cn.organization_id;

  -- Membership / tenancy check
  SELECT EXISTS(
    SELECT 1 FROM organization_users
    WHERE organization_id = v_org
      AND user_id = COALESCE(p_user_id, auth.uid())
  ) INTO v_membership;
  IF NOT v_membership THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'Not authorized for this organization');
  END IF;

  IF v_cn.client_id IS NOT NULL THEN
    v_entity_type := 'client';
    v_entity_id := v_cn.client_id;
  ELSIF v_cn.company_id IS NOT NULL THEN
    v_entity_type := 'company';
    v_entity_id := v_cn.company_id;
  ELSE
    RETURN jsonb_build_object('success', false, 'error_message', 'Credit note has no entity scope');
  END IF;

  -- Resolve control account
  IF v_cn.credit_note_type = 'SALES' THEN
    v_control_subtypes := ARRAY['TRADE_DEBTORS','DEBTOR','RECEIVABLE','ACCOUNTS_RECEIVABLE'];
  ELSE
    v_control_subtypes := ARRAY['TRADE_CREDITORS','CREDITOR','PAYABLE','ACCOUNTS_PAYABLE'];
  END IF;

  SELECT id INTO v_control_account
  FROM bookkeeping_accounts
  WHERE organization_id = v_org
    AND is_active = true
    AND is_control_account = true
    AND account_subtype = ANY(v_control_subtypes)
    AND ((v_entity_type = 'client' AND client_id = v_entity_id)
      OR (v_entity_type = 'company' AND company_id = v_entity_id))
  LIMIT 1;

  IF v_control_account IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_message',
      'No control account configured for ' || v_cn.credit_note_type);
  END IF;

  -- Resolve VAT control if needed
  IF v_cn.vat_total > 0 THEN
    SELECT id INTO v_vat_account
    FROM bookkeeping_accounts
    WHERE organization_id = v_org
      AND is_active = true
      AND is_control_account = true
      AND account_subtype IN ('VAT_CONTROL','VAT')
      AND ((v_entity_type = 'client' AND client_id = v_entity_id)
        OR (v_entity_type = 'company' AND company_id = v_entity_id))
    LIMIT 1;
    IF v_vat_account IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error_message', 'VAT control account not configured');
    END IF;
  END IF;

  -- Build entries. SALES credit note REVERSES original sales:
  --   Dr Sales (net), Dr VAT, Cr Debtors (gross)
  -- PURCHASE credit note REVERSES original purchase:
  --   Cr Expense (net), Cr VAT, Dr Creditors (gross)
  FOR v_line IN
    SELECT account_id, net_amount, vat_amount
    FROM credit_note_lines
    WHERE credit_note_id = p_credit_note_id
  LOOP
    IF v_line.account_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error_message', 'Credit note line missing account');
    END IF;
    IF v_cn.credit_note_type = 'SALES' THEN
      v_entries := v_entries || jsonb_build_array(jsonb_build_object(
        'account_id', v_line.account_id,
        'debit', v_line.net_amount,
        'credit', NULL,
        'description', 'Sales credit',
        'vat_code_id', NULL
      ));
    ELSE
      v_entries := v_entries || jsonb_build_array(jsonb_build_object(
        'account_id', v_line.account_id,
        'debit', NULL,
        'credit', v_line.net_amount,
        'description', 'Purchase credit',
        'vat_code_id', NULL
      ));
    END IF;
  END LOOP;

  IF v_cn.vat_total > 0 THEN
    IF v_cn.credit_note_type = 'SALES' THEN
      v_entries := v_entries || jsonb_build_array(jsonb_build_object(
        'account_id', v_vat_account, 'debit', v_cn.vat_total, 'credit', NULL,
        'description', 'VAT on sales credit', 'vat_code_id', NULL));
    ELSE
      v_entries := v_entries || jsonb_build_array(jsonb_build_object(
        'account_id', v_vat_account, 'debit', NULL, 'credit', v_cn.vat_total,
        'description', 'VAT on purchase credit', 'vat_code_id', NULL));
    END IF;
  END IF;

  -- Control account leg
  IF v_cn.credit_note_type = 'SALES' THEN
    v_entries := v_entries || jsonb_build_array(jsonb_build_object(
      'account_id', v_control_account, 'debit', NULL, 'credit', v_cn.total,
      'description', 'Debtor reduction', 'vat_code_id', NULL));
  ELSE
    v_entries := v_entries || jsonb_build_array(jsonb_build_object(
      'account_id', v_control_account, 'debit', v_cn.total, 'credit', NULL,
      'description', 'Creditor reduction', 'vat_code_id', NULL));
  END IF;

  -- Post atomically
  v_post_result := public.post_to_ledger(
    p_organization_id := v_org,
    p_client_id       := CASE WHEN v_entity_type = 'client'  THEN v_entity_id ELSE NULL END,
    p_company_id      := CASE WHEN v_entity_type = 'company' THEN v_entity_id ELSE NULL END,
    p_journal_date    := v_cn.issue_date,
    p_reference       := COALESCE(v_cn.credit_note_number, 'CN-' || left(v_cn.id::text, 8)),
    p_description     := 'Credit Note ' || COALESCE(v_cn.credit_note_number, ''),
    p_journal_type    := 'SYSTEM',
    p_source_type     := 'CREDIT_NOTE',
    p_source_id       := v_cn.id,
    p_currency        := v_cn.currency,
    p_fx_rate         := COALESCE(v_cn.fx_rate, 1.0),
    p_created_by      := COALESCE(p_user_id, auth.uid()),
    p_entries         := v_entries
  );

  IF NOT COALESCE((v_post_result->>'success')::boolean, false) THEN
    RETURN jsonb_build_object('success', false,
      'error_message', COALESCE(v_post_result->>'error', 'Posting failed'));
  END IF;

  v_journal_id := (v_post_result->>'journal_id')::uuid;

  UPDATE credit_notes
  SET status = 'APPROVED',
      is_posted = true,
      posted_at = now(),
      posted_by = COALESCE(p_user_id, auth.uid()),
      journal_id = v_journal_id,
      remaining_allocation = total,
      updated_at = now(),
      updated_by = COALESCE(p_user_id, auth.uid())
  WHERE id = p_credit_note_id;

  RETURN jsonb_build_object('success', true, 'journal_id', v_journal_id);
END;
$$;

-- ============================================================
-- allocate_credit_note: atomic multi-document allocation
-- p_allocations: jsonb array of { document_id uuid, amount numeric }
-- ============================================================
CREATE OR REPLACE FUNCTION public.allocate_credit_note(
  p_credit_note_id uuid,
  p_allocations jsonb,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cn record;
  v_alloc jsonb;
  v_doc_id uuid;
  v_amount numeric;
  v_total_alloc numeric := 0;
  v_inv record;
  v_bill record;
  v_new_paid numeric;
  v_new_remaining numeric;
  v_membership boolean;
  v_new_cn_remaining numeric;
  v_new_cn_status text;
BEGIN
  SELECT * INTO v_cn FROM credit_notes WHERE id = p_credit_note_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'Credit note not found');
  END IF;

  IF NOT v_cn.is_posted THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'Credit note must be approved before allocating');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM organization_users
    WHERE organization_id = v_cn.organization_id
      AND user_id = COALESCE(p_user_id, auth.uid())
  ) INTO v_membership;
  IF NOT v_membership THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'Not authorized for this organization');
  END IF;

  -- Validate totals first
  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
    v_amount := COALESCE((v_alloc->>'amount')::numeric, 0);
    IF v_amount <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error_message', 'Allocation amount must be positive');
    END IF;
    v_total_alloc := v_total_alloc + v_amount;
  END LOOP;

  IF v_total_alloc > v_cn.remaining_allocation + 0.005 THEN
    RETURN jsonb_build_object('success', false, 'error_message', 'Total allocation exceeds remaining credit');
  END IF;

  -- Apply each allocation
  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
    v_doc_id := (v_alloc->>'document_id')::uuid;
    v_amount := (v_alloc->>'amount')::numeric;

    IF v_cn.credit_note_type = 'SALES' THEN
      SELECT id, organization_id, amount_paid, total_gross
      INTO v_inv FROM invoices WHERE id = v_doc_id FOR UPDATE;
      IF NOT FOUND OR v_inv.organization_id <> v_cn.organization_id THEN
        RETURN jsonb_build_object('success', false, 'error_message', 'Invoice not found / wrong org');
      END IF;

      INSERT INTO credit_note_allocations (
        organization_id, credit_note_id, invoice_id, bill_id,
        amount, allocation_date, created_by
      ) VALUES (
        v_cn.organization_id, v_cn.id, v_doc_id, NULL,
        v_amount, CURRENT_DATE, COALESCE(p_user_id, auth.uid())
      );

      v_new_paid := COALESCE(v_inv.amount_paid, 0) + v_amount;
      v_new_remaining := v_inv.total_gross - v_new_paid;
      UPDATE invoices
      SET amount_paid = v_new_paid,
          remaining_balance = v_new_remaining,
          status = CASE WHEN v_new_remaining <= 0.005 THEN 'PAID' ELSE 'PART_PAID' END,
          updated_at = now()
      WHERE id = v_doc_id;

    ELSE
      SELECT id, organization_id, amount_paid, total_gross
      INTO v_bill FROM bills WHERE id = v_doc_id FOR UPDATE;
      IF NOT FOUND OR v_bill.organization_id <> v_cn.organization_id THEN
        RETURN jsonb_build_object('success', false, 'error_message', 'Bill not found / wrong org');
      END IF;

      INSERT INTO credit_note_allocations (
        organization_id, credit_note_id, invoice_id, bill_id,
        amount, allocation_date, created_by
      ) VALUES (
        v_cn.organization_id, v_cn.id, NULL, v_doc_id,
        v_amount, CURRENT_DATE, COALESCE(p_user_id, auth.uid())
      );

      v_new_paid := COALESCE(v_bill.amount_paid, 0) + v_amount;
      v_new_remaining := v_bill.total_gross - v_new_paid;
      UPDATE bills
      SET amount_paid = v_new_paid,
          remaining_balance = v_new_remaining,
          status = CASE WHEN v_new_remaining <= 0.005 THEN 'PAID' ELSE 'PART_PAID' END,
          updated_at = now()
      WHERE id = v_doc_id;
    END IF;
  END LOOP;

  v_new_cn_remaining := GREATEST(0, v_cn.remaining_allocation - v_total_alloc);
  v_new_cn_status := CASE WHEN v_new_cn_remaining <= 0.005 THEN 'FULLY_ALLOCATED' ELSE 'PARTIALLY_ALLOCATED' END;

  UPDATE credit_notes
  SET remaining_allocation = v_new_cn_remaining,
      status = v_new_cn_status,
      updated_at = now(),
      updated_by = COALESCE(p_user_id, auth.uid())
  WHERE id = p_credit_note_id;

  RETURN jsonb_build_object(
    'success', true,
    'remaining_allocation', v_new_cn_remaining,
    'credit_note_status', v_new_cn_status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_credit_note(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_credit_note(uuid, jsonb, uuid) TO authenticated;
