import { supabase } from "@/integrations/supabase/client";

export interface BillLineInput {
  description: string;
  quantity: number;
  unit_price: number;
  account_id?: string;
  vat_code_id?: string;
  vat_rate: number;
  // Server calculates amounts
}

export interface CreateBillDraftInput {
  entityType: 'client' | 'company';
  entityId: string;
  supplierId?: string;
  billNumber?: string;
  reference?: string;
  issueDate?: string;
  dueDate?: string;
  notes?: string;
  currency?: string;
  lines: BillLineInput[];
}

export interface CreateBillDraftResult {
  success: boolean;
  bill_id?: string;
  error?: string;
}

export interface UpdateBillDraftResult {
  success: boolean;
  bill_id?: string;
  error?: string;
}

export async function createBillDraftSafe(
  organizationId: string,
  input: CreateBillDraftInput
): Promise<CreateBillDraftResult> {
  // Send only what server needs - server calculates amounts
  const lines = input.lines.map(line => ({
    description: line.description,
    quantity: line.quantity,
    unit_price: line.unit_price,
    account_id: line.account_id || '',
    vat_code_id: line.vat_code_id || '',
    vat_rate: line.vat_rate
  }));

  const { data, error } = await supabase.rpc('create_bill_draft_safe', {
    p_organization_id: organizationId,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
    p_supplier_id: input.supplierId || null,
    p_bill_number: input.billNumber || null,
    p_reference: input.reference || null,
    p_issue_date: input.issueDate || null,
    p_due_date: input.dueDate || null,
    p_notes: input.notes || null,
    p_currency: input.currency || 'GBP',
    p_lines: lines as unknown as Record<string, never>
  });

  if (error) return { success: false, error: error.message };
  return data as unknown as CreateBillDraftResult;
}

export async function updateBillDraftSafe(
  billId: string,
  input: Partial<Omit<CreateBillDraftInput, 'entityType' | 'entityId'>>
): Promise<UpdateBillDraftResult> {
  // Send only what server needs - server calculates amounts
  const lines = input.lines ? input.lines.map(line => ({
    description: line.description,
    quantity: line.quantity,
    unit_price: line.unit_price,
    account_id: line.account_id || '',
    vat_code_id: line.vat_code_id || '',
    vat_rate: line.vat_rate
  })) : null;

  const { data, error } = await supabase.rpc('update_bill_draft_safe', {
    p_bill_id: billId,
    p_supplier_id: input.supplierId || null,
    p_bill_number: input.billNumber || null,
    p_reference: input.reference || null,
    p_issue_date: input.issueDate || null,
    p_due_date: input.dueDate || null,
    p_notes: input.notes || null,
    p_lines: lines as unknown as Record<string, never> | null
  });

  if (error) return { success: false, error: error.message };
  return data as unknown as UpdateBillDraftResult;
}
