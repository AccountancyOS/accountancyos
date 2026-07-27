import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { VERSION } from "./VERSION.ts";

/**
 * Companies House officers for a bare company number.
 *
 * WHY THIS IS ITS OWN FUNCTION. A lead has no persisted company row, and the only
 * officer lookups that existed both require one: `companies-house-sync`'s full sync
 * (companyId + organizationId) and `onboarding-fetch-ch-officers` (application_id +
 * access token). So proposal signatory selection — which offers the active directors —
 * had nothing to call, because `leads.ch_company_profile` stores the CH company profile,
 * which contains no officers.
 *
 * The action was first added to companies-house-sync, but that ~1,200-line function
 * failed to deploy and the old copy stayed live, so the new action 404'd its way into a
 * fall-through 400. This does one thing, has one dependency, and carries its own version
 * stamp so "did it actually deploy?" is answerable rather than inferred.
 *
 * Returns only public Companies House data, so it needs an authenticated user but no
 * organization scoping — the same surface as companies-house-sync's `search`/`profile`.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

console.log(
  "[boot] ch-officers source_sha",
  VERSION.source_commit_sha,
  "release_id",
  VERSION.release_id,
);

const CH_API_BASE = "https://api.company-information.service.gov.uk";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Basic auth header for Companies House API calls.
 * Format: "Basic " + base64(key + ":") — key as username, empty password. NOT Bearer.
 * The key is never logged; it only ever flows into this header.
 */
function chBasicAuthHeader(key: string): string {
  return "Basic " + btoa(key + ":");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Deploy attestation probe — answerable without a body or a CH key.
  if (new URL(req.url).searchParams.get("action") === "version") {
    return jsonResponse({
      function: "ch-officers",
      source_commit_sha: VERSION.source_commit_sha,
      release_id: VERSION.release_id,
      built_at: VERSION.built_at,
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "No authorization header" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("[ch-officers] Auth error:", authError);
      return jsonResponse({ error: "Invalid token" }, 401);
    }

    const payload = await req.json().catch(() => ({}));
    const companyNumber: string = (payload.company_number || "")
      .toString()
      .trim()
      .toUpperCase();

    if (!companyNumber) {
      return jsonResponse({ error: "company_number is required" }, 400);
    }

    // The CH API key is a live secret held in edge-function secrets. It is read ONLY
    // here and used ONLY to build the Authorization header — never logged or echoed.
    const CH_PROD_API_KEY = Deno.env.get("CH_PROD_API_KEY");
    if (!CH_PROD_API_KEY) {
      return jsonResponse({ error: "Companies House API key is not configured" }, 500);
    }

    const url = new URL(`${CH_API_BASE}/company/${encodeURIComponent(companyNumber)}/officers`);
    url.searchParams.set("items_per_page", "100");

    let resp: Response;
    try {
      resp = await fetch(url.toString(), {
        headers: { Authorization: chBasicAuthHeader(CH_PROD_API_KEY) },
      });
    } catch (e) {
      // Network-level failure talking to CH. Never crash the function.
      console.error("[ch-officers] CH fetch failed:", e);
      return jsonResponse({ error: "Could not reach Companies House", ch_status: 0 }, 502);
    }

    if (!resp.ok) {
      console.error(`[ch-officers] CH returned ${resp.status} for ${companyNumber}`);
      return jsonResponse(
        { error: "Companies House officers lookup failed", ch_status: resp.status },
        502,
      );
    }

    const data = await resp.json();
    const officers = Array.isArray(data?.items) ? data.items : [];
    console.log(`[ch-officers] ${companyNumber}: ${officers.length} officer(s)`);

    return jsonResponse({ officers, company_number: companyNumber });
  } catch (error) {
    console.error("[ch-officers] Unexpected error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
