-- Phase 3: Invoices (Sales & Purchases)

-- invoices: Sales and purchase invoices
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Entity scoping
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Invoice type
  invoice_type TEXT NOT NULL, -- SALES, PURCHASE
  
  -- Contact details
  contact_name TEXT NOT NULL,
  contact_email TEXT,
  contact_address TEXT,
  
  -- Invoice details
  invoice_number TEXT,
  reference TEXT, -- PO number, supplier invoice number, etc.
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  
  -- Amounts (denormalized for quick display)
  total_net NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_vat NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_gross NUMERIC(15,2) NOT NULL DEFAULT 0,
  
  -- Payment tracking
  amount_paid NUMERIC(15,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT, SENT, AWAITING_PAYMENT, PART_PAID, PAID, OVERDUE, VOID
  
  -- Linked to ledger
  is_posted BOOLEAN DEFAULT false,
  posted_at TIMESTAMPTZ,
  posted_by UUID,
  
  -- Document storage
  document_id UUID REFERENCES job_documents(id),
  
  -- Notes
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT entity_check CHECK (
    (client_id IS NOT NULL AND company_id IS NULL) OR
    (client_id IS NULL AND company_id IS NOT NULL)
  )
);

-- invoice_lines: Line items for invoices
CREATE TABLE invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  
  -- Line details
  line_number INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(15,2) NOT NULL,
  
  -- Calculated amounts
  net_amount NUMERIC(15,2) NOT NULL,
  vat_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  gross_amount NUMERIC(15,2) NOT NULL,
  
  -- VAT
  vat_code_id UUID REFERENCES vat_codes(id),
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  
  -- Account
  account_id UUID NOT NULL REFERENCES bookkeeping_accounts(id),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT line_order UNIQUE (invoice_id, line_number)
);

-- invoice_payments: Track payments against invoices
CREATE TABLE invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  
  -- Payment details
  payment_date DATE NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  payment_method TEXT, -- BANK_TRANSFER, CASH, CARD, CHEQUE, etc.
  reference TEXT,
  
  -- Link to bank transaction if applicable
  bank_transaction_id UUID REFERENCES bank_transactions(id),
  
  -- Link to ledger entry
  ledger_entry_id UUID REFERENCES ledger_entries(id),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID
);

-- RLS Policies

-- invoices
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view invoices in their organization"
ON invoices FOR SELECT
USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can manage invoices in their organization"
ON invoices FOR ALL
USING (user_has_organization_access(organization_id))
WITH CHECK (user_has_organization_access(organization_id));

-- invoice_lines
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view invoice lines in their organization"
ON invoice_lines FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = invoice_lines.invoice_id
    AND user_has_organization_access(i.organization_id)
  )
);

CREATE POLICY "Users can manage invoice lines in their organization"
ON invoice_lines FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = invoice_lines.invoice_id
    AND user_has_organization_access(i.organization_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = invoice_lines.invoice_id
    AND user_has_organization_access(i.organization_id)
  )
);

-- invoice_payments
ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view invoice payments in their organization"
ON invoice_payments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = invoice_payments.invoice_id
    AND user_has_organization_access(i.organization_id)
  )
);

CREATE POLICY "Users can manage invoice payments in their organization"
ON invoice_payments FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = invoice_payments.invoice_id
    AND user_has_organization_access(i.organization_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM invoices i
    WHERE i.id = invoice_payments.invoice_id
    AND user_has_organization_access(i.organization_id)
  )
);

-- Indexes for performance
CREATE INDEX idx_invoices_entity ON invoices(organization_id, client_id, company_id);
CREATE INDEX idx_invoices_type ON invoices(invoice_type);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_dates ON invoices(issue_date, due_date);
CREATE INDEX idx_invoices_number ON invoices(invoice_number) WHERE invoice_number IS NOT NULL;

CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(invoice_id);
CREATE INDEX idx_invoice_lines_account ON invoice_lines(account_id);

CREATE INDEX idx_invoice_payments_invoice ON invoice_payments(invoice_id);
CREATE INDEX idx_invoice_payments_bank_transaction ON invoice_payments(bank_transaction_id);
CREATE INDEX idx_invoice_payments_ledger_entry ON invoice_payments(ledger_entry_id);

-- Function to update invoice totals when lines change
CREATE OR REPLACE FUNCTION update_invoice_totals()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE invoices
  SET 
    total_net = COALESCE((
      SELECT SUM(net_amount)
      FROM invoice_lines
      WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id)
    ), 0),
    total_vat = COALESCE((
      SELECT SUM(vat_amount)
      FROM invoice_lines
      WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id)
    ), 0),
    total_gross = COALESCE((
      SELECT SUM(gross_amount)
      FROM invoice_lines
      WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id)
    ), 0),
    updated_at = now()
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_invoice_totals_on_line_change
AFTER INSERT OR UPDATE OR DELETE ON invoice_lines
FOR EACH ROW
EXECUTE FUNCTION update_invoice_totals();

-- Function to update invoice payment status
CREATE OR REPLACE FUNCTION update_invoice_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  v_total_paid NUMERIC;
  v_invoice_total NUMERIC;
  v_invoice_id UUID;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  
  -- Calculate total paid
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM invoice_payments
  WHERE invoice_id = v_invoice_id;
  
  -- Get invoice total
  SELECT total_gross INTO v_invoice_total
  FROM invoices
  WHERE id = v_invoice_id;
  
  -- Update invoice status
  UPDATE invoices
  SET 
    amount_paid = v_total_paid,
    status = CASE
      WHEN v_total_paid = 0 THEN 'AWAITING_PAYMENT'
      WHEN v_total_paid >= v_invoice_total THEN 'PAID'
      ELSE 'PART_PAID'
    END,
    updated_at = now()
  WHERE id = v_invoice_id
    AND status NOT IN ('DRAFT', 'VOID');
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_invoice_payment_status_on_payment
AFTER INSERT OR UPDATE OR DELETE ON invoice_payments
FOR EACH ROW
EXECUTE FUNCTION update_invoice_payment_status();