import { supabase } from "@/integrations/supabase/client";
import type { PortalEntity, PortalPayment } from "../types";

/**
 * Read-only listing of accounts-receivable invoices issued to the entity.
 * Hosted-pay-link wiring is a Batch 3 concern; `payUrl` stays null for now.
 */
export async function listPortalPayments(
  entity: PortalEntity | null,
): Promise<PortalPayment[]> {
  if (!entity) return [];
  const col = entity.type === "client" ? "client_id" : "company_id";
  const { data, error } = await supabase
    .from("invoices")
    .select(
      "id, invoice_number, reference, total_gross, currency, status, due_date, issue_date, amount_paid, paid_at",
    )
    .eq(col, entity.id)
    .order("issue_date", { ascending: false });
  if (error || !data) return [];
  return data.map((r: any) => ({
    id: r.id,
    reference: r.invoice_number ?? r.reference ?? r.id.slice(0, 8),
    amount: Number(r.total_gross ?? 0),
    currency: r.currency ?? "GBP",
    status: r.status,
    dueAt: r.due_date,
    // Prefer the real payment timestamp; fall back to "fully paid" heuristic for legacy rows.
    paidAt: r.paid_at ?? (Number(r.amount_paid ?? 0) >= Number(r.total_gross ?? 0) ? r.issue_date : null),
    payUrl: null,
  }));
}