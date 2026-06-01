-- Expand chaser policy trigger_type to support Phase 2 subject-based categories.
ALTER TABLE public.automation_chaser_policies
  DROP CONSTRAINT IF EXISTS automation_chaser_policies_trigger_type_check;

ALTER TABLE public.automation_chaser_policies
  ADD CONSTRAINT automation_chaser_policies_trigger_type_check
  CHECK (trigger_type = ANY (ARRAY[
    'COMPANY_YEAR_END',
    'TAX_YEAR_END',
    'MTD_QUARTER_END',
    'VAT_PERIOD_END',
    'MANUAL',
    'JOB_CREATED',
    'LEAD_CREATED',
    'QUOTE_SENT',
    'ENGAGEMENT_LETTER_SENT',
    'KYC_STATUS_CHANGED',
    'HMRC_AUTH_REQUESTED'
  ]));