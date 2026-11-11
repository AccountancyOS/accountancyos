
-- Add structured tax mapping columns to bookkeeping_accounts
-- These replace the unstructured tax_mapping JSONB for tax-critical fields

ALTER TABLE public.bookkeeping_accounts 
  ADD COLUMN IF NOT EXISTS tax_allowability TEXT DEFAULT 'fully_allowable' 
    CHECK (tax_allowability IN ('fully_allowable', 'partially_allowable', 'disallowable', 'capital', 'not_applicable')),
  ADD COLUMN IF NOT EXISTS ct_addback_category TEXT DEFAULT NULL
    CHECK (ct_addback_category IN (
      'depreciation', 'amortisation', 'entertaining', 'donations_non_qualifying',
      'fines_penalties', 'legal_non_trade', 'provisions', 'personal_expenses',
      'capital_expenditure', 'other_disallowable', NULL
    )),
  ADD COLUMN IF NOT EXISTS vat_treatment TEXT DEFAULT 'standard'
    CHECK (vat_treatment IN ('standard', 'reduced', 'zero_rated', 'exempt', 'outside_scope', 'reverse_charge', 'not_applicable'));
