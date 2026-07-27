import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ProposalSignatoriesSection } from "@/components/quotes/ProposalSignatoriesSection";
import { emptySnapshot, type SignatorySnapshot } from "@/lib/proposal/signatories";

/**
 * Proposal Phase 2 T2e — the Signatories step (component gate).
 *
 * Confirms the section sources ACTIVE CH directors from the already-loaded
 * ch_company_profile (resigned excluded, never re-fetched), defaults SA
 * individuals to the sole signatory, preserves manually typed emails, and
 * defaults the signing rule to all-must-sign.
 */

// Radix components need these DOM APIs jsdom lacks.
beforeEach(() => {
  (Element.prototype as any).hasPointerCapture = () => false;
  (Element.prototype as any).setPointerCapture = () => {};
  (Element.prototype as any).releasePointerCapture = () => {};
  (Element.prototype as any).scrollIntoView = () => {};
});

const COMPANY_SOURCE = {
  ch_company_profile: {
    profile: { company_name: "Acme Ltd" },
    officers: [
      { name: "LOVELACE, Ada", officer_role: "director", appointed_on: "2020-01-01", links: { self: "/a" } },
      { name: "BABBAGE, Charles", officer_role: "director", appointed_on: "2019-01-01", resigned_on: "2021-06-01", links: { self: "/b" } },
    ],
  },
};

/** A controlled host so onChange round-trips into the value prop, like the dialog. */
function Host({
  leadType,
  chSource,
  individual,
  initial = null,
}: {
  leadType: any;
  chSource: any;
  individual: { name: string; email: string } | null;
  initial?: SignatorySnapshot | null;
}) {
  const [snap, setSnap] = useState<SignatorySnapshot | null>(initial);
  return (
    <ProposalSignatoriesSection
      leadType={leadType}
      chSource={chSource}
      individual={individual}
      value={snap}
      onChange={setSnap}
    />
  );
}

describe("ProposalSignatoriesSection", () => {
  it("lists active CH directors and excludes resigned ones", () => {
    render(<Host leadType="limited_company" chSource={COMPANY_SOURCE} individual={null} />);
    expect(screen.getByText("Ada LOVELACE")).toBeInTheDocument();
    expect(screen.queryByText("Charles BABBAGE")).not.toBeInTheDocument();
  });

  it("selecting a director adds them as an editable signatory and preserves a typed email", async () => {
    const user = userEvent.setup();
    render(<Host leadType="limited_company" chSource={COMPANY_SOURCE} individual={null} />);

    await user.click(screen.getByLabelText("Select Ada LOVELACE as a signatory"));

    const emailInput = screen.getByLabelText("Email for Ada LOVELACE") as HTMLInputElement;
    await user.type(emailInput, "ada@acme.co");
    expect((screen.getByLabelText("Email for Ada LOVELACE") as HTMLInputElement).value).toBe("ada@acme.co");

    // Default rule is all-must-sign.
    expect(screen.getByText("All must sign")).toBeInTheDocument();
  });

  it("defaults an SA/individual to the sole primary signatory", async () => {
    render(
      <Host
        leadType="sa_non_mtd"
        chSource={null}
        individual={{ name: "Sam Sole", email: "sam@sole.co" }}
      />
    );
    const nameInput = (await screen.findByDisplayValue("Sam Sole")) as HTMLInputElement;
    expect(nameInput).toBeInTheDocument();
    expect(screen.getByDisplayValue("sam@sole.co")).toBeInTheDocument();
    // No CH director list / signing-rule selector for an individual.
    expect(screen.queryByText("Companies House directors")).not.toBeInTheDocument();
  });

  /**
   * Regression: a manually added signatory's row identity must NOT be derived from the
   * fields being edited. It used to be `manual:<name>:<email>`, so every keystroke
   * changed the React key, unmounted the row and remounted a fresh input — the field
   * lost focus after one character. Director rows were keyed on their CH id, which is
   * why the tests above never caught it.
   */
  it("keeps focus while typing a manual signatory's name and email", async () => {
    const user = userEvent.setup();
    render(<Host leadType="limited_company" chSource={COMPANY_SOURCE} individual={null} />);

    await user.click(screen.getByRole("button", { name: /add signatory/i }));

    const nameInput = screen.getByPlaceholderText("Signatory name") as HTMLInputElement;
    await user.type(nameInput, "Grace Hopper");
    expect((screen.getByPlaceholderText("Signatory name") as HTMLInputElement).value).toBe(
      "Grace Hopper",
    );

    const emailInput = screen.getByPlaceholderText("name@example.com") as HTMLInputElement;
    await user.type(emailInput, "grace@navy.mil");
    expect((screen.getByPlaceholderText("name@example.com") as HTMLInputElement).value).toBe(
      "grace@navy.mil",
    );
  });

  it("keeps two manual signatories independently editable", async () => {
    const user = userEvent.setup();
    render(<Host leadType="limited_company" chSource={COMPANY_SOURCE} individual={null} />);

    await user.click(screen.getByRole("button", { name: /add signatory/i }));
    await user.click(screen.getByRole("button", { name: /add signatory/i }));

    const names = screen.getAllByPlaceholderText("Signatory name") as HTMLInputElement[];
    expect(names).toHaveLength(2);
    await user.type(names[0], "Ada");
    await user.type(
      (screen.getAllByPlaceholderText("Signatory name") as HTMLInputElement[])[1],
      "Grace",
    );

    const after = screen.getAllByPlaceholderText("Signatory name") as HTMLInputElement[];
    expect(after.map((i) => i.value)).toEqual(["Ada", "Grace"]);
  });

  it("shows the fallback when a company has no active directors loaded", () => {
    render(
      <Host
        leadType="limited_company"
        chSource={{ ch_company_profile: { profile: {} } }}
        individual={null}
      />
    );
    expect(
      screen.getByText(/No active Companies House directors are loaded/i)
    ).toBeInTheDocument();
  });
});
