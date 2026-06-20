-- ============================================================
-- Fix onboarding_applications.status column DEFAULT
-- ============================================================
-- The column was created (20251125174504) with DEFAULT 'pending'. Migration
-- 20260603105927 later replaced the CHECK constraint with the canonical
-- 11-value set — which does NOT include 'pending' — and normalised existing
-- 'pending'/'sent'/'draft' rows to 'in_progress', but never updated the column
-- DEFAULT. So the default was left at a retired value: any INSERT that omits
-- `status` resolves to 'pending' and is rejected by
-- onboarding_applications_status_check.
--
-- All current creation paths (public_accept_quote_by_token,
-- public_get_quote_by_token self-heal, etc.) insert status = 'in_progress'
-- explicitly — the canonical initial state — so align the column default with
-- that.
--
-- Safe: changes the default for future default-omitting inserts only. No
-- existing rows are modified. No 'pending' rows can exist (they were normalised
-- in 20260603105927, and a default-omitting insert could not have created new
-- ones because the constraint rejects 'pending').
-- ============================================================

ALTER TABLE public.onboarding_applications
  ALTER COLUMN status SET DEFAULT 'in_progress';
