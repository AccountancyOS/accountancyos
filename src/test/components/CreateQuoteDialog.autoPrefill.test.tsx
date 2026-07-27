import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

/**
 * Bug: a proposal started from a lead showed "No Companies House accounts date found —
 * enter the year-end manually", even though the lead's CH profile carries
 * accounts.next_accounts.
 *
 * Root cause: two different code paths add an accounts line. Picking the service by hand
 * goes through updateLine(), which prefills the CH period. Arriving from a lead page
 * (/quotes?create=true&lead_id=…) auto-populates the default service lines from a
 * useEffect that sets only service_id / quantity / unit_price / billing_frequency — no
 * period fields at all. So the exact same lead prefilled or didn't depending on how the
 * accountant got there.
 */
beforeEach(() => {
  (Element.prototype as any).hasPointerCapture = () => false;
  (Element.prototype as any).setPointerCapture = () => {};
  (Element.prototype as any).releasePointerCapture = () => {};
  (Element.prototype as any).scrollIntoView = () => {};
});

const LEAD_ID = "22222222-2222-4222-8222-222222222222";

/** Churchills' real shape: wrapped { profile, officers }, next_accounts present. */
const LEAD = {
  id: LEAD_ID,
  first_name: "CHURCHILLS LONDON LTD",
  last_name: "",
  email: "owner@churchills.test",
  lead_type: "limited_company",
  ch_company_profile: {
    profile: {
      company_number: "13740882",
      company_name: "CHURCHILLS LONDON LTD",
      accounts: {
        next_made_up_to: "2026-04-30",
        next_due: "2027-01-31",
        next_accounts: {
          period_start_on: "2025-05-01",
          period_end_on: "2026-04-30",
          due_on: "2027-01-31",
          overdue: false,
        },
      },
    },
    officers: [],
  },
};

const ACCOUNTS_SERVICE = {
  id: "svc-accounts",
  name: "Company Accounts",
  code: "company_accounts",
  canonical_service_code: "company_accounts",
  default_price: 900,
  active: true,
};

function makeFrom() {
  return (table: string) => {
    const rows =
      table === "services_catalog" ? [ACCOUNTS_SERVICE] : table === "leads" ? [LEAD] : [];
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      insert: () => builder,
      single: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        resolve({ data: rows, error: null }),
    };
    return builder;
  };
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => makeFrom()(table),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    functions: { invoke: vi.fn().mockResolvedValue({ data: { officers: [] }, error: null }) },
  },
}));

vi.mock("@/lib/organization-context", () => ({
  useOrganization: () => ({ organization: { id: "org-1" } }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => vi.fn() };
});

// The default service lines for a limited company must include the accounts service,
// otherwise this test would prove nothing about the auto-populate path.
vi.mock("@/lib/quote-defaults", async () => {
  const actual = await vi.importActual<typeof import("@/lib/quote-defaults")>(
    "@/lib/quote-defaults",
  );
  return {
    ...actual,
    getDefaultServiceCodesForLeadType: () => [
      { code: "company_accounts", billing_frequency: "annual" as const },
    ],
  };
});

import CreateQuoteDialog from "@/components/quotes/CreateQuoteDialog";

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CreateQuoteDialog open onOpenChange={() => {}} initialLeadId={LEAD_ID} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("CreateQuoteDialog — accounts period on the auto-populated path", () => {
  it("prefills the CH accounts period when the proposal starts from a lead", async () => {
    renderDialog();

    // The period label the CH year-end 2026-04-30 produces.
    await waitFor(() => expect(screen.getByDisplayValue("2026-04-30")).toBeInTheDocument());

    // ...and therefore no "enter it manually" warning.
    expect(
      screen.queryByText(/No Companies House accounts date found/i),
    ).not.toBeInTheDocument();
  });
});
