-- ============================================================
-- Expose token_expires_at on connected_mailboxes_safe (for the Settings stale-token badge)
-- ============================================================
-- The Settings UI reads connected_mailboxes via the connected_mailboxes_safe view (which correctly
-- withholds access_token/refresh_token). To show a "token expired — reconnect" badge, the client
-- needs the expiry timestamp. token_expires_at is not sensitive on its own (it is a time, not a
-- credential), so add it to the safe projection. Column set is otherwise byte-identical to the
-- prior definition (20260218184426) so nothing else changes.
-- ============================================================

CREATE OR REPLACE VIEW public.connected_mailboxes_safe AS
  SELECT
    id, organization_id, user_id, provider, email_address,
    status, last_sync_at, mailbox_type,
    sync_enabled, error_message, token_expires_at, created_at, updated_at
  FROM public.connected_mailboxes;
