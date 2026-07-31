# Apply DEF-001 + DEF-002 (one atomic migration)

Claude's branch (5c76747) is in the working tree and verified against LIVE. Nothing has been applied. This plan covers the apply, the privilege check first, and the honest scope of what can and cannot be verified today.

## Pre-apply checks already done

- `supabase/migrations/20260731210000_def_001_002_rpc_context_and_invoice_draft.sql` is present and its SHA-256 is `aee9c160b5594b2748db7434c8397d22fd7e13100803204e1d04ba6cdf4830f5` — byte-identical to the receipt.
- Live signature inventory re-run: the four invoice-draft overloads exist exactly as the matrix records them (13-arg date create, 14-arg text create, 8-arg date update, 8-arg text update). The three signatures the migration drops all exist; the two it replaces in place have parameter names identical to the migration's, so `CREATE OR REPLACE` will not fail with a parameter-rename error.
- Only application code calls these RPCs (`src/lib/invoice-draft-service.ts`, `src/pages/OpsHealth.tsx`). No edge function calls them, so no function redeploy is coupled to this migration.
- Confirmed the service's update payload sends `p_notes`, which no current live candidate accepts — consistent with the reported resolution failure.

## Apply sequence

1. Apply the migration as a single unit through the Lovable migration flow. It is not split; DEF-001 and DEF-002 must not exist half-fixed.
2. Verify the privilege change first, as the receipt requires: for all ten affected signatures confirm `proacl` no longer contains PUBLIC (`=X/postgres`) or `anon`, still contains `authenticated`, `service_role` and `sandbox_exec`, and `proowner` is `postgres`.
3. Sweep every public function body for `set_rpc_context` and confirm zero matches (was 8).
4. Confirm exactly two invoice-draft candidates remain: create with 14 arguments, update with 9.
5. Confirm the eight repaired bodies have new definition hashes, replacing `de32451b / 3803ae13 / dbe752a5 / 1ef6b7fc / 75551314 / cc7973c4 / 2dbb0171 / 1ca6a433`.
6. Record both the authored version (`20260731210000`) and the executor version in the receipt, then move it out of `pending/`.
7. Refresh `docs/audits/unapplied-migrations-baseline.json`.

## What will be verified now vs deferred

Verifiable immediately from the catalogue, without fixtures: privileges, ownership, zero helper references, candidate uniqueness, changed body hashes.

Deferred as post-apply behavioural checks in the receipt, because they need the Staff/Admin and second-tenant fixtures approved in Phase 0 §4 and the current tenant has no invoices after the wipe: portal create/edit, the `can_create_invoices` refusal on update, cross-tenant entity and customer rejection, line preservation on a failed update, and the four payload resolutions end to end. These will be reported as not executed rather than simulated.

## Points flagged for the record

- The `can_create_invoices` tightening on update is a deliberate behaviour change, not a repair. A member without that capability could edit drafts before and cannot after. It is the most likely thing to be reported as a regression.
- Revoking PUBLIC and anon changes the anon-caller response from `{"success":false,"error":"Not authenticated"}` to a hard permission denied. `sandbox_exec` is untouched.
- The rollback is intentionally not fully automatic and reinstates the outage; it stays outside `supabase/migrations/`.
- `app.rpc` is now written by eighteen functions and read by none. Deciding whether to restore the RPC write guard or strip the flag is a separate security-architecture task, not taken as a side effect here.
- `update_bill_draft_safe` is inlined on LIVE though git never had it that way — recorded as DEF-020 drift, not acted on.

## Not in this change

No application code, no edge-function deploy, no frontend publish. The 19 regression guards are static and already pass on the branch.
