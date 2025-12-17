import { supabase } from "@/integrations/supabase/client";

export interface BillLineInput {
  description?: string;
  quantity: number;
  unitPrice: number;
  accountId?: string;
  vatCodeId?: string;
  vatRate: number;
}

export interface CreateBillDraftInput {
  entityType: 'client' | 'company';
  entityId: string;
  supplierId: string;
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
  const lines = input.lines.map(line => {
    const net = line.quantity * line.unitPrice;
    const vat = net * (line.vatRate / 100);
    return {
      description: line.description || '',
      quantity: line.quantity,
      unit_price: line.unitPrice,
      account_id: line.accountId || '',
      vat_code_id: line.vatCodeId || '',
      vat_rate: line.vatRate,
      net_amount: net,
      vat_amount: vat,
      gross_amount: net + vat
    };
  });

  const { data, error } = await supabase.rpc('create_bill_draft_safe', {
    p_organization_id: organizationId,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
    p_supplier_id: input.supplierId,
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
  const lines = input.lines ? input.lines.map(line => {
    const net = line.quantity * line.unitPrice;
    const vat = net * (line.vatRate / 100);
    return {
      description: line.description || '',
      quantity: line.quantity,
      unit_price: line.unitPrice,
      account_id: line.accountId || '',
      vat_code_id: line.vatCodeId || '',
      vat_rate: line.vatRate,
      net_amount: net,
      vat_amount: vat,
      gross_amount: net + vat
    };
  }) : null;

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
