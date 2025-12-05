
-- =============================================
-- PHASE 9: Sales Invoicing, Bills, Bank Rules
-- =============================================

-- Helper function for timestamp updates (if not exists)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 1. CUSTOMERS TABLE (entity-scoped to client/company)
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  client_id UUID REFERENCES clients(id),
  company_id UUID REFERENCES companies(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address_line_1 TEXT,
  address_line_2 TEXT,
  city TEXT,
  postcode TEXT,
  country TEXT DEFAULT 'United Kingdom',
  vat_number TEXT,
  default_account_id UUID REFERENCES bookkeeping_accounts(id),
  default_vat_code_id UUID REFERENCES vat_codes(id),
  payment_terms_days INTEGER DEFAULT 30,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT customers_entity_check CHECK (
    (client_id IS NOT NULL AND company_id IS NULL) OR
    (client_id IS NULL AND company_id IS NOT NULL)
  )
);

-- 2. SUPPLIERS TABLE (entity-scoped to client/company)
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  client_id UUID REFERENCES clients(id),
  company_id UUID REFERENCES companies(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address_line_1 TEXT,
  address_line_2 TEXT,
  city TEXT,
  postcode TEXT,
  country TEXT DEFAULT 'United Kingdom',
  vat_number TEXT,
  default_account_id UUID REFERENCES bookkeeping_accounts(id),
  default_vat_code_id UUID REFERENCES vat_codes(id),
  payment_terms_days INTEGER DEFAULT 30,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT suppliers_entity_check CHECK (
    (client_id IS NOT NULL AND company_id IS NULL) OR
    (client_id IS NULL AND company_id IS NOT NULL)
  )
);

-- 3. BILLS TABLE (Accounts Payable - separate from invoices)
CREATE TABLE public.bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  client_id UUID REFERENCES clients(id),
  company_id UUID REFERENCES companies(id),
  supplier_id UUID REFERENCES suppliers(id),
  bill_number TEXT,
  reference TEXT,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  currency TEXT DEFAULT 'GBP',
  exchange_rate NUMERIC DEFAULT 1,
  total_net NUMERIC DEFAULT 0,
  total_vat NUMERIC DEFAULT 0,
  total_gross NUMERIC DEFAULT 0,
  amount_paid NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'DRAFT',
  notes TEXT,
  is_posted BOOLEAN DEFAULT false,
  posted_at TIMESTAMPTZ,
  posted_by UUID REFERENCES auth.users(id),
  receipt_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT bills_entity_check CHECK (
    (client_id IS NOT NULL AND company_id IS NULL) OR
    (client_id IS NULL AND company_id IS NOT NULL)
  ),
  CONSTRAINT bills_status_check CHECK (status IN ('DRAFT', 'AWAITING_PAYMENT', 'PART_PAID', 'PAID', 'OVERDUE', 'VOID'))
);

-- 4. BILL_LINES TABLE
CREATE TABLE public.bill_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  quantity NUMERIC DEFAULT 1,
  unit_price NUMERIC DEFAULT 0,
  account_id UUID REFERENCES bookkeeping_accounts(id),
  vat_code_id UUID REFERENCES vat_codes(id),
  vat_rate NUMERIC DEFAULT 0,
  net_amount NUMERIC DEFAULT 0,
  vat_amount NUMERIC DEFAULT 0,
  gross_amount NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. BILL_PAYMENTS TABLE
CREATE TABLE public.bill_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL,
  amount NUMERIC NOT NULL,
  payment_method TEXT,
  reference TEXT,
  bank_account_id UUID REFERENCES bank_accounts(id),
  bank_transaction_id UUID REFERENCES bank_transactions(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- 6. BANK_RULES TABLE
CREATE TABLE public.bank_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  client_id UUID REFERENCES clients(id),
  company_id UUID REFERENCES companies(id),
  rule_name TEXT NOT NULL,
  description TEXT,
  conditions JSONB NOT NULL DEFAULT '{}',
  actions JSONB NOT NULL DEFAULT '{}',
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  times_applied INTEGER DEFAULT 0,
  last_applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- 7. BANK_RULE_EXECUTIONS TABLE
CREATE TABLE public.bank_rule_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  bank_rule_id UUID NOT NULL REFERENCES bank_rules(id),
  bank_transaction_id UUID NOT NULL REFERENCES bank_transactions(id),
  matched_conditions JSONB,
  applied_actions JSONB,
  result TEXT DEFAULT 'success',
  error_message TEXT,
  executed_at TIMESTAMPTZ DEFAULT now(),
  executed_by UUID REFERENCES auth.users(id)
);

-- 8. MATCHING_CANDIDATES TABLE
CREATE TABLE public.matching_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  bank_transaction_id UUID NOT NULL REFERENCES bank_transactions(id),
  candidate_type TEXT NOT NULL,
  candidate_id UUID NOT NULL,
  confidence_score INTEGER DEFAULT 0,
  match_reasons JSONB,
  is_accepted BOOLEAN DEFAULT false,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. EXTEND INVOICES TABLE
ALTER TABLE public.invoices 
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id),
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'GBP',
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC DEFAULT 1,
  ADD COLUMN IF NOT EXISTS pdf_path TEXT,
  ADD COLUMN IF NOT EXISTS send_status TEXT DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX idx_customers_organization ON customers(organization_id);
CREATE INDEX idx_customers_client ON customers(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_customers_company ON customers(company_id) WHERE company_id IS NOT NULL;

CREATE INDEX idx_suppliers_organization ON suppliers(organization_id);
CREATE INDEX idx_suppliers_client ON suppliers(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_suppliers_company ON suppliers(company_id) WHERE company_id IS NOT NULL;

CREATE INDEX idx_bills_organization ON bills(organization_id);
CREATE INDEX idx_bills_client ON bills(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_bills_company ON bills(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX idx_bills_supplier ON bills(supplier_id);
CREATE INDEX idx_bills_status ON bills(status);
CREATE INDEX idx_bills_due_date ON bills(due_date);

CREATE INDEX idx_bill_lines_bill ON bill_lines(bill_id);
CREATE INDEX idx_bill_payments_bill ON bill_payments(bill_id);

CREATE INDEX idx_bank_rules_organization ON bank_rules(organization_id);
CREATE INDEX idx_bank_rules_priority ON bank_rules(priority DESC);

CREATE INDEX idx_bank_rule_executions_rule ON bank_rule_executions(bank_rule_id);
CREATE INDEX idx_bank_rule_executions_transaction ON bank_rule_executions(bank_transaction_id);

CREATE INDEX idx_matching_candidates_transaction ON matching_candidates(bank_transaction_id);

CREATE INDEX idx_invoices_customer ON invoices(customer_id) WHERE customer_id IS NOT NULL;

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

-- CUSTOMERS RLS
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view customers in their organization"
  ON customers FOR SELECT USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert customers in their organization"
  ON customers FOR INSERT WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update customers in their organization"
  ON customers FOR UPDATE USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete customers in their organization"
  ON customers FOR DELETE USING (user_has_organization_access(organization_id));

-- SUPPLIERS RLS
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view suppliers in their organization"
  ON suppliers FOR SELECT USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert suppliers in their organization"
  ON suppliers FOR INSERT WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update suppliers in their organization"
  ON suppliers FOR UPDATE USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete suppliers in their organization"
  ON suppliers FOR DELETE USING (user_has_organization_access(organization_id));

-- BILLS RLS
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view bills in their organization"
  ON bills FOR SELECT USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert bills in their organization"
  ON bills FOR INSERT WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update bills in their organization"
  ON bills FOR UPDATE USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete bills in their organization"
  ON bills FOR DELETE USING (user_has_organization_access(organization_id));

-- BILL_LINES RLS
ALTER TABLE bill_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view bill lines via bills"
  ON bill_lines FOR SELECT
  USING (EXISTS (SELECT 1 FROM bills b WHERE b.id = bill_lines.bill_id AND user_has_organization_access(b.organization_id)));

CREATE POLICY "Users can insert bill lines via bills"
  ON bill_lines FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM bills b WHERE b.id = bill_lines.bill_id AND user_has_organization_access(b.organization_id)));

CREATE POLICY "Users can update bill lines via bills"
  ON bill_lines FOR UPDATE
  USING (EXISTS (SELECT 1 FROM bills b WHERE b.id = bill_lines.bill_id AND user_has_organization_access(b.organization_id)));

CREATE POLICY "Users can delete bill lines via bills"
  ON bill_lines FOR DELETE
  USING (EXISTS (SELECT 1 FROM bills b WHERE b.id = bill_lines.bill_id AND user_has_organization_access(b.organization_id)));

-- BILL_PAYMENTS RLS
ALTER TABLE bill_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view bill payments via bills"
  ON bill_payments FOR SELECT
  USING (EXISTS (SELECT 1 FROM bills b WHERE b.id = bill_payments.bill_id AND user_has_organization_access(b.organization_id)));

CREATE POLICY "Users can insert bill payments via bills"
  ON bill_payments FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM bills b WHERE b.id = bill_payments.bill_id AND user_has_organization_access(b.organization_id)));

CREATE POLICY "Users can update bill payments via bills"
  ON bill_payments FOR UPDATE
  USING (EXISTS (SELECT 1 FROM bills b WHERE b.id = bill_payments.bill_id AND user_has_organization_access(b.organization_id)));

CREATE POLICY "Users can delete bill payments via bills"
  ON bill_payments FOR DELETE
  USING (EXISTS (SELECT 1 FROM bills b WHERE b.id = bill_payments.bill_id AND user_has_organization_access(b.organization_id)));

-- BANK_RULES RLS
ALTER TABLE bank_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view bank rules in their organization"
  ON bank_rules FOR SELECT USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert bank rules in their organization"
  ON bank_rules FOR INSERT WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update bank rules in their organization"
  ON bank_rules FOR UPDATE USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete bank rules in their organization"
  ON bank_rules FOR DELETE USING (user_has_organization_access(organization_id));

-- BANK_RULE_EXECUTIONS RLS
ALTER TABLE bank_rule_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view rule executions in their organization"
  ON bank_rule_executions FOR SELECT USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert rule executions in their organization"
  ON bank_rule_executions FOR INSERT WITH CHECK (user_has_organization_access(organization_id));

-- MATCHING_CANDIDATES RLS
ALTER TABLE matching_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view matching candidates in their organization"
  ON matching_candidates FOR SELECT USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can insert matching candidates in their organization"
  ON matching_candidates FOR INSERT WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can update matching candidates in their organization"
  ON matching_candidates FOR UPDATE USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can delete matching candidates in their organization"
  ON matching_candidates FOR DELETE USING (user_has_organization_access(organization_id));

-- =============================================
-- TRIGGERS
-- =============================================

-- Auto-update bill totals when lines change
CREATE OR REPLACE FUNCTION update_bill_totals()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE bills
  SET 
    total_net = COALESCE((SELECT SUM(net_amount) FROM bill_lines WHERE bill_id = COALESCE(NEW.bill_id, OLD.bill_id)), 0),
    total_vat = COALESCE((SELECT SUM(vat_amount) FROM bill_lines WHERE bill_id = COALESCE(NEW.bill_id, OLD.bill_id)), 0),
    total_gross = COALESCE((SELECT SUM(gross_amount) FROM bill_lines WHERE bill_id = COALESCE(NEW.bill_id, OLD.bill_id)), 0),
    updated_at = now()
  WHERE id = COALESCE(NEW.bill_id, OLD.bill_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_bill_totals_trigger
  AFTER INSERT OR UPDATE OR DELETE ON bill_lines
  FOR EACH ROW EXECUTE FUNCTION update_bill_totals();

-- Auto-update bill payment status
CREATE OR REPLACE FUNCTION update_bill_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  v_total_paid NUMERIC;
  v_bill_total NUMERIC;
  v_bill_id UUID;
BEGIN
  v_bill_id := COALESCE(NEW.bill_id, OLD.bill_id);
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid FROM bill_payments WHERE bill_id = v_bill_id;
  SELECT total_gross INTO v_bill_total FROM bills WHERE id = v_bill_id;
  UPDATE bills
  SET 
    amount_paid = v_total_paid,
    status = CASE
      WHEN v_total_paid = 0 THEN 'AWAITING_PAYMENT'
      WHEN v_total_paid >= v_bill_total THEN 'PAID'
      ELSE 'PART_PAID'
    END,
    updated_at = now()
  WHERE id = v_bill_id AND status NOT IN ('DRAFT', 'VOID');
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_bill_payment_status_trigger
  AFTER INSERT OR UPDATE OR DELETE ON bill_payments
  FOR EACH ROW EXECUTE FUNCTION update_bill_payment_status();

-- Auto-update timestamps
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bills_updated_at BEFORE UPDATE ON bills FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bank_rules_updated_at BEFORE UPDATE ON bank_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
