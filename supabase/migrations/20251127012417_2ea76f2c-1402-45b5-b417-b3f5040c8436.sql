-- Bookkeeping Module Phase 1: Foundation Schema

-- 1. Chart of Accounts
CREATE TABLE bookkeeping_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Entity scoping (exactly one must be set)
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Account details
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL, -- ASSET, LIABILITY, EQUITY, INCOME, EXPENSE
  account_subtype TEXT,
  
  -- Flags
  is_bank_account BOOLEAN DEFAULT false,
  is_control_account BOOLEAN DEFAULT false,
  is_system_account BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  -- For future filing integration
  tax_mapping JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Constraint: exactly one of client_id or company_id must be set
  CONSTRAINT entity_check CHECK (
    (client_id IS NOT NULL AND company_id IS NULL) OR
    (client_id IS NULL AND company_id IS NOT NULL)
  )
);

-- 2. VAT Codes
CREATE TABLE vat_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Entity scoping (null = organization-wide default)
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  rate DECIMAL(5,2) NOT NULL,
  vat_type TEXT NOT NULL, -- OUTPUT, INPUT, EXEMPT, ZERO, RC_DOMESTIC, EC_GOODS, EC_SERVICES
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Journals (Header)
CREATE TABLE journals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Entity scoping
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Journal details
  journal_date DATE NOT NULL,
  reference TEXT,
  description TEXT NOT NULL,
  journal_type TEXT NOT NULL DEFAULT 'MANUAL', -- MANUAL, REVERSING, RECURRING, YEAR_END, OPENING
  
  -- For reversing journals
  reverses_journal_id UUID REFERENCES journals(id),
  reverse_date DATE,
  is_reversed BOOLEAN DEFAULT false,
  
  -- Totals (denormalized for quick display)
  total_debit DECIMAL(15,2) DEFAULT 0,
  total_credit DECIMAL(15,2) DEFAULT 0,
  
  -- Status
  is_posted BOOLEAN DEFAULT false,
  posted_at TIMESTAMPTZ,
  
  -- Audit
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT entity_check CHECK (
    (client_id IS NOT NULL AND company_id IS NULL) OR
    (client_id IS NULL AND company_id IS NOT NULL)
  )
);

-- 4. Journal Lines
CREATE TABLE journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id UUID NOT NULL REFERENCES journals(id) ON DELETE CASCADE,
  
  -- Line details
  line_number INTEGER NOT NULL,
  account_id UUID NOT NULL REFERENCES bookkeeping_accounts(id),
  debit DECIMAL(15,2),
  credit DECIMAL(15,2),
  vat_code_id UUID REFERENCES vat_codes(id),
  description TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT debit_credit_check CHECK (
    (debit IS NOT NULL AND credit IS NULL) OR
    (debit IS NULL AND credit IS NOT NULL)
  )
);

-- 5. Ledger Entries
CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Entity scoping
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Transaction details
  transaction_date DATE NOT NULL,
  account_id UUID NOT NULL REFERENCES bookkeeping_accounts(id),
  debit DECIMAL(15,2),
  credit DECIMAL(15,2),
  vat_code_id UUID REFERENCES vat_codes(id),
  description TEXT,
  
  -- Source tracking
  source_type TEXT NOT NULL, -- MANUAL, JOURNAL, BANK_FEED, INVOICE, RULE, IMPORT, ADJUSTMENT
  source_id UUID,
  
  -- Document attachment
  document_id UUID REFERENCES job_documents(id),
  
  -- Period locking
  is_locked BOOLEAN DEFAULT false,
  
  -- Audit trail
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT debit_credit_check CHECK (
    (debit IS NOT NULL AND credit IS NULL) OR
    (debit IS NULL AND credit IS NOT NULL)
  ),
  CONSTRAINT entity_check CHECK (
    (client_id IS NOT NULL AND company_id IS NULL) OR
    (client_id IS NULL AND company_id IS NOT NULL)
  )
);

-- Unique indexes to enforce code uniqueness per entity
CREATE UNIQUE INDEX idx_bookkeeping_accounts_client_code 
  ON bookkeeping_accounts(organization_id, client_id, code) 
  WHERE client_id IS NOT NULL;

CREATE UNIQUE INDEX idx_bookkeeping_accounts_company_code 
  ON bookkeeping_accounts(organization_id, company_id, code) 
  WHERE company_id IS NOT NULL;

-- Performance indexes
CREATE INDEX idx_bookkeeping_accounts_entity ON bookkeeping_accounts(organization_id, client_id, company_id);
CREATE INDEX idx_bookkeeping_accounts_type ON bookkeeping_accounts(account_type) WHERE is_active = true;
CREATE INDEX idx_vat_codes_entity ON vat_codes(organization_id, client_id, company_id);
CREATE INDEX idx_journals_entity ON journals(organization_id, client_id, company_id);
CREATE INDEX idx_journals_date ON journals(journal_date);
CREATE INDEX idx_journal_lines_journal ON journal_lines(journal_id);
CREATE INDEX idx_ledger_entries_entity ON ledger_entries(organization_id, client_id, company_id);
CREATE INDEX idx_ledger_entries_date ON ledger_entries(transaction_date);
CREATE INDEX idx_ledger_entries_account ON ledger_entries(account_id);
CREATE INDEX idx_ledger_entries_source ON ledger_entries(source_type, source_id);

-- Enable RLS
ALTER TABLE bookkeeping_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view accounts in their organization"
  ON bookkeeping_accounts FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can manage accounts in their organization"
  ON bookkeeping_accounts FOR ALL
  USING (user_has_organization_access(organization_id))
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can view VAT codes in their organization"
  ON vat_codes FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can manage VAT codes in their organization"
  ON vat_codes FOR ALL
  USING (user_has_organization_access(organization_id))
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can view journals in their organization"
  ON journals FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can manage journals in their organization"
  ON journals FOR ALL
  USING (user_has_organization_access(organization_id))
  WITH CHECK (user_has_organization_access(organization_id));

CREATE POLICY "Users can view journal lines in their organization"
  ON journal_lines FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM journals j 
    WHERE j.id = journal_lines.journal_id 
    AND user_has_organization_access(j.organization_id)
  ));

CREATE POLICY "Users can manage journal lines in their organization"
  ON journal_lines FOR ALL
  USING (EXISTS (
    SELECT 1 FROM journals j 
    WHERE j.id = journal_lines.journal_id 
    AND user_has_organization_access(j.organization_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM journals j 
    WHERE j.id = journal_lines.journal_id 
    AND user_has_organization_access(j.organization_id)
  ));

CREATE POLICY "Users can view ledger entries in their organization"
  ON ledger_entries FOR SELECT
  USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can manage ledger entries in their organization"
  ON ledger_entries FOR ALL
  USING (user_has_organization_access(organization_id))
  WITH CHECK (user_has_organization_access(organization_id));

-- Seed function for default UK Chart of Accounts
CREATE OR REPLACE FUNCTION seed_default_chart_of_accounts(
  p_organization_id UUID,
  p_client_id UUID DEFAULT NULL,
  p_company_id UUID DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  INSERT INTO bookkeeping_accounts (organization_id, client_id, company_id, code, name, account_type, account_subtype, is_bank_account, is_control_account)
  VALUES
    -- Assets
    (p_organization_id, p_client_id, p_company_id, '1000', 'Current Account', 'ASSET', 'CURRENT_ASSET', true, false),
    (p_organization_id, p_client_id, p_company_id, '1100', 'Trade Debtors', 'ASSET', 'CURRENT_ASSET', false, true),
    (p_organization_id, p_client_id, p_company_id, '1200', 'Other Debtors', 'ASSET', 'CURRENT_ASSET', false, false),
    (p_organization_id, p_client_id, p_company_id, '1300', 'Prepayments', 'ASSET', 'CURRENT_ASSET', false, false),
    (p_organization_id, p_client_id, p_company_id, '1500', 'Fixed Assets', 'ASSET', 'FIXED_ASSET', false, false),
    -- Liabilities
    (p_organization_id, p_client_id, p_company_id, '2000', 'Trade Creditors', 'LIABILITY', 'CURRENT_LIABILITY', false, true),
    (p_organization_id, p_client_id, p_company_id, '2100', 'VAT Control', 'LIABILITY', 'CURRENT_LIABILITY', false, true),
    (p_organization_id, p_client_id, p_company_id, '2200', 'PAYE/NIC Payable', 'LIABILITY', 'CURRENT_LIABILITY', false, true),
    (p_organization_id, p_client_id, p_company_id, '2300', 'Corporation Tax', 'LIABILITY', 'CURRENT_LIABILITY', false, true),
    (p_organization_id, p_client_id, p_company_id, '2500', 'Loans', 'LIABILITY', 'LONG_TERM_LIABILITY', false, false),
    -- Equity
    (p_organization_id, p_client_id, p_company_id, '3000', 'Share Capital', 'EQUITY', 'EQUITY', false, false),
    (p_organization_id, p_client_id, p_company_id, '3100', 'Retained Earnings', 'EQUITY', 'RETAINED_EARNINGS', false, true),
    (p_organization_id, p_client_id, p_company_id, '3200', 'Dividends', 'EQUITY', 'DRAWINGS', false, false),
    -- Income
    (p_organization_id, p_client_id, p_company_id, '4000', 'Sales Revenue', 'INCOME', 'SALES', false, false),
    (p_organization_id, p_client_id, p_company_id, '4100', 'Other Income', 'INCOME', 'OTHER_INCOME', false, false),
    -- Cost of Sales
    (p_organization_id, p_client_id, p_company_id, '5000', 'Cost of Sales', 'EXPENSE', 'COST_OF_SALES', false, false),
    (p_organization_id, p_client_id, p_company_id, '5100', 'Direct Labour', 'EXPENSE', 'COST_OF_SALES', false, false),
    -- Overheads
    (p_organization_id, p_client_id, p_company_id, '6000', 'Wages & Salaries', 'EXPENSE', 'OVERHEAD', false, false),
    (p_organization_id, p_client_id, p_company_id, '6100', 'Employer NIC', 'EXPENSE', 'OVERHEAD', false, false),
    (p_organization_id, p_client_id, p_company_id, '6200', 'Pension Costs', 'EXPENSE', 'OVERHEAD', false, false),
    (p_organization_id, p_client_id, p_company_id, '6300', 'Rent & Rates', 'EXPENSE', 'OVERHEAD', false, false),
    (p_organization_id, p_client_id, p_company_id, '6400', 'Utilities', 'EXPENSE', 'OVERHEAD', false, false),
    (p_organization_id, p_client_id, p_company_id, '6500', 'Insurance', 'EXPENSE', 'OVERHEAD', false, false),
    (p_organization_id, p_client_id, p_company_id, '6600', 'Professional Fees', 'EXPENSE', 'OVERHEAD', false, false),
    (p_organization_id, p_client_id, p_company_id, '6700', 'Motor Expenses', 'EXPENSE', 'OVERHEAD', false, false),
    (p_organization_id, p_client_id, p_company_id, '6800', 'Travel & Entertainment', 'EXPENSE', 'OVERHEAD', false, false),
    (p_organization_id, p_client_id, p_company_id, '6900', 'Office Costs', 'EXPENSE', 'OVERHEAD', false, false),
    (p_organization_id, p_client_id, p_company_id, '7000', 'Depreciation', 'EXPENSE', 'OVERHEAD', false, false),
    (p_organization_id, p_client_id, p_company_id, '7100', 'Bank Charges', 'EXPENSE', 'OVERHEAD', false, false),
    (p_organization_id, p_client_id, p_company_id, '7200', 'Interest Paid', 'EXPENSE', 'FINANCE', false, false),
    (p_organization_id, p_client_id, p_company_id, '7300', 'Bad Debts', 'EXPENSE', 'OVERHEAD', false, false),
    (p_organization_id, p_client_id, p_company_id, '7900', 'Sundry Expenses', 'EXPENSE', 'OVERHEAD', false, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Seed default VAT codes (organization-wide)
CREATE OR REPLACE FUNCTION seed_default_vat_codes(p_organization_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO vat_codes (organization_id, code, description, rate, vat_type)
  VALUES
    (p_organization_id, 'S20', 'Standard Rate 20%', 20.00, 'OUTPUT'),
    (p_organization_id, 'S5', 'Reduced Rate 5%', 5.00, 'OUTPUT'),
    (p_organization_id, 'Z', 'Zero Rated', 0.00, 'ZERO'),
    (p_organization_id, 'E', 'Exempt', 0.00, 'EXEMPT'),
    (p_organization_id, 'P20', 'Standard Rate Purchase', 20.00, 'INPUT'),
    (p_organization_id, 'P5', 'Reduced Rate Purchase', 5.00, 'INPUT'),
    (p_organization_id, 'NV', 'No VAT', 0.00, 'EXEMPT');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;