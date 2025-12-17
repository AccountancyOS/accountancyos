import { supabase } from "@/integrations/supabase/client";

export interface ApproveBillResult { success: boolean; bill_id?: string; status?: string; error?: string; }
export interface VoidBillResult { success: boolean; bill_id?: string; error?: string; }
export interface RecordBillPaymentResult { success: boolean; payment_id?: string; bill_status?: string; error?: string; }
export interface ReverseBillPaymentResult { success: boolean; reversal_id?: string; bill_status?: string; error?: string; }
export interface OverrideBillResult { success: boolean; bill_id?: string; error?: string; }

export async function approveBillSafe(billId: string): Promise<ApproveBillResult> {
  const { data, error } = await supabase.rpc('approve_bill_safe', { p_bill_id: billId });
  if (error) return { success: false, error: error.message };
  return data as unknown as ApproveBillResult;
}

export async function voidBillSafe(billId: string, reason: string): Promise<VoidBillResult> {
  if (!reason?.trim()) return { success: false, error: "Reason is required" };
  const { data, error } = await supabase.rpc('void_bill_safe', { p_bill_id: billId, p_reason: reason });
  if (error) return { success: false, error: error.message };
  return data as unknown as VoidBillResult;
}

export async function recordBillPaymentSafe(
  billId: string,
  payment: { amount: number; paymentDate: string; bankAccountId?: string; paymentMethod?: string; reference?: string; }
): Promise<RecordBillPaymentResult> {
  const { data, error } = await supabase.rpc('record_bill_payment_safe', {
    p_bill_id: billId,
    p_amount: payment.amount,
    p_payment_date: payment.paymentDate,
    p_bank_account_id: payment.bankAccountId || null,
    p_payment_method: payment.paymentMethod || null,
    p_reference: payment.reference || null
  });
  if (error) return { success: false, error: error.message };
  return data as unknown as RecordBillPaymentResult;
}

export async function reverseBillPaymentSafe(paymentId: string, reason: string): Promise<ReverseBillPaymentResult> {
  if (!reason?.trim()) return { success: false, error: "Reason is required" };
  const { data, error } = await supabase.rpc('reverse_bill_payment_safe', { p_payment_id: paymentId, p_reason: reason });
  if (error) return { success: false, error: error.message };
  return data as unknown as ReverseBillPaymentResult;
}

export async function overrideBillLockSafe(billId: string, changes: Record<string, unknown>, reason: string): Promise<OverrideBillResult> {
  if (!reason?.trim()) return { success: false, error: "Reason is required" };
  const { data, error } = await supabase.rpc('override_bill_lock_safe', {
    p_bill_id: billId,
    p_changes: changes as unknown as Record<string, never>,
    p_reason: reason
  });
  if (error) return { success: false, error: error.message };
  return data as unknown as OverrideBillResult;
}
