-- ============================================================
-- Fix (review findings E1 + E4): void FX double-apply + paying a voided invoice/bill
-- ============================================================
-- E1: void_invoice / void_bill build reversal entries from ledger_entries.debit/credit, which
--     are already BASE-currency amounts, then call post_to_ledger with p_fx_rate = the invoice
--     exchange rate — which multiplies again (base x fx^2). For any non-GBP document the
--     reversal was wrong. Pass p_fx_rate := 1.0 so the base amounts pass through unchanged.
-- E4: void set status='VOIDED' but left is_posted=true, so record_invoice_payment /
--     record_bill_payment (which gate only on is_posted) would happily pay a voided document
--     and flip it back to PART_PAID/PAID. Clear is_posted on void so that gate blocks it.
-- Only void_invoice + void_bill are changed; the identical p_fx_rate line in the approve/payment
-- functions is correct and left untouched.
-- ============================================================

CREATE OR REPLACE FUNCTION public.void_invoice(
  p_invoice_id uuid,
  p_reason text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice RECORD;
  v_journal_id uuid;
  v_entries jsonb := '[]'::jsonb;
  v_line RECORD;
  v_post_result jsonb;
  v_entity_type text;
  v_entity_id uuid;
  v_uid uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found', 'error_message', 'Invoice not found');
  END IF;
  IF v_invoice.status = 'VOIDED' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'already_voided', 'error_message', 'Invoice already voided');
  END IF;
  IF COALESCE(v_invoice.amount_paid,0) > 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'has_payments', 'error_message', 'Cannot void invoice with payments. Refund first.');
  END IF;

  v_entity_type := CASE WHEN v_invoice.client_id IS NOT NULL THEN 'client' ELSE 'company' END;
  v_entity_id   := COALESCE(v_invoice.client_id, v_invoice.company_id);

  IF v_invoice.is_posted THEN
    SELECT journal_id INTO v_journal_id FROM ledger_entries
      WHERE source_type = 'INVOICE' AND source_id = p_invoice_id LIMIT 1;

    IF v_journal_id IS NOT NULL THEN
      FOR v_line IN
        SELECT account_id, debit, credit, description, vat_code_id
          FROM ledger_entries WHERE journal_id = v_journal_id
      LOOP
        v_entries := v_entries || jsonb_build_array(jsonb_build_object(
          'account_id', v_line.account_id,
          'debit',  v_line.credit,
          'credit', v_line.debit,
          'description', 'REVERSAL: ' || COALESCE(v_line.description,'') ||
                         CASE WHEN p_reason IS NOT NULL THEN ' - ' || p_reason ELSE '' END,
          'vat_code_id', v_line.vat_code_id
        ));
      END LOOP;

      v_post_result := post_to_ledger(
        p_organization_id := v_invoice.organization_id,
        p_client_id       := CASE WHEN v_entity_type='client'  THEN v_entity_id ELSE NULL END,
        p_company_id      := CASE WHEN v_entity_type='company' THEN v_entity_id ELSE NULL END,
        p_journal_date    := CURRENT_DATE,
        p_reference       := 'VOID-' || COALESCE(v_invoice.invoice_number, substr(p_invoice_id::text,1,8)),
        p_description     := 'INVOICE void',
        p_journal_type    := 'SYSTEM',
        p_source_type     := 'JOURNAL',
        p_source_id       := v_journal_id,
        p_currency        := COALESCE(v_invoice.currency,'GBP'),
        p_fx_rate         := 1.0,
        p_created_by      := v_uid,
        p_entries         := v_entries
      );

      IF NOT (v_post_result->>'success')::boolean THEN
        RAISE EXCEPTION 'Reversal failed: %', v_post_result->>'error_message'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  UPDATE invoices SET status='VOIDED', is_posted=false, updated_at=now() WHERE id = p_invoice_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.void_bill(
  p_bill_id uuid,
  p_reason text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill RECORD;
  v_journal_id uuid;
  v_entries jsonb := '[]'::jsonb;
  v_line RECORD;
  v_post_result jsonb;
  v_entity_type text;
  v_entity_id uuid;
  v_uid uuid := COALESCE(p_user_id, auth.uid());
BEGIN
  SELECT * INTO v_bill FROM bills WHERE id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found', 'error_message', 'Bill not found');
  END IF;
  IF v_bill.status = 'VOIDED' THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'already_voided', 'error_message', 'Bill already voided');
  END IF;
  IF COALESCE(v_bill.amount_paid,0) > 0 THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'has_payments', 'error_message', 'Cannot void bill with payments. Refund first.');
  END IF;

  v_entity_type := CASE WHEN v_bill.client_id IS NOT NULL THEN 'client' ELSE 'company' END;
  v_entity_id   := COALESCE(v_bill.client_id, v_bill.company_id);

  IF v_bill.is_posted THEN
    SELECT journal_id INTO v_journal_id FROM ledger_entries
      WHERE source_type = 'BILL' AND source_id = p_bill_id LIMIT 1;

    IF v_journal_id IS NOT NULL THEN
      FOR v_line IN
        SELECT account_id, debit, credit, description, vat_code_id
          FROM ledger_entries WHERE journal_id = v_journal_id
      LOOP
        v_entries := v_entries || jsonb_build_array(jsonb_build_object(
          'account_id', v_line.account_id,
          'debit',  v_line.credit,
          'credit', v_line.debit,
          'description', 'REVERSAL: ' || COALESCE(v_line.description,'') ||
                         CASE WHEN p_reason IS NOT NULL THEN ' - ' || p_reason ELSE '' END,
          'vat_code_id', v_line.vat_code_id
        ));
      END LOOP;

      v_post_result := post_to_ledger(
        p_organization_id := v_bill.organization_id,
        p_client_id       := CASE WHEN v_entity_type='client'  THEN v_entity_id ELSE NULL END,
        p_company_id      := CASE WHEN v_entity_type='company' THEN v_entity_id ELSE NULL END,
        p_journal_date    := CURRENT_DATE,
        p_reference       := 'VOID-' || COALESCE(v_bill.bill_number, substr(p_bill_id::text,1,8)),
        p_description     := 'BILL void',
        p_journal_type    := 'SYSTEM',
        p_source_type     := 'JOURNAL',
        p_source_id       := v_journal_id,
        p_currency        := COALESCE(v_bill.currency,'GBP'),
        p_fx_rate         := 1.0,
        p_created_by      := v_uid,
        p_entries         := v_entries
      );

      IF NOT (v_post_result->>'success')::boolean THEN
        RAISE EXCEPTION 'Reversal failed: %', v_post_result->>'error_message'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  UPDATE bills SET status='VOIDED', is_posted=false, updated_at=now() WHERE id = p_bill_id;
  RETURN jsonb_build_object('success', true);
END;
$$;
