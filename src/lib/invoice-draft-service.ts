import { supabase } from "@/integrations/supabase/client";

export interface InvoiceLineInput {
  description: string;
  quantity: number;
  unit_price: number;
  account_id?: string;
  vat_code_id?: string;
  vat_rate: number;
  // Server calculates these - we don't send them
}

export interface CreateInvoiceDraftInput {
  entityType: 'client' | 'company';
  entityId: string;
  invoiceType: 'SALES' | 'PURCHASE';
  contactName: string;
  contactEmail?: string;
  invoiceNumber?: string;
  reference?: string;
  issueDate?: string;
  dueDate?: string;
  notes?: string;
  currency?: string;
  customerId?: string;
  lines: InvoiceLineInput[];
}

export interface CreateInvoiceDraftResult {
  success: boolean;
  invoice_id?: string;
  error?: string;
}

export interface UpdateInvoiceDraftResult {
  success: boolean;
  invoice_id?: string;
  error?: string;
}

export async function createInvoiceDraftSafe(
  organizationId: string,
  input: CreateInvoiceDraftInput
): Promise<CreateInvoiceDraftResult> {
  // Send only what server needs - server calculates amounts
  const lines = input.lines.map(line => ({
    description: line.description,
    quantity: line.quantity,
    unit_price: line.unit_price,
    account_id: line.account_id || '',
    vat_code_id: line.vat_code_id || '',
    vat_rate: line.vat_rate
  }));

  const { data, error } = await supabase.rpc('create_invoice_draft_safe', {
    p_organization_id: organizationId,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
    p_invoice_type: input.invoiceType,
    p_contact_name: input.contactName,
    p_contact_email: input.contactEmail || null,
    p_invoice_number: input.invoiceNumber || null,
    p_reference: input.reference || null,
    p_issue_date: input.issueDate || null,
    p_due_date: input.dueDate || null,
    p_notes: input.notes || null,
    p_currency: input.currency || 'GBP',
    p_customer_id: input.customerId || null,
    p_lines: lines as unknown as Record<string, never>
  });

  if (error) return { success: false, error: error.message };
  return data as unknown as CreateInvoiceDraftResult;
}

export async function updateInvoiceDraftSafe(
  invoiceId: string,
  input: Partial<Omit<CreateInvoiceDraftInput, 'entityType' | 'entityId' | 'invoiceType'>>
): Promise<UpdateInvoiceDraftResult> {
  // Send only what server needs - server calculates amounts
  const lines = input.lines ? input.lines.map(line => ({
    description: line.description,
    quantity: line.quantity,
    unit_price: line.unit_price,
    account_id: line.account_id || '',
    vat_code_id: line.vat_code_id || '',
    vat_rate: line.vat_rate
  })) : null;

  const { data, error } = await supabase.rpc('update_invoice_draft_safe', {
    p_invoice_id: invoiceId,
    p_contact_name: input.contactName || null,
    p_contact_email: input.contactEmail || null,
    p_reference: input.reference || null,
    p_issue_date: input.issueDate || null,
    p_due_date: input.dueDate || null,
    p_notes: input.notes || null,
    p_customer_id: input.customerId || null,
    p_lines: lines as unknown as Record<string, never> | null
  });

  if (error) return { success: false, error: error.message };
  return data as unknown as UpdateInvoiceDraftResult;
}

export interface GetInvoiceWithLinesResult {
  success: boolean;
  invoice?: {
    id: string;
    organization_id: string;
    client_id?: string;
    company_id?: string;
    customer_id?: string;
    invoice_type: string;
    status: string;
    invoice_number?: string;
    contact_name?: string;
    contact_email?: string;
    reference?: string;
    issue_date: string;
    due_date: string;
    notes?: string;
    currency: string;
    total_net: number;
    total_vat: number;
    total_gross: number;
    amount_paid: number;
    remaining_balance: number;
    created_at: string;
    updated_at: string;
  };
  lines?: Array<{
    id: string;
    line_number: number;
    description: string;
    quantity: number;
    unit_price: number;
    vat_rate: number;
    vat_code_id?: string;
    account_id?: string;
    net_amount: number;
    vat_amount: number;
    gross_amount: number;
  }>;
  error?: string;
}

export async function getInvoiceWithLinesSafe(
  invoiceId: string
): Promise<GetInvoiceWithLinesResult> {
  const { data, error } = await supabase.rpc('get_invoice_with_lines_safe', {
    p_invoice_id: invoiceId
  });

  if (error) return { success: false, error: error.message };
  return data as unknown as GetInvoiceWithLinesResult;
}
