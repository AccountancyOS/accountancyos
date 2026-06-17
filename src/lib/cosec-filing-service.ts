/**
 * CoSec Filing Service
 * Handles creation and management of Companies House filings (CS01, AP01, TM01, etc.)
 */

import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit-service";

export type ResolutionFilingType = "AP01" | "TM01" | "TM02" | "PSC01" | "PSC04" | "PSC07" | "SH01";

export interface CS01FilingData {
  companyId: string;
  organizationId: string;
  jobId?: string;
  madeUpToDate: string;
  officers: {
    personId: string;
    name: string;
    role: string;
    appointedOn: string;
  }[];
  pscs: {
    personId: string;
    name: string;
    natureOfControl: string[];
    notifiedOn: string;
  }[];
  shareCapital: {
    classes: {
      className: string;
      nominalValue: number;
      currency: string;
      totalIssued: number;
    }[];
    totalShares: number;
  };
  sicCodes: string[];
  registeredOffice: {
    address_line_1?: string;
    address_line_2?: string;
    locality?: string;
    region?: string;
    postal_code?: string;
    country?: string;
  } | null;
  tradingStatusUnchanged: boolean;
  statementOfCapitalCorrect: boolean;
}

export interface CreateFilingResult {
  success: boolean;
  filingId?: string;
  filingType?: string;
  error?: string;
}

/**
 * Create a CS01 Confirmation Statement filing
 */
export async function createCS01Filing(data: CS01FilingData): Promise<CreateFilingResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    // Check for existing CS01 filing for this job
    if (data.jobId) {
      const { data: existing } = await supabase
        .from("filings")
        .select("id")
        .eq("job_id", data.jobId)
        .eq("filing_type", "CS01")
        .maybeSingle();
      
      if (existing) {
        return { success: true, filingId: existing.id, filingType: "CS01" };
      }
    }

    // Prepare filing data payload
    const filingPayload = {
      confirmation_statement: {
        made_up_to_date: data.madeUpToDate,
        trading_status_unchanged: data.tradingStatusUnchanged,
        statement_of_capital_correct: data.statementOfCapitalCorrect,
      },
      officers: data.officers,
      pscs: data.pscs,
      share_capital: data.shareCapital,
      sic_codes: data.sicCodes,
      registered_office: data.registeredOffice,
      prepared_by: user?.id,
      prepared_at: new Date().toISOString(),
    };

    // Calculate next due date (14 days after made up to date)
    const madeUpTo = new Date(data.madeUpToDate);
    const filingDeadline = new Date(madeUpTo);
    filingDeadline.setDate(filingDeadline.getDate() + 14);

    const { data: filing, error } = await supabase
      .from("filings")
      .insert({
        organization_id: data.organizationId,
        company_id: data.companyId,
        job_id: data.jobId,
        filing_type: "CS01",
        filing_body: "COMPANIES_HOUSE",
        period_end: data.madeUpToDate,
        filing_data: filingPayload,
        status: "draft",
      })
      .select("id")
      .single();

    if (error) {
      console.error("[CoSec Filing] Failed to create CS01:", error);
      return { success: false, error: error.message };
    }

    // Log audit
    await logAudit({
      organizationId: data.organizationId,
      entityType: "filing",
      entityId: filing.id,
      action: "create",
      metadata: {
        filing_type: "CS01",
        made_up_to_date: data.madeUpToDate,
        officers_count: data.officers.length,
        pscs_count: data.pscs.length,
      },
    });

    return { success: true, filingId: filing.id, filingType: "CS01" };
  } catch (err: any) {
    console.error("[CoSec Filing] Exception:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Create a resolution filing (AP01, TM01, etc.) to resolve discrepancies
 */
export async function createResolutionFiling(params: {
  companyId: string;
  organizationId: string;
  filingType: ResolutionFilingType;
  relatedData: any;
  discrepancyMessage: string;
  jobId?: string;
}): Promise<CreateFilingResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    const filingPayload = {
      discrepancy_resolution: true,
      discrepancy_message: params.discrepancyMessage,
      related_data: params.relatedData,
      prepared_by: user?.id,
      prepared_at: new Date().toISOString(),
    };

    // filings.job_id is NOT NULL. If the caller did not pass one, bind to the
    // most recent open CS01 job for the company so resolution filings always
    // have a parent job.
    let jobId = params.jobId;
    if (!jobId) {
      const { data: openJob } = await supabase
        .from("jobs")
        .select("id")
        .eq("company_id", params.companyId)
        .eq("organization_id", params.organizationId)
        .neq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      jobId = openJob?.id;
    }
    if (!jobId) {
      return { success: false, error: "No open job found to attach resolution filing to." };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;
    const { data: filing, error } = await client
      .from("filings")
      .insert({
        organization_id: params.organizationId,
        company_id: params.companyId,
        job_id: jobId,
        filing_type: params.filingType,
        filing_body: "COMPANIES_HOUSE",
        filing_data: filingPayload,
        status: "draft",
      })
      .select("id")
      .single();

    if (error) {
      console.error(`[CoSec Filing] Failed to create ${params.filingType}:`, error);
      return { success: false, error: error.message };
    }

    // Log audit
    await logAudit({
      organizationId: params.organizationId,
      entityType: "filing",
      entityId: filing.id,
      action: "create",
      metadata: {
        filing_type: params.filingType,
        resolution_filing: true,
        discrepancy_message: params.discrepancyMessage,
      },
    });

    return { success: true, filingId: filing.id, filingType: params.filingType };
  } catch (err: any) {
    console.error("[CoSec Filing] Exception:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Update CS01 filing with new data
 */
export async function updateCS01Filing(
  filingId: string,
  updates: Partial<CS01FilingData>
): Promise<{ success: boolean; error?: string }> {
  try {
    // Fetch existing filing
    const { data: existing, error: fetchError } = await supabase
      .from("filings")
      .select("filing_data, organization_id")
      .eq("id", filingId)
      .single();

    if (fetchError || !existing) {
      return { success: false, error: "Filing not found" };
    }

    // Merge updates
    const currentData = existing.filing_data as Record<string, any> || {};
    const updatedData = {
      ...currentData,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from("filings")
      .update({ filing_data: updatedData })
      .eq("id", filingId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    // Log audit
    await logAudit({
      organizationId: existing.organization_id,
      entityType: "filing",
      entityId: filingId,
      action: "update",
      metadata: { updated_fields: Object.keys(updates) },
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Mark CS01 as filed and trigger rollover
 */
export async function markCS01AsFiled(
  filingId: string,
  filingReference?: string
): Promise<{ success: boolean; error?: string; nextYearJobId?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    // Fetch filing details
    const { data: filing, error: fetchError } = await supabase
      .from("filings")
      .select(`
        *,
        companies(
          id,
          confirmation_statement_made_up_to,
          confirmation_statement_next_due
        )
      `)
      .eq("id", filingId)
      .single();

    if (fetchError || !filing) {
      return { success: false, error: "Filing not found" };
    }

    const filingData = filing.filing_data as Record<string, any>;
    const madeUpToDate = filingData?.confirmation_statement?.made_up_to_date;

    // Update filing status
    const { error: updateError } = await supabase
      .from("filings")
      .update({
        status: "filed",
        filed_at: new Date().toISOString(),
        filed_by: user?.id,
        filing_reference: filingReference,
        is_locked: true,
      })
      .eq("id", filingId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    // Update company confirmation statement dates
    if (madeUpToDate && filing.company_id) {
      const nextDue = new Date(madeUpToDate);
      nextDue.setFullYear(nextDue.getFullYear() + 1);

      await supabase
        .from("companies")
        .update({
          confirmation_statement_made_up_to: madeUpToDate,
          confirmation_statement_next_due: nextDue.toISOString().split("T")[0],
        })
        .eq("id", filing.company_id);

    // Create register event
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as any;
      await client
        .from("company_register_events")
        .insert({
          company_id: filing.company_id,
          event_type: "confirmation_statement_filed",
          event_date: new Date().toISOString().split("T")[0],
          source: "filing",
          filing_id: filingId,
          details: {
            made_up_to_date: madeUpToDate,
            filing_reference: filingReference,
          },
          created_by: user?.id,
        });
    }

    // Trigger auto-rollover for next year CS01
    let nextYearJobId: string | undefined;
    if (filing.job_id && madeUpToDate) {
      const rolloverResult = await createNextYearCS01Job({
        organizationId: filing.organization_id,
        companyId: filing.company_id,
        currentJobId: filing.job_id,
        currentMadeUpToDate: madeUpToDate,
        assignedTo: user?.id,
      });
      
      if (rolloverResult.success) {
        nextYearJobId = rolloverResult.jobId;
        
        // Update filing with next year job reference
        await supabase
          .from("filings")
          .update({ next_year_job_id: nextYearJobId })
          .eq("id", filingId);
      }
    }

    // Log audit
    await logAudit({
      organizationId: filing.organization_id,
      entityType: "filing",
      entityId: filingId,
      action: "file",
      metadata: {
        filing_reference: filingReference,
        made_up_to_date: madeUpToDate,
        next_year_job_id: nextYearJobId,
      },
    });

    return { success: true, nextYearJobId };
  } catch (err: any) {
    console.error("[CoSec Filing] markCS01AsFiled error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Create next year's CS01 job (auto-rollover)
 */
async function createNextYearCS01Job(params: {
  organizationId: string;
  companyId: string;
  currentJobId: string;
  currentMadeUpToDate: string;
  assignedTo?: string;
}): Promise<{ success: boolean; jobId?: string; error?: string }> {
  try {
    // Calculate next period
    const currentDate = new Date(params.currentMadeUpToDate);
    const nextMadeUpTo = new Date(currentDate);
    nextMadeUpTo.setFullYear(nextMadeUpTo.getFullYear() + 1);

    // Check for existing next year job (idempotency)
    const { data: existing } = await supabase
      .from("jobs")
      .select("id")
      .eq("organization_id", params.organizationId)
      .eq("company_id", params.companyId)
      .eq("service_type", "CS01")
      .eq("period_end", nextMadeUpTo.toISOString().split("T")[0])
      .maybeSingle();

    if (existing) {
      return { success: true, jobId: existing.id };
    }

    // Fetch original job for template
    const { data: originalJob } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", params.currentJobId)
      .single();

    // Create next year's job
    const nextJobName = `CS01 Confirmation Statement - YE ${nextMadeUpTo.toISOString().split("T")[0]}`;

    const { data: newJob, error } = await supabase
      .from("jobs")
      .insert({
        organization_id: params.organizationId,
        company_id: params.companyId,
        job_name: nextJobName,
        service_type: "CS01",
        status: "not_started",
        priority: originalJob?.priority || "medium",
        period_end: nextMadeUpTo.toISOString().split("T")[0],
        assigned_to: params.assignedTo || originalJob?.assigned_to,
        is_auto_generated: true,
        source_job_id: params.currentJobId,
        tags: originalJob?.tags,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[CoSec Filing] Failed to create next year CS01 job:", error);
      return { success: false, error: error.message };
    }

    // Create deadline for next year CS01
    const filingDeadline = new Date(nextMadeUpTo);
    filingDeadline.setDate(filingDeadline.getDate() + 14);

    await supabase
      .from("deadlines")
      .insert({
        organization_id: params.organizationId,
        company_id: params.companyId,
        job_id: newJob.id,
        name: "CS01 Confirmation Statement",
        deadline_type: "statutory",
        filing_body: "COMPANIES_HOUSE",
        due_date: filingDeadline.toISOString().split("T")[0],
        period_end: nextMadeUpTo.toISOString().split("T")[0],
        status: "pending",
        service_code: "CS01",
      });

    return { success: true, jobId: newJob.id };
  } catch (err: any) {
    console.error("[CoSec Filing] createNextYearCS01Job error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Get filing form descriptions
 */
export function getFilingFormDescription(filingType: string): string {
  const descriptions: Record<string, string> = {
    CS01: "Confirmation Statement - Annual confirmation of company information",
    AP01: "Appointment of Director - Notify CH of new director appointment",
    AP02: "Appointment of Corporate Director",
    AP03: "Appointment of Secretary",
    TM01: "Termination of Director - Notify CH director has left",
    TM02: "Termination of Secretary",
    PSC01: "Notice of individual PSC",
    PSC02: "Notice of corporate PSC",
    PSC04: "Change to PSC details",
    PSC07: "Cessation of PSC",
    SH01: "Statement of Capital - Allotment of shares",
    SH02: "Notice of consolidation, sub-division, redemption or re-conversion",
    SH03: "Return of purchase of own shares",
    CH01: "Change of registered office address",
  };
  
  return descriptions[filingType] || filingType;
}
