/**
 * The retired legacy project and hosting platform (cutover B, 2026-11-11).
 *
 * The ONLY place these identifiers are spelled out in active code. Tests import them to prove the
 * identifiers are absent everywhere else; no-legacy-platform.test.ts exempts this file alone.
 */
export const LEGACY_REF = "moxpdejnucjjcplleefn";
export const RETIRED_IDENTIFIERS = [LEGACY_REF, "lovable.app", "lovableproject.com", "@lovable.dev", "lovable-tagger"] as const;
