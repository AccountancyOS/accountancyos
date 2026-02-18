
-- Fix security definer view warning
DROP VIEW IF EXISTS public.connected_mailboxes_safe;
CREATE VIEW public.connected_mailboxes_safe 
WITH (security_invoker = true) AS
  SELECT id, organization_id, user_id, provider, email_address, 
    status, last_sync_at, mailbox_type, sync_enabled, error_message, created_at, updated_at
  FROM public.connected_mailboxes;
