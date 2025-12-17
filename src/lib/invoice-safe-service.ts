import { supabase } from "@/integrations/supabase/client";

export interface IssueInvoiceResult { success: boolean; invoice_id?: string; invoice_number?: string; error?: string; }
export interface RecordPaymentResult { success: boolean; payment_id?: string; invoice_status?: string; error?: string; }
export interface VoidInvoiceResult { success: boolean; invoice_id?: string; error?: string; }
export interface OverrideInvoiceResult { success: boolean; invoice_id?: string; error?: string; }
export interface ReversePaymentResult { success: boolean; reversal_id?: string; invoice_status?: string; error?: string; }

export async function issueInvoiceSafe(invoiceId: string): Promise<IssueInvoiceResult> {
  const { data, error } = await supabase.rpc('issue_invoice_safe', { p_invoice_id: invoiceId });
  if (error) return { success: false, error: error.message };
  return data as unknown as IssueInvoiceResult;
}

export async function updateIssuedInvoiceSafe(
  invoiceId: string,
  changes: { notes?: string; due_date?: string; tags?: string[] }
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('update_issued_invoice_safe', {
    p_invoice_id: invoiceId,
    p_updates: { notes: changes.notes, due_date: changes.due_date, tags: changes.tags }
  });
  if (error) return { success: false, error: error.message };
  return data as unknown as { success: boolean; error?: string };
}

export async function overrideInvoiceLockSafe(invoiceId: string, changes: Record<string, unknown>, reason: string): Promise<OverrideInvoiceResult> {
  if (!reason?.trim()) return { success: false, error: "Reason is required for override" };
  const { data, error } = await supabase.rpc('override_invoice_lock_safe', {
    p_invoice_id: invoiceId,
    p_changes: changes as unknown as Record<string, never>,
    p_reason: reason
  });
  if (error) return { success: false, error: error.message };
  return data as unknown as OverrideInvoiceResult;
}

export async function voidInvoiceSafe(invoiceId: string, reason: string): Promise<VoidInvoiceResult> {
  if (!reason?.trim()) return { success: false, error: "Reason is required for voiding" };
  const { data, error } = await supabase.rpc('void_invoice_safe', { p_invoice_id: invoiceId, p_reason: reason });
  if (error) return { success: false, error: error.message };
  return data as unknown as VoidInvoiceResult;
}

export async function recordInvoicePaymentSafe(
  invoiceId: string,
  payment: { amount: number; paymentDate: string; bankAccountId?: string; paymentMethod?: string; reference?: string; }
): Promise<RecordPaymentResult> {
  const { data, error } = await supabase.rpc('record_invoice_payment_safe', {
    p_invoice_id: invoiceId,
    p_amount: payment.amount,
    p_payment_date: payment.paymentDate,
    p_bank_account_id: payment.bankAccountId || null,
    p_payment_method: payment.paymentMethod || null,
    p_reference: payment.reference || null
  });
  if (error) return { success: false, error: error.message };
  return data as unknown as RecordPaymentResult;
}

export async function reverseInvoicePaymentSafe(paymentId: string, reason: string): Promise<ReversePaymentResult> {
  if (!reason?.trim()) return { success: false, error: "Reason is required for reversal" };
  const { data, error } = await supabase.rpc('reverse_invoice_payment_safe', { p_payment_id: paymentId, p_reason: reason });
  if (error) return { success: false, error: error.message };
  return data as unknown as ReversePaymentResult;
}
