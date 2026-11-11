
-- =========================================================
-- B1: is_system flag + protection trigger
-- =========================================================
ALTER TABLE public.vat_codes
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS vat_codes_org_code_uidx
  ON public.vat_codes (organization_id, code);

CREATE OR REPLACE FUNCTION public.protect_system_vat_codes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.is_system THEN
      RAISE EXCEPTION 'System VAT code "%" cannot be deleted', OLD.code
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_system AND (
       NEW.code IS DISTINCT FROM OLD.code
       OR NEW.rate IS DISTINCT FROM OLD.rate
       OR NEW.vat_type IS DISTINCT FROM OLD.vat_type
       OR NEW.is_system IS DISTINCT FROM OLD.is_system
    ) THEN
      RAISE EXCEPTION 'System VAT code "%" core fields (code/rate/type/is_system) cannot be modified', OLD.code
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_system_vat_codes ON public.vat_codes;
CREATE TRIGGER trg_protect_system_vat_codes
BEFORE UPDATE OR DELETE ON public.vat_codes
FOR EACH ROW EXECUTE FUNCTION public.protect_system_vat_codes();

-- =========================================================
-- seed_system_vat_codes(org) — idempotent
-- =========================================================
CREATE OR REPLACE FUNCTION public.seed_system_vat_codes(p_organization_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_users
    WHERE organization_id = p_organization_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of organization %', p_organization_id;
  END IF;

  WITH seed(code, description, rate, vat_type, supply_category, is_reclaimable, reverse_charge, is_common) AS (
    VALUES
      ('S20', 'Standard rated sales 20%',           20.0, 'OUTPUT', 'STANDARD',     false, false, true),
      ('S5',  'Reduced rated sales 5%',              5.0, 'OUTPUT', 'REDUCED',      false, false, true),
      ('Z',   'Zero rated sales',                    0.0, 'ZERO',   'ZERO_RATED',   false, false, true),
      ('E',   'Exempt sales',                        0.0, 'EXEMPT', 'EXEMPT',       false, false, true),
      ('OS',  'Outside the scope of UK VAT',         0.0, 'EXEMPT', 'OUT_OF_SCOPE', false, false, false),
      ('P20', 'Standard rated purchases 20%',       20.0, 'INPUT',  'STANDARD',     true,  false, true),
      ('P5',  'Reduced rated purchases 5%',          5.0, 'INPUT',  'REDUCED',      true,  false, true),
      ('PZ',  'Zero rated purchases',                0.0, 'ZERO',   'ZERO_RATED',   true,  false, false),
      ('PE',  'Exempt purchases',                    0.0, 'EXEMPT', 'EXEMPT',       false, false, false),
      ('NV',  'No VAT / outside scope purchases',    0.0, 'EXEMPT', 'OUT_OF_SCOPE', false, false, true),
      ('RC',  'Reverse charge (domestic services)', 20.0, 'INPUT',  'REVERSE_CHG',  true,  true,  false),
      ('IMP', 'Import VAT (PVA)',                   20.0, 'INPUT',  'IMPORT',       true,  false, false),
      ('EXP', 'Export of goods outside UK',          0.0, 'ZERO',   'EXPORT',       false, false, false),
      ('EU_GOODS', 'EU acquisitions of goods',      20.0, 'INPUT',  'EU_GOODS',     true,  true,  false)
  )
  INSERT INTO public.vat_codes (
    organization_id, code, description, rate, vat_type,
    supply_category, is_reclaimable, reverse_charge, is_common,
    is_active, is_system, jurisdiction
  )
  SELECT
    p_organization_id, s.code, s.description, s.rate, s.vat_type,
    s.supply_category, s.is_reclaimable, s.reverse_charge, s.is_common,
    true, true, 'UK'
  FROM seed s
  ON CONFLICT (organization_id, code) DO UPDATE
    SET is_system   = true,
        description = EXCLUDED.description,
        is_active   = true,
        updated_at  = now()
  ;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_system_vat_codes(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.seed_system_vat_codes(uuid) TO authenticated;

-- =========================================================
-- B2: get_vat_9box_detail
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_vat_9box_detail(
  p_organization_id uuid,
  p_client_id uuid,
  p_company_id uuid,
  p_from date,
  p_to date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_boxes jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_users
    WHERE organization_id = p_organization_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of organization %', p_organization_id;
  END IF;

  IF (p_client_id IS NULL AND p_company_id IS NULL)
     OR (p_client_id IS NOT NULL AND p_company_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Exactly one of client_id or company_id must be provided';
  END IF;

  -- Pull invoice lines (sales) for the entity in the period
  WITH inv AS (
    SELECT
      il.id,
      i.issue_date AS tx_date,
      i.invoice_number AS doc_ref,
      'invoice'::text AS source_type,
      il.invoice_id AS source_id,
      il.description,
      COALESCE(vc.code, 'UNKNOWN')           AS vat_code,
      COALESCE(vc.rate, il.vat_rate, 0)      AS vat_rate,
      COALESCE(vc.vat_type, 'OUTPUT')        AS vat_type,
      ABS(COALESCE(il.net_amount,0))         AS net_amount,
      ABS(COALESCE(il.vat_amount,0))         AS vat_amount,
      'SALES'::text AS direction
    FROM public.invoice_lines il
    JOIN public.invoices i ON i.id = il.invoice_id
    LEFT JOIN public.vat_codes vc ON vc.id = il.vat_code_id
    WHERE i.organization_id = p_organization_id
      AND i.is_posted = true
      AND i.issue_date BETWEEN p_from AND p_to
      AND ( (p_client_id IS NOT NULL AND i.client_id = p_client_id)
         OR (p_company_id IS NOT NULL AND i.company_id = p_company_id) )
  ),
  bil AS (
    SELECT
      bl.id,
      b.issue_date AS tx_date,
      b.bill_number AS doc_ref,
      'bill'::text AS source_type,
      bl.bill_id AS source_id,
      bl.description,
      COALESCE(vc.code, 'UNKNOWN')          AS vat_code,
      COALESCE(vc.rate, bl.vat_rate, 0)     AS vat_rate,
      COALESCE(vc.vat_type, 'INPUT')        AS vat_type,
      ABS(COALESCE(bl.net_amount,0))        AS net_amount,
      ABS(COALESCE(bl.vat_amount,0))        AS vat_amount,
      'PURCHASES'::text AS direction
    FROM public.bill_lines bl
    JOIN public.bills b ON b.id = bl.bill_id
    LEFT JOIN public.vat_codes vc ON vc.id = bl.vat_code_id
    WHERE b.organization_id = p_organization_id
      AND b.is_posted = true
      AND b.issue_date BETWEEN p_from AND p_to
      AND ( (p_client_id IS NOT NULL AND b.client_id = p_client_id)
         OR (p_company_id IS NOT NULL AND b.company_id = p_company_id) )
  ),
  lines AS (
    SELECT * FROM inv UNION ALL SELECT * FROM bil
  ),
  -- Box mapping helper (mirrors src/lib/vat-ledger-aggregator.ts)
  mapped AS (
    SELECT
      l.*,
      CASE
        WHEN l.direction='SALES'     AND l.vat_code IN ('S20','S5','RC') THEN l.vat_amount ELSE 0 END AS box1,
      CASE
        WHEN l.direction='SALES'     AND l.vat_code = 'EU_GOODS'         THEN l.vat_amount ELSE 0 END AS box2,
      CASE
        WHEN l.direction='PURCHASES' AND l.vat_code IN ('P20','P5','RC','IMP','EU_GOODS') THEN l.vat_amount ELSE 0 END AS box4,
      CASE WHEN l.direction='SALES'     THEN l.net_amount ELSE 0 END AS box6,
      CASE WHEN l.direction='PURCHASES' THEN l.net_amount ELSE 0 END AS box7,
      CASE WHEN l.direction='SALES'     AND l.vat_code='EXP'      THEN l.net_amount ELSE 0 END AS box8,
      CASE WHEN l.direction='PURCHASES' AND l.vat_code='EU_GOODS' THEN l.net_amount ELSE 0 END AS box9
    FROM lines l
  ),
  totals AS (
    SELECT
      ROUND(SUM(box1)::numeric, 2) AS b1,
      ROUND(SUM(box2)::numeric, 2) AS b2,
      ROUND(SUM(box4)::numeric, 2) AS b4,
      ROUND(SUM(box6)::numeric, 0) AS b6,
      ROUND(SUM(box7)::numeric, 0) AS b7,
      ROUND(SUM(box8)::numeric, 0) AS b8,
      ROUND(SUM(box9)::numeric, 0) AS b9
    FROM mapped
  ),
  per_code AS (
    SELECT
      vat_code,
      MAX(vat_rate) AS vat_rate,
      MAX(vat_type) AS vat_type,
      COUNT(*)::int AS line_count,
      ROUND(SUM(net_amount)::numeric, 2) AS total_net,
      ROUND(SUM(vat_amount)::numeric, 2) AS total_vat,
      jsonb_agg(jsonb_build_object(
        'id', id,
        'tx_date', tx_date,
        'doc_ref', doc_ref,
        'source_type', source_type,
        'source_id', source_id,
        'description', description,
        'net_amount', net_amount,
        'vat_amount', vat_amount,
        'direction', direction
      ) ORDER BY tx_date, doc_ref) AS transactions
    FROM mapped
    GROUP BY vat_code
  )
  SELECT jsonb_build_object(
    'period_from', p_from,
    'period_to',   p_to,
    'organization_id', p_organization_id,
    'client_id',  p_client_id,
    'company_id', p_company_id,
    'boxes', (SELECT jsonb_build_object(
        'box1_vat_on_sales',           COALESCE(b1,0),
        'box2_vat_on_acquisitions',    COALESCE(b2,0),
        'box3_total_vat_due',          ROUND((COALESCE(b1,0)+COALESCE(b2,0))::numeric, 2),
        'box4_vat_reclaimed',          COALESCE(b4,0),
        'box5_net_vat_due',            ROUND(ABS((COALESCE(b1,0)+COALESCE(b2,0))-COALESCE(b4,0))::numeric, 2),
        'box6_total_sales_ex_vat',     COALESCE(b6,0),
        'box7_total_purchases_ex_vat', COALESCE(b7,0),
        'box8_goods_supplied_ex_vat',  COALESCE(b8,0),
        'box9_acquisitions_ex_vat',    COALESCE(b9,0)
      ) FROM totals),
    'codes', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'vat_code', vat_code,
        'vat_rate', vat_rate,
        'vat_type', vat_type,
        'line_count', line_count,
        'total_net', total_net,
        'total_vat', total_vat,
        'transactions', transactions
      ) ORDER BY vat_code) FROM per_code), '[]'::jsonb),
    'generated_at', now()
  )
  INTO v_boxes;

  RETURN v_boxes;
END;
$$;

REVOKE ALL ON FUNCTION public.get_vat_9box_detail(uuid, uuid, uuid, date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.get_vat_9box_detail(uuid, uuid, uuid, date, date) TO authenticated;
