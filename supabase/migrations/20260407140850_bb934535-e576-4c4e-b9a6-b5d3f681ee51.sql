
-- ============================================================
-- FIX 1: Replace has_organization_role with org-scoped version
-- Must drop dependent policies FIRST, then the function
-- ============================================================

-- Drop all policies that depend on has_organization_role(text)
DROP POLICY IF EXISTS "Admins can manage automation rules" ON public.automation_rules;
DROP POLICY IF EXISTS "Admins can manage templates" ON public.job_templates;
DROP POLICY IF EXISTS "Admins can manage period locks" ON public.period_locks;
DROP POLICY IF EXISTS "Admins and owners can create invitations" ON public.team_invitations;
DROP POLICY IF EXISTS "Admins and owners can delete invitations" ON public.team_invitations;
DROP POLICY IF EXISTS "Admins can insert template versions" ON public.template_versions;
DROP POLICY IF EXISTS "Admins can manage category mappings" ON public.workpaper_category_mappings;

-- Now safe to drop the old function
DROP FUNCTION IF EXISTS public.has_organization_role(text);

-- Create new org-scoped version
CREATE OR REPLACE FUNCTION public.has_organization_role(_org_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.organization_users 
    WHERE user_id = auth.uid() 
      AND organization_id = _org_id
      AND role = _role
  );
$$;

-- Recreate policies with org-scoped role checks
CREATE POLICY "Admins can manage automation rules" ON public.automation_rules
  FOR ALL USING (
    user_has_organization_access(organization_id)
    AND (has_organization_role(organization_id, 'owner') OR has_organization_role(organization_id, 'admin'))
  );

CREATE POLICY "Admins can manage templates" ON public.job_templates
  FOR ALL USING (
    user_has_organization_access(organization_id)
    AND (has_organization_role(organization_id, 'owner') OR has_organization_role(organization_id, 'admin'))
  );

CREATE POLICY "Admins can manage period locks" ON public.period_locks
  FOR ALL USING (
    user_has_organization_access(organization_id)
    AND (has_organization_role(organization_id, 'owner') OR has_organization_role(organization_id, 'admin'))
  ) WITH CHECK (
    user_has_organization_access(organization_id)
    AND (has_organization_role(organization_id, 'owner') OR has_organization_role(organization_id, 'admin'))
  );

CREATE POLICY "Admins and owners can create invitations" ON public.team_invitations
  FOR INSERT WITH CHECK (
    user_has_organization_access(organization_id)
    AND (has_organization_role(organization_id, 'owner') OR has_organization_role(organization_id, 'admin'))
  );

CREATE POLICY "Admins and owners can delete invitations" ON public.team_invitations
  FOR DELETE USING (
    user_has_organization_access(organization_id)
    AND (has_organization_role(organization_id, 'owner') OR has_organization_role(organization_id, 'admin'))
  );

CREATE POLICY "Admins can insert template versions" ON public.template_versions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM templates
      WHERE templates.id = template_versions.template_id
        AND user_has_organization_access(templates.organization_id)
        AND (has_organization_role(templates.organization_id, 'owner') OR has_organization_role(templates.organization_id, 'admin'))
    )
  );

CREATE POLICY "Admins can manage category mappings" ON public.workpaper_category_mappings
  FOR ALL USING (
    user_has_organization_access(organization_id)
    AND (has_organization_role(organization_id, 'owner') OR has_organization_role(organization_id, 'admin'))
  );

-- ============================================================
-- FIX 2: Remove overly broad filing-documents storage policies
-- ============================================================

DROP POLICY IF EXISTS "Org users can view filing docs" ON storage.objects;
DROP POLICY IF EXISTS "Org users can upload filing docs" ON storage.objects;
DROP POLICY IF EXISTS "Org users can delete filing docs" ON storage.objects;

-- ============================================================
-- FIX 3: Remove is_rpc_context() from RLS policies
-- All writes MUST go through SECURITY DEFINER RPCs (which bypass RLS)
-- ============================================================

-- automation_rules
DROP POLICY IF EXISTS "automation_rules_insert_rpc" ON public.automation_rules;
DROP POLICY IF EXISTS "automation_rules_update_rpc" ON public.automation_rules;
DROP POLICY IF EXISTS "automation_rules_delete_rpc" ON public.automation_rules;
DROP POLICY IF EXISTS "automation_rules_insert_rpc_only" ON public.automation_rules;
DROP POLICY IF EXISTS "automation_rules_update_rpc_only" ON public.automation_rules;
DROP POLICY IF EXISTS "automation_rules_delete_rpc_only" ON public.automation_rules;

-- bills
DROP POLICY IF EXISTS "bills_insert_rpc" ON public.bills;
DROP POLICY IF EXISTS "bills_update_rpc" ON public.bills;
DROP POLICY IF EXISTS "bills_delete_rpc" ON public.bills;

-- bill_lines
DROP POLICY IF EXISTS "bill_lines_insert_rpc_org" ON public.bill_lines;
DROP POLICY IF EXISTS "bill_lines_update_rpc_org" ON public.bill_lines;
DROP POLICY IF EXISTS "bill_lines_delete_rpc_org" ON public.bill_lines;

-- bill_payments
DROP POLICY IF EXISTS "bill_payments_insert_rpc" ON public.bill_payments;
DROP POLICY IF EXISTS "bill_payments_update_rpc" ON public.bill_payments;
DROP POLICY IF EXISTS "bill_payments_delete_rpc" ON public.bill_payments;

-- customers
DROP POLICY IF EXISTS "customers_insert_rpc" ON public.customers;
DROP POLICY IF EXISTS "customers_update_rpc" ON public.customers;
DROP POLICY IF EXISTS "customers_delete_rpc" ON public.customers;
DROP POLICY IF EXISTS "customers_insert_rpc_only" ON public.customers;
DROP POLICY IF EXISTS "customers_update_rpc_only" ON public.customers;
DROP POLICY IF EXISTS "customers_delete_rpc_only" ON public.customers;

-- email_queue
DROP POLICY IF EXISTS "email_queue_insert_rpc" ON public.email_queue;
DROP POLICY IF EXISTS "email_queue_update_rpc" ON public.email_queue;
DROP POLICY IF EXISTS "email_queue_delete_rpc" ON public.email_queue;

-- invoice_lines
DROP POLICY IF EXISTS "invoice_lines_insert_rpc_org" ON public.invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_update_rpc_org" ON public.invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_delete_rpc_org" ON public.invoice_lines;

-- invoice_payments
DROP POLICY IF EXISTS "invoice_payments_insert_rpc" ON public.invoice_payments;
DROP POLICY IF EXISTS "invoice_payments_update_rpc" ON public.invoice_payments;
DROP POLICY IF EXISTS "invoice_payments_delete_rpc" ON public.invoice_payments;

-- Drop the vulnerable functions
DROP FUNCTION IF EXISTS public.is_rpc_context();
DROP FUNCTION IF EXISTS public.set_rpc_context();
