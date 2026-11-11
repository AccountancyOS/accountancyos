
-- =====================================================
-- PHASE 4: BOOKKEEPING GAP-FILL & HARDENING
-- =====================================================

-- GAP-002: Multi-Currency Support on ledger_entries
ALTER TABLE public.ledger_entries 
ADD COLUMN IF NOT EXISTS transaction_currency TEXT DEFAULT 'GBP',
ADD COLUMN IF NOT EXISTS transaction_debit NUMERIC,
ADD COLUMN IF NOT EXISTS transaction_credit NUMERIC,
ADD COLUMN IF NOT EXISTS fx_rate_to_base NUMERIC DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS base_currency TEXT DEFAULT 'GBP';

-- GAP-002: Multi-Currency Support on journals
ALTER TABLE public.journals
ADD COLUMN IF NOT EXISTS transaction_currency TEXT DEFAULT 'GBP',
ADD COLUMN IF NOT EXISTS fx_rate_to_base NUMERIC DEFAULT 1.0;

-- GAP-003: Reversal Journal columns
ALTER TABLE public.journals
ADD COLUMN IF NOT EXISTS reverses_journal_id UUID REFERENCES public.journals(id),
ADD COLUMN IF NOT EXISTS is_reversed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS reversal_date DATE;

-- GAP-002: FX Rates reference table (small cache)
CREATE TABLE IF NOT EXISTS public.fx_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency TEXT NOT NULL DEFAULT 'GBP',
  target_currency TEXT NOT NULL,
  rate_date DATE NOT NULL,
  rate NUMERIC NOT NULL,
  source TEXT DEFAULT 'api',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(base_currency, target_currency, rate_date)
);

-- Enable RLS on fx_rates
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;

-- FX rates are read-only for all authenticated users
CREATE POLICY "Authenticated users can view FX rates"
ON public.fx_rates FOR SELECT
TO authenticated
USING (true);

-- Only system can insert/update FX rates (via edge function)
CREATE POLICY "Service role can manage FX rates"
ON public.fx_rates FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- =====================================================
-- GAP-001: Period Lock Enforcement
-- =====================================================

-- Helper function to check if a period is locked
CREATE OR REPLACE FUNCTION public.is_period_locked(
  p_organization_id UUID,
  p_client_id UUID,
  p_company_id UUID,
  p_target_date DATE
) RETURNS BOOLEAN AS $$
DECLARE
  v_lock_date DATE;
BEGIN
  -- Find the most restrictive lock date for this entity
  SELECT lock_date INTO v_lock_date
  FROM public.period_locks
  WHERE organization_id = p_organization_id
    AND (
      (p_client_id IS NOT NULL AND client_id = p_client_id)
      OR (p_company_id IS NOT NULL AND company_id = p_company_id)
    )
  ORDER BY lock_date DESC
  LIMIT 1;
  
  -- If no lock exists, period is not locked
  IF v_lock_date IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Period is locked if target date is before or on lock date
  RETURN p_target_date <= v_lock_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger function to enforce period locks on ledger_entries
CREATE OR REPLACE FUNCTION public.enforce_period_lock_ledger_entries()
RETURNS TRIGGER AS $$
DECLARE
  v_is_locked BOOLEAN;
  v_entry_date DATE;
BEGIN
  -- Determine the date to check
  IF TG_OP = 'DELETE' THEN
    v_entry_date := OLD.entry_date;
  ELSE
    v_entry_date := NEW.entry_date;
  END IF;
  
  -- Check if period is locked
  v_is_locked := public.is_period_locked(
    COALESCE(NEW.organization_id, OLD.organization_id),
    COALESCE(NEW.client_id, OLD.client_id),
    COALESCE(NEW.company_id, OLD.company_id),
    v_entry_date
  );
  
  IF v_is_locked THEN
    -- Log the blocked attempt to audit_log
    INSERT INTO public.audit_log (
      organization_id,
      entity_type,
      entity_id,
      action,
      user_id,
      old_value,
      new_value,
      metadata
    ) VALUES (
      COALESCE(NEW.organization_id, OLD.organization_id),
      'ledger_entry',
      COALESCE(NEW.id, OLD.id),
      'period_lock_blocked',
      auth.uid(),
      CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN OLD.id::TEXT ELSE NULL END,
      CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN NEW.id::TEXT ELSE NULL END,
      jsonb_build_object(
        'operation', TG_OP,
        'entry_date', v_entry_date,
        'reason', 'Period is locked'
      )
    );
    
    RAISE EXCEPTION 'Cannot % ledger entry: period ending % is locked', 
      LOWER(TG_OP), v_entry_date;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger function to enforce period locks on journals
CREATE OR REPLACE FUNCTION public.enforce_period_lock_journals()
RETURNS TRIGGER AS $$
DECLARE
  v_is_locked BOOLEAN;
  v_journal_date DATE;
BEGIN
  -- Determine the date to check
  IF TG_OP = 'DELETE' THEN
    v_journal_date := OLD.journal_date;
  ELSE
    v_journal_date := NEW.journal_date;
  END IF;
  
  -- Check if period is locked
  v_is_locked := public.is_period_locked(
    COALESCE(NEW.organization_id, OLD.organization_id),
    COALESCE(NEW.client_id, OLD.client_id),
    COALESCE(NEW.company_id, OLD.company_id),
    v_journal_date
  );
  
  IF v_is_locked THEN
    -- Log the blocked attempt
    INSERT INTO public.audit_log (
      organization_id,
      entity_type,
      entity_id,
      action,
      user_id,
      old_value,
      new_value,
      metadata
    ) VALUES (
      COALESCE(NEW.organization_id, OLD.organization_id),
      'journal',
      COALESCE(NEW.id, OLD.id),
      'period_lock_blocked',
      auth.uid(),
      CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN OLD.id::TEXT ELSE NULL END,
      CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN NEW.id::TEXT ELSE NULL END,
      jsonb_build_object(
        'operation', TG_OP,
        'journal_date', v_journal_date,
        'reason', 'Period is locked'
      )
    );
    
    RAISE EXCEPTION 'Cannot % journal: period ending % is locked', 
      LOWER(TG_OP), v_journal_date;
  END IF;
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create triggers on ledger_entries
DROP TRIGGER IF EXISTS enforce_period_lock_on_ledger_entries ON public.ledger_entries;
CREATE TRIGGER enforce_period_lock_on_ledger_entries
  BEFORE INSERT OR UPDATE OR DELETE ON public.ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_period_lock_ledger_entries();

-- Create triggers on journals
DROP TRIGGER IF EXISTS enforce_period_lock_on_journals ON public.journals;
CREATE TRIGGER enforce_period_lock_on_journals
  BEFORE INSERT OR UPDATE OR DELETE ON public.journals
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_period_lock_journals();

-- =====================================================
-- GAP-003: Reverse Journal RPC Function
-- =====================================================

CREATE OR REPLACE FUNCTION public.reverse_journal(
  p_journal_id UUID,
  p_reversal_date DATE,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_original_journal RECORD;
  v_new_journal_id UUID;
  v_is_locked BOOLEAN;
  v_line RECORD;
BEGIN
  -- Get the original journal
  SELECT * INTO v_original_journal
  FROM public.journals
  WHERE id = p_journal_id;
  
  IF v_original_journal IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Journal not found');
  END IF;
  
  -- Check if already reversed
  IF v_original_journal.is_reversed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Journal has already been reversed');
  END IF;
  
  -- Check if reversal date is in a locked period
  v_is_locked := public.is_period_locked(
    v_original_journal.organization_id,
    v_original_journal.client_id,
    v_original_journal.company_id,
    p_reversal_date
  );
  
  IF v_is_locked THEN
    RETURN jsonb_build_object('success', false, 'error', 'Reversal date is in a locked period');
  END IF;
  
  -- Generate new journal ID
  v_new_journal_id := gen_random_uuid();
  
  -- Create the reversal journal
  INSERT INTO public.journals (
    id,
    organization_id,
    client_id,
    company_id,
    journal_date,
    reference,
    description,
    journal_type,
    status,
    total_debit,
    total_credit,
    transaction_currency,
    fx_rate_to_base,
    reverses_journal_id,
    created_by
  ) VALUES (
    v_new_journal_id,
    v_original_journal.organization_id,
    v_original_journal.client_id,
    v_original_journal.company_id,
    p_reversal_date,
    'REV-' || v_original_journal.reference,
    COALESCE(p_reason, 'Reversal of ' || v_original_journal.reference),
    'REVERSING',
    'POSTED',
    v_original_journal.total_credit, -- Swapped
    v_original_journal.total_debit,  -- Swapped
    v_original_journal.transaction_currency,
    v_original_journal.fx_rate_to_base,
    p_journal_id,
    auth.uid()
  );
  
  -- Copy and reverse the journal lines
  FOR v_line IN 
    SELECT * FROM public.journal_lines WHERE journal_id = p_journal_id
  LOOP
    INSERT INTO public.journal_lines (
      journal_id,
      account_id,
      debit,
      credit,
      description
    ) VALUES (
      v_new_journal_id,
      v_line.account_id,
      v_line.credit, -- Swapped
      v_line.debit,  -- Swapped
      'Reversal: ' || COALESCE(v_line.description, '')
    );
  END LOOP;
  
  -- Create reversed ledger entries
  INSERT INTO public.ledger_entries (
    organization_id,
    client_id,
    company_id,
    account_id,
    entry_date,
    debit,
    credit,
    description,
    reference,
    journal_id,
    transaction_currency,
    transaction_debit,
    transaction_credit,
    fx_rate_to_base,
    base_currency
  )
  SELECT
    organization_id,
    client_id,
    company_id,
    account_id,
    p_reversal_date,
    credit, -- Swapped
    debit,  -- Swapped
    'Reversal: ' || COALESCE(description, ''),
    'REV-' || reference,
    v_new_journal_id,
    transaction_currency,
    transaction_credit, -- Swapped
    transaction_debit,  -- Swapped
    fx_rate_to_base,
    base_currency
  FROM public.ledger_entries
  WHERE journal_id = p_journal_id;
  
  -- Mark original as reversed
  UPDATE public.journals
  SET is_reversed = TRUE,
      reversal_date = p_reversal_date
  WHERE id = p_journal_id;
  
  -- Log to audit
  INSERT INTO public.audit_log (
    organization_id,
    entity_type,
    entity_id,
    action,
    user_id,
    old_value,
    new_value,
    metadata
  ) VALUES (
    v_original_journal.organization_id,
    'journal',
    p_journal_id,
    'reversed',
    auth.uid(),
    p_journal_id::TEXT,
    v_new_journal_id::TEXT,
    jsonb_build_object(
      'reversal_journal_id', v_new_journal_id,
      'reversal_date', p_reversal_date,
      'reason', p_reason
    )
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'reversal_journal_id', v_new_journal_id,
    'message', 'Journal reversed successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- Indexes for performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_ledger_entries_currency ON public.ledger_entries(transaction_currency);
CREATE INDEX IF NOT EXISTS idx_journals_reversal ON public.journals(reverses_journal_id) WHERE reverses_journal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fx_rates_lookup ON public.fx_rates(base_currency, target_currency, rate_date DESC);
