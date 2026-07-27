import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The proposal dialog must state a fee exactly as the accountant quoted it.
 *
 * It used to label every price box "Annual Price" while offering only Bill Now / Bill
 * Monthly, and divide monthly lines by 12 for display while saving the undivided figure.
 * So £2,520 quoted annually was shown as ~£210/month, stored as 'monthly', and repeated
 * by the engagement letter as £2,520 PER MONTH.
 */
const root = resolve(__dirname, "../../../");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const DIALOG = read("src/components/quotes/CreateQuoteDialog.tsx");
const CONSTANTS = read("src/lib/db-constants/check-constraints.ts");

describe("quote lines are priced per stated billing period", () => {
  it("offers every billing period the database accepts", () => {
    // Driven off the constraint constant, so a new period cannot appear in the schema
    // without appearing in the picker.
    expect(DIALOG).toMatch(/QUOTE_LINE_BILLING_FREQUENCIES\.map\(\(frequency\) =>/);
    expect(CONSTANTS).toMatch(/picker: "Bill Annually"/);
  });

  it("labels the price box with the chosen period", () => {
    expect(DIALOG).toMatch(
      /<Label>\{BILLING_FREQUENCY_LABELS\[line\.billing_frequency\]\.price\}<\/Label>/,
    );
    // The fixed "Annual Price" label is what made an annual fee look right while being
    // stored as monthly.
    expect(DIALOG).not.toMatch(/<Label>Annual Price<\/Label>/);
  });

  it("never divides or annualises a quoted amount", () => {
    expect(DIALOG).not.toMatch(/unit_price \/ 12/);
    expect(DIALOG).not.toMatch(/\* 12/);
  });

  it("totals each period separately and shows no blended headline", () => {
    expect(DIALOG).toMatch(/const payableNow = sumFor\("now"\)/);
    expect(DIALOG).toMatch(/const payableMonthly = sumFor\("monthly"\)/);
    expect(DIALOG).toMatch(/const payableAnnually = sumFor\("annual"\)/);
    expect(DIALOG).toMatch(/Payable Annually/);
    // One-off, monthly and annual money cannot be added into a figure a client can read.
    expect(DIALOG).not.toMatch(/text-2xl font-semibold[\s\S]{0,80}totalAmount/);
  });

  it("stores the same figure it displays", () => {
    expect(DIALOG).toMatch(/const total = totalAmount;/);
  });

  it("derives the type from the CHECK constraint so they cannot drift", () => {
    expect(CONSTANTS).toMatch(
      /export type BillingFrequency = \(typeof QUOTE_LINE_BILLING_FREQUENCIES\)\[number\]/,
    );
    expect(DIALOG).not.toMatch(/"now" \| "monthly"/);
  });
});
