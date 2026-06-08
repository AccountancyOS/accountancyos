import { supabase } from "@/integrations/supabase/client";
import type { PortalEntity } from "../types";

export interface PortalDeadlineRow {
  id: string;
  name: string;
  deadlineType: string | null;
  filingBody: string | null;
  serviceCode: string | null;
  dueDate: string | null;
  paymentDate: string | null;
  status: string;
  amount: number | null;
  currency: string;
}

const HORIZON_DAYS = 90;
const PAGE_LIMIT = 5;

function mapRow(r: any): PortalDeadlineRow {
  const metaAmount = r.metadata?.amount ?? r.metadata?.estimated_amount ?? null;
  const amount = metaAmount != null && !isNaN(Number(metaAmount)) ? Number(metaAmount) : null;
  return {
    id: r.id,
    name: r.name,
    deadlineType: r.deadline_type ?? null,
    filingBody: r.filing_body ?? null,
    serviceCode: r.service_code ?? null,
    dueDate: r.due_date ?? null,
    paymentDate: r.payment_date ?? null,
    status: r.status,
    amount,
    currency: r.metadata?.currency ?? "GBP",
  };
}

function horizonISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + HORIZON_DAYS);
  return d.toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function listPortalUpcomingDeadlines(
  entity: PortalEntity | null,
): Promise<PortalDeadlineRow[]> {
  if (!entity) return [];
  const col = entity.type === "client" ? "client_id" : "company_id";
  const { data, error } = await supabase
    .from("deadlines")
    .select(
      "id, name, deadline_type, filing_body, service_code, due_date, payment_date, status, metadata",
    )
    .eq(col, entity.id)
    .not("status", "in", "(completed,filed)")
    .gte("due_date", todayISO())
    .lte("due_date", horizonISO())
    .order("due_date", { ascending: true })
    .limit(PAGE_LIMIT);
  if (error || !data) return [];
  return data.map(mapRow);
}

export async function listPortalTaxPayments(
  entity: PortalEntity | null,
): Promise<PortalDeadlineRow[]> {
  if (!entity) return [];
  const col = entity.type === "client" ? "client_id" : "company_id";
  const { data, error } = await supabase
    .from("deadlines")
    .select(
      "id, name, deadline_type, filing_body, service_code, due_date, payment_date, status, metadata",
    )
    .eq(col, entity.id)
    .not("status", "in", "(completed,filed)")
    .not("payment_date", "is", null)
    .gte("payment_date", todayISO())
    .lte("payment_date", horizonISO())
    .order("payment_date", { ascending: true })
    .limit(PAGE_LIMIT);
  if (error || !data) return [];
  return data.map(mapRow);
}