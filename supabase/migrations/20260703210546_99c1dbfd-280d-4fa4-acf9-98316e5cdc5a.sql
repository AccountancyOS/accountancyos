-- ============================================================
-- Fix (review finding B1): aged-balance sync reads a non-existent column + writes bad status
-- ============================================================
-- recompute_aged_balances + the sync_*_aged_balance trigger functions read `total_amount`
-- from invoices/bills — but those tables have `total_gross` (total_amount exists only on
-- quotes/receipts), so every invoice_payments / bill_payments / credit_note_allocations write
-- that fires these triggers errored (42703). They also wrote lowercase 'paid'/'part_paid',
-- which violates the invoices_status_check / bills_status_check (uppercase-only). This blocked
-- the entire payment + bank-matching path.
-- Fix: read total_gross; write canonical uppercase PAID / PART_PAID. Triggers reference these
-- functions by name, so only the function bodies are recreated.
-- ============================================================

CREATE OR REPLACE FUNCTION public.recompute_aged_balances(
  p_organization_id uuid, p_entity_type text, p_entity_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inv int := 0; v_bills int := 0;
BEGIN
  IF NOT public.user_has_organization_access(p_organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;
  IF p_entity_type NOT IN ('client','company') THEN
    RETURN jsonb_build_object('success', false, 'error', 'entity_type must be client or company');
  END IF;

  WITH ip AS (
    SELECT i.id, i.total_gross,
      COALESCE((SELECT SUM(amount) FROM public.invoice_payments WHERE invoice_id = i.id),0)
      + COALESCE((SELECT SUM(amount) FROM public.credit_note_allocations WHERE invoice_id = i.id),0) AS paid
    FROM public.invoices i
    WHERE i.organization_id = p_organization_id
      AND ((p_entity_type='client' AND i.client_id=p_entity_id) OR (p_entity_type='company' AND i.company_id=p_entity_id))
      AND lower(i.status) NOT IN ('voided','draft','cancelled')
  ), upd AS (
    UPDATE public.invoices i SET amount_paid = ip.paid,
      remaining_balance = GREATEST(ip.total_gross - ip.paid, 0),
      status = CASE WHEN ip.paid <= 0 THEN i.status
        WHEN ip.paid >= ip.total_gross - 0.005 THEN 'PAID'
        ELSE 'PART_PAID' END,
      updated_at = now()
    FROM ip WHERE i.id = ip.id RETURNING 1
  ) SELECT count(*) INTO v_inv FROM upd;

  WITH bp AS (
    SELECT b.id, b.total_gross,
      COALESCE((SELECT SUM(amount) FROM public.bill_payments WHERE bill_id = b.id),0)
      + COALESCE((SELECT SUM(amount) FROM public.credit_note_allocations WHERE bill_id = b.id),0) AS paid
    FROM public.bills b
    WHERE b.organization_id = p_organization_id
      AND ((p_entity_type='client' AND b.client_id=p_entity_id) OR (p_entity_type='company' AND b.company_id=p_entity_id))
      AND lower(b.status) NOT IN ('voided','void','draft','cancelled')
  ), upd2 AS (
    UPDATE public.bills b SET amount_paid = bp.paid,
      remaining_balance = GREATEST(bp.total_gross - bp.paid, 0),
      status = CASE WHEN bp.paid <= 0 THEN b.status
        WHEN bp.paid >= bp.total_gross - 0.005 THEN 'PAID'
        ELSE 'PART_PAID' END,
      updated_at = now()
    FROM bp WHERE b.id = bp.id RETURNING 1
  ) SELECT count(*) INTO v_bills FROM upd2;

  RETURN jsonb_build_object('success', true, 'invoices_updated', v_inv, 'bills_updated', v_bills);
END; $$;

CREATE OR REPLACE FUNCTION public.sync_invoice_aged_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid := COALESCE(NEW.invoice_id, OLD.invoice_id); v_total numeric; v_paid numeric;
BEGIN
  IF v_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT total_gross INTO v_total FROM public.invoices WHERE id = v_id;
  IF v_total IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT COALESCE((SELECT SUM(amount) FROM public.invoice_payments WHERE invoice_id = v_id),0)
       + COALESCE((SELECT SUM(amount) FROM public.credit_note_allocations WHERE invoice_id = v_id),0)
    INTO v_paid;
  UPDATE public.invoices
  SET amount_paid = v_paid, remaining_balance = GREATEST(v_total - v_paid, 0),
      status = CASE WHEN v_paid <= 0 THEN status
        WHEN v_paid >= v_total - 0.005 THEN 'PAID' ELSE 'PART_PAID' END,
      updated_at = now()
  WHERE id = v_id AND lower(status) NOT IN ('voided','draft','cancelled');
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE OR REPLACE FUNCTION public.sync_bill_aged_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid := COALESCE(NEW.bill_id, OLD.bill_id); v_total numeric; v_paid numeric;
BEGIN
  IF v_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT total_gross INTO v_total FROM public.bills WHERE id = v_id;
  IF v_total IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT COALESCE((SELECT SUM(amount) FROM public.bill_payments WHERE bill_id = v_id),0)
       + COALESCE((SELECT SUM(amount) FROM public.credit_note_allocations WHERE bill_id = v_id),0)
    INTO v_paid;
  UPDATE public.bills
  SET amount_paid = v_paid, remaining_balance = GREATEST(v_total - v_paid, 0),
      status = CASE WHEN v_paid <= 0 THEN status
        WHEN v_paid >= v_total - 0.005 THEN 'PAID' ELSE 'PART_PAID' END,
      updated_at = now()
  WHERE id = v_id AND lower(status) NOT IN ('voided','void','draft','cancelled');
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE OR REPLACE FUNCTION public.sync_aged_balance_from_cna()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inv uuid := COALESCE(NEW.invoice_id, OLD.invoice_id);
        v_bill uuid := COALESCE(NEW.bill_id, OLD.bill_id);
        v_total numeric; v_paid numeric;
BEGIN
  IF v_inv IS NOT NULL THEN
    SELECT total_gross INTO v_total FROM public.invoices WHERE id = v_inv;
    IF v_total IS NOT NULL THEN
      SELECT COALESCE((SELECT SUM(amount) FROM public.invoice_payments WHERE invoice_id = v_inv),0)
           + COALESCE((SELECT SUM(amount) FROM public.credit_note_allocations WHERE invoice_id = v_inv),0)
        INTO v_paid;
      UPDATE public.invoices
      SET amount_paid = v_paid, remaining_balance = GREATEST(v_total - v_paid, 0),
          status = CASE WHEN v_paid <= 0 THEN status
            WHEN v_paid >= v_total - 0.005 THEN 'PAID' ELSE 'PART_PAID' END,
          updated_at = now()
      WHERE id = v_inv AND lower(status) NOT IN ('voided','draft','cancelled');
    END IF;
  END IF;
  IF v_bill IS NOT NULL THEN
    SELECT total_gross INTO v_total FROM public.bills WHERE id = v_bill;
    IF v_total IS NOT NULL THEN
      SELECT COALESCE((SELECT SUM(amount) FROM public.bill_payments WHERE bill_id = v_bill),0)
           + COALESCE((SELECT SUM(amount) FROM public.credit_note_allocations WHERE bill_id = v_bill),0)
        INTO v_paid;
      UPDATE public.bills
      SET amount_paid = v_paid, remaining_balance = GREATEST(v_total - v_paid, 0),
          status = CASE WHEN v_paid <= 0 THEN status
            WHEN v_paid >= v_total - 0.005 THEN 'PAID' ELSE 'PART_PAID' END,
          updated_at = now()
      WHERE id = v_bill AND lower(status) NOT IN ('voided','void','draft','cancelled');
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
