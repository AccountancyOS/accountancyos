-- ============================================================
-- Proposal Phase 2, Task 2e — quotes.signatory_snapshot (ADDITIVE)
-- ------------------------------------------------------------
-- ADDITIVE ONLY. Safe to apply. No function is re-issued, so this migration
-- carries NO live function body and has no live-body dependency.
--
-- Adds public.quotes.signatory_snapshot jsonb — the proposal's OWN immutable
-- signatory list + signing rule, e.g.
--   { "rule": "all" | "any",
--     "signatories": [ { person_id?, contact_id?, ch_officer_id?,
--                        name, email, is_primary, required } ] }
--
-- The proposal stores its own snapshot so that later Companies-House / contact
-- changes never silently change an in-flight proposal. Nothing reads it yet:
-- the acceptance-time flow into engagement_letters / engagement_letter_signatories
-- is Task 2d. No existing object is altered or dropped; no RPC/gate/trigger touched.
-- ============================================================

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS signatory_snapshot jsonb;
