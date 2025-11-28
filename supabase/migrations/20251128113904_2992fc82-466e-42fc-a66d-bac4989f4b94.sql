-- Fix update_invoice_totals function with SECURITY DEFINER and search_path
CREATE OR REPLACE FUNCTION public.update_invoice_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE invoices
  SET 
    total_net = COALESCE((
      SELECT SUM(net_amount)
      FROM invoice_lines
      WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id)
    ), 0),
    total_vat = COALESCE((
      SELECT SUM(vat_amount)
      FROM invoice_lines
      WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id)
    ), 0),
    total_gross = COALESCE((
      SELECT SUM(gross_amount)
      FROM invoice_lines
      WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id)
    ), 0),
    updated_at = now()
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Fix update_invoice_payment_status function with SECURITY DEFINER and search_path
CREATE OR REPLACE FUNCTION public.update_invoice_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_paid NUMERIC;
  v_invoice_total NUMERIC;
  v_invoice_id UUID;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  -- Calculate total paid
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM invoice_payments
  WHERE invoice_id = v_invoice_id;
  
  -- Get invoice total
  SELECT total_gross INTO v_invoice_total
  FROM invoices
  WHERE id = v_invoice_id;
  
  -- Update invoice status
  UPDATE invoices
  SET 
    amount_paid = v_total_paid,
    status = CASE
      WHEN v_total_paid = 0 THEN 'AWAITING_PAYMENT'
      WHEN v_total_paid >= v_invoice_total THEN 'PAID'
      ELSE 'PART_PAID'
    END,
    updated_at = now()
  WHERE id = v_invoice_id
    AND status NOT IN ('DRAFT', 'VOID');
  
  RETURN COALESCE(NEW, OLD);
END;
$$;