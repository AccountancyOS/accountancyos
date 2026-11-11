-- Phase 11 Permissions Hardening: Database Helper Functions

-- ============================================================================
-- PART 1: Role Hierarchy Helper Function
-- ============================================================================

-- Canonical helper for role hierarchy checks (used in RLS and RPCs)
CREATE OR REPLACE FUNCTION public.user_has_role_at_least(_user_id uuid, _org_id uuid, _min_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.organization_users
    WHERE user_id = _user_id 
      AND organization_id = _org_id
      AND CASE _min_role
        WHEN 'viewer' THEN role IN ('viewer', 'staff', 'manager', 'admin', 'owner')
        WHEN 'staff' THEN role IN ('staff', 'manager', 'admin', 'owner')
        WHEN 'manager' THEN role IN ('manager', 'admin', 'owner')
        WHEN 'admin' THEN role IN ('admin', 'owner')
        WHEN 'owner' THEN role = 'owner'
        ELSE false
      END
  )
$$;

-- ============================================================================
-- PART 2: Bookkeeping Permission Check Functions
-- ============================================================================

-- Check if user can create invoices (staff+)
CREATE OR REPLACE FUNCTION public.can_create_invoices(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_role_at_least(_user_id, _org_id, 'staff')
$$;

-- Check if user can edit invoices (staff+ for DRAFT, admin+ for others)
CREATE OR REPLACE FUNCTION public.can_edit_invoices(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_role_at_least(_user_id, _org_id, 'staff')
$$;

-- Check if user can issue invoices (manager+)
CREATE OR REPLACE FUNCTION public.can_issue_invoices(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_role_at_least(_user_id, _org_id, 'manager')
$$;

-- Check if user can void invoices (admin+)
CREATE OR REPLACE FUNCTION public.can_void_invoices(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_role_at_least(_user_id, _org_id, 'admin')
$$;

-- Check if user can manage bills (staff+)
CREATE OR REPLACE FUNCTION public.can_manage_bills(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_role_at_least(_user_id, _org_id, 'staff')
$$;

-- Check if user can approve bills (manager+)
CREATE OR REPLACE FUNCTION public.can_approve_bills(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_role_at_least(_user_id, _org_id, 'manager')
$$;

-- Check if user can post journals (manager+)
CREATE OR REPLACE FUNCTION public.can_post_journals(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_role_at_least(_user_id, _org_id, 'manager')
$$;

-- Check if user can manage bank reconciliation (manager+)
CREATE OR REPLACE FUNCTION public.can_manage_bank_reconciliation(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_role_at_least(_user_id, _org_id, 'manager')
$$;

-- Check if user can lock periods (admin+)
CREATE OR REPLACE FUNCTION public.can_lock_periods(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_role_at_least(_user_id, _org_id, 'admin')
$$;

-- Check if user can override locked records (admin+)
CREATE OR REPLACE FUNCTION public.can_override_locked_records(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_role_at_least(_user_id, _org_id, 'admin')
$$;

-- Check if user can send emails (staff+)
CREATE OR REPLACE FUNCTION public.can_send_emails(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_role_at_least(_user_id, _org_id, 'staff')
$$;

-- Check if user can manage email queue (manager+)
CREATE OR REPLACE FUNCTION public.can_manage_email_queue(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_role_at_least(_user_id, _org_id, 'manager')
$$;

-- Check if user can record payments (manager+)
CREATE OR REPLACE FUNCTION public.can_record_payments(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_role_at_least(_user_id, _org_id, 'manager')
$$;

-- ============================================================================
-- PART 3: Add ISSUED status and tracking columns to invoices
-- ============================================================================

-- Add issued tracking columns if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'issued_at') THEN
    ALTER TABLE public.invoices ADD COLUMN issued_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'issued_by') THEN
    ALTER TABLE public.invoices ADD COLUMN issued_by UUID;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'voided_at') THEN
    ALTER TABLE public.invoices ADD COLUMN voided_at TIMESTAMPTZ;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'voided_by') THEN
    ALTER TABLE public.invoices ADD COLUMN voided_by UUID;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'void_reason') THEN
    ALTER TABLE public.invoices ADD COLUMN void_reason TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'invoices' AND column_name = 'override_metadata') THEN
    ALTER TABLE public.invoices ADD COLUMN override_metadata JSONB;
  END IF;
END $$;

-- Add queued_by column to email_queue for audit trail
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_queue' AND column_name = 'queued_by') THEN
    ALTER TABLE public.email_queue ADD COLUMN queued_by UUID;
  END IF;
END $$;