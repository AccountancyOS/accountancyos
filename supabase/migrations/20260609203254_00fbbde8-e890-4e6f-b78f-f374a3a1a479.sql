
-- Phase 5 Block C: Fixed Assets Register + Depreciation

ALTER TABLE public.fixed_assets
  ADD COLUMN IF NOT EXISTS depreciation_method text NOT NULL DEFAULT 'SL' CHECK (depreciation_method IN ('SL','RB','NONE')),
  ADD COLUMN IF NOT EXISTS useful_life_months integer,
  ADD COLUMN IF NOT EXISTS residual_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS depreciation_rate_pct numeric,
  ADD COLUMN IF NOT EXISTS depreciation_start_date date,
  ADD COLUMN IF NOT EXISTS accumulated_depreciation numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_depreciation_date date,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disposed','fully_depreciated')),
  ADD COLUMN IF NOT EXISTS depreciation_expense_account_id uuid REFERENCES public.bookkeeping_accounts(id),
  ADD COLUMN IF NOT EXISTS accumulated_depreciation_account_id uuid REFERENCES public.bookkeeping_accounts(id),
  ADD COLUMN IF NOT EXISTS fixed_asset_account_id uuid REFERENCES public.bookkeeping_accounts(id);

ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS depreciation_expense_account_id uuid REFERENCES public.bookkeeping_accounts(id);

-- =====================================================================
-- post_monthly_depreciation
-- =====================================================================
CREATE OR REPLACE FUNCTION public.post_monthly_depreciation(
  p_asset_id uuid,
  p_period_end date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_asset public.fixed_assets%ROWTYPE;
  v_user uuid := auth.uid();
  v_period_start date := date_trunc('month', p_period_end)::date;
  v_period_end date := (date_trunc('month', p_period_end) + interval '1 month - 1 day')::date;
  v_reference text;
  v_existing uuid;
  v_dep_acct uuid;
  v_accum_acct uuid;
  v_asset_acct uuid;
  v_depreciable numeric;
  v_charge numeric := 0;
  v_remaining numeric;
  v_entries jsonb;
  v_result jsonb;
BEGIN
  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asset not found'; END IF;

  IF NOT public.has_role(v_user, 'owner') AND NOT public.has_role(v_user, 'admin') AND NOT public.has_role(v_user, 'staff') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.organization_users WHERE user_id = v_user AND organization_id = v_asset.organization_id) THEN
    RAISE EXCEPTION 'Cross-tenant access denied';
  END IF;

  IF v_asset.status <> 'active' THEN
    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'asset_not_active');
  END IF;

  IF v_asset.depreciation_method = 'NONE' THEN
    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'no_depreciation');
  END IF;

  IF v_asset.depreciation_start_date IS NULL OR v_period_end < v_asset.depreciation_start_date THEN
    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'before_start_date');
  END IF;

  v_reference := 'DEPN-' || p_asset_id::text || '-' || to_char(v_period_end, 'YYYYMM');
  SELECT id INTO v_existing FROM public.journals
    WHERE organization_id = v_asset.organization_id AND source_type = 'DEPRECIATION' AND reference = v_reference;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'already_posted', 'journal_id', v_existing);
  END IF;

  v_dep_acct := COALESCE(v_asset.depreciation_expense_account_id,
    (SELECT depreciation_expense_account_id FROM public.org_settings WHERE organization_id = v_asset.organization_id LIMIT 1));
  v_accum_acct := COALESCE(v_asset.accumulated_depreciation_account_id,
    (SELECT accumulated_depreciation_account_id FROM public.org_settings WHERE organization_id = v_asset.organization_id LIMIT 1));
  v_asset_acct := v_asset.fixed_asset_account_id;

  IF v_dep_acct IS NULL OR v_accum_acct IS NULL THEN
    RAISE EXCEPTION 'Depreciation expense or accumulated depreciation account not configured';
  END IF;

  v_depreciable := GREATEST(v_asset.cost - COALESCE(v_asset.residual_value,0), 0);
  v_remaining := GREATEST(v_depreciable - COALESCE(v_asset.accumulated_depreciation,0), 0);

  IF v_asset.depreciation_method = 'SL' THEN
    IF v_asset.useful_life_months IS NULL OR v_asset.useful_life_months <= 0 THEN
      RAISE EXCEPTION 'Useful life (months) required for straight-line';
    END IF;
    v_charge := round(v_depreciable / v_asset.useful_life_months, 2);
  ELSIF v_asset.depreciation_method = 'RB' THEN
    IF v_asset.depreciation_rate_pct IS NULL OR v_asset.depreciation_rate_pct <= 0 THEN
      RAISE EXCEPTION 'Depreciation rate required for reducing balance';
    END IF;
    v_charge := round((v_asset.cost - COALESCE(v_asset.accumulated_depreciation,0)) * (v_asset.depreciation_rate_pct/100.0) / 12.0, 2);
  END IF;

  v_charge := LEAST(v_charge, v_remaining);

  IF v_charge <= 0 THEN
    UPDATE public.fixed_assets SET status='fully_depreciated', updated_at=now() WHERE id=p_asset_id;
    RETURN jsonb_build_object('success', true, 'skipped', true, 'reason', 'fully_depreciated');
  END IF;

  v_entries := jsonb_build_array(
    jsonb_build_object('account_id', v_dep_acct, 'debit', v_charge, 'credit', 0,
                       'description', 'Depreciation: ' || v_asset.asset_name),
    jsonb_build_object('account_id', v_accum_acct, 'debit', 0, 'credit', v_charge,
                       'description', 'Accumulated depreciation: ' || v_asset.asset_name)
  );

  v_result := public.post_to_ledger(
    p_organization_id := v_asset.organization_id,
    p_client_id       := NULL,
    p_company_id      := v_asset.company_id,
    p_journal_date    := v_period_end,
    p_reference       := v_reference,
    p_description     := 'Monthly depreciation - ' || v_asset.asset_name,
    p_journal_type    := 'DEPRECIATION',
    p_source_type     := 'DEPRECIATION',
    p_source_id       := p_asset_id,
    p_currency        := 'GBP',
    p_fx_rate         := 1.0,
    p_created_by      := v_user,
    p_entries         := v_entries,
    p_lock_override_reason := NULL,
    p_idempotency_key := v_reference
  );

  IF (v_result->>'success')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'post_to_ledger failed: %', v_result->>'error';
  END IF;

  UPDATE public.fixed_assets
     SET accumulated_depreciation = COALESCE(accumulated_depreciation,0) + v_charge,
         last_depreciation_date = v_period_end,
         status = CASE WHEN COALESCE(accumulated_depreciation,0) + v_charge >= v_depreciable
                       THEN 'fully_depreciated' ELSE status END,
         updated_at = now()
   WHERE id = p_asset_id;

  INSERT INTO public.bookkeeping_audit_log(organization_id, entity_type, entity_id, action, actor_id, after_state)
  VALUES (v_asset.organization_id, 'fixed_asset', p_asset_id, 'post_depreciation', v_user,
          jsonb_build_object('period_end', v_period_end, 'charge', v_charge, 'journal_id', v_result->>'journal_id'));

  RETURN jsonb_build_object('success', true, 'charge', v_charge, 'journal_id', v_result->>'journal_id', 'period_end', v_period_end);
END; $$;

GRANT EXECUTE ON FUNCTION public.post_monthly_depreciation(uuid, date) TO authenticated;

-- =====================================================================
-- run_monthly_depreciation: iterate all active assets for an entity
-- =====================================================================
CREATE OR REPLACE FUNCTION public.run_monthly_depreciation(
  p_organization_id uuid,
  p_company_id uuid,
  p_period_end date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_asset record;
  v_results jsonb := '[]'::jsonb;
  v_r jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organization_users WHERE user_id = auth.uid() AND organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'Cross-tenant access denied';
  END IF;

  FOR v_asset IN
    SELECT id FROM public.fixed_assets
     WHERE organization_id = p_organization_id
       AND company_id = p_company_id
       AND status = 'active'
       AND depreciation_method <> 'NONE'
  LOOP
    v_r := public.post_monthly_depreciation(v_asset.id, p_period_end);
    v_results := v_results || jsonb_build_array(jsonb_build_object('asset_id', v_asset.id, 'result', v_r));
  END LOOP;

  RETURN jsonb_build_object('success', true, 'period_end', p_period_end, 'results', v_results);
END; $$;

GRANT EXECUTE ON FUNCTION public.run_monthly_depreciation(uuid, uuid, date) TO authenticated;

-- =====================================================================
-- dispose_fixed_asset
-- =====================================================================
CREATE OR REPLACE FUNCTION public.dispose_fixed_asset(
  p_asset_id uuid,
  p_disposal_date date,
  p_proceeds numeric,
  p_proceeds_account_id uuid,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_asset public.fixed_assets%ROWTYPE;
  v_user uuid := auth.uid();
  v_accum_acct uuid;
  v_asset_acct uuid;
  v_gain_loss numeric;
  v_nbv numeric;
  v_entries jsonb;
  v_result jsonb;
  v_gain_loss_acct uuid;
  v_reference text;
BEGIN
  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asset not found'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.organization_users WHERE user_id = v_user AND organization_id = v_asset.organization_id) THEN
    RAISE EXCEPTION 'Cross-tenant access denied';
  END IF;

  IF v_asset.status = 'disposed' THEN
    RAISE EXCEPTION 'Asset already disposed';
  END IF;

  v_accum_acct := COALESCE(v_asset.accumulated_depreciation_account_id,
    (SELECT accumulated_depreciation_account_id FROM public.org_settings WHERE organization_id = v_asset.organization_id LIMIT 1));
  v_asset_acct := COALESCE(v_asset.fixed_asset_account_id,
    (SELECT fixed_assets_account_id FROM public.org_settings WHERE organization_id = v_asset.organization_id LIMIT 1));
  v_gain_loss_acct := COALESCE(v_asset.depreciation_expense_account_id,
    (SELECT depreciation_expense_account_id FROM public.org_settings WHERE organization_id = v_asset.organization_id LIMIT 1));

  IF v_accum_acct IS NULL OR v_asset_acct IS NULL OR p_proceeds_account_id IS NULL OR v_gain_loss_acct IS NULL THEN
    RAISE EXCEPTION 'Disposal accounts not fully configured';
  END IF;

  v_nbv := v_asset.cost - COALESCE(v_asset.accumulated_depreciation,0);
  v_gain_loss := COALESCE(p_proceeds,0) - v_nbv; -- positive = gain, negative = loss
  v_reference := 'DISP-' || p_asset_id::text || '-' || to_char(p_disposal_date, 'YYYYMMDD');

  -- Build entries:
  -- Dr Proceeds account (cash/bank or receivable) for proceeds
  -- Dr Accumulated depreciation
  -- Cr Fixed asset (cost)
  -- Dr/Cr Gain or Loss balancing line
  v_entries := jsonb_build_array(
    jsonb_build_object('account_id', p_proceeds_account_id, 'debit', COALESCE(p_proceeds,0), 'credit', 0,
                       'description', 'Disposal proceeds: ' || v_asset.asset_name),
    jsonb_build_object('account_id', v_accum_acct, 'debit', COALESCE(v_asset.accumulated_depreciation,0), 'credit', 0,
                       'description', 'Remove accumulated depreciation: ' || v_asset.asset_name),
    jsonb_build_object('account_id', v_asset_acct, 'debit', 0, 'credit', v_asset.cost,
                       'description', 'Remove cost: ' || v_asset.asset_name)
  );

  IF v_gain_loss > 0 THEN
    v_entries := v_entries || jsonb_build_array(
      jsonb_build_object('account_id', v_gain_loss_acct, 'debit', 0, 'credit', v_gain_loss,
                         'description', 'Gain on disposal: ' || v_asset.asset_name));
  ELSIF v_gain_loss < 0 THEN
    v_entries := v_entries || jsonb_build_array(
      jsonb_build_object('account_id', v_gain_loss_acct, 'debit', -v_gain_loss, 'credit', 0,
                         'description', 'Loss on disposal: ' || v_asset.asset_name));
  END IF;

  v_result := public.post_to_ledger(
    p_organization_id := v_asset.organization_id,
    p_client_id       := NULL,
    p_company_id      := v_asset.company_id,
    p_journal_date    := p_disposal_date,
    p_reference       := v_reference,
    p_description     := 'Disposal - ' || v_asset.asset_name,
    p_journal_type    := 'DISPOSAL',
    p_source_type     := 'ASSET_DISPOSAL',
    p_source_id       := p_asset_id,
    p_currency        := 'GBP',
    p_fx_rate         := 1.0,
    p_created_by      := v_user,
    p_entries         := v_entries,
    p_lock_override_reason := NULL,
    p_idempotency_key := v_reference
  );

  IF (v_result->>'success')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'post_to_ledger failed: %', v_result->>'error';
  END IF;

  UPDATE public.fixed_assets
     SET status='disposed', disposal_date=p_disposal_date, disposal_proceeds=p_proceeds, updated_at=now()
   WHERE id=p_asset_id;

  INSERT INTO public.fixed_asset_transactions(
    fixed_asset_id, organization_id, accounting_period_start, accounting_period_end,
    transaction_type, amount_net, disposal_proceeds, notes, created_by)
  VALUES (p_asset_id, v_asset.organization_id,
          date_trunc('year', p_disposal_date)::date,
          (date_trunc('year', p_disposal_date) + interval '1 year - 1 day')::date,
          'DISPOSAL', v_nbv, p_proceeds, p_reason, v_user);

  INSERT INTO public.bookkeeping_audit_log(organization_id, entity_type, entity_id, action, actor_id, after_state)
  VALUES (v_asset.organization_id, 'fixed_asset', p_asset_id, 'dispose_asset', v_user,
          jsonb_build_object('disposal_date', p_disposal_date, 'proceeds', p_proceeds, 'nbv', v_nbv,
                             'gain_loss', v_gain_loss, 'journal_id', v_result->>'journal_id', 'reason', p_reason));

  RETURN jsonb_build_object('success', true, 'journal_id', v_result->>'journal_id',
                            'nbv', v_nbv, 'gain_loss', v_gain_loss);
END; $$;

GRANT EXECUTE ON FUNCTION public.dispose_fixed_asset(uuid, date, numeric, uuid, text) TO authenticated;
