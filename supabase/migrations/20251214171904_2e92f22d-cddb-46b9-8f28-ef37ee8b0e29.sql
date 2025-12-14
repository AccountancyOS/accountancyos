-- Fix function search path security warnings

CREATE OR REPLACE FUNCTION public.get_active_vat_registration(
  p_entity_id UUID,
  p_entity_type TEXT,
  p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS public.vat_registrations
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT *
  FROM public.vat_registrations
  WHERE (
    (p_entity_type = 'company' AND company_id = p_entity_id) OR
    (p_entity_type = 'client' AND client_id = p_entity_id)
  )
  AND effective_from <= p_as_of_date
  AND (effective_to IS NULL OR effective_to >= p_as_of_date)
  ORDER BY effective_from DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.calculate_cash_vat_proportion(
  p_net_amount DECIMAL,
  p_vat_amount DECIMAL,
  p_paid_amount DECIMAL,
  p_gross_amount DECIMAL
)
RETURNS DECIMAL
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE 
    WHEN p_gross_amount = 0 THEN 0
    ELSE (p_paid_amount / p_gross_amount) * p_vat_amount
  END;
$$;