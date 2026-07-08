import { describe, it, expect } from "vitest";
import {
  activationPlan,
  materialisationPasses,
} from "@/lib/lifecycle-activation-model";

/**
 * Fix 8 · Increment 2 — pins the verified accept/approve behaviour under each flag state, and the
 * canonical invariants that must hold for an org to be flipped to canonical lifecycle.
 */
describe("canonical activation contract (Fix 8 Inc 2)", () => {
  describe("flag-OFF (legacy — preserved unchanged)", () => {
    it("accept activates (links) and materialises jobs; entity still pending", () => {
      expect(activationPlan("accept", false)).toEqual({
        entityStatus: "pending",
        createsActiveLinks: true,
        materialisesJobs: true,
      });
    });
    it("approve activates the entity and materialises again (the latent LC-1 duplicate)", () => {
      expect(activationPlan("approve", false)).toEqual({
        entityStatus: "active",
        createsActiveLinks: false, // legacy created links at accept, not approve
        materialisesJobs: true,
      });
    });
    it("legacy materialises jobs TWICE across the journey (accept + approve)", () => {
      expect(materialisationPasses(false)).toBe(2);
    });
  });

  describe("flag-ON (canonical — approval-only activation, single materialisation)", () => {
    it("accept creates only the pending shell — no links, no jobs", () => {
      expect(activationPlan("accept", true)).toEqual({
        entityStatus: "pending",
        createsActiveLinks: false,
        materialisesJobs: false,
      });
    });
    it("approval is the sole activation gate — links + entity active + jobs", () => {
      expect(activationPlan("approve", true)).toEqual({
        entityStatus: "active",
        createsActiveLinks: true,
        materialisesJobs: true,
      });
    });
    it("INVARIANT: jobs materialise exactly once (at approval)", () => {
      expect(materialisationPasses(true)).toBe(1);
    });
    it("INVARIANT: quote acceptance never activates (no links) under canonical", () => {
      expect(activationPlan("accept", true).createsActiveLinks).toBe(false);
    });
  });
});
