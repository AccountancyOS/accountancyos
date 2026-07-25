-- ============================================================
-- Accounts-prep Increment 2, Task 1 — draft TB-snapshot lifecycle
-- ------------------------------------------------------------
-- Additive + idempotent. Owner applies via Lovable (release-receipt gated).
--
-- Adds two SECURITY DEFINER lifecycle RPCs plus the supporting integrity
-- objects so a job can produce a *draft*, ledger-backed trial-balance snapshot
-- without a Bookkeeping detour:
--   * public.create_tb_snapshot     — build/refresh a draft snapshot; native
--                                      source is aggregated from the single
--                                      source of truth get_trial_balance_from_ledger.
--   * public.regenerate_tb_snapshot — rebuild a *draft* snapshot from the ledger,
--                                      superseding the old draft.
--   * status CHECK  status IN ('draft','finalised','superseded','used_in_workpaper')
--   * partial unique index — at most one *live draft* per (org, entity, period).
--
-- Preview NEVER locks: every row written here is status='draft', locked=false.
-- Finalise/lock is Increment 3.
-- ============================================================

-- 1. Status CHECK constraint (guarded add-if-absent) --------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'trial_balance_snapshots_status_check'
       AND conrelid = 'public.trial_balance_snapshots'::regclass
  ) THEN
    ALTER TABLE public.trial_balance_snapshots
      ADD CONSTRAINT trial_balance_snapshots_status_check
      CHECK (status IN ('draft','finalised','superseded','used_in_workpaper'));
  END IF;
END $$;

-- 2. Partial unique index: one live draft per (org, entity, period) -----------
CREATE UNIQUE INDEX IF NOT EXISTS uq_tb_snapshot_live_draft
  ON public.trial_balance_snapshots (
    organization_id,
    COALESCE(client_id,  '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    period_start,
    period_end
  )
  WHERE status = 'draft';

-- 3. create_tb_snapshot -------------------------------------------------------
-- Native path (p_source_type='native' AND p_balances IS NULL) aggregates the
-- single-source get_trial_balance_from_ledger into the SAME jsonb shape the app
-- stores (TBSnapshotBalance: camelCase accountId/accountCode/accountName/
-- accountType/openingBalance/debit/credit/closingBalance). Otherwise the caller's
-- p_balances is stored verbatim. Supersedes any existing live draft for the same
-- (org, entity, period) before inserting the new draft. Role-gated + audited.
CREATE OR REPLACE FUNCTION public.create_tb_snapshot(
  p_org uuid,
  p_client_id uuid,
  p_company_id uuid,
  p_job_id uuid,
  p_period_start date,
  p_period_end date,
  p_source_type text,
  p_balances jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_balances jsonb;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_is_balanced boolean;
  v_new_id uuid;
BEGIN
  -- Role gate: caller must belong to the org.
  IF NOT public.user_has_organization_access(p_org) THEN
    RAISE EXCEPTION 'Access denied to organization' USING ERRCODE = '42501';
  END IF;

  IF p_client_id IS NULL AND p_company_id IS NULL THEN
    RAISE EXCEPTION 'A client_id or company_id is required for a TB snapshot';
  END IF;

  -- Build balances.
  IF p_source_type = 'native' AND p_balances IS NULL THEN
    -- Aggregate the single source of truth into the stored jsonb shape.
    -- get_trial_balance_from_ledger returns opening/closing as debit-normal
    -- (debit - credit) for ALL account types. App-stored snapshots use NATURAL
    -- signs, so we normalise the presentation sign here to mirror naturalBalance
    -- exactly (see src/lib/trial-balance-service.ts:18): credit-normal types
    -- (LIABILITY, EQUITY, INCOME, case-insensitive) are negated to credit-debit;
    -- everything else stays debit-credit. The per-account debit/credit movement
    -- fields keep the raw period figures (never flipped). This is a sign
    -- normalisation only — the ledger remains the source of the underlying math.
    SELECT
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'accountId',      tb.account_id,
            'accountCode',    tb.account_code,
            'accountName',    tb.account_name,
            'accountType',    tb.account_type,
            'openingBalance',
              CASE WHEN upper(tb.account_type) IN ('LIABILITY','EQUITY','INCOME')
                   THEN -tb.opening_balance ELSE tb.opening_balance END,
            'debit',          tb.period_debit,
            'credit',         tb.period_credit,
            'closingBalance',
              CASE WHEN upper(tb.account_type) IN ('LIABILITY','EQUITY','INCOME')
                   THEN -tb.closing_balance ELSE tb.closing_balance END
          )
          ORDER BY tb.account_code
        ),
        '[]'::jsonb
      ),
      COALESCE(SUM(tb.period_debit), 0),
      COALESCE(SUM(tb.period_credit), 0)
    INTO v_balances, v_total_debit, v_total_credit
    FROM public.get_trial_balance_from_ledger(
      p_org, p_client_id, p_company_id, p_period_start, p_period_end
    ) tb;
  ELSE
    v_balances := COALESCE(p_balances, '[]'::jsonb);
    SELECT
      COALESCE(SUM((e->>'debit')::numeric), 0),
      COALESCE(SUM((e->>'credit')::numeric), 0)
    INTO v_total_debit, v_total_credit
    FROM jsonb_array_elements(v_balances) e;
  END IF;

  v_is_balanced := abs(v_total_debit - v_total_credit) < 0.01;

  -- Supersede any existing live draft for the same (org, entity, period).
  UPDATE public.trial_balance_snapshots
     SET status = 'superseded',
         updated_at = now()
   WHERE organization_id = p_org
     AND status = 'draft'
     AND COALESCE(client_id,  '00000000-0000-0000-0000-000000000000'::uuid)
         = COALESCE(p_client_id,  '00000000-0000-0000-0000-000000000000'::uuid)
     AND COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = COALESCE(p_company_id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND period_start = p_period_start
     AND period_end   = p_period_end;

  -- Insert the fresh draft. Preview never locks.
  INSERT INTO public.trial_balance_snapshots (
    organization_id, client_id, company_id, job_id,
    period_start, period_end, source_type,
    status, locked, balances,
    total_debit, total_credit, is_balanced,
    created_by, metadata
  ) VALUES (
    p_org, p_client_id, p_company_id, p_job_id,
    p_period_start, p_period_end, COALESCE(p_source_type, 'native'),
    'draft', false, v_balances,
    v_total_debit, v_total_credit, v_is_balanced,
    auth.uid(),
    jsonb_build_object('createdFrom', 'create_tb_snapshot', 'source_type', COALESCE(p_source_type, 'native'))
  )
  RETURNING id INTO v_new_id;

  -- Audit.
  INSERT INTO public.audit_log (
    organization_id, entity_type, entity_id, action, user_id, metadata
  ) VALUES (
    p_org, 'trial_balance_snapshot', v_new_id, 'created', auth.uid(),
    jsonb_build_object(
      'source_type',  COALESCE(p_source_type, 'native'),
      'job_id',       p_job_id,
      'period_start', p_period_start,
      'period_end',   p_period_end,
      'is_balanced',  v_is_balanced
    )
  );

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tb_snapshot(uuid, uuid, uuid, uuid, date, date, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_tb_snapshot(uuid, uuid, uuid, uuid, date, date, text, jsonb)
  TO authenticated, service_role;

-- 4. regenerate_tb_snapshot ---------------------------------------------------
-- Draft-only. Rebuilds balances from the ledger for the snapshot's own period,
-- supersedes the old draft (via create_tb_snapshot), and returns the new id.
-- Rejects a finalised/locked snapshot.
CREATE OR REPLACE FUNCTION public.regenerate_tb_snapshot(
  p_snapshot_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_snap public.trial_balance_snapshots%ROWTYPE;
  v_new_id uuid;
BEGIN
  SELECT * INTO v_snap
    FROM public.trial_balance_snapshots
   WHERE id = p_snapshot_id;

  IF v_snap.id IS NULL THEN
    RAISE EXCEPTION 'Trial balance snapshot % not found', p_snapshot_id;
  END IF;

  IF NOT public.user_has_organization_access(v_snap.organization_id) THEN
    RAISE EXCEPTION 'Access denied to organization' USING ERRCODE = '42501';
  END IF;

  IF v_snap.status <> 'draft' OR v_snap.locked THEN
    RAISE EXCEPTION 'Only a draft (unlocked) snapshot can be regenerated (snapshot % is status=%, locked=%)',
      p_snapshot_id, v_snap.status, v_snap.locked;
  END IF;

  -- Rebuild from the ledger SoT for the same entity/period; this supersedes the
  -- old draft (same org/entity/period) and inserts a fresh native draft.
  v_new_id := public.create_tb_snapshot(
    v_snap.organization_id,
    v_snap.client_id,
    v_snap.company_id,
    v_snap.job_id,
    v_snap.period_start,
    v_snap.period_end,
    'native',
    NULL
  );

  INSERT INTO public.audit_log (
    organization_id, entity_type, entity_id, action, user_id, metadata
  ) VALUES (
    v_snap.organization_id, 'trial_balance_snapshot', v_new_id, 'regenerated', auth.uid(),
    jsonb_build_object('regenerated_from', p_snapshot_id)
  );

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_tb_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regenerate_tb_snapshot(uuid)
  TO authenticated, service_role;
