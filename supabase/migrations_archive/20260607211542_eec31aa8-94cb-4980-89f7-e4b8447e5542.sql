
CREATE POLICY "Portal clients can delete draft invoices"
ON public.invoices
FOR DELETE
TO authenticated
USING (
  portal_has_perm(client_id, company_id, 'allow_invoice_create')
  AND status = 'draft'
);

CREATE POLICY "Portal clients can delete draft bills"
ON public.bills
FOR DELETE
TO authenticated
USING (
  portal_has_perm(client_id, company_id, 'allow_bill_create')
  AND status = 'draft'
);
