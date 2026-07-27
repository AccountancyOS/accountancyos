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

const SYNC_FN = read("supabase/functions/companies-house-sync/index.ts");
const LOOKUP = read("src/lib/companies-house-lookup.ts");
const CRM = read("src/pages/CRM.tsx");
const DIALOG = read("src/components/quotes/CreateQuoteDialog.tsx");

describe("CH officers are reachable for a lead (signatory selection)", () => {
  it("exposes an officers action that needs only a company number", () => {
    expect(SYNC_FN).toMatch(/if \(action === "officers"\)/);
    expect(SYNC_FN).toMatch(/\/company\/\$\{encodeURIComponent\(companyNumber\)\}\/officers/);
    // Returns the officer items under a stable key.
    expect(SYNC_FN).toMatch(/officers: result\.data\?\.items \?\? \[\]/);
    // It must sit BEFORE the companyId/organizationId requirement, or a lead (which has
    // no company row) could never call it.
    expect(SYNC_FN.indexOf('if (action === "officers")')).toBeLessThan(
      SYNC_FN.indexOf("companyId and organizationId are required"),
    );
  });

  it("gives the client a helper for it", () => {
    expect(LOOKUP).toMatch(/export async function getCompanyOfficers/);
    expect(LOOKUP).toMatch(/action: "officers"/);
    // A missing/!array payload degrades to an empty list, never undefined.
    expect(LOOKUP).toMatch(/Array\.isArray\(officers\) \? officers : \[\]/);
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
