import { supabase } from "@/integrations/supabase/client";
import type {
  PortalAccessRecord,
  PortalClientProfile,
  PortalEntity,
  PortalUserContext,
} from "../types";

/**
 * Real-data wiring (Batch 2).
 * - Source of truth: public.portal_access (RLS: user_id = auth.uid()).
 * - Active rows only: status='active' AND is_active=true.
 */
export async function getPortalUserContext(): Promise<PortalUserContext | null> {
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) return null;

  const { data: rows, error } = await supabase
    .from("portal_access")
    .select("id, organization_id, client_id, company_id, role, is_active, status")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .eq("status", "active");

  if (error || !rows || rows.length === 0) return null;

  const access: PortalAccessRecord[] = rows.map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    clientId: r.client_id,
    companyId: r.company_id,
    role: r.role,
    isActive: !!r.is_active,
  }));

  return {
    userId: user.id,
    email: user.email ?? "",
    organizationId: access[0].organizationId,
    access,
  };
}

export async function listPortalEntities(): Promise<PortalEntity[]> {
  const ctx = await getPortalUserContext();
  if (!ctx) return [];

  const clientIds = ctx.access.map((a) => a.clientId).filter((x): x is string => !!x);
  const companyIds = ctx.access.map((a) => a.companyId).filter((x): x is string => !!x);

  const [clientsRes, companiesRes] = await Promise.all([
    clientIds.length
      ? supabase
          .from("clients")
          .select("id, organization_id, first_name, last_name, utr")
          .in("id", clientIds)
      : Promise.resolve({ data: [], error: null } as const),
    companyIds.length
      ? supabase
          .from("companies")
          .select("id, organization_id, company_name, company_number, utr")
          .in("id", companyIds)
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  const out: PortalEntity[] = [];
  for (const c of (clientsRes.data ?? []) as any[]) {
    const fullName = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
    out.push({
      id: c.id,
      type: "client",
      displayName: fullName || "Client",
      organizationId: c.organization_id,
      taxReference: c.utr ?? null,
      registrationNumber: null,
    });
  }
  for (const c of (companiesRes.data ?? []) as any[]) {
    out.push({
      id: c.id,
      type: "company",
      displayName: c.company_name ?? "Company",
      organizationId: c.organization_id,
      registrationNumber: c.company_number ?? null,
      taxReference: c.utr ?? null,
    });
  }
  return out;
}

export async function getPortalClientProfile(): Promise<PortalClientProfile | null> {
  const entities = await listPortalEntities();
  const entity = entities[0];
  if (!entity) return null;
  return { entity, primaryContactName: null, primaryContactEmail: null };
}