-- Pin invoice_settings.organization_id to the entity's real org
DROP POLICY IF EXISTS "Portal inserts invoice settings" ON public.invoice_settings;
CREATE POLICY "Portal inserts invoice settings" ON public.invoice_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.portal_can_access_bookkeeping(client_id, company_id)
    AND organization_id = COALESCE(
      (SELECT organization_id FROM public.clients   WHERE id = client_id),
      (SELECT organization_id FROM public.companies WHERE id = company_id)
    )
  );

DROP POLICY IF EXISTS "Portal updates invoice settings" ON public.invoice_settings;
CREATE POLICY "Portal updates invoice settings" ON public.invoice_settings
  FOR UPDATE TO authenticated
  USING (public.portal_can_access_bookkeeping(client_id, company_id))
  WITH CHECK (
    public.portal_can_access_bookkeeping(client_id, company_id)
    AND organization_id = COALESCE(
      (SELECT organization_id FROM public.clients   WHERE id = client_id),
      (SELECT organization_id FROM public.companies WHERE id = company_id)
    )
  );

-- void_invoice_safe reverses the ledger via void_invoice
CREATE OR REPLACE FUNCTION public.void_invoice_safe(p_invoice_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_invoice record;
  v_res jsonb;
BEGIN
  PERFORM set_config('app.rpc', '1', true);
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;
  IF NOT public.user_in_organization(v_user_id, v_invoice.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;
  IF NOT public.can_void_invoices(v_user_id, v_invoice.organization_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Permission denied: cannot void invoices');
  END IF;
  v_res := public.void_invoice(p_invoice_id, p_reason, v_user_id);
  IF NOT COALESCE((v_res->>'success')::boolean, false) THEN
    RETURN jsonb_build_object('success', false,
      'error', COALESCE(v_res->>'error_message', v_res->>'error', 'Could not void invoice'));
  END IF;
  RETURN jsonb_build_object('success', true, 'invoice_id', p_invoice_id);
END;
$$;

-- Missing email_queue.attachments column (blocks process-email-queue on ANY queued email
-- because send-invoice writes this field).
ALTER TABLE public.email_queue ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;