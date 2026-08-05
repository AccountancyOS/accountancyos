import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * DEF-026/027 — post-assertion false positive.
 *
 * The original assertion used `v_src LIKE '%internal_notes%'`, which matched the
 * legitimate parameter `p_internal_notes` and trapped a correct repair. The
 * correction (docs/releases/patches/2026-08-05-def-026-027-assertion-boundary.patch)
 * replaces it with PostgreSQL identifier-boundary regexes `\m ... \M`.
 *
 * These tests model \m/\M with JS boundaries that treat `_` as a word character
 * (PostgreSQL semantics) and prove the corrected predicate behaviour.
 */

const PATCH_PATH = resolve(
  __dirname,
  "../../../docs/releases/patches/2026-08-05-def-026-027-assertion-boundary.patch",
);
const MIGRATION_PATH = resolve(
  __dirname,
  "../../../supabase/migrations/20260805110000_def_026_027_bill_status_and_customer_columns.sql",
);

/** PostgreSQL \mIDENT\M — `_` counts as a word character. */
const boundary = (ident: string) =>
  new RegExp(`(?<![A-Za-z0-9_])${ident}(?![A-Za-z0-9_])`);

const fails = (src: string) =>
  boundary("billing_address").test(src) || boundary("internal_notes").test(src);

describe("DEF-027 post-assertion identifier-boundary check", () => {
  it("rejects a standalone internal_notes column reference", () => {
    expect(fails("INSERT INTO public.customers (name, internal_notes) VALUES ($1,$2)")).toBe(true);
  });

  it("does not reject the legitimate p_internal_notes parameter", () => {
    expect(fails("INSERT INTO public.customers (notes) VALUES (p_internal_notes)")).toBe(false);
  });

  it("keeps the billing_address protection effective", () => {
    expect(fails("INSERT INTO public.customers (billing_address) VALUES ($1)")).toBe(true);
    expect(fails("NULLIF(p_billing_address->>'line1','')")).toBe(false);
  });

  it("accepts the real decomposed body shape used by the migration", () => {
    const body = `
      INSERT INTO public.customers (address_line_1, address_line_2, city, postcode, country, notes)
      VALUES (NULLIF(p_billing_address->>'line1',''), NULLIF(p_billing_address->>'line2',''),
              NULLIF(p_billing_address->>'city',''), NULLIF(p_billing_address->>'postcode',''),
              COALESCE(NULLIF(p_billing_address->>'country',''), 'United Kingdom'), p_internal_notes)`;
    expect(fails(body)).toBe(false);
  });
});

describe("DEF-026/027 patch scope", () => {
  const patch = readFileSync(PATCH_PATH, "utf8");

  it("touches only the DEF-026/027 migration file", () => {
    const targets = patch.match(/^\+\+\+ b\/.+$/gm) ?? [];
    expect(targets).toEqual([
      "+++ b/supabase/migrations/20260805110000_def_026_027_bill_status_and_customer_columns.sql",
    ]);
  });

  it("removes only the assertion predicate line — no functional SQL", () => {
    const removed = Array.from(
      patch.matchAll(/^-(?!--)(?!-- ).*$/gm),
      (match) => match[0],
    )
      .filter((l) => l.startsWith("-") && !l.startsWith("---"))
      .map((l) => l.slice(1).trim())
      .filter(Boolean);
    expect(removed).toEqual([
      "IF v_src LIKE '%billing_address,%' OR v_src LIKE '%internal_notes%' THEN",
      "RAISE EXCEPTION 'DEF-027 post-assert failed: the body still names a column that does not exist on public.customers.';",
      "END IF;",
    ]);
  });

  it("introduces the \\m ... \\M boundary predicate", () => {
    expect(patch).toContain("+  IF v_src ~ '\\mbilling_address\\M' OR v_src ~ '\\minternal_notes\\M' THEN");
  });

  it("the on-disk migration contains the reviewed boundary correction", () => {
    const sql = readFileSync(MIGRATION_PATH, "utf8");
    expect(sql).toContain("IF v_src ~ '\\mbilling_address\\M' OR v_src ~ '\\minternal_notes\\M' THEN");
    expect(sql).not.toContain("LIKE '%internal_notes%'");
  });
});
