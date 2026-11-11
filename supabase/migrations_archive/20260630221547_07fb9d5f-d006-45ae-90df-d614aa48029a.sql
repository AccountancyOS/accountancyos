DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key') THEN
    RAISE WARNING 'Vault secret "email_queue_service_role_key" is missing; TrueLayer sync cron is scheduled but will 401 until the secret is set.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Could not verify Vault secret email_queue_service_role_key (%); ensure it is configured.', SQLERRM;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('truelayer-sync-scheduled');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'truelayer-sync-scheduled',
  '*/30 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://moxpdejnucjjcplleefn.supabase.co/functions/v1/truelayer-sync-scheduled',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'email_queue_service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
  $cron$
);

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

  IF NOT public.portal_has_perm(v_client, v_company, 'allow_client_post_to_ledger') THEN
    RAISE EXCEPTION 'Not permitted to categorise transactions' USING ERRCODE = '42501';
  END IF;

  v_result := public.post_bank_transaction(
    p_bank_transaction_id, p_contra_account_id, p_vat_code_id, p_vat_amount, p_description);

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