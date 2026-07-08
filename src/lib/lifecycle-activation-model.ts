/**
 * Fix 8 · Increment 2 — the canonical activation contract.
 *
 * This encodes the VERIFIED behaviour of the two lifecycle gates under each state of the
 * `canonical_lifecycle_enabled` org flag, traced from the live SQL:
 *   - public_accept_quote_by_token  (20260629163528…)
 *   - lifecycle_approve_onboarding  (20260629091343…)
 *
 * It is the executable spec for the staged rollout: flag-OFF preserves legacy behaviour (accept
 * activates + materialises, and approve materialises AGAIN — the latent LC-1 duplicate), while
 * flag-ON is approval-only activation with a SINGLE materialisation. The invariants below are the
 * acceptance criteria for flipping an org to canonical, and a regression guard for anyone editing
 * the gate SQL. (True end-to-end verification still requires the live DB — see the stage report.)
 */

export type LifecyclePhase = "accept" | "approve";

export interface ActivationPlan {
  /** Entity (client/company) row status after this phase. */
  entityStatus: "pending" | "active";
  /** Does this phase create ACTIVE accountant_client_links? */
  createsActiveLinks: boolean;
  /** Does this phase materialise jobs/deadlines (lifecycle_materialize_jobs)? */
  materialisesJobs: boolean;
}

/** Verified behaviour matrix. flagOn = organizations.canonical_lifecycle_enabled. */
export function activationPlan(phase: LifecyclePhase, flagOn: boolean): ActivationPlan {
  if (phase === "accept") {
    return {
      entityStatus: "pending", // accept always creates the entity as 'pending'
      createsActiveLinks: !flagOn, // legacy activates at accept; canonical does not
      materialisesJobs: !flagOn, // legacy materialises at accept; canonical does not
    };
  }
  // approve
  return {
    entityStatus: "active", // approval always activates the entity (both flag states)
    createsActiveLinks: flagOn, // canonical creates the links at approval; legacy did so at accept
    materialisesJobs: true, // approve always materialises (idempotent dedupe)
  };
}

/** Total number of job-materialisation passes across the accept→approve journey. */
export function materialisationPasses(flagOn: boolean): number {
  return (
    (activationPlan("accept", flagOn).materialisesJobs ? 1 : 0) +
    (activationPlan("approve", flagOn).materialisesJobs ? 1 : 0)
  );
}
