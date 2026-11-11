
CREATE OR REPLACE FUNCTION public.lock_period(
  p_organization_id uuid, p_entity_type text, p_entity_id uuid,
  p_lock_date date, p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_existing_lock date;
  v_unposted_count int;
  v_lock_id uuid;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  IF NOT (public.has_organization_role(p_organization_id, 'owner')
       OR public.has_organization_role(p_organization_id, 'admin')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only owners or admins may lock periods');
  END IF;
  IF p_entity_type NOT IN ('client','company') THEN
    RETURN jsonb_build_object('success', false, 'error', 'entity_type must be client or company');
  END IF;

  SELECT count(*) INTO v_unposted_count
  FROM public.journals j
  WHERE j.organization_id = p_organization_id
    AND ((p_entity_type = 'client'  AND j.client_id  = p_entity_id)
      OR (p_entity_type = 'company' AND j.company_id = p_entity_id))
    AND j.journal_date <= p_lock_date
    AND j.status = 'DRAFT';

  IF v_unposted_count > 0 THEN
    RETURN jsonb_build_object('success', false,
      'error', format('%s draft journal(s) on or before %s must be posted or voided first', v_unposted_count, p_lock_date));
  END IF;

  SELECT lock_date INTO v_existing_lock FROM public.period_locks
  WHERE organization_id = p_organization_id
    AND ((p_entity_type = 'client'  AND client_id  = p_entity_id)
      OR (p_entity_type = 'company' AND company_id = p_entity_id));

  IF v_existing_lock IS NOT NULL AND p_lock_date < v_existing_lock THEN
    RETURN jsonb_build_object('success', false,
      'error', format('Lock date cannot move backwards. Current lock: %s. Use unlock_period first.', v_existing_lock));
  END IF;

  INSERT INTO public.period_locks(organization_id, client_id, company_id, lock_date, locked_by, reason)
  VALUES (p_organization_id,
    CASE WHEN p_entity_type='client'  THEN p_entity_id END,
    CASE WHEN p_entity_type='company' THEN p_entity_id END,
    p_lock_date, v_user, p_reason)
  ON CONFLICT (organization_id, client_id, company_id)
  DO UPDATE SET lock_date = EXCLUDED.lock_date, locked_by = EXCLUDED.locked_by,
                locked_at = now(), reason = EXCLUDED.reason
  RETURNING id INTO v_lock_id;

  RETURN jsonb_build_object('success', true, 'lock_id', v_lock_id, 'lock_date', p_lock_date);
END; $$;

CREATE OR REPLACE FUNCTION public.unlock_period(
  p_organization_id uuid, p_entity_type text, p_entity_id uuid, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  IF NOT public.has_organization_role(p_organization_id, 'owner') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only owners may unlock periods');
  END IF;
  IF coalesce(trim(p_reason), '') = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'A reason is required to unlock a period');
  END IF;
  DELETE FROM public.period_locks
  WHERE organization_id = p_organization_id
    AND ((p_entity_type = 'client'  AND client_id  = p_entity_id)
      OR (p_entity_type = 'company' AND company_id = p_entity_id));
  RETURN jsonb_build_object('success', true);
END; $$;

REVOKE ALL ON FUNCTION public.lock_period(uuid,text,uuid,date,text) FROM public;
REVOKE ALL ON FUNCTION public.unlock_period(uuid,text,uuid,text) FROM public;
GRANT EXECUTE ON FUNCTION public.lock_period(uuid,text,uuid,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlock_period(uuid,text,uuid,text) TO authenticated;

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
    SELECT i.id, i.total_amount,
      COALESCE((SELECT SUM(amount) FROM public.invoice_payments WHERE invoice_id = i.id),0)
      + COALESCE((SELECT SUM(amount) FROM public.credit_note_allocations WHERE invoice_id = i.id),0) AS paid
    FROM public.invoices i
    WHERE i.organization_id = p_organization_id
      AND ((p_entity_type='client' AND i.client_id=p_entity_id) OR (p_entity_type='company' AND i.company_id=p_entity_id))
      AND lower(i.status) NOT IN ('voided','draft','cancelled')
  ), upd AS (
    UPDATE public.invoices i SET amount_paid = ip.paid,
      remaining_balance = GREATEST(ip.total_amount - ip.paid, 0),
      status = CASE WHEN ip.paid <= 0 THEN i.status
        WHEN ip.paid >= ip.total_amount - 0.005 THEN 'paid'
        ELSE 'part_paid' END,
      updated_at = now()
    FROM ip WHERE i.id = ip.id RETURNING 1
  ) SELECT count(*) INTO v_inv FROM upd;

  WITH bp AS (
    SELECT b.id, b.total_amount, b.status AS s,
      COALESCE((SELECT SUM(amount) FROM public.bill_payments WHERE bill_id = b.id),0)
      + COALESCE((SELECT SUM(amount) FROM public.credit_note_allocations WHERE bill_id = b.id),0) AS paid
    FROM public.bills b
    WHERE b.organization_id = p_organization_id
      AND ((p_entity_type='client' AND b.client_id=p_entity_id) OR (p_entity_type='company' AND b.company_id=p_entity_id))
      AND lower(b.status) NOT IN ('voided','void','draft','cancelled')
  ), upd2 AS (
    UPDATE public.bills b SET amount_paid = bp.paid,
      remaining_balance = GREATEST(bp.total_amount - bp.paid, 0),
      status = CASE WHEN bp.paid <= 0 THEN b.status
        WHEN bp.paid >= bp.total_amount - 0.005 THEN CASE WHEN bp.s = upper(bp.s) THEN 'PAID' ELSE 'paid' END
        ELSE CASE WHEN bp.s = upper(bp.s) THEN 'PART_PAID' ELSE 'part_paid' END END,
      updated_at = now()
    FROM bp WHERE b.id = bp.id RETURNING 1
  ) SELECT count(*) INTO v_bills FROM upd2;

  RETURN jsonb_build_object('success', true, 'invoices_updated', v_inv, 'bills_updated', v_bills);
END; $$;

REVOKE ALL ON FUNCTION public.recompute_aged_balances(uuid,text,uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.recompute_aged_balances(uuid,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_invoice_aged_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid := COALESCE(NEW.invoice_id, OLD.invoice_id); v_total numeric; v_paid numeric;
BEGIN
  IF v_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT total_amount INTO v_total FROM public.invoices WHERE id = v_id;
  IF v_total IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT COALESCE((SELECT SUM(amount) FROM public.invoice_payments WHERE invoice_id = v_id),0)
       + COALESCE((SELECT SUM(amount) FROM public.credit_note_allocations WHERE invoice_id = v_id),0)
    INTO v_paid;
  UPDATE public.invoices
  SET amount_paid = v_paid, remaining_balance = GREATEST(v_total - v_paid, 0),
      status = CASE WHEN v_paid <= 0 THEN status
        WHEN v_paid >= v_total - 0.005 THEN 'paid' ELSE 'part_paid' END,
      updated_at = now()
  WHERE id = v_id AND lower(status) NOT IN ('voided','draft','cancelled');
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE OR REPLACE FUNCTION public.sync_bill_aged_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid := COALESCE(NEW.bill_id, OLD.bill_id); v_total numeric; v_paid numeric; v_s text;
BEGIN
  IF v_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT total_amount, status INTO v_total, v_s FROM public.bills WHERE id = v_id;
  IF v_total IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT COALESCE((SELECT SUM(amount) FROM public.bill_payments WHERE bill_id = v_id),0)
       + COALESCE((SELECT SUM(amount) FROM public.credit_note_allocations WHERE bill_id = v_id),0)
    INTO v_paid;
  UPDATE public.bills
  SET amount_paid = v_paid, remaining_balance = GREATEST(v_total - v_paid, 0),
      status = CASE WHEN v_paid <= 0 THEN status
        WHEN v_paid >= v_total - 0.005 THEN CASE WHEN v_s = upper(v_s) THEN 'PAID' ELSE 'paid' END
        ELSE CASE WHEN v_s = upper(v_s) THEN 'PART_PAID' ELSE 'part_paid' END END,
      updated_at = now()
  WHERE id = v_id AND lower(status) NOT IN ('voided','void','draft','cancelled');
  RETURN COALESCE(NEW, OLD);
END; $$;

DROP TRIGGER IF EXISTS trg_sync_invoice_aged_balance_pay   ON public.invoice_payments;
DROP TRIGGER IF EXISTS trg_sync_invoice_aged_balance_alloc ON public.credit_note_allocations;
DROP TRIGGER IF EXISTS trg_sync_bill_aged_balance_pay      ON public.bill_payments;
DROP TRIGGER IF EXISTS trg_sync_bill_aged_balance_alloc    ON public.credit_note_allocations;
DROP TRIGGER IF EXISTS trg_sync_aged_balance_cna           ON public.credit_note_allocations;

CREATE TRIGGER trg_sync_invoice_aged_balance_pay
AFTER INSERT OR UPDATE OR DELETE ON public.invoice_payments
FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_aged_balance();

CREATE TRIGGER trg_sync_bill_aged_balance_pay
AFTER INSERT OR UPDATE OR DELETE ON public.bill_payments
FOR EACH ROW EXECUTE FUNCTION public.sync_bill_aged_balance();

-- Single trigger on credit_note_allocations that dispatches to both sync funcs
CREATE OR REPLACE FUNCTION public.sync_aged_balance_from_cna()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inv uuid := COALESCE(NEW.invoice_id, OLD.invoice_id);
        v_bill uuid := COALESCE(NEW.bill_id, OLD.bill_id);
        v_total numeric; v_paid numeric; v_s text;
BEGIN
  IF v_inv IS NOT NULL THEN
    SELECT total_amount INTO v_total FROM public.invoices WHERE id = v_inv;
    IF v_total IS NOT NULL THEN
      SELECT COALESCE((SELECT SUM(amount) FROM public.invoice_payments WHERE invoice_id = v_inv),0)
           + COALESCE((SELECT SUM(amount) FROM public.credit_note_allocations WHERE invoice_id = v_inv),0)
        INTO v_paid;
      UPDATE public.invoices
      SET amount_paid = v_paid, remaining_balance = GREATEST(v_total - v_paid, 0),
          status = CASE WHEN v_paid <= 0 THEN status
            WHEN v_paid >= v_total - 0.005 THEN 'paid' ELSE 'part_paid' END,
          updated_at = now()
      WHERE id = v_inv AND lower(status) NOT IN ('voided','draft','cancelled');
    END IF;
  END IF;
  IF v_bill IS NOT NULL THEN
    SELECT total_amount, status INTO v_total, v_s FROM public.bills WHERE id = v_bill;
    IF v_total IS NOT NULL THEN
      SELECT COALESCE((SELECT SUM(amount) FROM public.bill_payments WHERE bill_id = v_bill),0)
           + COALESCE((SELECT SUM(amount) FROM public.credit_note_allocations WHERE bill_id = v_bill),0)
        INTO v_paid;
      UPDATE public.bills
      SET amount_paid = v_paid, remaining_balance = GREATEST(v_total - v_paid, 0),
          status = CASE WHEN v_paid <= 0 THEN status
            WHEN v_paid >= v_total - 0.005 THEN CASE WHEN v_s = upper(v_s) THEN 'PAID' ELSE 'paid' END
            ELSE CASE WHEN v_s = upper(v_s) THEN 'PART_PAID' ELSE 'part_paid' END END,
          updated_at = now()
      WHERE id = v_bill AND lower(status) NOT IN ('voided','void','draft','cancelled');
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE TRIGGER trg_sync_aged_balance_cna
AFTER INSERT OR UPDATE OR DELETE ON public.credit_note_allocations
FOR EACH ROW EXECUTE FUNCTION public.sync_aged_balance_from_cna();
