import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ==================== CH SANDBOX MOCK DATA ====================
// In production, this would call the real Companies House API

interface CHOfficer {
  name: string;
  officer_role: string;
  appointed_on: string;
  resigned_on?: string;
  date_of_birth?: { month: number; year: number };
  nationality?: string;
  country_of_residence?: string;
  occupation?: string;
  links?: { self: string };
}

interface CHPSC {
  name: string;
  natures_of_control: string[];
  notified_on: string;
  ceased_on?: string;
  date_of_birth?: { month: number; year: number };
  nationality?: string;
  country_of_residence?: string;
  links?: { self: string };
}

interface CHCompanyProfile {
  company_number: string;
  company_name: string;
  company_status: string;
  type: string;
  date_of_creation: string;
  registered_office_address: {
    address_line_1?: string;
    address_line_2?: string;
    locality?: string;
    region?: string;
    postal_code?: string;
    country?: string;
  };
  sic_codes?: string[];
  confirmation_statement?: {
    last_made_up_to?: string;
    next_due?: string;
  };
}

// Generate sandbox mock data based on company number
function generateMockCompanyProfile(companyNumber: string): CHCompanyProfile {
  console.log(`[CH Sandbox] Generating mock profile for ${companyNumber}`);
  
  return {
    company_number: companyNumber,
    company_name: `Sandbox Company ${companyNumber}`,
    company_status: "active",
    type: "ltd",
    date_of_creation: "2020-01-15",
    registered_office_address: {
      address_line_1: "123 Sandbox Street",
      locality: "London",
      postal_code: "EC1A 1BB",
      country: "United Kingdom",
    },
    sic_codes: ["62020", "62090"],
    confirmation_statement: {
      last_made_up_to: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      next_due: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    },
  };
}

function generateMockOfficers(companyNumber: string): CHOfficer[] {
  console.log(`[CH Sandbox] Generating mock officers for ${companyNumber}`);
  
  return [
    {
      name: "SMITH, John",
      officer_role: "director",
      appointed_on: "2020-01-15",
      date_of_birth: { month: 3, year: 1980 },
      nationality: "British",
      country_of_residence: "United Kingdom",
      occupation: "Company Director",
      links: { self: `/company/${companyNumber}/appointments/abc123` },
    },
    {
      name: "JONES, Sarah",
      officer_role: "secretary",
      appointed_on: "2020-06-01",
      links: { self: `/company/${companyNumber}/appointments/def456` },
    },
  ];
}

function generateMockPSCs(companyNumber: string): CHPSC[] {
  console.log(`[CH Sandbox] Generating mock PSCs for ${companyNumber}`);
  
  return [
    {
      name: "Mr John Smith",
      natures_of_control: [
        "ownership-of-shares-75-to-100-percent",
        "voting-rights-75-to-100-percent",
        "right-to-appoint-and-remove-directors",
      ],
      notified_on: "2020-01-15",
      date_of_birth: { month: 3, year: 1980 },
      nationality: "British",
      country_of_residence: "United Kingdom",
      links: { self: `/company/${companyNumber}/persons-with-significant-control/individual/ghi789` },
    },
  ];
}

// ==================== SYNC LOGIC ====================

async function syncCompanyFromCH(
  supabase: any,
  companyId: string,
  organizationId: string
) {
  console.log(`[CH Sync] Starting sync for company ${companyId}`);
  
  // Get company details from our database
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, company_number, company_name, organization_id, registered_office_address, sic_codes, company_type, confirmation_statement_made_up_to, confirmation_statement_next_due, client_id")
    .eq("id", companyId)
    .single();
  
  if (companyError || !company) {
    throw new Error(`Company not found: ${companyId}`);
  }
  
  if (company.organization_id !== organizationId) {
    throw new Error("Access denied to this company");
  }
  
  const companyNumber = company.company_number;
  if (!companyNumber) {
    throw new Error("Company number is required for CH sync");
  }
  
  // Fetch mock data from "Companies House" (sandbox)
  const chProfile = generateMockCompanyProfile(companyNumber);
  const chOfficers = generateMockOfficers(companyNumber);
  const chPSCs = generateMockPSCs(companyNumber);

  // Persist the raw CH snapshot ONLY (no field overwrites). All field changes
  // go to companies_house_diff_staging for Owner review before being applied.
  const { error: snapshotError } = await supabase
    .from("companies")
    .update({
      ch_company_profile: {
        profile: chProfile,
        officers: chOfficers,
        pscs: chPSCs,
        synced_at: new Date().toISOString(),
      },
      ch_last_synced_at: new Date().toISOString(),
    })
    .eq("id", companyId);

  if (snapshotError) {
    console.error("[CH Sync] Failed to store CH snapshot:", snapshotError);
    throw new Error(`Failed to store CH snapshot: ${snapshotError.message}`);
  }

  // Build field-level diff candidates and stage them
  const diffCandidates: Array<{ field_path: string; current: unknown; incoming: unknown }> = [
    { field_path: "registered_office_address", current: company.registered_office_address, incoming: chProfile.registered_office_address },
    { field_path: "sic_codes", current: company.sic_codes, incoming: chProfile.sic_codes },
    { field_path: "company_type", current: company.company_type, incoming: chProfile.type },
    { field_path: "confirmation_statement_made_up_to", current: company.confirmation_statement_made_up_to, incoming: chProfile.confirmation_statement?.last_made_up_to },
    { field_path: "confirmation_statement_next_due", current: company.confirmation_statement_next_due, incoming: chProfile.confirmation_statement?.next_due },
  ];

  const stagedDiffs = await stageFieldDiffs(
    supabase,
    organizationId,
    companyId,
    company.client_id ?? null,
    companyNumber,
    diffCandidates,
  );
  
  // Compare with internal registers and identify discrepancies
  const discrepancies = await compareWithInternalRegisters(
    supabase,
    companyId,
    organizationId,
    chOfficers,
    chPSCs
  );
  
  // Create sync event in register events
  await supabase.from("company_register_events").insert({
    company_id: companyId,
    event_type: "ch_sync",
    event_date: new Date().toISOString().split('T')[0],
    source: "ch_sync",
    details: {
      officers_count: chOfficers.length,
      pscs_count: chPSCs.length,
      discrepancies_found: discrepancies.length,
      staged_field_diffs: stagedDiffs,
      discrepancies: discrepancies,
    },
  });
  
  // Generate CS01 deadline if confirmation_statement_next_due is available
  let cs01DeadlineCreated = false;
  if (chProfile.confirmation_statement?.next_due) {
    const deadlineResult = await generateCS01Deadline(
      supabase,
      organizationId,
      companyId,
      chProfile.confirmation_statement.next_due,
      chProfile.confirmation_statement.last_made_up_to
    );
    cs01DeadlineCreated = deadlineResult.created;
    console.log(`[CH Sync] CS01 deadline generation: ${deadlineResult.message}`);
  }
  
  console.log(`[CH Sync] Completed sync for ${companyNumber}. Staged ${stagedDiffs} field diffs, found ${discrepancies.length} register discrepancies.`);
  
  return {
    success: true,
    companyNumber,
    profile: chProfile,
    officers: chOfficers,
    pscs: chPSCs,
    discrepancies,
    stagedFieldDiffs: stagedDiffs,
    cs01DeadlineCreated,
    syncedAt: new Date().toISOString(),
  };
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

async function stageFieldDiffs(
  supabase: any,
  organizationId: string,
  companyId: string,
  clientId: string | null,
  companyNumber: string,
  candidates: Array<{ field_path: string; current: unknown; incoming: unknown }>,
): Promise<number> {
  const changed = candidates.filter((c) => !valuesEqual(c.current, c.incoming));
  if (changed.length === 0) return 0;

  // Supersede any prior pending diffs for the same field paths on this company
  await supabase
    .from("companies_house_diff_staging")
    .update({ status: "superseded", decided_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("company_id", companyId)
    .eq("status", "pending")
    .in("field_path", changed.map((c) => c.field_path));

  const rows = changed.map((c) => ({
    organization_id: organizationId,
    company_id: companyId,
    client_id: clientId,
    company_number: companyNumber,
    field_path: c.field_path,
    current_value: c.current ?? null,
    incoming_value: c.incoming ?? null,
    source: "ch_sync",
    status: "pending",
  }));

  const { error } = await supabase.from("companies_house_diff_staging").insert(rows);
  if (error) {
    console.error("[CH Sync] Failed to stage field diffs:", error);
    return 0;
  }
  return rows.length;
}

async function generateCS01Deadline(
  supabase: any,
  organizationId: string,
  companyId: string,
  nextDueDate: string,
  madeUpToDate?: string
): Promise<{ created: boolean; message: string }> {
  try {
    // Check for existing CS01 deadline for this company with same due date
    const { data: existingDeadline } = await supabase
      .from("deadlines")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("company_id", companyId)
      .eq("service_code", "CS01")
      .eq("due_date", nextDueDate)
      .maybeSingle();

    if (existingDeadline) {
      return { created: false, message: "CS01 deadline already exists" };
    }

    const dueDate = new Date(nextDueDate);
    
    // Calculate warning date (30 days before due)
    const warningDate = new Date(dueDate);
    warningDate.setDate(warningDate.getDate() - 30);

    // Calculate active window start (90 days before due)
    const activeWindowStart = new Date(dueDate);
    activeWindowStart.setDate(activeWindowStart.getDate() - 90);

    const { error } = await supabase
      .from("deadlines")
      .insert({
        organization_id: organizationId,
        company_id: companyId,
        name: "Confirmation Statement (CS01)",
        deadline_type: "statutory",
        filing_body: "COMPANIES_HOUSE",
        service_code: "CS01",
        due_date: nextDueDate,
        period_end: madeUpToDate,
        warning_date: warningDate.toISOString().split("T")[0],
        active_window_start: activeWindowStart.toISOString().split("T")[0],
        status: "pending",
        risk_score: 0,
      });

    if (error) {
      console.error("[CH Sync] Failed to create CS01 deadline:", error);
      return { created: false, message: `Failed to create deadline: ${error.message}` };
    }

    return { created: true, message: "CS01 deadline created successfully" };
  } catch (err: any) {
    console.error("[CH Sync] Error generating CS01 deadline:", err);
    return { created: false, message: `Error: ${err.message}` };
  }
}

async function compareWithInternalRegisters(
  supabase: any,
  companyId: string,
  organizationId: string,
  chOfficers: CHOfficer[],
  chPSCs: CHPSC[]
) {
  const discrepancies: any[] = [];
  
  // Get internal officers
  const { data: internalOfficers } = await supabase
    .from("company_officers")
    .select(`
      id,
      role,
      appointed_at,
      resigned_at,
      ch_appointment_id,
      person:company_persons(
        id,
        first_name,
        last_name,
        date_of_birth,
        nationality,
        country_of_residence
      )
    `)
    .eq("company_id", companyId)
    .is("resigned_at", null);
  
  // Get internal PSCs
  const { data: internalPSCs } = await supabase
    .from("company_pscs")
    .select(`
      id,
      nature_of_control,
      notified_at,
      ceased_at,
      ch_psc_id,
      person:company_persons(
        id,
        first_name,
        last_name,
        date_of_birth,
        nationality,
        country_of_residence
      )
    `)
    .eq("company_id", companyId)
    .is("ceased_at", null);
  
  // Compare officers
  const activeChOfficers = chOfficers.filter(o => !o.resigned_on);
  
  // Officers in CH but not in internal
  for (const chOfficer of activeChOfficers) {
    const chName = chOfficer.name.toLowerCase();
    const matchingInternal = (internalOfficers || []).find((io: any) => {
      const internalName = `${io.person?.last_name}, ${io.person?.first_name}`.toLowerCase();
      return internalName === chName || 
             `${io.person?.first_name} ${io.person?.last_name}`.toLowerCase() === chName.split(', ').reverse().join(' ');
    });
    
    if (!matchingInternal) {
      discrepancies.push({
        type: "officer_missing_internal",
        chData: chOfficer,
        message: `Officer "${chOfficer.name}" (${chOfficer.officer_role}) exists in CH but not in internal registers`,
      });
    }
  }
  
  // Officers in internal but not in CH
  for (const internalOfficer of (internalOfficers || [])) {
    const internalName = `${internalOfficer.person?.last_name}, ${internalOfficer.person?.first_name}`.toUpperCase();
    const matchingCH = activeChOfficers.find(cho => 
      cho.name.toUpperCase() === internalName ||
      cho.name.toUpperCase() === `${internalOfficer.person?.first_name} ${internalOfficer.person?.last_name}`.toUpperCase()
    );
    
    if (!matchingCH) {
      discrepancies.push({
        type: "officer_missing_ch",
        internalData: internalOfficer,
        message: `Officer "${internalOfficer.person?.first_name} ${internalOfficer.person?.last_name}" exists internally but not in CH`,
      });
    }
  }
  
  // Compare PSCs
  const activeChPSCs = chPSCs.filter(p => !p.ceased_on);
  
  for (const chPSC of activeChPSCs) {
    const matchingInternal = (internalPSCs || []).find((ip: any) => {
      const internalName = `${ip.person?.first_name} ${ip.person?.last_name}`.toLowerCase();
      return chPSC.name.toLowerCase().includes(internalName) || 
             internalName.includes(chPSC.name.toLowerCase().replace(/^(mr|mrs|ms|miss|dr)\s+/i, ''));
    });
    
    if (!matchingInternal) {
      discrepancies.push({
        type: "psc_missing_internal",
        chData: chPSC,
        message: `PSC "${chPSC.name}" exists in CH but not in internal registers`,
      });
    } else {
      // Check nature of control differences
      const chControls = new Set(chPSC.natures_of_control);
      const internalControls = new Set(matchingInternal.nature_of_control || []);
      
      if (chControls.size !== internalControls.size || 
          ![...chControls].every(c => internalControls.has(c))) {
        discrepancies.push({
          type: "psc_control_mismatch",
          chData: chPSC,
          internalData: matchingInternal,
          message: `PSC "${chPSC.name}" has different nature of control between CH and internal`,
        });
      }
    }
  }
  
  for (const internalPSC of (internalPSCs || [])) {
    const internalName = `${internalPSC.person?.first_name} ${internalPSC.person?.last_name}`;
    const matchingCH = activeChPSCs.find(chp => 
      chp.name.toLowerCase().includes(internalName.toLowerCase()) ||
      internalName.toLowerCase().includes(chp.name.toLowerCase().replace(/^(mr|mrs|ms|miss|dr)\s+/i, ''))
    );
    
    if (!matchingCH) {
      discrepancies.push({
        type: "psc_missing_ch",
        internalData: internalPSC,
        message: `PSC "${internalName}" exists internally but not in CH`,
      });
    }
  }
  
  return discrepancies;
}

// ==================== HTTP HANDLER ====================

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error("[CH Sync] Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const { companyId, organizationId } = await req.json();
    
    if (!companyId || !organizationId) {
      return new Response(
        JSON.stringify({ error: "companyId and organizationId are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`[CH Sync] Request from user ${user.id} for company ${companyId}`);
    
    // Verify user has access to organization
    const { data: orgAccess, error: orgError } = await supabase
      .from("organization_users")
      .select("id")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .single();
    
    if (orgError || !orgAccess) {
      console.error("[CH Sync] Organization access denied:", orgError);
      return new Response(
        JSON.stringify({ error: "Access denied to organization" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Enforce per-org opt-in. Sync is paused for organisations that have not
    // explicitly opted in to Companies House sync.
    const { data: chIntegration, error: chIntegrationError } = await supabase
      .from("organization_integrations_companies_house")
      .select("ch_sync_opt_in")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (chIntegrationError) {
      console.error("[CH Sync] Integration lookup failed:", chIntegrationError);
      return new Response(
        JSON.stringify({ error: "Failed to verify Companies House integration" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!chIntegration?.ch_sync_opt_in) {
      console.warn(`[CH Sync] Opt-in not enabled for org ${organizationId}`);
      return new Response(
        JSON.stringify({
          error: "ch_sync_opt_in_required",
          message:
            "Companies House sync is disabled for this organisation. An Owner must enable it in Settings → Companies House.",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await syncCompanyFromCH(supabase, companyId, organizationId);
    
    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error: unknown) {
    console.error("[CH Sync] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
