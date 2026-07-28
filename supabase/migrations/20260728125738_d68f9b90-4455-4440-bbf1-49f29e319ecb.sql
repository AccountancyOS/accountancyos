UPDATE public.services_catalog
   SET active = false,
       updated_at = now()
 WHERE code = 'mtd_quarterly'
   AND active IS DISTINCT FROM false;

COMMENT ON TABLE public.services_catalog IS
  'Sellable services per organization. NOTE: code ''mtd_quarterly'' is a retired legacy '
  'entry (deactivated by 20260728130000, DEF-010) — the canonical MTD codes are '
  '''mtd_quarter'' and ''mtd_itsa_final'', which the proposal engine decomposes a tax '
  'year into. Do not reactivate it.';