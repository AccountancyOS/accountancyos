import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CH_API_BASE = "https://api.company-information.service.gov.uk";

// ==================== Companies House Public Data API types ====================
// Mirrors src/lib/companies-house-live.ts. Edge functions cannot import from
// src/, so the pure helpers below are re-implemented inline and pinned by
// src/test/regression/companies-house-sync-live.test.ts.

interface CHOfficer {
  name: string;
  officer_role: string;
  appointed_on: string;
  resigned_on?: string;
  date_of_birth?: { month: number; year: number };
  nationality?: string;
  country_of_residence?: string;
  occupation?: string;
  links?: { self?: string };
}

interface CHPSC {
  name: string;
  natures_of_control: string[];
  notified_on: string;
  ceased_on?: string;
  date_of_birth?: { month: number; year: number };
  nationality?: string;
  country_of_residence?: string;
  links?: { self?: string };
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
  accounts?: {
    next_made_up_to?: string;
    next_due?: string;
    last_accounts?: { made_up_to?: string };
  };
  confirmation_statement?: {
    last_made_up_to?: string;
    next_due?: string;
  };
}

interface PersonUpsert {
  organization_id: string;
  first_name: string;
  last_name: string;
  nationality?: string;
  occupation?: string;
  ch_officer_id?: string;
}

interface OfficerRow {
  company_id: string;
  person_id: string;
  role: "director" | "secretary" | "llp_member" | "llp_designated_member";
  appointed_at: string;
  resigned_at: string | null;
  ch_appointment_id?: string;
}

// ==================== Pure CH helpers (mirrors src/lib/companies-house-live.ts) ====================

/**
 * Basic auth header for Companies House API calls.
 * Format: "Basic " + base64(key + ":") — key as username, empty password.
 * NOT Bearer. The key is never logged; it only ever flows into this header.
 */
function chBasicAuthHeader(key: string): string {
  return "Basic " + btoa(key + ":");
}

/**
 * Parses Companies House officer name format "SURNAME, Forename" into parts.
 * If no comma is found, treats the whole string as last_name.
 */
function parseChName(chName: string): { first_name: string; last_name: string } {
  const parts = chName.split(",");
  if (parts.length < 2) {
    return { first_name: "", last_name: chName };
  }
  return {
    last_name: parts[0].trim(),
    first_name: parts.slice(1).join(",").trim(),
  };
}

/**
 * Maps a CH officer to a company_persons upsert row.
 * Deliberately never includes `linked_client_id` — that is a manual
 * person<->SA-client link and must survive a resync untouched.
 */
function mapChOfficerToPerson(o: CHOfficer, orgId: string): PersonUpsert {
  const { first_name, last_name } = parseChName(o.name);

  const result: PersonUpsert = {
    organization_id: orgId,
    first_name,
    last_name,
  };

  if (o.nationality) result.nationality = o.nationality;
  if (o.occupation) result.occupation = o.occupation;
  if (o.links?.self) result.ch_officer_id = o.links.self;

  return result;
}

/**
 * Maps a CH officer to a company_officers upsert row.
 * Role mapping: secretary -> secretary; llp-member -> llp_member;
 * llp-designated-member -> llp_designated_member; anything else -> director.
 */
function mapChOfficerToOfficerRow(o: CHOfficer, companyId: string, personId: string): OfficerRow {
  let role: OfficerRow["role"];
  switch (o.officer_role.toLowerCase()) {
    case "secretary":
      role = "secretary";
      break;
    case "llp-member":
      role = "llp_member";
      break;
    case "llp-designated-member":
      role = "llp_designated_member";
      break;
    case "director":
    default:
      role = "director";
      break;
  }

  const result: OfficerRow = {
    company_id: companyId,
    person_id: personId,
    role,
    appointed_at: o.appointed_on,
    resigned_at: o.resigned_on ?? null,
  };

  if (o.links?.self) result.ch_appointment_id = o.links.self;

  return result;
}

// ==================== Companies House API client ====================
// Never throws. Callers inspect `.ok` and translate any non-2xx CH response
// into a clean `{ error, ch_status }` payload instead of crashing — this is
// the fix for the live runtime error.

type ChFetchResult = { ok: true; data: any } | { ok: false; status: number };

async function chFetchJson(
  path: string,
  chApiKey: string,
  params?: Record<string, string>,
): Promise<ChFetchResult> {
  try {
    const url = new URL(`${CH_API_BASE}${path}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    }
    const resp = await fetch(url.toString(), {
      headers: { Authorization: chBasicAuthHeader(chApiKey) },
    });
    if (!resp.ok) {
      return { ok: false, status: resp.status };
    }
    const data = await resp.json();
    return { ok: true, data };
  } catch {
    // Network-level failure talking to CH. Never crash the function.
    return { ok: false, status: 0 };
  }
}

// ==================== SYNC LOGIC ====================

type SyncOutcome =
  | {
      success: true;
      companyNumber: string;
      profile: CHCompanyProfile;
      officers: CHOfficer[];
      pscs: CHPSC[];
      discrepancies: any[];
      stagedFieldDiffs: number;
      cs01DeadlineCreated: boolean;
      promotedOfficers: number;
      syncedAt: string;
    }
  | { error: string; ch_status?: number };

async function syncCompanyFromCH(
  supabase: any,
  companyId: string,
  organizationId: string,
  chApiKey: string,
): Promise<SyncOutcome> {
  // Get company details from our database
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select(
      "id, company_number, company_name, organization_id, registered_office_address, sic_codes, company_type, confirmation_statement_made_up_to, confirmation_statement_next_due, client_id",
    )
    .eq("id", companyId)
    .single();

  if (companyError || !company) {
    return { error: `Company not found: ${companyId}` };
  }

  if (company.organization_id !== organizationId) {
    return { error: "Access denied to this company" };
  }

  const companyNumber: string | undefined = company.company_number;
  if (!companyNumber) {
    return { error: "Company number is required for CH sync" };
  }

  // Fetch live data from the Companies House Public Data API.
  const profileResult = await chFetchJson(`/company/${encodeURIComponent(companyNumber)}`, chApiKey);
  if (!profileResult.ok) {
    return { error: "Companies House profile lookup failed", ch_status: profileResult.status };
  }
  const chProfile: CHCompanyProfile = profileResult.data;

  const officersResult = await chFetchJson(
    `/company/${encodeURIComponent(companyNumber)}/officers`,
    chApiKey,
  );
  if (!officersResult.ok) {
    return { error: "Companies House officers lookup failed", ch_status: officersResult.status };
  }
  const chOfficers: CHOfficer[] = officersResult.data?.items ?? [];

  // PSC endpoint returns 404 for companies with no PSC statement on record —
  // that is a normal, non-error outcome, so treat it as an empty list.
  let chPSCs: CHPSC[] = [];
  const pscResult = await chFetchJson(
    `/company/${encodeURIComponent(companyNumber)}/persons-with-significant-control`,
    chApiKey,
  );
  if (pscResult.ok) {
    chPSCs = pscResult.data?.items ?? [];
  } else if (pscResult.status !== 404) {
    return { error: "Companies House PSC lookup failed", ch_status: pscResult.status };
  }

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
    return { error: `Failed to store CH snapshot: ${snapshotError.message}` };
  }

  // Build field-level diff candidates and stage them
  const diffCandidates: Array<{ field_path: string; current: unknown; incoming: unknown }> = [
    {
      field_path: "registered_office_address",
      current: company.registered_office_address,
      incoming: chProfile.registered_office_address,
    },
    { field_path: "sic_codes", current: company.sic_codes, incoming: chProfile.sic_codes },
    { field_path: "company_type", current: company.company_type, incoming: chProfile.type },
    {
      field_path: "confirmation_statement_made_up_to",
      current: company.confirmation_statement_made_up_to,
      incoming: chProfile.confirmation_statement?.last_made_up_to,
    },
    {
      field_path: "confirmation_statement_next_due",
      current: company.confirmation_statement_next_due,
      incoming: chProfile.confirmation_statement?.next_due,
    },
  ];

  const stagedDiffs = await stageFieldDiffs(
    supabase,
    organizationId,
    companyId,
    company.client_id ?? null,
    companyNumber,
    diffCandidates,
  );

  // Phase 2 columns (companies.accounts_next_made_up_to / accounts_next_due)
  // may not exist in the live schema yet. This write is best-effort and must
  // never abort the sync — officer promotion and everything below it must
  // still run even if it fails.
  await persistAccountsDatesNonFatal(supabase, companyId, chProfile);

  // Promote CH officers into the person spine (company_persons +
  // company_officers). Non-fatal: a promotion failure must not abort the
  // rest of the sync (diff staging / CS01 deadline / discrepancy detection).
  const promotion = await promoteOfficersToPersonSpine(supabase, organizationId, companyId, chOfficers);
  if (promotion.error) {
    console.error("[CH Sync] Officer promotion failed (non-fatal):", promotion.error);
  }

  // Compare with internal registers and identify discrepancies
  const discrepancies = await compareWithInternalRegisters(supabase, companyId, chOfficers, chPSCs);

  // Create sync event in register events
  await supabase.from("company_register_events").insert({
    company_id: companyId,
    event_type: "ch_sync",
    event_date: new Date().toISOString().split("T")[0],
    source: "ch_sync",
    details: {
      officers_count: chOfficers.length,
      pscs_count: chPSCs.length,
      discrepancies_found: discrepancies.length,
      staged_field_diffs: stagedDiffs,
      promoted_officers: promotion.promoted,
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
      chProfile.confirmation_statement.last_made_up_to,
    );
    cs01DeadlineCreated = deadlineResult.created;
  }

  return {
    success: true,
    companyNumber,
    profile: chProfile,
    officers: chOfficers,
    pscs: chPSCs,
    discrepancies,
    stagedFieldDiffs: stagedDiffs,
    cs01DeadlineCreated,
    promotedOfficers: promotion.promoted,
    syncedAt: new Date().toISOString(),
  };
}

/**
 * Persists accounts.next_made_up_to / next_due from the CH profile onto the
 * new companies columns. These columns are added by a later migration and
 * may not exist yet in the live schema — a failure here is swallowed so it
 * can never abort the sync.
 */
async function persistAccountsDatesNonFatal(
  supabase: any,
  companyId: string,
  chProfile: CHCompanyProfile,
): Promise<void> {
  const accountsNextMadeUpTo = chProfile.accounts?.next_made_up_to ?? null;
  const accountsNextDue = chProfile.accounts?.next_due ?? null;
  if (!accountsNextMadeUpTo && !accountsNextDue) return;

  try {
    const { error } = await supabase
      .from("companies")
      .update({
        accounts_next_made_up_to: accountsNextMadeUpTo,
        accounts_next_due: accountsNextDue,
      })
      .eq("id", companyId);
    if (error) {
      console.warn(
        "[CH Sync] accounts_next_made_up_to/accounts_next_due write skipped (non-fatal):",
        error.message,
      );
    }
  } catch (err) {
    console.warn("[CH Sync] accounts date persistence failed (non-fatal):", err);
  }
}

/**
 * Promotes CH officers into the person spine.
 *
 * company_persons is upserted on `ch_officer_id` and NEVER writes
 * `linked_client_id` — that is a manual person<->SA-client link that must
 * survive a resync untouched (upsert only overwrites columns present in the
 * payload, so simply omitting the column is sufficient).
 *
 * company_officers is upserted on `ch_appointment_id`.
 *
 * Officers without a stable CH link (`links.self`) are skipped for
 * promotion — there is no safe dedupe key for them — but never cause an
 * error.
 */
async function promoteOfficersToPersonSpine(
  supabase: any,
  organizationId: string,
  companyId: string,
  chOfficers: CHOfficer[],
): Promise<{ promoted: number; error?: string }> {
  try {
    const personRows: PersonUpsert[] = [];
    for (const o of chOfficers) {
      const person = mapChOfficerToPerson(o, organizationId);
      if (!person.ch_officer_id) continue;
      personRows.push(person);
    }
    if (personRows.length === 0) return { promoted: 0 };

    const { data: upsertedPersons, error: personsError } = await supabase
      .from("company_persons")
      .upsert(personRows, { onConflict: "ch_officer_id" })
      .select("id, ch_officer_id");

    if (personsError || !upsertedPersons) {
      return { promoted: 0, error: personsError?.message ?? "Failed to upsert company_persons" };
    }

    const personIdByChOfficerId = new Map<string, string>();
    for (const p of upsertedPersons) {
      if (p.ch_officer_id) personIdByChOfficerId.set(p.ch_officer_id, p.id);
    }

    const officerRows: OfficerRow[] = [];
    for (const o of chOfficers) {
      const chOfficerId = o.links?.self;
      if (!chOfficerId) continue;
      const personId = personIdByChOfficerId.get(chOfficerId);
      if (!personId) continue;
      const row = mapChOfficerToOfficerRow(o, companyId, personId);
      if (!row.ch_appointment_id) continue;
      officerRows.push(row);
    }

    if (officerRows.length === 0) return { promoted: 0 };

    const { error: officersError } = await supabase
      .from("company_officers")
      .upsert(officerRows, { onConflict: "ch_appointment_id" });

    if (officersError) {
      return { promoted: 0, error: officersError.message };
    }

    return { promoted: officerRows.length };
  } catch (err: any) {
    return { promoted: 0, error: err?.message ?? "Officer promotion error" };
  }
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
  madeUpToDate?: string,
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

    const { error } = await supabase.from("deadlines").insert({
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
  chOfficers: CHOfficer[],
  chPSCs: CHPSC[],
) {
  const discrepancies: any[] = [];

  // Get internal officers
  const { data: internalOfficers } = await supabase
    .from("company_officers")
    .select(
      `
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
    `,
    )
    .eq("company_id", companyId)
    .is("resigned_at", null);

  // Get internal PSCs
  const { data: internalPSCs } = await supabase
    .from("company_pscs")
    .select(
      `
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
    `,
    )
    .eq("company_id", companyId)
    .is("ceased_at", null);

  // Compare officers
  const activeChOfficers = chOfficers.filter((o) => !o.resigned_on);

  // Officers in CH but not in internal
  for (const chOfficer of activeChOfficers) {
    const chName = chOfficer.name.toLowerCase();
    const matchingInternal = (internalOfficers || []).find((io: any) => {
      const internalName = `${io.person?.last_name}, ${io.person?.first_name}`.toLowerCase();
      return (
        internalName === chName ||
        `${io.person?.first_name} ${io.person?.last_name}`.toLowerCase() ===
          chName.split(", ").reverse().join(" ")
      );
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
  for (const internalOfficer of internalOfficers || []) {
    const internalName = `${internalOfficer.person?.last_name}, ${internalOfficer.person?.first_name}`.toUpperCase();
    const matchingCH = activeChOfficers.find(
      (cho) =>
        cho.name.toUpperCase() === internalName ||
        cho.name.toUpperCase() ===
          `${internalOfficer.person?.first_name} ${internalOfficer.person?.last_name}`.toUpperCase(),
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
  const activeChPSCs = chPSCs.filter((p) => !p.ceased_on);

  for (const chPSC of activeChPSCs) {
    const matchingInternal = (internalPSCs || []).find((ip: any) => {
      const internalName = `${ip.person?.first_name} ${ip.person?.last_name}`.toLowerCase();
      return (
        chPSC.name.toLowerCase().includes(internalName) ||
        internalName.includes(chPSC.name.toLowerCase().replace(/^(mr|mrs|ms|miss|dr)\s+/i, ""))
      );
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

      if (
        chControls.size !== internalControls.size ||
        ![...chControls].every((c) => internalControls.has(c))
      ) {
        discrepancies.push({
          type: "psc_control_mismatch",
          chData: chPSC,
          internalData: matchingInternal,
          message: `PSC "${chPSC.name}" has different nature of control between CH and internal`,
        });
      }
    }
  }

  for (const internalPSC of internalPSCs || []) {
    const internalName = `${internalPSC.person?.first_name} ${internalPSC.person?.last_name}`;
    const matchingCH = activeChPSCs.find(
      (chp) =>
        chp.name.toLowerCase().includes(internalName.toLowerCase()) ||
        internalName.toLowerCase().includes(chp.name.toLowerCase().replace(/^(mr|mrs|ms|miss|dr)\s+/i, "")),
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

// ==================== Response helpers ====================

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ==================== HTTP HANDLER ====================
// The entire handler is wrapped so that no path — a bad CH response, a
// missing key, a DB error, an unexpected exception — ever crashes the
// function. Every branch returns a clean JSON response.

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
      return jsonResponse({ error: "No authorization header" }, 401);
    }

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("[CH Sync] Auth error:", authError);
      return jsonResponse({ error: "Invalid token" }, 401);
    }

    const payload = await req.json();
    const action: string = payload.action || "sync";

    // The CH API key is a live secret held in edge-function secrets. It is
    // read ONLY here and only ever used to build the Authorization header —
    // it is never logged, echoed, or included in any response.
    const CH_PROD_API_KEY = Deno.env.get("CH_PROD_API_KEY");

    if (!CH_PROD_API_KEY) {
      return jsonResponse({ error: "Companies House API key is not configured" }, 500);
    }

    if (action === "search") {
      const query: string = (payload.query || "").trim();
      if (!query) {
        return jsonResponse({ items: [], total_results: 0 }, 200);
      }
      const result = await chFetchJson("/search/companies", CH_PROD_API_KEY, {
        q: query,
        items_per_page: "20",
      });
      if (!result.ok) {
        return jsonResponse(
          { error: "Companies House search failed", ch_status: result.status },
          502,
        );
      }
      return jsonResponse(result.data, 200);
    }

    if (action === "profile") {
      const companyNumber: string = (payload.company_number || "").toString().trim().toUpperCase();
      if (!companyNumber) {
        return jsonResponse({ error: "company_number is required" }, 400);
      }
      const result = await chFetchJson(`/company/${encodeURIComponent(companyNumber)}`, CH_PROD_API_KEY);
      if (!result.ok) {
        return jsonResponse(
          { error: "Companies House profile lookup failed", ch_status: result.status },
          502,
        );
      }
      return jsonResponse(result.data, 200);
    }

    const { companyId, organizationId } = payload;

    if (!companyId || !organizationId) {
      return jsonResponse({ error: "companyId and organizationId are required" }, 400);
    }

    // Verify user has access to organization
    const { data: orgAccess, error: orgError } = await supabase
      .from("organization_users")
      .select("id")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .single();

    if (orgError || !orgAccess) {
      console.error("[CH Sync] Organization access denied:", orgError);
      return jsonResponse({ error: "Access denied to organization" }, 403);
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
      return jsonResponse({ error: "Failed to verify Companies House integration" }, 500);
    }

    if (!chIntegration?.ch_sync_opt_in) {
      return jsonResponse(
        {
          error: "ch_sync_opt_in_required",
          message:
            "Companies House sync is disabled for this organisation. An Owner must enable it in Settings → Companies House.",
        },
        409,
      );
    }

    const result = await syncCompanyFromCH(supabase, companyId, organizationId, CH_PROD_API_KEY);

    if ("error" in result) {
      return jsonResponse(result, result.ch_status ? 502 : 500);
    }

    return jsonResponse(result, 200);
  } catch (error: unknown) {
    console.error("[CH Sync] Unhandled error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return jsonResponse({ error: errorMessage }, 500);
  }
});
