CREATE UNIQUE INDEX IF NOT EXISTS services_catalog_org_canonical_code_uniq
  ON public.services_catalog (organization_id, canonical_service_code)
  WHERE canonical_service_code IS NOT NULL;