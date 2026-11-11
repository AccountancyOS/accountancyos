
-- =============================================================================
-- CORRECTIVE MIGRATION: Fix security holes and design issues
-- =============================================================================

-- 1) CRITICAL: Revoke public access to set_rpc_context() 
-- This prevents authenticated users from bypassing RLS by calling it directly
REVOKE EXECUTE ON FUNCTION public.set_rpc_context() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_rpc_context() FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_rpc_context() FROM authenticated;

-- 2) FIX RLS: Add org membership checks to invoice_lines and bill_lines
-- Drop existing weak policies
DROP POLICY IF EXISTS invoice_lines_insert_rpc ON invoice_lines;
DROP POLICY IF EXISTS invoice_lines_update_rpc ON invoice_lines;
DROP POLICY IF EXISTS invoice_lines_delete_rpc ON invoice_lines;
DROP POLICY IF EXISTS bill_lines_insert_rpc ON bill_lines;
DROP POLICY IF EXISTS bill_lines_update_rpc ON bill_lines;
DROP POLICY IF EXISTS bill_lines_delete_rpc ON bill_lines;

-- Recreate with proper org membership checks via parent record
CREATE POLICY invoice_lines_insert_rpc ON invoice_lines FOR INSERT
  WITH CHECK (
    public.is_rpc_context()
    AND EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_lines.invoice_id
        AND public.user_in_organization(auth.uid(), i.organization_id)
    )
  );

CREATE POLICY invoice_lines_update_rpc ON invoice_lines FOR UPDATE
  USING (
    public.is_rpc_context()
    AND EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_lines.invoice_id
        AND public.user_in_organization(auth.uid(), i.organization_id)
    )
  )
  WITH CHECK (
    public.is_rpc_context()
    AND EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_lines.invoice_id
        AND public.user_in_organization(auth.uid(), i.organization_id)
    )
  );

CREATE POLICY invoice_lines_delete_rpc ON invoice_lines FOR DELETE
  USING (
    public.is_rpc_context()
    AND EXISTS (
      SELECT 1 FROM invoices i
      WHERE i.id = invoice_lines.invoice_id
        AND public.user_in_organization(auth.uid(), i.organization_id)
    )
  );

CREATE POLICY bill_lines_insert_rpc ON bill_lines FOR INSERT
  WITH CHECK (
    public.is_rpc_context()
    AND EXISTS (
      SELECT 1 FROM bills b
      WHERE b.id = bill_lines.bill_id
        AND public.user_in_organization(auth.uid(), b.organization_id)
    )
  );

CREATE POLICY bill_lines_update_rpc ON bill_lines FOR UPDATE
  USING (
    public.is_rpc_context()
    AND EXISTS (
      SELECT 1 FROM bills b
      WHERE b.id = bill_lines.bill_id
        AND public.user_in_organization(auth.uid(), b.organization_id)
    )
  )
  WITH CHECK (
    public.is_rpc_context()
    AND EXISTS (
      SELECT 1 FROM bills b
      WHERE b.id = bill_lines.bill_id
        AND public.user_in_organization(auth.uid(), b.organization_id)
    )
  );

CREATE POLICY bill_lines_delete_rpc ON bill_lines FOR DELETE
  USING (
    public.is_rpc_context()
    AND EXISTS (
      SELECT 1 FROM bills b
      WHERE b.id = bill_lines.bill_id
        AND public.user_in_organization(auth.uid(), b.organization_id)
    )
  );

-- 3) Ensure org_settings has the invoice numbering columns
ALTER TABLE org_settings 
  ADD COLUMN IF NOT EXISTS invoice_prefix TEXT DEFAULT 'INV-',
  ADD COLUMN IF NOT EXISTS next_invoice_number INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS invoice_padding INTEGER DEFAULT 5;

-- 4) FIX queue_email_safe: Drop existing overload first, then recreate with draft vs queued semantics
DROP FUNCTION IF EXISTS public.queue_email_safe(uuid, text, text, text, text, uuid, text, uuid, jsonb, timestamptz) CASCADE;

CREATE FUNCTION public.queue_email_safe(
  p_organization_id uuid,
  p_to_email text,
  p_to_name text default null,
  p_subject text default null,
  p_body_html text default null,
  p_template_id uuid default null,
  p_merge_data jsonb default '{}'::jsonb,
  p_scheduled_at timestamptz default null,
  p_entity_type text default null,
  p_entity_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_email_id uuid;
  v_status text;
begin
  -- Set RPC context for RLS bypass
  perform set_config('app.rpc', '1', true);
  
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Not authenticated');
  end if;
  
  -- Validate org membership
  if not public.user_in_organization(v_user_id, p_organization_id) then
    return jsonb_build_object('success', false, 'error', 'Access denied');
  end if;
  
  -- Validate required fields
  if p_to_email is null or length(trim(p_to_email)) = 0 then
    return jsonb_build_object('success', false, 'error', 'Recipient email required');
  end if;
  
  -- Determine status based on scheduled_at:
  -- NULL scheduled_at = draft (not yet ready to send)
  -- Set scheduled_at = queued (ready to be picked up by sender job)
  if p_scheduled_at is null then
    v_status := 'draft';
  else
    v_status := 'queued';
  end if;
  
  -- Insert email
  insert into email_queue (
    organization_id,
    to_email,
    to_name,
    subject,
    body_html,
    template_id,
    merge_data,
    scheduled_at,
    status,
    entity_type,
    entity_id,
    created_by
  ) values (
    p_organization_id,
    p_to_email,
    p_to_name,
    p_subject,
    p_body_html,
    p_template_id,
    p_merge_data,
    p_scheduled_at,
    v_status,
    p_entity_type,
    p_entity_id,
    v_user_id
  )
  returning id into v_email_id;
  
  -- Audit log
  insert into audit_log (organization_id, entity_type, entity_id, action, user_id, after_state)
  values (p_organization_id, 'email_queue', v_email_id, 'queued', v_user_id, 
    jsonb_build_object('to_email', p_to_email, 'status', v_status, 'scheduled_at', p_scheduled_at));
  
  return jsonb_build_object('success', true, 'email_id', v_email_id, 'status', v_status);
end;
$$;

-- Grant execute to authenticated (the function validates auth.uid() internally)
GRANT EXECUTE ON FUNCTION public.queue_email_safe(uuid, text, text, text, text, uuid, jsonb, timestamptz, text, uuid) TO authenticated;
