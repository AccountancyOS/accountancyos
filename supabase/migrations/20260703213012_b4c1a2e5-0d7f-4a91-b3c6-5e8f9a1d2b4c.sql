-- ============================================================
-- Fix (review finding B4): reverse_journal omitted NOT-NULL ledger_entries columns
-- ============================================================
-- ledger_entries.transaction_date and .source_type are NOT NULL, but reverse_journal's
-- INSERT supplied neither — so every journal reversal (bank-match unmatch, invoice void)
-- aborted with a NOT-NULL violation. Supply transaction_date (= the reversal date, matching
-- entry_date) and carry source_type/source_id from the original entries. Function reproduced
-- byte-faithfully; only the ledger_entries INSERT changed.
-- ============================================================

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
    transaction_date,
    debit,
    credit,
    description,
    reference,
    journal_id,
    source_type,
    source_id,
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
    p_reversal_date,
    credit, -- Swapped
    debit,  -- Swapped
    'Reversal: ' || COALESCE(description, ''),
    'REV-' || reference,
    v_new_journal_id,
    source_type,
    source_id,
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
