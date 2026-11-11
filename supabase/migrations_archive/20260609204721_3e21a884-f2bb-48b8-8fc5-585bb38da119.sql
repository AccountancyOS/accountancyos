CREATE UNIQUE INDEX IF NOT EXISTS portal_visibility_settings_client_unique
  ON public.portal_visibility_settings (client_id)
  WHERE client_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS portal_visibility_settings_company_unique
  ON public.portal_visibility_settings (company_id)
  WHERE company_id IS NOT NULL;