-- ============================================================
-- Fix partner_in_charge / staff_in_charge assignment
-- ============================================================
-- The staff picker saves the auth user id, but companies.partner_in_charge / staff_in_charge were
-- FK'd to organization_users(id) — a DIFFERENT id (its own uuid PK, not user_id) — so every save
-- failed the FK constraint and the assignment could never be changed. Drop the mismatched FKs; the
-- columns hold a user id and the picker already restricts choices to organization members.
--
-- Also: clients (individuals) had NO partner_in_charge / staff_in_charge columns at all, so they
-- could not be assigned. Add them (uuid = user id), mirroring companies.
-- ============================================================

ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_partner_in_charge_fkey;
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_staff_in_charge_fkey;

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS partner_in_charge uuid;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS staff_in_charge uuid;
