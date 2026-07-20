/**
 * Pure signatory-eligibility logic (no React/DB import), unit-tested.
 * Mirrors the `enforce_signatory_rules` DB trigger (migration
 * 20260720190000_company_profile_person_fields.sql) so the UI can pre-check
 * before submitting, rather than relying solely on the DB rejecting it.
 */

export const SIGNATORY_CAP = 10;

/** An officer can be a signatory only while they remain active (not resigned). */
export function canBeSignatory(o: { resigned_at: string | null }): boolean {
  return o.resigned_at == null;
}

/** True once the company already has SIGNATORY_CAP active signatories (no more may be added). */
export function signatoryCapReached(currentCount: number): boolean {
  return currentCount >= SIGNATORY_CAP;
}
