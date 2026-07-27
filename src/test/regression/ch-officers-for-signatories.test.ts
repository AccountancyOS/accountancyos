import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Bug: proposal signatory selection offered no Companies House directors, even for a
 * company whose directors are plainly visible at CH. The accounts-period prefill on the
 * same screen worked, which made it look like a filtering bug.
 *
 * Root cause: `leads.ch_company_profile` stores the CH COMPANY PROFILE
 * (`/company/{number}`), which contains `accounts` — hence the working period prefill —
 * but has no `officers` field at all. Nothing ever fetched officers for a lead: the
 * officers endpoint was only reachable through the full `sync` action, which requires an
 * already-persisted company row, and a lead has none.
 *
 * This guard freezes the fix: an `officers` action on the CH edge function, a client
 * helper, storage of the wrapped `{ profile, officers }` shape at lookup time, and an
 * on-demand fetch in the proposal dialog for leads created before that.
 */
const root = resolve(__dirname, "../../../");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const OFFICERS_FN = read("supabase/functions/ch-officers/index.ts");
const SYNC_FN = read("supabase/functions/companies-house-sync/index.ts");
const CONFIG = read("supabase/config.toml");
const LOOKUP = read("src/lib/companies-house-lookup.ts");
const CRM = read("src/pages/CRM.tsx");
const DIALOG = read("src/components/quotes/CreateQuoteDialog.tsx");

describe("CH officers are reachable for a lead (signatory selection)", () => {
  it("lives in its own function, needing only a company number", () => {
    expect(OFFICERS_FN).toMatch(/\/company\/\$\{encodeURIComponent\(companyNumber\)\}\/officers/);
    // Returns the officer items under a stable key, never undefined.
    expect(OFFICERS_FN).toMatch(/Array\.isArray\(data\?\.items\) \? data\.items : \[\]/);
    // Authenticated, but no org scoping — it returns public CH data only.
    expect(OFFICERS_FN).toMatch(/supabase\.auth\.getUser\(token\)/);
    expect(OFFICERS_FN).not.toMatch(/organization_id/);
    // Registered, and JWT-verified like the other CH endpoints.
    expect(CONFIG).toMatch(/\[functions\.ch-officers\]\s*\n\s*verify_jwt = true/);
  });

  it("stays OUT of the companies-house-sync monolith", () => {
    // That function failed to deploy with the action inlined, leaving the old copy live.
    // Keeping this lookup independent is the point — it must not creep back in.
    expect(SYNC_FN).not.toMatch(/action === "officers"/);
  });

  it("can answer which commit it was deployed from", () => {
    expect(OFFICERS_FN).toMatch(/searchParams\.get\("action"\) === "version"/);
    expect(OFFICERS_FN).toMatch(/source_commit_sha/);
  });

  it("gives the client a helper that surfaces the real failure", () => {
    expect(LOOKUP).toMatch(/export async function getCompanyOfficers/);
    expect(LOOKUP).toMatch(/functions\.invoke\("ch-officers"/);
    // A missing/!array payload degrades to an empty list, never undefined.
    expect(LOOKUP).toMatch(/Array\.isArray\(officers\) \? officers : \[\]/);
    // supabase-js hides the function's own { error, ch_status } body behind
    // error.context — swallowing it made a failed deploy look like a CH outage.
    expect(LOOKUP).toMatch(/describeFunctionError/);
    expect(LOOKUP).toMatch(/context\.json\(\)/);
  });

  it("stores officers alongside the profile when a company is picked in the CRM", () => {
    expect(CRM).toMatch(/getCompanyOfficers\(/);
    expect(CRM).toMatch(/ch_company_profile: \{ profile, officers \}/);
    // Non-fatal: the lead is still created if CH officers cannot be fetched.
    expect(CRM).toMatch(/Directors not loaded/);
  });

  it("fetches officers on demand for leads that have none stored", () => {
    expect(DIALOG).toMatch(/extractActiveDirectors\(selectedLead as any\)\.length > 0\) return/);
    expect(DIALOG).toMatch(/getCompanyOfficers\(companyNumber\)/);
    // leads has no company_number column — the number comes from the stored profile.
    expect(DIALOG).toMatch(
      /stored\?\.company_number \?\? stored\?\.profile\?\.company_number \?\? null/,
    );
    // The section is fed the merged source, not the raw lead row.
    expect(DIALOG).toMatch(/chSource=\{signatoryChSource\}/);
  });
});
