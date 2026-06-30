-- ============================================================
-- Bookkeeping — let the client CATEGORISE (post to the ledger), not just "explain"
-- ============================================================
-- Previously the portal could only "explain" a transaction (a suggestion the accountant
-- had to action). The practice can grant 'allow_client_post_to_ledger'; this RPC wires
-- that permission to the SAME posting engine the accountant uses (post_bank_transaction),
-- so a client categorisation creates the real double-entry and marks the txn MATCHED.
-- The client post is tagged (client_explained_by / 'client_posted') so the accountant can
-- spot and re-categorise it (unmatch_bank_transaction → re-post) if it's wrong.
-- ============================================================

CREATE OR REPLACE FUNCTION public.portal_categorise_transaction(
  p_bank_transaction_id uuid,
  p_contra_account_id uuid,
  p_vat_code_id uuid DEFAULT NULL,
  p_vat_amount numeric DEFAULT 0,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client  uuid;
  v_company uuid;
  v_result  jsonb;
BEGIN
  SELECT client_id, company_id INTO v_client, v_company
  FROM public.bank_transactions WHERE id = p_bank_transaction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  -- Only when the practice has granted ledger-posting to this client.
  IF NOT public.portal_has_perm(v_client, v_company, 'allow_client_post_to_ledger') THEN
    RAISE EXCEPTION 'Not permitted to categorise transactions' USING ERRCODE = '42501';
  END IF;

  -- Reuse the single posting engine: double-entry to the ledger + marks MATCHED.
  -- (It validates already-matched / unmapped account / VAT control itself.)
  v_result := public.post_bank_transaction(
    p_bank_transaction_id, p_contra_account_id, p_vat_code_id, p_vat_amount, p_description);

  -- Tag the client post so the accountant can review / re-categorise.
  IF COALESCE((v_result->>'success')::boolean, false) THEN
    UPDATE public.bank_transactions
       SET client_explained_by     = auth.uid(),
           client_explained_status = 'client_posted'
     WHERE id = p_bank_transaction_id;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_categorise_transaction(uuid, uuid, uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_categorise_transaction(uuid, uuid, uuid, numeric, text) TO authenticated;

-- Categorisable GL accounts for the client's category picker. The chart of accounts is
-- org-level (null entity), so the entity-scoped RLS on bookkeeping_accounts won't surface
-- it to portal users — this SECURITY DEFINER reader returns the org's non-bank accounts,
-- gated by portal bookkeeping access.
CREATE OR REPLACE FUNCTION public.portal_list_ledger_accounts(
  p_client_id uuid,
  p_company_id uuid
)
RETURNS TABLE (id uuid, code text, name text, account_type text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  IF NOT public.portal_can_access_bookkeeping(p_client_id, p_company_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_client_id IS NOT NULL THEN
    SELECT organization_id INTO v_org FROM public.clients WHERE id = p_client_id;
  ELSE
    SELECT organization_id INTO v_org FROM public.companies WHERE id = p_company_id;
  END IF;

  RETURN QUERY
    SELECT a.id, a.code, a.name, a.account_type
    FROM public.bookkeeping_accounts a
    WHERE a.organization_id = v_org
      AND COALESCE(a.is_active, true) = true
      AND COALESCE(a.is_bank_account, false) = false
    ORDER BY a.account_type, a.code;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_list_ledger_accounts(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_list_ledger_accounts(uuid, uuid) TO authenticated;
