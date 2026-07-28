import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Launch-readiness audit remediation, first batch of app-side defects.
 * Report: docs/audits/2026-07-27-launch-readiness-e2e.md
 *
 * Three of these are the same mistake wearing different clothes: `.single()` used where
 * zero rows is a legitimate outcome, which PostgREST answers with 406/PGRST116. It is
 * worth pinning as a class, not just as three call sites.
 */
const root = resolve(__dirname, "../../../");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("DEF-007 — /jobs no longer 406s on every load", () => {
  it("treats a missing default saved view as absence, not an error", () => {
    const svc = read("src/lib/jobs-filter-service.ts");
    expect(svc).toMatch(/\.eq\('is_default', true\)[\s\S]{0,200}\.maybeSingle\(\)/);
    expect(svc).not.toMatch(/\.eq\('is_default', true\)[\s\S]{0,120}\.single\(\)/);
  });
});

describe("DEF-011 — portal pages no longer 406 four times per load", () => {
  it("treats a portal user's absent organization membership as legitimate", () => {
    const auth = read("src/lib/auth-context.tsx");
    // A portal identity has no organization_users row at all.
    expect(auth).toMatch(
      /from\('organization_users'\)[\s\S]{0,240}\.maybeSingle\(\)/,
    );
    expect(auth).not.toMatch(/from\('organization_users'\)[\s\S]{0,200}\.single\(\)/);
    // One identity belongs to one practice, so a second row must not raise either.
    expect(auth).toMatch(/\.limit\(1\)/);
  });
});

describe("DEF-009 — dates are UK-formatted everywhere", () => {
  it("does not leave the onboarding stepper on the viewer's locale", () => {
    const stepper = read("src/components/onboarding/OnboardingStatusStepper.tsx");
    // Comments are stripped first: the fix's own note names the offending API, and a
    // guard that a comment can trip is a guard that gets deleted rather than fixed.
    const code = stepper.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    // The locale-following call rendered "7/27/2026" beside "27 July 2026" on one screen.
    expect(code).not.toMatch(/toLocaleDateString\(\)/);
    expect(code).toMatch(/format\(date, "dd MMM yyyy"\)/);
  });
});

describe("DEF-014 — no nested interactive controls", () => {
  it("keeps the category kill switch outside the accordion trigger", () => {
    const centre = read("src/pages/settings/AutomationSettingsCentre.tsx");
    const trigger = centre.slice(
      centre.indexOf("<AccordionTrigger"),
      centre.indexOf("</AccordionTrigger>"),
    );
    // AccordionTrigger renders a <button>; a switch inside it is invalid markup AND
    // means toggling a category also opens the accordion.
    expect(trigger).not.toMatch(/CategoryKillSwitch/);
    expect(centre).toMatch(/CategoryKillSwitch/);
  });
});

describe("DEF-010 — one canonical MTD quarterly service", () => {
  const MIG = read(
    "supabase/migrations/20260728130000_retire_legacy_mtd_quarterly_service.sql",
  );

  it("deactivates the legacy entry rather than deleting it", () => {
    expect(MIG).toMatch(/UPDATE public\.services_catalog[\s\S]*?SET active = false/);
    expect(MIG).toMatch(/WHERE code = 'mtd_quarterly'/);
    // Historic quote_lines reference services_catalog by id.
    expect(MIG).not.toMatch(/DELETE FROM public\.services_catalog/);
  });

  it("leaves the two canonical codes alone", () => {
    // mtd_quarter and mtd_itsa_final are what the proposal engine decomposes into.
    expect(MIG).not.toMatch(/code = 'mtd_quarter'/);
    expect(MIG).not.toMatch(/code = 'mtd_itsa_final'/);
    const mtd = read("src/lib/proposal/mtd-periods.ts");
    expect(mtd).toMatch(/MTD_SERVICE_CODES = \["mtd_quarter", "mtd_itsa_final"\]/);
  });
});

describe("DEF-010 — sa_mtd is an anchor, not a billable line", () => {
  const DIALOG = read("src/components/quotes/CreateQuoteDialog.tsx");

  it("is hidden from the quote builder", () => {
    expect(DIALOG).toMatch(/filter\(\(s: any\) => s\.code !== "sa_mtd"\)/);
    // The picker must render the filtered list, not the raw services query.
    expect(DIALOG).toMatch(/\{sellableServices\.map\(\(service\) =>/);
    expect(DIALOG).not.toMatch(/\{services\?\.map\(\(service\) =>/);
  });

  it("is NOT deactivated or deleted — materialisation depends on it", () => {
    // It carries canonical_service_code 'self_assessment_mtd_quarterly' and doubles as
    // the client type. Retiring the row would stop MTD jobs being created.
    const retire = read(
      "supabase/migrations/20260728130000_retire_legacy_mtd_quarterly_service.sql",
    );
    expect(retire).not.toMatch(/'sa_mtd'/);
    const prices = read(
      "supabase/migrations/20260728140000_service_prices_and_unpriced_state.sql",
    );
    expect(prices).not.toMatch(/UPDATE public\.services_catalog[\s\S]{0,200}active = false/);
    // The engine still keys on it.
    const mig = read("supabase/migrations/20260725140000_mtd_deadlines_and_service.sql");
    expect(mig).toMatch(/sc\.code = 'sa_mtd'/);
  });
});

describe("DEF-010 — an unset price is unset, never £0.00", () => {
  const MIG = read(
    "supabase/migrations/20260728140000_service_prices_and_unpriced_state.sql",
  );
  const DIALOG = read("src/components/quotes/CreateQuoteDialog.tsx");

  it("makes 'not yet priced' representable", () => {
    expect(MIG).toMatch(/ALTER COLUMN default_price DROP NOT NULL/);
    expect(MIG).toMatch(/ALTER COLUMN default_price DROP DEFAULT/);
  });

  it("applies the owner's prices to the three unpriced services", () => {
    expect(MIG).toMatch(/SET default_price = 1000\.00[\s\S]{0,120}LLP accounts production/);
    expect(MIG).toMatch(/SET default_price = 250\.00[\s\S]{0,120}Sole trader accounts/);
    expect(MIG).toMatch(/SET default_price = 250\.00[\s\S]{0,120}Trust Registration Service/);
    // Never overwrite a price a practice has already set.
    expect(MIG).toMatch(/AND COALESCE\(default_price, 0\) = 0/);
  });

  it("never renders an unpriced service as a zero fee", () => {
    // Zero means INCLUDED everywhere in this product, so an unpriced service must not
    // borrow that rendering.
    expect(DIALOG).toMatch(/not priced/i);
    expect(DIALOG).not.toMatch(/£\$\{service\.default_price\.toFixed\(2\)\}/);
  });
});

describe("DEF-006 — bank connection health works, and says so when it does not", () => {
  const MIG = read(
    "supabase/migrations/20260728160000_fix_bank_connection_health_ambiguity.sql",
  );
  const CARD = read("src/components/bookkeeping/PracticeBankingOverview.tsx");

  it("qualifies the reference that collided with the OUT parameter", () => {
    expect(MIG).toMatch(/FROM public\.organization_users ou/);
    expect(MIG).toMatch(/ou\.user_id = auth\.uid\(\) AND ou\.organization_id = _org_id/);
    // The pragma would change how every unqualified name in the body resolves. Comments
    // are stripped first — the migration's own rationale names the thing it avoided, and
    // a guard a comment can trip is a guard that gets deleted rather than fixed.
    const sql = MIG.replace(/^\s*--.*$/gm, "");
    expect(sql).not.toMatch(/#variable_conflict/);
  });

  it("keeps the authorisation check", () => {
    // The edit is inside the authorisation EXISTS, so this is what a mistake would break.
    expect(MIG).toMatch(/RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'/);
  });

  it("distinguishes failure from emptiness in the UI", () => {
    // The card used to fall back to [] and announce "No bank connections" when the RPC
    // failed — a hard failure rendered as reassurance.
    expect(CARD).toMatch(/isError/);
    expect(CARD).toMatch(/Bank connection health is unavailable/);
  });
});

describe("DEF-013 — the staff signature is actually rendered", () => {
  const FN = read("supabase/functions/send-engagement-letter/index.ts");

  it("reads the signature from profiles, per the owner's ruling", () => {
    expect(FN).toMatch(/from\('profiles'\)[\s\S]{0,120}select\('email_signature'\)/);
  });

  it("treats an absent signature as empty, never as a failure", () => {
    expect(FN).toMatch(/senderProfile\?\.email_signature \?\? ''/);
    // NULL must not block a send.
    expect(FN).toMatch(/staffSignature\s*\n?\s*\?/);
  });

  it("renders it in both the variant and the default wording", () => {
    expect(FN).toMatch(/\{\{staff_signature\}\}/);
    expect(FN).toMatch(/\$\{signatureHtml\}/);
  });
});
