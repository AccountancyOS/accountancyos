// Lead to Client conversion service
import { supabase } from "@/integrations/supabase/client";
import { isCompanyBasedType, getClientTypeConfig, type ClientType } from "@/lib/client-types";

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  lead_type: ClientType;
  ch_company_profile: any | null;
  notes: string | null;
  estimated_monthly_value: number | null;
}

interface ConversionResult {
  success: boolean;
  clientId?: string;
  companyId?: string;
  error?: string;
  skipped?: boolean;
}

/**
 * Check if a lead has already been converted (idempotency guard)
 */
async function isAlreadyConverted(leadId: string): Promise<{ converted: boolean; clientId?: string; companyId?: string }> {
  const { data: lead } = await supabase
    .from("leads")
    .select("converted_at, converted_to_client_id, converted_to_company_id")
    .eq("id", leadId)
    .single();

  if (lead?.converted_at) {
    return {
      converted: true,
      clientId: lead.converted_to_client_id || undefined,
      companyId: lead.converted_to_company_id || undefined,
    };
  }
  return { converted: false };
}

/**
 * Check if an engagement letter has been signed for a lead's onboarding application
 */
async function hasSignedEngagementLetter(leadId: string, organizationId: string): Promise<boolean> {
  // Check if there's an onboarding application linked to this lead with a signed EL
  const { data: applications } = await supabase
    .from("onboarding_applications")
    .select("id, engagement_letters(signed_at)")
    .eq("lead_id", leadId)
    .eq("organization_id", organizationId)
    .limit(1);

  if (!applications || applications.length === 0) return false;

  const app = applications[0];
  const letters = app.engagement_letters as any[];
  return letters?.some((l: any) => l.signed_at != null) ?? false;
}

/**
 * Convert a lead to a client or company record.
 * 
 * Guards:
 * - Idempotency: prevents duplicate conversion
 * - EL gate: requires signed engagement letter (can be bypassed with force flag)
 */
export async function convertLeadToClient(
  lead: Lead,
  organizationId: string,
  options: { force?: boolean } = {}
): Promise<ConversionResult> {
  try {
    // 1. Idempotency check — prevent duplicate conversions
    const existing = await isAlreadyConverted(lead.id);
    if (existing.converted) {
      return {
        success: true,
        skipped: true,
        clientId: existing.clientId,
        companyId: existing.companyId,
        error: "Lead has already been converted",
      };
    }

    // 2. Engagement letter gate — unless force-bypassed
    if (!options.force) {
      const elSigned = await hasSignedEngagementLetter(lead.id, organizationId);
      if (!elSigned) {
        return {
          success: false,
          error: "Engagement letter must be signed before converting a lead to a client. Send and sign the engagement letter first.",
        };
      }
    }

    const isCompanyType = isCompanyBasedType(lead.lead_type);
    const config = getClientTypeConfig(lead.lead_type);

    if (isCompanyType) {
      // Create company record
      const chProfile = lead.ch_company_profile;
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .insert({
          organization_id: organizationId,
          company_name: lead.first_name,
          email: lead.email,
          phone: lead.phone || null,
          company_number: chProfile?.company_number || null,
          notes: lead.notes || null,
        })
        .select()
        .single();

      if (companyError) {
        return { success: false, error: companyError.message };
      }

      // Create charity details if applicable
      if (lead.lead_type === "charity" && company) {
        await supabase.from("client_detail_charity").insert({
          client_id: company.id,
          organization_id: organizationId,
          charity_number: chProfile?.charity_number || null,
        });
      }

      // Mark lead as converted
      await supabase
        .from("leads")
        .update({
          converted_at: new Date().toISOString(),
          converted_to_company_id: company.id,
          status: "won",
        })
        .eq("id", lead.id);

      return { success: true, companyId: company.id };
    } else {
      // Create individual client record
      const { data: client, error: clientError } = await supabase
        .from("clients")
        .insert({
          organization_id: organizationId,
          first_name: lead.first_name,
          last_name: lead.last_name,
          email: lead.email,
          phone: lead.phone || null,
          client_type: lead.lead_type,
          notes: lead.notes || null,
        })
        .select()
        .single();

      if (clientError) {
        return { success: false, error: clientError.message };
      }

      // Create type-specific detail record
      if (client && config.detailTable) {
        if (config.detailTable === "client_detail_sa") {
          await supabase.from("client_detail_sa").insert({
            client_id: client.id,
            organization_id: organizationId,
            is_mtd: lead.lead_type === "sa_mtd",
          });
        } else if (config.detailTable === "client_detail_partnership") {
          await supabase.from("client_detail_partnership").insert({
            client_id: client.id,
            organization_id: organizationId,
          });
        } else if (config.detailTable === "client_detail_cgt") {
          await supabase.from("client_detail_cgt").insert({
            client_id: client.id,
            organization_id: organizationId,
          });
        }
      }

      // Mark lead as converted
      await supabase
        .from("leads")
        .update({
          converted_at: new Date().toISOString(),
          converted_to_client_id: client.id,
          status: "won",
        })
        .eq("id", lead.id);

      return { success: true, clientId: client.id };
    }
  } catch (error: any) {
    console.error("Lead conversion error:", error);
    return { success: false, error: error.message || "Conversion failed" };
  }
}
