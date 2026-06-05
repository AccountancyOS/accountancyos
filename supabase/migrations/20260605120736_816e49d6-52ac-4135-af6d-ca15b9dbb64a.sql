CREATE OR REPLACE FUNCTION public.update_invoice_payment_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total_paid NUMERIC;
  v_invoice_total NUMERIC;
  v_invoice_id UUID;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);

  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM invoice_payments
  WHERE invoice_id = v_invoice_id;

  SELECT total_gross INTO v_invoice_total
  FROM invoices
  WHERE id = v_invoice_id;

  UPDATE invoices
  SET
    amount_paid = v_total_paid,
    status = CASE
      WHEN v_total_paid = 0 THEN 'sent'
      WHEN v_total_paid >= v_invoice_total THEN 'paid'
      ELSE 'part_paid'
    END,
    updated_at = now()
  WHERE id = v_invoice_id
    AND status NOT IN ('draft', 'voided', 'cancelled');

  RETURN COALESCE(NEW, OLD);
END;
$function$;