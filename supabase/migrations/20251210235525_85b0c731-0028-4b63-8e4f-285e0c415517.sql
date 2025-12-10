-- Seed FRS 105 (Micro-Entity) Workpaper Template
INSERT INTO templates (
  organization_id,
  name,
  description,
  type,
  service,
  status,
  tags,
  content
)
SELECT 
  NULL, -- System template, not organization-specific
  'FRS 105 Micro-Entity Accounts Workpaper',
  'Workpaper template for FRS 105 Micro-Entity accounts filing to Companies House',
  'workpaper',
  'accounts_frs105',
  'active',
  '["accounts", "frs105", "micro-entity", "companies-house", "system"]'::jsonb,
  '{
    "config": {
      "service_type": "accounts_frs105",
      "standard": "FRS105",
      "is_accounts_workpaper": true,
      "has_profit_loss": false
    },
    "sections": [
      {
        "id": "balance_sheet",
        "name": "Balance Sheet",
        "description": "Statement of financial position as at the period end date",
        "fields": [
          {"id": "tangible_assets", "label": "Tangible Fixed Assets", "type": "currency", "source": "trial_balance", "tb_category": "fixed_assets", "required": false},
          {"id": "intangible_assets", "label": "Intangible Fixed Assets", "type": "currency", "source": "trial_balance", "tb_category": "intangible_assets", "required": false},
          {"id": "investments", "label": "Investments", "type": "currency", "source": "trial_balance", "tb_category": "investments", "required": false},
          {"id": "stock", "label": "Stock / Inventory", "type": "currency", "source": "trial_balance", "tb_category": "stock", "required": false},
          {"id": "debtors", "label": "Debtors", "type": "currency", "source": "trial_balance", "tb_category": "debtors", "required": false},
          {"id": "cash_at_bank", "label": "Cash at Bank and in Hand", "type": "currency", "source": "trial_balance", "tb_category": "bank", "required": true},
          {"id": "creditors_within_one_year", "label": "Creditors: amounts falling due within one year", "type": "currency", "source": "trial_balance", "tb_category": "creditors_short", "required": false},
          {"id": "creditors_after_one_year", "label": "Creditors: amounts falling due after more than one year", "type": "currency", "source": "trial_balance", "tb_category": "creditors_long", "required": false},
          {"id": "share_capital", "label": "Called Up Share Capital", "type": "currency", "source": "trial_balance", "tb_category": "share_capital", "required": true},
          {"id": "share_premium", "label": "Share Premium Account", "type": "currency", "source": "trial_balance", "tb_category": "share_premium", "required": false},
          {"id": "retained_earnings", "label": "Profit and Loss Reserve", "type": "currency", "source": "trial_balance", "tb_category": "retained_earnings", "required": true}
        ]
      },
      {
        "id": "notes",
        "name": "Notes to the Accounts",
        "description": "Statutory notes and disclosures required under FRS 105",
        "fields": [
          {"id": "going_concern", "label": "Prepared on a going concern basis", "type": "boolean", "source": "manual", "default": true, "required": true},
          {"id": "turnover_policy", "label": "Turnover Recognition Policy", "type": "text", "source": "manual", "default": "Turnover represents amounts receivable for goods and services provided in the normal course of business.", "required": false},
          {"id": "depreciation_policy", "label": "Depreciation Policy", "type": "text", "source": "manual", "default": "Depreciation is provided on all tangible fixed assets at rates calculated to write off the cost over their expected useful lives.", "required": false},
          {"id": "stock_valuation_policy", "label": "Stock Valuation Policy", "type": "text", "source": "manual", "default": "Stock is valued at the lower of cost and estimated selling price less costs to sell.", "required": false},
          {"id": "average_employees", "label": "Average Number of Employees", "type": "number", "source": "questionnaire", "required": true},
          {"id": "directors_advances_exist", "label": "Directors Advances/Credits Exist", "type": "boolean", "source": "manual", "default": false, "required": true},
          {"id": "directors_loan_account", "label": "Directors Loan Account Balance", "type": "currency", "source": "trial_balance", "tb_category": "dla", "required": false},
          {"id": "directors_advances_details", "label": "Directors Advances Details", "type": "text", "source": "manual", "required": false, "conditional": "directors_advances_exist"},
          {"id": "guarantees_exist", "label": "Guarantees or Financial Commitments Exist", "type": "boolean", "source": "manual", "default": false, "required": true},
          {"id": "guarantees_details", "label": "Guarantees Details", "type": "text", "source": "manual", "required": false, "conditional": "guarantees_exist"},
          {"id": "related_party_transactions_exist", "label": "Related Party Transactions Exist", "type": "boolean", "source": "manual", "default": false, "required": true},
          {"id": "related_party_details", "label": "Related Party Transaction Details", "type": "text", "source": "manual", "required": false, "conditional": "related_party_transactions_exist"},
          {"id": "contingent_liabilities_exist", "label": "Contingent Liabilities Exist", "type": "boolean", "source": "manual", "default": false, "required": false},
          {"id": "contingent_liabilities_details", "label": "Contingent Liabilities Details", "type": "text", "source": "manual", "required": false, "conditional": "contingent_liabilities_exist"}
        ]
      },
      {
        "id": "approval",
        "name": "Approval",
        "description": "Board approval and signatory details",
        "fields": [
          {"id": "approved_by_board", "label": "Approved by the Board", "type": "boolean", "source": "manual", "default": false, "required": true},
          {"id": "approval_date", "label": "Date of Approval", "type": "date", "source": "manual", "required": true},
          {"id": "signatory_name", "label": "Signatory Name", "type": "text", "source": "manual", "required": true},
          {"id": "signatory_role", "label": "Signatory Role", "type": "text", "source": "manual", "default": "Director", "required": true}
        ]
      }
    ]
  }'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM templates WHERE service = 'accounts_frs105' AND organization_id IS NULL
);

-- Seed FRS 102 Section 1A (Small Company) Workpaper Template
INSERT INTO templates (
  organization_id,
  name,
  description,
  type,
  service,
  status,
  tags,
  content
)
SELECT 
  NULL, -- System template, not organization-specific
  'FRS 102 Section 1A Small Company Accounts Workpaper',
  'Workpaper template for FRS 102 Section 1A small company accounts filing to Companies House',
  'workpaper',
  'accounts_frs102_1a',
  'active',
  '["accounts", "frs102", "small-company", "companies-house", "system"]'::jsonb,
  '{
    "config": {
      "service_type": "accounts_frs102_1a",
      "standard": "FRS102_1A",
      "is_accounts_workpaper": true,
      "has_profit_loss": true,
      "has_directors_report": true
    },
    "sections": [
      {
        "id": "profit_loss",
        "name": "Profit and Loss Account",
        "description": "Statement of comprehensive income for the period",
        "fields": [
          {"id": "turnover", "label": "Turnover", "type": "currency", "source": "trial_balance", "tb_category": "revenue", "required": true},
          {"id": "cost_of_sales", "label": "Cost of Sales", "type": "currency", "source": "trial_balance", "tb_category": "cost_of_sales", "required": false},
          {"id": "gross_profit", "label": "Gross Profit", "type": "currency", "source": "calculation", "formula": "turnover - cost_of_sales", "required": false},
          {"id": "administrative_expenses", "label": "Administrative Expenses", "type": "currency", "source": "trial_balance", "tb_category": "admin_expenses", "required": false},
          {"id": "other_operating_income", "label": "Other Operating Income", "type": "currency", "source": "trial_balance", "tb_category": "other_income", "required": false},
          {"id": "operating_profit", "label": "Operating Profit", "type": "currency", "source": "calculation", "formula": "gross_profit - administrative_expenses + other_operating_income", "required": false},
          {"id": "interest_receivable", "label": "Interest Receivable", "type": "currency", "source": "trial_balance", "tb_category": "interest_income", "required": false},
          {"id": "interest_payable", "label": "Interest Payable", "type": "currency", "source": "trial_balance", "tb_category": "interest_expense", "required": false},
          {"id": "profit_before_tax", "label": "Profit Before Taxation", "type": "currency", "source": "calculation", "formula": "operating_profit + interest_receivable - interest_payable", "required": true},
          {"id": "corporation_tax", "label": "Corporation Tax", "type": "currency", "source": "trial_balance", "tb_category": "tax_charge", "required": false},
          {"id": "profit_after_tax", "label": "Profit for the Financial Year", "type": "currency", "source": "calculation", "formula": "profit_before_tax - corporation_tax", "required": true}
        ]
      },
      {
        "id": "balance_sheet",
        "name": "Balance Sheet",
        "description": "Statement of financial position as at the period end date",
        "fields": [
          {"id": "tangible_assets", "label": "Tangible Fixed Assets", "type": "currency", "source": "trial_balance", "tb_category": "fixed_assets", "required": false},
          {"id": "intangible_assets", "label": "Intangible Fixed Assets", "type": "currency", "source": "trial_balance", "tb_category": "intangible_assets", "required": false},
          {"id": "investments", "label": "Investments", "type": "currency", "source": "trial_balance", "tb_category": "investments", "required": false},
          {"id": "stock", "label": "Stock / Inventory", "type": "currency", "source": "trial_balance", "tb_category": "stock", "required": false},
          {"id": "trade_debtors", "label": "Trade Debtors", "type": "currency", "source": "trial_balance", "tb_category": "trade_debtors", "required": false},
          {"id": "other_debtors", "label": "Other Debtors", "type": "currency", "source": "trial_balance", "tb_category": "other_debtors", "required": false},
          {"id": "prepayments", "label": "Prepayments and Accrued Income", "type": "currency", "source": "trial_balance", "tb_category": "prepayments", "required": false},
          {"id": "debtors", "label": "Total Debtors", "type": "currency", "source": "calculation", "formula": "trade_debtors + other_debtors + prepayments", "required": false},
          {"id": "cash_at_bank", "label": "Cash at Bank and in Hand", "type": "currency", "source": "trial_balance", "tb_category": "bank", "required": true},
          {"id": "trade_creditors", "label": "Trade Creditors", "type": "currency", "source": "trial_balance", "tb_category": "trade_creditors", "required": false},
          {"id": "accruals", "label": "Accruals and Deferred Income", "type": "currency", "source": "trial_balance", "tb_category": "accruals", "required": false},
          {"id": "taxation_creditor", "label": "Corporation Tax", "type": "currency", "source": "trial_balance", "tb_category": "tax_creditor", "required": false},
          {"id": "other_creditors", "label": "Other Creditors", "type": "currency", "source": "trial_balance", "tb_category": "other_creditors", "required": false},
          {"id": "creditors_within_one_year", "label": "Creditors: amounts falling due within one year", "type": "currency", "source": "calculation", "formula": "trade_creditors + accruals + taxation_creditor + other_creditors", "required": false},
          {"id": "long_term_loans", "label": "Bank Loans and Overdrafts (Long Term)", "type": "currency", "source": "trial_balance", "tb_category": "long_term_debt", "required": false},
          {"id": "creditors_after_one_year", "label": "Creditors: amounts falling due after more than one year", "type": "currency", "source": "trial_balance", "tb_category": "creditors_long", "required": false},
          {"id": "called_up_share_capital", "label": "Called Up Share Capital", "type": "currency", "source": "trial_balance", "tb_category": "share_capital", "required": true},
          {"id": "share_premium", "label": "Share Premium Account", "type": "currency", "source": "trial_balance", "tb_category": "share_premium", "required": false},
          {"id": "profit_loss_reserve", "label": "Profit and Loss Reserve", "type": "currency", "source": "trial_balance", "tb_category": "retained_earnings", "required": true}
        ]
      },
      {
        "id": "notes",
        "name": "Notes to the Accounts",
        "description": "Statutory notes and disclosures required under FRS 102 Section 1A",
        "fields": [
          {"id": "going_concern", "label": "Prepared on a going concern basis", "type": "boolean", "source": "manual", "default": true, "required": true},
          {"id": "turnover_policy", "label": "Turnover Recognition Policy", "type": "text", "source": "manual", "default": "Turnover represents amounts receivable for goods and services provided in the normal course of business, net of VAT and trade discounts.", "required": false},
          {"id": "depreciation_policy", "label": "Depreciation Policy", "type": "text", "source": "manual", "default": "Depreciation is provided on all tangible fixed assets at rates calculated to write off the cost, less estimated residual value, over their expected useful lives.", "required": false},
          {"id": "stock_valuation_policy", "label": "Stock Valuation Policy", "type": "text", "source": "manual", "default": "Stock is valued at the lower of cost and net realisable value after making due allowance for obsolete and slow-moving stock.", "required": false},
          {"id": "average_employees", "label": "Average Number of Employees", "type": "number", "source": "questionnaire", "required": true},
          {"id": "directors_advances_exist", "label": "Directors Advances/Credits Exist", "type": "boolean", "source": "manual", "default": false, "required": true},
          {"id": "directors_loan_account", "label": "Directors Loan Account Balance", "type": "currency", "source": "trial_balance", "tb_category": "dla", "required": false},
          {"id": "directors_advances_details", "label": "Directors Advances Details", "type": "text", "source": "manual", "required": false, "conditional": "directors_advances_exist"},
          {"id": "guarantees_exist", "label": "Guarantees or Financial Commitments Exist", "type": "boolean", "source": "manual", "default": false, "required": true},
          {"id": "guarantees_details", "label": "Guarantees Details", "type": "text", "source": "manual", "required": false, "conditional": "guarantees_exist"},
          {"id": "related_party_transactions_exist", "label": "Related Party Transactions Exist", "type": "boolean", "source": "manual", "default": false, "required": true},
          {"id": "related_party_details", "label": "Related Party Transaction Details", "type": "text", "source": "manual", "required": false, "conditional": "related_party_transactions_exist"},
          {"id": "contingent_liabilities_exist", "label": "Contingent Liabilities Exist", "type": "boolean", "source": "manual", "default": false, "required": false},
          {"id": "contingent_liabilities_details", "label": "Contingent Liabilities Details", "type": "text", "source": "manual", "required": false, "conditional": "contingent_liabilities_exist"},
          {"id": "audit_exemption_claimed", "label": "Audit Exemption Claimed", "type": "boolean", "source": "manual", "default": true, "required": true},
          {"id": "audit_exemption_statement", "label": "Audit Exemption Statement", "type": "text", "source": "manual", "default": "For the year ending [period_end] the company was entitled to exemption from audit under section 477 of the Companies Act 2006 relating to small companies.", "required": false}
        ]
      },
      {
        "id": "directors_report",
        "name": "Directors Report",
        "description": "Strategic report and directors report content",
        "fields": [
          {"id": "principal_activities", "label": "Principal Activities", "type": "text", "source": "manual", "required": true},
          {"id": "review_of_business", "label": "Review of Business", "type": "text", "source": "manual", "required": false},
          {"id": "dividends_statement", "label": "Dividends Statement", "type": "text", "source": "manual", "default": "The directors do not recommend the payment of a final dividend.", "required": false},
          {"id": "directors_report_approved", "label": "Directors Report Approved", "type": "boolean", "source": "manual", "default": false, "required": true},
          {"id": "directors_report_date", "label": "Directors Report Date", "type": "date", "source": "manual", "required": true},
          {"id": "directors_report_signatory", "label": "Directors Report Signatory", "type": "text", "source": "manual", "required": true}
        ]
      },
      {
        "id": "approval",
        "name": "Approval",
        "description": "Board approval and signatory details",
        "fields": [
          {"id": "approved_by_board", "label": "Approved by the Board", "type": "boolean", "source": "manual", "default": false, "required": true},
          {"id": "approval_date", "label": "Date of Approval", "type": "date", "source": "manual", "required": true},
          {"id": "signatory_name", "label": "Signatory Name", "type": "text", "source": "manual", "required": true},
          {"id": "signatory_role", "label": "Signatory Role", "type": "text", "source": "manual", "default": "Director", "required": true}
        ]
      }
    ]
  }'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM templates WHERE service = 'accounts_frs102_1a' AND organization_id IS NULL
);