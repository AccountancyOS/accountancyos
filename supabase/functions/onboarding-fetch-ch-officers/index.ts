import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

// G3 — onboarding Companies House officer pre-link.
//
// Anon-callable (verify_jwt = false), token-gated edge function. It fetches a
// company's directors from Companies House during public onboarding and
// promotes them into company_persons keyed on ch_officer_id, so the "Your
// details" step pre-populates people carrying a stable person_id + ch_officer_id.
// Those keys activate the pre-link branches already built into
// approve_onboarding_transactional (G2): approval MERGES into the existing CH
// person instead of creating a duplicate.
//
// SECURITY: CH_PROD_API_KEY is a live secret read ONLY from env and used ONLY to
// build the CH Basic auth header. It is never logged, echoed, returned, or sent
// to the frontend. The onboarding access token authenticates the caller and is
// validated server-side (validate_onboarding_access_token) BEFORE any CH call or
// DB write; it is likewise never returned. CH publishes only month/year of
// birth, so a full DOB is never fabricated here.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CH_API_BASE = "https://api.company-information.service.gov.uk";

// ==================== CH types (mirror companies-house-sync) ====================

interface CHOfficer {
  name: string;
  officer_role: string;
  appointed_on?: string;
  resigned_on?: string;
  date_of_birth?: { month: number; year: number };
  nationality?: string;
  occupation?: string;
  links?: { self?: string };
}

interface PersonUpsert {
  organization_id: string;
  first_name: string;
  last_name: string;
  nationality?: string;
  occupation?: string;
  ch_officer_id?: string;
}

// ==================== Pure CH helpers (mirror companies-house-sync) ====================

/**
 * Basic auth header for Companies House. "Basic " + base64(key + ":") — key as
 * username, empty password. NOT Bearer. The key only ever flows into this header.
 */
function chBasicAuthHeader(key: string): string {
  return "Basic " + btoa(key + ":");
}

/**
 * Parses CH officer name "SURNAME, Forename" into parts. No comma => whole
 * string is the last name. (Mirrors companies-house-sync parseChName.)
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
 * Maps a CH officer to a company_persons upsert row. ch_officer_id === links.self
 * verbatim. Deliberately never writes the manual person<->SA-client link
 * column — that link must survive a resync untouched. (Mirrors
 * companies-house-sync mapChOfficerToPerson.)
 */
function mapChOfficerToPerson(o: CHOfficer, orgId: string): PersonUpsert {
  const { first_name, last_name } = parseChName(o.name);
  const result: PersonUpsert = { organization_id: orgId, first_name, last_name };
  if (o.nationality) result.nationality = o.nationality;
  if (o.occupation) result.occupation = o.occupation;
  if (o.links?.self) result.ch_officer_id = o.links.self;
  return result;
}

// ==================== CH client (never throws / never leaks) ====================

type ChFetchResult = { ok: true; data: any } | { ok: false; status: number };

async function chFetchOfficers(companyNumber: string, chApiKey: string): Promise<ChFetchResult> {
  try {
    const url = `${CH_API_BASE}/company/${encodeURIComponent(companyNumber)}/officers`;
    const resp = await fetch(url, { headers: { Authorization: chBasicAuthHeader(chApiKey) } });
    if (!resp.ok) {
      // Do NOT read/return the CH error body — it can be noisy and must not leak.
      return { ok: false, status: resp.status };
    }
    const data = await resp.json();
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0 };
  }
}

// ==================== Response helper ====================

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ==================== HTTP handler ====================

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { application_id, access_token } = await req.json();
    if (!application_id || !access_token) {
      return jsonResponse({ error: "application_id and access token are required" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Load the onboarding application (read-only; needed to resolve the org for
    // the token check and to gate on application type/status).
    const { data: app, error: appErr } = await supabase
      .from("onboarding_applications")
      .select("id, organization_id, company_number, application_type, status")
      .eq("id", application_id)
      .maybeSingle();
    if (appErr) {
      console.error("[onboarding-fetch-ch-officers] application lookup failed:", appErr.message);
      return jsonResponse({ error: "lookup_failed" }, 500);
    }
    if (!app) {
      return jsonResponse({ error: "application_not_found" }, 404);
    }

    // TOKEN GATE — must pass BEFORE any Companies House call or DB write. Uses
    // the boolean RPC (clean 401), not the RAISEing lifecycle guard.
    const { data: tokenValid, error: tokenErr } = await supabase.rpc(
      "validate_onboarding_access_token",
      { p_application_id: application_id, p_token: access_token },
    );
    if (tokenErr) {
      console.error("[onboarding-fetch-ch-officers] token validation error:", tokenErr.message);
      return jsonResponse({ error: "lookup_failed" }, 500);
    }
    if (tokenValid !== true) {
      return jsonResponse({ error: "invalid_token" }, 401);
    }

    // Do nothing for a closed application.
    if (
      app.status === "approved" ||
      app.status === "rejected" ||
      app.status === "cancelled"
    ) {
      return jsonResponse({ error: "onboarding_closed" }, 409);
    }

    // Nothing to fetch for a non-company application or one with no company
    // number — not an error, just an empty list (manual entry fallback).
    const companyNumber = (app.company_number ?? "").toString().trim();
    if (app.application_type !== "company" || !companyNumber) {
      return jsonResponse({ people: [] }, 200);
    }

    // The CH API key is a live secret. Read ONLY here; used ONLY to build the
    // Basic auth header. Never logged, echoed, or returned.
    const CH_PROD_API_KEY = Deno.env.get("CH_PROD_API_KEY");
    if (!CH_PROD_API_KEY) {
      // Generic message — never reveal anything about the secret.
      return jsonResponse({ people: [], warning: "ch_lookup_failed" }, 200);
    }

    const officersResult = await chFetchOfficers(companyNumber, CH_PROD_API_KEY);
    if (!officersResult.ok) {
      // Never leak the CH status/body or the key — the frontend just falls back
      // to manual entry on a warning.
      return jsonResponse({ people: [], warning: "ch_lookup_failed" }, 200);
    }

    const officers: CHOfficer[] = Array.isArray(officersResult.data?.items)
      ? officersResult.data.items
      : [];

    // Keep only active officers with a stable CH link (links.self). Skip
    // resigned officers and any without a dedupe key.
    const usable = officers.filter((o) => !o.resigned_on && !!o.links?.self);

    if (usable.length === 0) {
      return jsonResponse({ people: [] }, 200);
    }

    const personRows: PersonUpsert[] = [];
    for (const o of usable) {
      const row = mapChOfficerToPerson(o, app.organization_id);
      if (!row.ch_officer_id) continue;
      personRows.push(row);
    }

    if (personRows.length === 0) {
      return jsonResponse({ people: [] }, 200);
    }

    // Upsert into company_persons ONLY. There is NO companies row yet at
    // onboarding time (onboarding_applications.company_id is null pre-approval,
    // and the officer<->company link table's company_id is NOT NULL), so the
    // officer<->company link is deliberately NOT formed here — it is formed at
    // approval / a later authenticated CH sync. Keyed on
    // (organization_id, ch_officer_id) so a re-fetch merges rather than
    // duplicates; the manual person<->SA-client link column is never written by
    // the payload builder, so those manual links survive a resync untouched.
    const { data: upserted, error: upsertErr } = await supabase
      .from("company_persons")
      .upsert(personRows, { onConflict: "organization_id,ch_officer_id" })
      .select("id, ch_officer_id, first_name, last_name");
    if (upsertErr || !upserted) {
      console.error("[onboarding-fetch-ch-officers] person upsert failed:", upsertErr?.message);
      return jsonResponse({ people: [], warning: "ch_lookup_failed" }, 200);
    }

    const personIdByChOfficerId = new Map<string, string>();
    for (const p of upserted) {
      if (p.ch_officer_id) personIdByChOfficerId.set(p.ch_officer_id, p.id);
    }

    // Build the response: stable identity + display fields only, no secrets, no
    // access token, no full DOB (CH gives month/year only).
    const people = usable
      .map((o) => {
        const chOfficerId = o.links?.self;
        if (!chOfficerId) return null;
        const personId = personIdByChOfficerId.get(chOfficerId);
        if (!personId) return null;
        return {
          person_id: personId,
          ch_officer_id: chOfficerId,
          name: o.name,
          role: o.officer_role,
          date_of_birth_month: o.date_of_birth?.month ?? null,
          date_of_birth_year: o.date_of_birth?.year ?? null,
        };
      })
      .filter((p) => p !== null);

    return jsonResponse({ people }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[onboarding-fetch-ch-officers]", msg);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
