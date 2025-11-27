-- Create receipts storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false);

-- Storage RLS policies for receipts bucket
CREATE POLICY "Users can upload receipts for their organization"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'receipts' AND
  EXISTS (
    SELECT 1 FROM organization_users
    WHERE user_id = auth.uid()
    AND organization_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "Users can view receipts in their organization"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'receipts' AND
  EXISTS (
    SELECT 1 FROM organization_users
    WHERE user_id = auth.uid()
    AND organization_id::text = (storage.foldername(name))[1]
  )
);

CREATE POLICY "Users can delete receipts in their organization"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'receipts' AND
  EXISTS (
    SELECT 1 FROM organization_users
    WHERE user_id = auth.uid()
    AND organization_id::text = (storage.foldername(name))[1]
  )
);

-- Receipts metadata table
CREATE TABLE public.receipts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  client_id UUID REFERENCES public.clients(id),
  company_id UUID REFERENCES public.companies(id),
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  receipt_date DATE,
  vendor_name TEXT,
  total_amount NUMERIC,
  currency TEXT DEFAULT 'GBP',
  vat_amount NUMERIC,
  category TEXT,
  notes TEXT,
  ocr_data JSONB,
  ocr_status TEXT DEFAULT 'pending',
  bank_transaction_id UUID REFERENCES public.bank_transactions(id),
  invoice_id UUID REFERENCES public.invoices(id),
  ledger_entry_id UUID REFERENCES public.ledger_entries(id),
  uploaded_by UUID,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  CONSTRAINT receipts_entity_check CHECK (
    (client_id IS NOT NULL AND company_id IS NULL) OR
    (client_id IS NULL AND company_id IS NOT NULL)
  )
);

-- RLS for receipts
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view receipts in their organization"
ON public.receipts FOR SELECT
USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can manage receipts in their organization"
ON public.receipts FOR ALL
USING (user_has_organization_access(organization_id))
WITH CHECK (user_has_organization_access(organization_id));

-- Indexes
CREATE INDEX idx_receipts_entity ON public.receipts(organization_id, client_id, company_id);
CREATE INDEX idx_receipts_date ON public.receipts(receipt_date);
CREATE INDEX idx_receipts_bank_transaction ON public.receipts(bank_transaction_id);
CREATE INDEX idx_receipts_invoice ON public.receipts(invoice_id);