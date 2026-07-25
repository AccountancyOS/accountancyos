import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

/**
 * Proposal Phase 1 T5b — VAT frequency/stagger period selection (component gate).
 *
 * Asserts that CreateQuoteDialog, once a VAT service + complete frequency/stagger
 * are chosen, calls the `generate_vat_periods` RPC with the exact args, renders
 * the returned periods as selectable candidates, and gates "Create Quote" on a
 * selected period. The supabase client (both the `.from` query chain and `.rpc`)
 * is mocked so nothing hits the network.
 */

// Radix Select needs these DOM APIs jsdom lacks.
beforeEach(() => {
  (Element.prototype as any).hasPointerCapture = () => false;
  (Element.prototype as any).setPointerCapture = () => {};
  (Element.prototype as any).releasePointerCapture = () => {};
  (Element.prototype as any).scrollIntoView = () => {};
});

const rpcMock = vi.fn();

const VAT_SERVICE = {
  id: "svc-vat",
  name: "VAT Return",
  code: "vat_return",
  canonical_service_code: "vat_return",
  default_price: 120,
  active: true,
};

// A thenable query-builder: every chained method returns itself; awaiting it
// resolves to the rows for the queried table.
function makeFrom() {
  return (table: string) => {
    const rows = table === "services_catalog" ? [VAT_SERVICE] : [];
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
        resolve({ data: rows, error: null }),
    };
    return builder;
  };
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => makeFrom()(table),
    rpc: (...args: unknown[]) => rpcMock(...args),
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

function renderDialog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CreateQuoteDialog open onOpenChange={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** Open a Radix Select (by its accessible name) and click an option. */
async function selectOption(user: ReturnType<typeof userEvent.setup>, triggerName: RegExp, optionName: RegExp) {
  const trigger = await screen.findByRole("combobox", { name: triggerName });
  await user.click(trigger);
  const option = await screen.findByRole("option", { name: optionName });
  await user.click(option);
}

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({
    data: [
      { period_start: "2025-10-01", period_end: "2025-12-31", period_label: "VAT Q/E 31 Dec 2025" },
      { period_start: "2026-01-01", period_end: "2026-03-31", period_label: "VAT Q/E 31 Mar 2026" },
    ],
    error: null,
  });
});

describe("CreateQuoteDialog — VAT period selection", () => {
  it("calls generate_vat_periods with the chosen frequency/stagger and gates submit on a period", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderDialog();

    // Pick the VAT service on the first (only) line.
    await selectOption(user, /Service for line 1/i, /VAT Return/i);

    // No RPC yet — the config is incomplete (no frequency).
    expect(rpcMock).not.toHaveBeenCalled();

    // Choose frequency = Quarterly, then stagger group 1 → config complete.
    await selectOption(user, /VAT frequency/i, /Quarterly/i);
    await selectOption(user, /VAT stagger group/i, /Group 1/i);

    // The generator is called with the exact args over the default window.
    await waitFor(() => expect(rpcMock).toHaveBeenCalled());
    const [fnName, args] = rpcMock.mock.calls.at(-1)!;
    expect(fnName).toBe("generate_vat_periods");
    expect(args).toMatchObject({ p_frequency: "quarterly", p_stagger: 1 });
    expect(args.p_from < args.p_to).toBe(true);

    // Candidate periods render as selectable buttons.
    const marchBtn = await screen.findByRole("button", { name: /VAT Q\/E 31 Mar 2026/i });

    // Submit is blocked before any period is selected.
    const createBtn = screen.getByRole("button", { name: /Create Quote/i });
    expect(createBtn).toBeDisabled();

    // Select a period; ongoing work is on by default, so the first ongoing period
    // must still be identified before submit is allowed.
    await user.click(marchBtn);
    expect(createBtn).toBeDisabled();

    await selectOption(user, /First ongoing VAT period/i, /VAT Q\/E 31 Mar 2026/i);

    await waitFor(() => expect(createBtn).toBeEnabled());
  });
});
