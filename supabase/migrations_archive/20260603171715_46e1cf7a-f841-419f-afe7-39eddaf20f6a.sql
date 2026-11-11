UPDATE public.onboarding_applications SET aml_status = 'verified' WHERE aml_status = 'passed';

ALTER TABLE public.onboarding_applications DROP CONSTRAINT IF EXISTS onboarding_applications_aml_status_check;

ALTER TABLE public.onboarding_applications
  ADD CONSTRAINT onboarding_applications_aml_status_check
  CHECK (aml_status IN ('pending','verified','failed','manual_review'));