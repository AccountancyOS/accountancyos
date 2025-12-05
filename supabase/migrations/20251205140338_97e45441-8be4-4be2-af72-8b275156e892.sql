-- Phase 9.1b: Credit Notes, Allocations, and Payment Extensions

-- Credit Notes table
CREATE TABLE IF NOT EXISTS public.credit_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  credit_note_type TEXT NOT NULL CHECK (credit_note_type IN ('SALES', 'PURCHASE')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'VOIDED', 'FULLY_ALLOCATED')),
  currency TEXT NOT NULL DEFAULT 'GBP',
  fx_rate NUMERIC(12,6) DEFAULT 1.0,
  credit_note_number TEXT,
  issue_date DATE NOT NULL,
  reference TEXT,
  external_reference TEXT,
  subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
  vat_total NUMERIC(15,2) NOT NULL DEFAULT 0,
  total NUMERIC(15,2) NOT NULL DEFAULT 0,
  remaining_allocation NUMERIC(15,2) NOT NULL DEFAULT 0,
  original_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  original_bill_id UUID REFERENCES public.bills(id) ON DELETE SET NULL,
  notes TEXT,
  pdf_url TEXT,
  is_posted BOOLEAN DEFAULT false,
  posted_at TIMESTAMPTZ,
  posted_by UUID,
  journal_id UUID REFERENCES public.journals(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  CONSTRAINT credit_notes_entity_check CHECK (
    (client_id IS NOT NULL AND company_id IS NULL) OR
    (company_id IS NOT NULL AND client_id IS NULL)
  ),
  CONSTRAINT credit_notes_counterparty_check CHECK (
    (credit_note_type = 'SALES' AND customer_id IS NOT NULL AND supplier_id IS NULL) OR
    (credit_note_type = 'PURCHASE' AND supplier_id IS NOT NULL AND customer_id IS NULL) OR
    (customer_id IS NULL AND supplier_id IS NULL)
  )
);

-- Credit Note Lines
CREATE TABLE IF NOT EXISTS public.credit_note_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  credit_note_id UUID NOT NULL REFERENCES public.credit_notes(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  quantity NUMERIC(12,4) DEFAULT 1,
  unit_price NUMERIC(15,4) DEFAULT 0,
  discount_rate NUMERIC(5,2),
  net_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  vat_code_id UUID REFERENCES public.vat_codes(id) ON DELETE SET NULL,
  vat_rate NUMERIC(5,2) DEFAULT 0,
  vat_amount NUMERIC(15,2) DEFAULT 0,
  gross_amount NUMERIC(15,2) DEFAULT 0,
  account_id UUID REFERENCES public.bookkeeping_accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Credit Note Allocations (linking credits to invoices/bills)
CREATE TABLE IF NOT EXISTS public.credit_note_allocations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  credit_note_id UUID NOT NULL REFERENCES public.credit_notes(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  bill_id UUID REFERENCES public.bills(id) ON DELETE SET NULL,
  allocation_date DATE NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  fx_rate NUMERIC(12,6) DEFAULT 1.0,
  journal_id UUID REFERENCES public.journals(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  CONSTRAINT allocation_target_check CHECK (
    (invoice_id IS NOT NULL AND bill_id IS NULL) OR
    (bill_id IS NOT NULL AND invoice_id IS NULL)
  )
);

-- Add remaining_allocation to invoices if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'remaining_balance') THEN
    ALTER TABLE public.invoices ADD COLUMN remaining_balance NUMERIC(15,2);
  END IF;
END $$;

-- Add remaining_allocation to bills if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bills' AND column_name = 'remaining_balance') THEN
    ALTER TABLE public.bills ADD COLUMN remaining_balance NUMERIC(15,2);
  END IF;
END $$;

-- Add supplier_id to invoices for purchase invoices (if needed)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'supplier_id') THEN
    ALTER TABLE public.invoices ADD COLUMN supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add payment_type and unallocated_amount to invoice_payments
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_payments' AND column_name = 'payment_type') THEN
    ALTER TABLE public.invoice_payments ADD COLUMN payment_type TEXT DEFAULT 'normal' CHECK (payment_type IN ('normal', 'overpayment', 'prepayment', 'refund'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoice_payments' AND column_name = 'unallocated_amount') THEN
    ALTER TABLE public.invoice_payments ADD COLUMN unallocated_amount NUMERIC(15,2) DEFAULT 0;
  END IF;
END $$;

-- Add payment_type and unallocated_amount to bill_payments
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bill_payments' AND column_name = 'payment_type') THEN
    ALTER TABLE public.bill_payments ADD COLUMN payment_type TEXT DEFAULT 'normal' CHECK (payment_type IN ('normal', 'overpayment', 'prepayment', 'refund'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bill_payments' AND column_name = 'unallocated_amount') THEN
    ALTER TABLE public.bill_payments ADD COLUMN unallocated_amount NUMERIC(15,2) DEFAULT 0;
  END IF;
END $$;

-- Enable RLS
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_note_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_note_allocations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for credit_notes
CREATE POLICY "Users can view credit notes in their org" ON public.credit_notes
  FOR SELECT USING (user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Users can create credit notes in their org" ON public.credit_notes
  FOR INSERT WITH CHECK (user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Users can update credit notes in their org" ON public.credit_notes
  FOR UPDATE USING (user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Users can delete credit notes in their org" ON public.credit_notes
  FOR DELETE USING (user_in_organization(auth.uid(), organization_id));

-- RLS Policies for credit_note_lines
CREATE POLICY "Users can view credit note lines" ON public.credit_note_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.credit_notes cn
      WHERE cn.id = credit_note_id AND user_in_organization(auth.uid(), cn.organization_id)
    )
  );

CREATE POLICY "Users can manage credit note lines" ON public.credit_note_lines
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.credit_notes cn
      WHERE cn.id = credit_note_id AND user_in_organization(auth.uid(), cn.organization_id)
    )
  );

-- RLS Policies for credit_note_allocations
CREATE POLICY "Users can view allocations in their org" ON public.credit_note_allocations
  FOR SELECT USING (user_in_organization(auth.uid(), organization_id));

CREATE POLICY "Users can manage allocations in their org" ON public.credit_note_allocations
  FOR ALL USING (user_in_organization(auth.uid(), organization_id));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_credit_notes_org ON public.credit_notes(organization_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_customer ON public.credit_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_supplier ON public.credit_notes(supplier_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_status ON public.credit_notes(status);
CREATE INDEX IF NOT EXISTS idx_credit_note_lines_credit_note ON public.credit_note_lines(credit_note_id);
CREATE INDEX IF NOT EXISTS idx_credit_note_allocations_credit_note ON public.credit_note_allocations(credit_note_id);
CREATE INDEX IF NOT EXISTS idx_credit_note_allocations_invoice ON public.credit_note_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_credit_note_allocations_bill ON public.credit_note_allocations(bill_id);

-- Trigger for updating credit_notes updated_at
CREATE TRIGGER update_credit_notes_updated_at
  BEFORE UPDATE ON public.credit_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to update credit_note totals from lines
CREATE OR REPLACE FUNCTION public.update_credit_note_totals()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE credit_notes
  SET 
    subtotal = COALESCE((SELECT SUM(net_amount) FROM credit_note_lines WHERE credit_note_id = COALESCE(NEW.credit_note_id, OLD.credit_note_id)), 0),
    vat_total = COALESCE((SELECT SUM(vat_amount) FROM credit_note_lines WHERE credit_note_id = COALESCE(NEW.credit_note_id, OLD.credit_note_id)), 0),
    total = COALESCE((SELECT SUM(gross_amount) FROM credit_note_lines WHERE credit_note_id = COALESCE(NEW.credit_note_id, OLD.credit_note_id)), 0),
    updated_at = now()
  WHERE id = COALESCE(NEW.credit_note_id, OLD.credit_note_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_credit_note_totals_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.credit_note_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.update_credit_note_totals();