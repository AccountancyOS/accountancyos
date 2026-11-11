-- Fix search_path security warning for calculate_deadline function
CREATE OR REPLACE FUNCTION public.calculate_deadline(
  filing_type TEXT,
  period_start DATE,
  period_end DATE,
  metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_date DATE;
  ard DATE;
  made_up_date DATE;
  quarter_end DATE;
BEGIN
  CASE filing_type
    WHEN 'companies_house_accounts' THEN
      ard := (metadata->>'accounting_reference_date')::DATE;
      IF ard IS NULL THEN
        ard := period_end;
      END IF;
      result_date := ard + INTERVAL '9 months';
      
    WHEN 'companies_house_confirmation' THEN
      made_up_date := (metadata->>'made_up_date')::DATE;
      IF made_up_date IS NULL THEN
        made_up_date := period_end;
      END IF;
      result_date := made_up_date + INTERVAL '12 months';
      
    WHEN 'corporation_tax_filing' THEN
      ard := (metadata->>'accounting_reference_date')::DATE;
      IF ard IS NULL THEN
        ard := period_end;
      END IF;
      result_date := ard + INTERVAL '12 months';
      
    WHEN 'corporation_tax_payment' THEN
      ard := (metadata->>'accounting_reference_date')::DATE;
      IF ard IS NULL THEN
        ard := period_end;
      END IF;
      result_date := ard + INTERVAL '9 months' + INTERVAL '1 day';
      
    WHEN 'self_assessment' THEN
      result_date := DATE_TRUNC('year', period_end)::DATE + INTERVAL '1 year' + INTERVAL '1 month' - INTERVAL '1 day';
      IF EXTRACT(MONTH FROM period_end) < 4 THEN
        result_date := result_date - INTERVAL '1 year';
      END IF;
      
    WHEN 'vat_return' THEN
      quarter_end := period_end;
      result_date := quarter_end + INTERVAL '1 month' + INTERVAL '7 days';
      
    WHEN 'payroll_fps' THEN
      result_date := period_end;
      
    WHEN 'payroll_eps' THEN
      result_date := DATE_TRUNC('month', period_end)::DATE + INTERVAL '1 month' + INTERVAL '18 days';
      
    ELSE
      result_date := period_end + INTERVAL '1 month';
  END CASE;
  
  RETURN result_date;
END;
$$;