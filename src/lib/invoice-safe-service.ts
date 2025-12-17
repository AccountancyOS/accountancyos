import { supabase } from "@/integrations/supabase/client";

export interface IssueInvoiceResult {
  success: boolean;
  invoice_id?: string;
  invoice_number?: string;
  error?: string;
}

export interface RecordPaymentResult {
  success: boolean;
  payment_id?: string;
  invoice_status?: string;
  total_paid?: number;
  error?: string;
}

export interface VoidInvoiceResult {
  success: boolean;
  invoice_id?: string;
  error?: string;
}

export interface OverrideInvoiceResult {
  success: boolean;
  invoice_id?: string;
  error?: string;
}

export interface ReversePaymentResult {
  success: boolean;
  invoice_id?: string;
  invoice_status?: string;
  total_paid?: number;
  error?: string;
}

/**
 * Issue an invoice (DRAFT → ISSUED)
 * Generates invoice number atomically, locks financial fields
 */
export async function issueInvoiceSafe(invoiceId: string): Promise<IssueInvoiceResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const { data, error } = await supabase.rpc('issue_invoice_safe', {
    p_invoice_id: invoiceId,
    p_user_id: user.id
  });

  if (error) {
    console.error('Issue invoice error:', error);
    return { success: false, error: error.message };
  }

  return data as unknown as IssueInvoiceResult;
}

/**
 * Update an issued invoice (limited fields only)
 * Manager+ can update due_date
 */
export async function updateIssuedInvoiceSafe(
  invoiceId: string,
  changes: {
    notes?: string;
    due_date?: string;
    tags?: string[];
  }
): Promise<{ success: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const { data, error } = await supabase.rpc('update_issued_invoice_safe', {
    p_invoice_id: invoiceId,
    p_updates: { notes: changes.notes, due_date: changes.due_date }
  });

  if (error) {
    console.error('Update issued invoice error:', error);
    return { success: false, error: error.message };
  }

  return data as unknown as { success: boolean; error?: string };
}

/**
 * Override locked fields on an invoice (owner/admin only)
 * Requires mandatory reason
 */
export async function overrideInvoiceLockSafe(
  invoiceId: string,
  changes: Record<string, unknown>,
  reason: string
): Promise<OverrideInvoiceResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  if (!reason || reason.trim() === '') {
    return { success: false, error: "Reason is required for override" };
  }

  const { data, error } = await supabase.rpc('override_invoice_lock_safe', {
    p_invoice_id: invoiceId,
    p_user_id: user.id,
    p_changes: changes as unknown as Record<string, never>,
    p_reason: reason
  });

  if (error) {
    console.error('Override invoice lock error:', error);
    return { success: false, error: error.message };
  }

  return data as unknown as OverrideInvoiceResult;
}

/**
 * Void an invoice
 * No payments: manager+ can void
 * Has payments: owner/admin only
 */
export async function voidInvoiceSafe(
  invoiceId: string,
  reason: string
): Promise<VoidInvoiceResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  if (!reason || reason.trim() === '') {
    return { success: false, error: "Reason is required for voiding" };
  }

  const { data, error } = await supabase.rpc('void_invoice_safe', {
    p_invoice_id: invoiceId,
    p_user_id: user.id,
    p_reason: reason
  });

  if (error) {
    console.error('Void invoice error:', error);
    return { success: false, error: error.message };
  }

  return data as unknown as VoidInvoiceResult;
}

/**
 * Record a payment against an invoice
 * Auto-updates invoice status to PART_PAID or PAID
 */
export async function recordInvoicePaymentSafe(
  invoiceId: string,
  payment: {
    amount: number;
    paymentDate: string;
    bankAccountId?: string;
    paymentMethod?: string;
    reference?: string;
  }
): Promise<RecordPaymentResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const { data, error } = await supabase.rpc('record_invoice_payment_safe', {
    p_invoice_id: invoiceId,
    p_user_id: user.id,
    p_amount: payment.amount,
    p_payment_date: payment.paymentDate,
    p_bank_account_id: payment.bankAccountId || null,
    p_payment_method: payment.paymentMethod || 'bank_transfer',
    p_reference: payment.reference || null
  });

  if (error) {
    console.error('Record payment error:', error);
    return { success: false, error: error.message };
  }

  return data as unknown as RecordPaymentResult;
}

/**
 * Reverse a payment (soft delete via reversal entry)
 * Recalculates invoice status
 */
export async function reverseInvoicePaymentSafe(
  paymentId: string,
  reason: string
): Promise<ReversePaymentResult> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  if (!reason || reason.trim() === '') {
    return { success: false, error: "Reason is required for reversal" };
  }

  const { data, error } = await supabase.rpc('reverse_invoice_payment_safe', {
    p_payment_id: paymentId,
    p_user_id: user.id,
    p_reason: reason
  });

  if (error) {
    console.error('Reverse payment error:', error);
    return { success: false, error: error.message };
  }

  return data as unknown as ReversePaymentResult;
}
