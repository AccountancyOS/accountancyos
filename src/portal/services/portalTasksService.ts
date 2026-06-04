import { supabase } from "@/integrations/supabase/client";
import type { PortalEntity, PortalTask } from "../types";

/**
 * Tasks shown to portal users come from public.client_tasks where
 * visibility = 'client_visible' and the row is scoped to the current entity.
 * job_tasks remain internal-only.
 */
export async function listPortalTasks(entity: PortalEntity | null): Promise<PortalTask[]> {
  if (!entity) return [];
  const col = entity.type === "client" ? "client_id" : "company_id";
  const { data, error } = await supabase
    .from("client_tasks")
    .select("id, title, status, due_date, job_id, visibility, task_order")
    .eq(col, entity.id)
    .eq("visibility", "client_visible")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("task_order", { ascending: true });
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    dueAt: r.due_date,
    relatedJobId: r.job_id,
  }));
}