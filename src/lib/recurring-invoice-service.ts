/**
 * Recurring Invoice Service - Phase 3 Slice 5
 * Wraps the atomic server-side RPCs that generate invoices from recurring schedules.
 */
import { supabase } from "@/integrations/supabase/client";

export async function generateRecurringInvoice(
  scheduleId: string,
  userId?: string
): Promise<{ success: boolean; invoiceId?: string; autoPosted?: boolean; nextRunAt?: string; error?: string }> {
  const { data, error } = await supabase.rpc("generate_recurring_invoice", {
    p_schedule_id: scheduleId,
    p_user_id: userId ?? null,
  });
  if (error) return { success: false, error: error.message };
  const r = data as {
    success: boolean;
    invoice_id?: string;
    auto_posted?: boolean;
    next_run_at?: string;
    error_message?: string;
  };
  if (!r?.success) return { success: false, error: r?.error_message || "Failed to generate recurring invoice" };
  return {
    success: true,
    invoiceId: r.invoice_id,
    autoPosted: r.auto_posted,
    nextRunAt: r.next_run_at,
  };
}

export async function processDueRecurringInvoices(
  organizationId?: string,
  limit = 100
): Promise<{ success: boolean; processed?: number; failed?: number; error?: string }> {
  const { data, error } = await supabase.rpc("process_due_recurring_invoices", {
    p_organization_id: organizationId ?? null,
    p_limit: limit,
  });
  if (error) return { success: false, error: error.message };
  const r = data as { success: boolean; processed?: number; failed?: number };
  return { success: true, processed: r?.processed ?? 0, failed: r?.failed ?? 0 };
}