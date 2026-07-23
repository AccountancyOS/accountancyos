import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * G3 — reload-drop regression guard for the onboarding pre-link keys.
 *
 * G2's approval-merge reads person_id + ch_officer_id off each personal_details
 * entry to MERGE into the existing CH person instead of creating a duplicate.
 * If seedPeople's resume branch (or toPersistedPerson / PersonDetail) drops
 * those keys, they vanish on reload/save and the pre-link silently breaks. This
 * pins them into the source.
 */

const read = (p: string) => readFileSync(resolve(__dirname, "../../../", p), "utf8");
const INDEX = read("src/components/onboarding/YourDetailsStep/index.tsx");
const TYPES = read("src/components/onboarding/YourDetailsStep/types.ts");

describe("YourDetailsStep pre-link key threading", () => {
  it("PersonDetail declares person_id and ch_officer_id", () => {
    expect(TYPES).toMatch(/person_id\??:\s*string\s*\|\s*null|person_id\??:\s*string/);
    expect(TYPES).toMatch(/ch_officer_id\??:\s*string\s*\|\s*null|ch_officer_id\??:\s*string/);
  });

  it("toPersistedPerson only strips _key (so person_id/ch_officer_id survive to the saved jsonb)", () => {
    const fn = TYPES.match(/export function toPersistedPerson[\s\S]*?\n}/)?.[0] ?? "";
    expect(fn).toMatch(/const\s*\{\s*_key\s*,\s*\.\.\.rest\s*\}\s*=\s*p/);
    expect(fn).not.toMatch(/person_id/);
    expect(fn).not.toMatch(/ch_officer_id/);
  });

  it("seedPeople's resume branch carries person_id and ch_officer_id back from app.personal_details", () => {
    const seed = INDEX.match(/function seedPeople[\s\S]*?\n}/)?.[0] ?? "";
    expect(seed.length).toBeGreaterThan(0);
    // The resume-branch object literal that reads back p?.<field> must include both keys.
    expect(seed).toMatch(/person_id:\s*p\?\.person_id/);
    expect(seed).toMatch(/ch_officer_id:\s*p\?\.ch_officer_id/);
  });

  it("auto-invokes onboarding-fetch-ch-officers to pre-populate directors", () => {
    expect(INDEX).toMatch(/onboarding-fetch-ch-officers/);
    expect(INDEX).toMatch(/application_id:\s*app\.id/);
    expect(INDEX).toMatch(/access_token/);
  });
});
