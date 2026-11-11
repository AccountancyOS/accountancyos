
CREATE OR REPLACE FUNCTION public.portal_user_has_entity_access(
  _user_id uuid, _client_id uuid, _company_id uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.portal_access pa
    WHERE pa.user_id = _user_id AND pa.is_active = true
      AND ((_client_id IS NOT NULL AND pa.client_id = _client_id)
        OR (_company_id IS NOT NULL AND pa.company_id = _company_id))
  );
$$;

CREATE OR REPLACE FUNCTION public.entity_has_active_bookkeeping(
  _client_id uuid, _company_id uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.engagements e
    JOIN public.services_catalog s ON s.id = e.service_id
    WHERE e.status = 'active'
      AND s.code IN ('BOOKKEEPING','BK-MONTHLY','BK-QUARTERLY')
      AND ((_client_id IS NOT NULL AND e.client_id = _client_id)
        OR (_company_id IS NOT NULL AND e.company_id = _company_id))
  );
$$;

CREATE OR REPLACE FUNCTION public.portal_can_access_bookkeeping(
  _client_id uuid, _company_id uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.portal_user_has_entity_access(auth.uid(), _client_id, _company_id)
    AND public.entity_has_active_bookkeeping(_client_id, _company_id);
$$;

CREATE OR REPLACE FUNCTION public.portal_has_bookkeeping(
  _entity_type text, _entity_id uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.portal_user_has_entity_access(auth.uid(),
      CASE WHEN _entity_type = 'client' THEN _entity_id END,
      CASE WHEN _entity_type = 'company' THEN _entity_id END)
    AND public.entity_has_active_bookkeeping(
      CASE WHEN _entity_type = 'client' THEN _entity_id END,
      CASE WHEN _entity_type = 'company' THEN _entity_id END);
$$;

GRANT EXECUTE ON FUNCTION public.portal_has_bookkeeping(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_can_access_bookkeeping(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_user_has_entity_access(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.entity_has_active_bookkeeping(uuid, uuid) TO authenticated;

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bank_connections','bank_accounts','bank_transactions',
    'bank_rules','categorization_rules','invoices','bills','credit_notes',
    'customers','suppliers','receipts']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Portal bookkeeping full access" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Portal bookkeeping full access" ON public.%I '
      || 'FOR ALL TO authenticated '
      || 'USING (public.portal_can_access_bookkeeping(client_id, company_id)) '
      || 'WITH CHECK (public.portal_can_access_bookkeeping(client_id, company_id))', t);
  END LOOP;
END $$;

DO $$ DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bookkeeping_accounts','journals','ledger_entries']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Portal bookkeeping read access" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Portal bookkeeping read access" ON public.%I '
      || 'FOR SELECT TO authenticated '
      || 'USING (public.portal_can_access_bookkeeping(client_id, company_id))', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Portal bookkeeping read journal lines" ON public.journal_lines;
CREATE POLICY "Portal bookkeeping read journal lines" ON public.journal_lines
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.journals j WHERE j.id = journal_lines.journal_id
    AND public.portal_can_access_bookkeeping(j.client_id, j.company_id)));

DROP POLICY IF EXISTS "Portal bookkeeping full access lines" ON public.invoice_lines;
CREATE POLICY "Portal bookkeeping full access lines" ON public.invoice_lines
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_lines.invoice_id AND public.portal_can_access_bookkeeping(i.client_id, i.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_lines.invoice_id AND public.portal_can_access_bookkeeping(i.client_id, i.company_id)));

DROP POLICY IF EXISTS "Portal bookkeeping full access payments" ON public.invoice_payments;
CREATE POLICY "Portal bookkeeping full access payments" ON public.invoice_payments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_payments.invoice_id AND public.portal_can_access_bookkeeping(i.client_id, i.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_payments.invoice_id AND public.portal_can_access_bookkeeping(i.client_id, i.company_id)));

DROP POLICY IF EXISTS "Portal bookkeeping full access bill lines" ON public.bill_lines;
CREATE POLICY "Portal bookkeeping full access bill lines" ON public.bill_lines
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_lines.bill_id AND public.portal_can_access_bookkeeping(b.client_id, b.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_lines.bill_id AND public.portal_can_access_bookkeeping(b.client_id, b.company_id)));

DROP POLICY IF EXISTS "Portal bookkeeping full access bill payments" ON public.bill_payments;
CREATE POLICY "Portal bookkeeping full access bill payments" ON public.bill_payments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_payments.bill_id AND public.portal_can_access_bookkeeping(b.client_id, b.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_payments.bill_id AND public.portal_can_access_bookkeeping(b.client_id, b.company_id)));

DROP POLICY IF EXISTS "Portal bookkeeping full access cn lines" ON public.credit_note_lines;
CREATE POLICY "Portal bookkeeping full access cn lines" ON public.credit_note_lines
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.credit_notes c WHERE c.id = credit_note_lines.credit_note_id AND public.portal_can_access_bookkeeping(c.client_id, c.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.credit_notes c WHERE c.id = credit_note_lines.credit_note_id AND public.portal_can_access_bookkeeping(c.client_id, c.company_id)));

CREATE OR REPLACE FUNCTION public.log_portal_bookkeeping_revocation(
  _organization_id uuid, _client_id uuid, _company_id uuid, _reason text
) RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.bookkeeping_audit_log
    (organization_id, entity_type, entity_id, action, reason, actor_id)
  VALUES (
    _organization_id,
    CASE WHEN _client_id IS NOT NULL THEN 'client' ELSE 'company' END,
    COALESCE(_client_id, _company_id),
    'portal_access_revoked',
    COALESCE(_reason, 'Bookkeeping service deactivated'),
    auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.log_portal_bookkeeping_revocation(uuid, uuid, uuid, text) TO authenticated;
