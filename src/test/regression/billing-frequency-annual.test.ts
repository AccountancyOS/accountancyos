import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Bug: an engagement letter promised £2,520 PER MONTH for a proposal quoted at
 * £2,520 per YEAR — twelve times the fee, in the document that is the contract.
 *
 * Cause: quote_lines.billing_frequency allowed only 'now' or 'monthly', while the
 * proposal UI labels the price box "Annual Price". An annual fee had to be stored as
 * 'monthly', and the dialog divided by 12 for display only — so the figure SAVED was the
 * annual one while its frequency claimed monthly. accepted_snapshot then reported
 * total_monthly = 2520 and the letter repeated it.
 *
 * The rule these assertions defend: the stored unit price is exactly what the accountant
 * quoted, the frequency says what period it covers, and nothing downstream divides or
 * annualises it.
 */
const root = resolve(__dirname, "../../../");
const migDir = resolve(root, "supabase/migrations");

const MIG_NAME = "20260727170000_billing_frequency_annual.sql";
const MIG = readFileSync(resolve(migDir, MIG_NAME), "utf8");
const CONSTANTS = readFileSync(
  resolve(root, "src/lib/db-constants/check-constraints.ts"),
  "utf8",
);

const latestDefinerOf = (fnName: string): string | undefined =>
  readdirSync(migDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) =>
      new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fnName}\\b`).test(
        readFileSync(resolve(migDir, f), "utf8"),
      ),
    )
    .pop();

describe("a quote line can be one-off, monthly or annual", () => {
  it("widens the billing_frequency vocabulary without dropping a value", () => {
    expect(MIG).toMatch(
      /CHECK \(billing_frequency IN \('now', 'monthly', 'annual'\)\)/,
    );
    // Located by constrained column, so a differently-named live CHECK cannot survive
    // and keep rejecting the new value.
    expect(MIG).toMatch(/c\.conkey\s+= ARRAY\[v_attnum\]/);
  });

  it("registers the vocabulary so the drift guard covers it", () => {
    expect(CONSTANTS).toMatch(
      /QUOTE_LINE_BILLING_FREQUENCIES = \["now", "monthly", "annual"\]/,
    );
    expect(CONSTANTS).toMatch(/quote_lines_billing_frequency_check/);
  });

  it("totals each billing period separately", () => {
    expect(MIG).toMatch(/'total_annual', v_total_annual/);
    // total_now must mean one-off only. It previously absorbed everything that was not
    // monthly, which is how an annual fee got reported as due now.
    expect(MIG).toMatch(
      /NOT IN \('monthly','annual'\)[\s\S]*?= 'monthly'[\s\S]*?= 'annual'/,
    );
    // Existing keys keep their names and meaning.
    expect(MIG).toMatch(/'total_now', v_total_now/);
    expect(MIG).toMatch(/'total_monthly', v_total_monthly/);
  });

  it("never divides or annualises a quoted amount", () => {
    // No arithmetic on the quoted figure — the letter must state what the quote states.
    expect(MIG).not.toMatch(/\/\s*12/);
    expect(MIG).not.toMatch(/\*\s*12/);
  });

  it("owns the live body of public_get_quote_by_token, after the token repair", () => {
    expect(latestDefinerOf("public_get_quote_by_token")).toBe(MIG_NAME);
    // It is based on the token repair, so that fix must not be lost by applying this.
    expect(MIG).toMatch(/'onboarding_access_token', v_access_token/);
    expect(MIG).toMatch(/IF v_quote\.status <> 'accepted' THEN\s+v_access_token := NULL;/);
    expect(MIG).toMatch(/APPLY AFTER 20260727160000/);
  });
});
