/**
 * Helper used by any portal feature that is intentionally not wired this
 * sprint. See docs/portal-disabled-features.md.
 */
export function disabledFeature(name: string): string {
  return `${name} is not available in the client portal yet.`;
}