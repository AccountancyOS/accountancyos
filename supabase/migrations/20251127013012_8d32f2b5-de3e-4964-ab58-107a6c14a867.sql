-- Phase 2: Bank Feeds & Bank Reconciliation Tables

-- bank_accounts: Track bank accounts per entity
CREATE TABLE bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Entity scoping (exactly one must be set)
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Link to chart of accounts
  account_id UUID NOT NULL REFERENCES bookkeeping_accounts(id),
  
  -- Bank details
  name TEXT NOT NULL, -- e.g. "Barclays Current Account"
  currency TEXT NOT NULL DEFAULT 'GBP',
  external_identifier TEXT, -- For future Open Banking integration
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Constraint: exactly one of client_id or company_id must be set
  CONSTRAINT entity_check CHECK (
    (client_id IS NOT NULL AND company_id IS NULL) OR
    (client_id IS NULL AND company_id IS NOT NULL)
  )
);

-- bank_transactions: Imported bank feed lines
CREATE TABLE bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Entity scoping (inherited from bank_account, denormalized for query performance)
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Bank account
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  
  -- Transaction details
  transaction_date DATE NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(15,2) NOT NULL, -- Positive for credits, negative for debits
  balance NUMERIC(15,2), -- Running balance (optional)
  
  -- Import tracking
  import_source TEXT DEFAULT 'CSV', -- CSV, OPEN_BANKING, MANUAL
  import_batch_id UUID, -- Group transactions from same import
  
  -- Categorization
  matched_ledger_entry_id UUID REFERENCES ledger_entries(id),
  rule_id UUID, -- Link to categorization_rules (to be created)
  
  -- Status
  status TEXT NOT NULL DEFAULT 'UNREVIEWED', -- UNREVIEWED, MATCHED, EXCLUDED, SPLIT
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT entity_check CHECK (
    (client_id IS NOT NULL AND company_id IS NULL) OR
    (client_id IS NULL AND company_id IS NOT NULL)
  )
);

-- categorization_rules: Auto-categorization rules for bank transactions
CREATE TABLE categorization_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Entity scoping (null = organization-wide)
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Rule details
  name TEXT NOT NULL,
  
  -- Conditions (JSON for flexibility)
  conditions JSONB NOT NULL DEFAULT '{}', -- { "description_contains": "AMZN", "amount_min": 0, "amount_max": 1000 }
  
  -- Actions
  default_account_id UUID NOT NULL REFERENCES bookkeeping_accounts(id),
  default_vat_code_id UUID REFERENCES vat_codes(id),
  description_template TEXT, -- e.g. "Amazon purchase"
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0, -- Higher priority rules checked first
  
  -- Usage stats
  times_applied INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- reconciliations: Bank reconciliation sessions
CREATE TABLE reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Entity scoping
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Bank account
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  
  -- Statement details
  statement_start_date DATE NOT NULL,
  statement_end_date DATE NOT NULL,
  statement_opening_balance NUMERIC(15,2) NOT NULL,
  statement_closing_balance NUMERIC(15,2) NOT NULL,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS', -- IN_PROGRESS, COMPLETED
  
  -- Completion tracking
  completed_by UUID,
  completed_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT entity_check CHECK (
    (client_id IS NOT NULL AND company_id IS NULL) OR
    (client_id IS NULL AND company_id IS NOT NULL)
  )
);

-- reconciliation_lines: Individual matches in a reconciliation
CREATE TABLE reconciliation_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id UUID NOT NULL REFERENCES reconciliations(id) ON DELETE CASCADE,
  
  -- What's being matched
  bank_transaction_id UUID REFERENCES bank_transactions(id),
  ledger_entry_id UUID REFERENCES ledger_entries(id),
  
  -- Match type
  match_type TEXT NOT NULL DEFAULT 'ONE_TO_ONE', -- ONE_TO_ONE, ONE_TO_MANY, MANY_TO_ONE, WRITE_OFF, ADJUSTMENT
  
  -- Amount (for partial matches or write-offs)
  amount NUMERIC(15,2) NOT NULL,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- At least one of bank_transaction_id or ledger_entry_id must be set
  CONSTRAINT match_check CHECK (
    bank_transaction_id IS NOT NULL OR ledger_entry_id IS NOT NULL
  )
);

-- RLS Policies

-- bank_accounts
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view bank accounts in their organization"
ON bank_accounts FOR SELECT
USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can manage bank accounts in their organization"
ON bank_accounts FOR ALL
USING (user_has_organization_access(organization_id))
WITH CHECK (user_has_organization_access(organization_id));

-- bank_transactions
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view bank transactions in their organization"
ON bank_transactions FOR SELECT
USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can manage bank transactions in their organization"
ON bank_transactions FOR ALL
USING (user_has_organization_access(organization_id))
WITH CHECK (user_has_organization_access(organization_id));

-- categorization_rules
ALTER TABLE categorization_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view rules in their organization"
ON categorization_rules FOR SELECT
USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can manage rules in their organization"
ON categorization_rules FOR ALL
USING (user_has_organization_access(organization_id))
WITH CHECK (user_has_organization_access(organization_id));

-- reconciliations
ALTER TABLE reconciliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reconciliations in their organization"
ON reconciliations FOR SELECT
USING (user_has_organization_access(organization_id));

CREATE POLICY "Users can manage reconciliations in their organization"
ON reconciliations FOR ALL
USING (user_has_organization_access(organization_id))
WITH CHECK (user_has_organization_access(organization_id));

-- reconciliation_lines
ALTER TABLE reconciliation_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reconciliation lines in their organization"
ON reconciliation_lines FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM reconciliations r
    WHERE r.id = reconciliation_lines.reconciliation_id
    AND user_has_organization_access(r.organization_id)
  )
);

CREATE POLICY "Users can manage reconciliation lines in their organization"
ON reconciliation_lines FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM reconciliations r
    WHERE r.id = reconciliation_lines.reconciliation_id
    AND user_has_organization_access(r.organization_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM reconciliations r
    WHERE r.id = reconciliation_lines.reconciliation_id
    AND user_has_organization_access(r.organization_id)
  )
);

-- Indexes for performance
CREATE INDEX idx_bank_accounts_entity ON bank_accounts(organization_id, client_id, company_id);
CREATE INDEX idx_bank_accounts_account ON bank_accounts(account_id);

CREATE INDEX idx_bank_transactions_entity ON bank_transactions(organization_id, client_id, company_id);
CREATE INDEX idx_bank_transactions_bank_account ON bank_transactions(bank_account_id);
CREATE INDEX idx_bank_transactions_date ON bank_transactions(transaction_date);
CREATE INDEX idx_bank_transactions_status ON bank_transactions(status);

CREATE INDEX idx_categorization_rules_entity ON categorization_rules(organization_id, client_id, company_id);
CREATE INDEX idx_categorization_rules_priority ON categorization_rules(priority DESC) WHERE is_active = true;

CREATE INDEX idx_reconciliations_entity ON reconciliations(organization_id, client_id, company_id);
CREATE INDEX idx_reconciliations_bank_account ON reconciliations(bank_account_id);

CREATE INDEX idx_reconciliation_lines_bank_transaction ON reconciliation_lines(bank_transaction_id);
CREATE INDEX idx_reconciliation_lines_ledger_entry ON reconciliation_lines(ledger_entry_id);