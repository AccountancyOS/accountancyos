CREATE UNIQUE INDEX IF NOT EXISTS company_persons_org_ch_psc_unique
  ON public.company_persons (organization_id, ch_psc_id);

CREATE UNIQUE INDEX IF NOT EXISTS company_pscs_company_ch_psc_unique
  ON public.company_pscs (company_id, ch_psc_id);