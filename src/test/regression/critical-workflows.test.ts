import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DOC = readFileSync(resolve(__dirname, "../../../docs/critical-workflows.md"), "utf8");

const REQUIRED_WORKFLOWS = [
  "Accountant Login",
  "Client Portal Login",
  "Client Forgotten Password",
  "Client Invitation",
  "Quote Accepted",
  "Engagement Letter",
  "Questionnaire Send",
  "Questionnaire Completion",
  "Email Queue Processing",
  "Deadline / Job Generation",
  "TrueLayer",
  "Bookkeeping Transaction Posting",
  "Workpaper Approval",
  "Filing Submission",
  "RLS Cross-Organization Isolation",
];

describe("Critical workflows documentation", () => {
  for (const w of REQUIRED_WORKFLOWS) {
    it(`documents ${w}`, () => {
      expect(DOC).toContain(w);
    });
  }

  it("references the deployed PortalForgotPassword component", () => {
    expect(existsSync(resolve(__dirname, "../../portal/pages/PortalForgotPassword.tsx"))).toBe(true);
    expect(DOC).toContain("PortalForgotPassword.tsx");
  });

  it("documents every relevant failure mode for the forgotten password flow", () => {
    expect(DOC).toMatch(/email_send_log[`\s]+empty/);
    expect(DOC).toMatch(/redirectTo/);
    expect(DOC).toMatch(/Rate-limit/);
    expect(DOC).toMatch(/suppressed_emails/);
  });
});