-- Phase 5 Block A Slice 2: Aged Debtors / Aged Creditors

CREATE OR REPLACE FUNCTION public.get_aged_debtors(
  p_organization_id uuid,
  p_client_id uuid,
  p_company_id uuid,
  p_as_at date
)
RETURNS TABLE(
  customer_id uuid,
  customer_name text,
  current_amount numeric,
  bucket_1_30 numeric,
  bucket_31_60 numeric,
  bucket_61_90 numeric,
  bucket_90_plus numeric,
  total_outstanding numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM organization_users
    WHERE organization_id = p_organization_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized for organization';
  END IF;

  IF (p_client_id IS NULL) = (p_company_id IS NULL) THEN
    RAISE EXCEPTION 'Exactly one of client_id or company_id required';
  END IF;

  RETURN QUERY
  WITH open_inv AS (
    SELECT
      i.customer_id,
      COALESCE(i.remaining_balance, i.total_gross - COALESCE(i.amount_paid,0)) AS outstanding,
      (p_as_at - i.due_date) AS days_overdue
    FROM invoices i
    WHERE i.organization_id = p_organization_id
      AND ((p_client_id IS NOT NULL AND i.client_id = p_client_id)
        OR (p_company_id IS NOT NULL AND i.company_id = p_company_id))
      AND i.issue_date <= p_as_at
      AND COALESCE(i.status, '') NOT IN ('void','draft','cancelled')
      AND COALESCE(i.remaining_balance, i.total_gross - COALESCE(i.amount_paid,0)) > 0.005
      AND i.customer_id IS NOT NULL
  )
  SELECT
    o.customer_id,
    c.name AS customer_name,
    SUM(CASE WHEN o.days_overdue <= 0 THEN o.outstanding ELSE 0 END)::numeric AS current_amount,
    SUM(CASE WHEN o.days_overdue BETWEEN 1 AND 30 THEN o.outstanding ELSE 0 END)::numeric AS bucket_1_30,
    SUM(CASE WHEN o.days_overdue BETWEEN 31 AND 60 THEN o.outstanding ELSE 0 END)::numeric AS bucket_31_60,
    SUM(CASE WHEN o.days_overdue BETWEEN 61 AND 90 THEN o.outstanding ELSE 0 END)::numeric AS bucket_61_90,
    SUM(CASE WHEN o.days_overdue > 90 THEN o.outstanding ELSE 0 END)::numeric AS bucket_90_plus,
    SUM(o.outstanding)::numeric AS total_outstanding
  FROM open_inv o
  JOIN customers c ON c.id = o.customer_id
  GROUP BY o.customer_id, c.name
  ORDER BY c.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_aged_creditors(
  p_organization_id uuid,
  p_client_id uuid,
  p_company_id uuid,
  p_as_at date
)
RETURNS TABLE(
  supplier_id uuid,
  supplier_name text,
  current_amount numeric,
  bucket_1_30 numeric,
  bucket_31_60 numeric,
  bucket_61_90 numeric,
  bucket_90_plus numeric,
  total_outstanding numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM organization_users
    WHERE organization_id = p_organization_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized for organization';
  END IF;

  IF (p_client_id IS NULL) = (p_company_id IS NULL) THEN
    RAISE EXCEPTION 'Exactly one of client_id or company_id required';
  END IF;

  RETURN QUERY
  WITH open_bill AS (
    SELECT
      b.supplier_id,
      COALESCE(b.remaining_balance, b.total_gross - COALESCE(b.amount_paid,0)) AS outstanding,
      (p_as_at - b.due_date) AS days_overdue
    FROM bills b
    WHERE b.organization_id = p_organization_id
      AND ((p_client_id IS NOT NULL AND b.client_id = p_client_id)
        OR (p_company_id IS NOT NULL AND b.company_id = p_company_id))
      AND b.issue_date <= p_as_at
      AND COALESCE(b.status, '') NOT IN ('void','draft','cancelled')
      AND COALESCE(b.remaining_balance, b.total_gross - COALESCE(b.amount_paid,0)) > 0.005
      AND b.supplier_id IS NOT NULL
  )
  SELECT
    o.supplier_id,
    s.name AS supplier_name,
    SUM(CASE WHEN o.days_overdue <= 0 THEN o.outstanding ELSE 0 END)::numeric AS current_amount,
    SUM(CASE WHEN o.days_overdue BETWEEN 1 AND 30 THEN o.outstanding ELSE 0 END)::numeric AS bucket_1_30,
    SUM(CASE WHEN o.days_overdue BETWEEN 31 AND 60 THEN o.outstanding ELSE 0 END)::numeric AS bucket_31_60,
    SUM(CASE WHEN o.days_overdue BETWEEN 61 AND 90 THEN o.outstanding ELSE 0 END)::numeric AS bucket_61_90,
    SUM(CASE WHEN o.days_overdue > 90 THEN o.outstanding ELSE 0 END)::numeric AS bucket_90_plus,
    SUM(o.outstanding)::numeric AS total_outstanding
  FROM open_bill o
  JOIN suppliers s ON s.id = o.supplier_id
  GROUP BY o.supplier_id, s.name
  ORDER BY s.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_aged_debtors(uuid,uuid,uuid,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_aged_creditors(uuid,uuid,uuid,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_aged_debtors(uuid,uuid,uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_aged_creditors(uuid,uuid,uuid,date) TO authenticated;