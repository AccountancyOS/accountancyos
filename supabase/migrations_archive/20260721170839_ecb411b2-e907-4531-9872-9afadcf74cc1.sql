ALTER TABLE public.company_persons ADD COLUMN IF NOT EXISTS ch_psc_id text;

CREATE UNIQUE INDEX IF NOT EXISTS company_persons_org_ch_psc_uq
  ON public.company_persons (organization_id, ch_psc_id)
  WHERE ch_psc_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS company_pscs_company_ch_psc_uq
  ON public.company_pscs (company_id, ch_psc_id)
  WHERE ch_psc_id IS NOT NULL;