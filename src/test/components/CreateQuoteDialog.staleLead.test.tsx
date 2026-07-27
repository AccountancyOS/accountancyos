import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

/**
 * Bug: creating a quote failed with
 *   insert or update on table "quotes" violates foreign key constraint "quotes_lead_id_fkey"
 *
 * Root cause: the dialog trusted its `initialLeadId` (from `/quotes?create=true&lead_id=…`)
 * and its `leadId` state without ever checking that the lead still exists in the loaded
 * list. A stale link — an old tab, the back button, a bookmark, or any lead deleted since
 * the page loaded (e.g. after wiping the data) — left `leadId` pointing at a row that is
 * gone. Radix Select renders a value with no matching option as the placeholder, so the
 * dialog LOOKED like no lead was selected while still sending the dead id to a foreign
 * key column.
 *
 * The invariant: `leadId` always refers to a lead that exists, or is empty.
 */
beforeEach(() => {
  (Element.prototype as any).hasPointerCapture = () => false;
  (Element.prototype as any).setPointerCapture = () => {};
  (Element.prototype as any).releasePointerCapture = () => {};
  (Element.prototype as any).scrollIntoView = () => {};
});

const insertMock = vi.fn();

/** Every table resolves empty — the state right after the data was wiped. */
function makeFrom() {
  return (_table: string) => {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      insert: (payload: unknown) => {
        insertMock(payload);
        return builder;
      },
      single: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        resolve({ data: [], error: null }),
    };
    return builder;
  };
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => makeFrom()(table),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
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

import CreateQuoteDialog from "@/components/quotes/CreateQuoteDialog";

function renderDialog(initialLeadId?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CreateQuoteDialog open onOpenChange={() => {}} initialLeadId={initialLeadId} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  insertMock.mockReset();
});

describe("CreateQuoteDialog — a lead that no longer exists", () => {
  it("drops a stale initialLeadId and says so instead of sending a dead foreign key", async () => {
    renderDialog("11111111-1111-4111-8111-111111111111");

    // The accountant is told the reference was dropped — silently clearing it would look
    // like the app forgot which lead they came from.
    expect(await screen.findByText(/lead .*no longer exists/i)).toBeInTheDocument();
  });

  it("never puts a non-existent lead id in the insert payload", async () => {
    renderDialog("11111111-1111-4111-8111-111111111111");

    await waitFor(() =>
      expect(screen.getByText(/lead .*no longer exists/i)).toBeInTheDocument(),
    );

    // Whatever else happens, no insert may carry the dead id.
    for (const call of insertMock.mock.calls) {
      const payload = call[0] as { lead_id?: string | null } | undefined;
      expect(payload?.lead_id ?? null).not.toBe("11111111-1111-4111-8111-111111111111");
    }
  });

  it("leaves a normal empty-start dialog alone", async () => {
    renderDialog(undefined);
    await waitFor(() => expect(screen.getByText("Lead (Optional)")).toBeInTheDocument());
    expect(screen.queryByText(/no longer exists/i)).not.toBeInTheDocument();
  });
});
