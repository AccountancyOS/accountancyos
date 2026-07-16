import { describe, it, expect, vi } from "vitest";

// filing-api-provider imports the supabase client at module load; the provider paths under test
// never touch it. Same convention as PortalLogin.test.tsx.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { HMRCSandboxProvider } from "@/lib/filing-api-provider";

/**
 * T1-19 / DEAD-1: the sandbox provider must never fabricate an HMRC acceptance for a standard
 * filing (SA/CT/VAT). It used to return status:"accepted" with an invented filing reference, and
 * submitFilingToAuthority writes that straight onto the filing's api_response — so wiring this path
 * up would silently mark real statutory filings as accepted by HMRC when nothing was ever sent.
 *
 * Real transport for these lives in the hmrc-*-submit edge functions. This provider has no
 * implementation, and must say so rather than lie.
 */

const baseRequest = {
  filingId: "filing-1",
  filingBody: "HMRC",
  organizationId: "org-1",
  taxYear: "2025-26",
  filingData: {},
};

describe("HMRCSandboxProvider standard filings (T1-19)", () => {
  it.each(["CT600", "SA100", "VAT_RETURN", "corporation_tax", "self_assessment"])(
    "refuses to fabricate an acceptance for %s",
    async (filingType) => {
      const provider = new HMRCSandboxProvider();

      await expect(
        provider.submitFiling({ ...baseRequest, filingType }),
      ).rejects.toThrow(/not implemented/i);
    },
  );

  it("does not export the never-imported submitFilingToAuthorityViaProvider helper", async () => {
    const mod = await import("@/lib/filing-api-provider");

    // Dead code that offered a second route to the fabricated acceptance.
    expect("submitFilingToAuthorityViaProvider" in mod).toBe(false);
  });
});
