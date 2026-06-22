## Current behaviour

`lifecycle_send_quote` writes the rendered email into `email_queue`, and `process-email-queue` always sends it through the Lovable Emails API with a fixed `FROM_ADDRESS = "AccountancyOS <noreply@accountancyos.com>"`. The accountant's identity is never carried through, even though we already have:

- `connected_mailboxes` (Gmail/Outlook OAuth per user) with `gmail-send` and `outlook-send` Edge Functions that accept `mailbox_id` and can be called with the service-role key.
- `email_queue` columns ready for this: `mailbox_id`, `provider`, `created_by`, `queued_by`.
- `quotes` table does **not** yet record which staff user created the quote.

## Fix

Route quote emails through the creator's connected mailbox when one exists; fall back to the current noreply path (with a clear flag) when it doesn't. No UI changes required for sending — the existing Send Quote button keeps working.

### 1. Capture quote creator

Migration adds `quotes.created_by uuid references auth.users(id)` and a BEFORE INSERT trigger that defaults it to `auth.uid()` when omitted. Backfill is not required (only future sends are affected).

### 2. Resolve mailbox in `lifecycle_send_quote`

Re-create `lifecycle_send_quote` (same body as the just-fixed version) and add, before the `INSERT INTO email_queue`:

```
SELECT id, provider, email_address
  INTO v_mailbox_id, v_mailbox_provider, v_mailbox_from
FROM connected_mailboxes
WHERE organization_id = v_quote.organization_id
  AND status = 'active'
  AND sync_enabled IS NOT FALSE
  AND user_id = COALESCE(v_quote.created_by, auth.uid())
ORDER BY updated_at DESC
LIMIT 1;

-- Fallback to any active org mailbox if the creator hasn't connected one
IF v_mailbox_id IS NULL THEN
  SELECT id, provider, email_address
    INTO v_mailbox_id, v_mailbox_provider, v_mailbox_from
  FROM connected_mailboxes
  WHERE organization_id = v_quote.organization_id
    AND status = 'active'
    AND sync_enabled IS NOT FALSE
  ORDER BY updated_at DESC LIMIT 1;
END IF;
```

Persist on insert: `mailbox_id`, `provider`, `created_by = COALESCE(v_quote.created_by, auth.uid())`, `queued_by = auth.uid()`. Also set `context = 'quote_send'` (already done).

### 3. Dispatcher routes via the user's mailbox

In `supabase/functions/process-email-queue/index.ts`, extend the `email_queue` select to include `mailbox_id, provider, created_by`. For each pending row:

```
if (row.mailbox_id && row.provider) {
  const fnName = row.provider === 'outlook' ? 'outlook-send' : 'gmail-send';
  providerResponse = await supabase.functions.invoke(fnName, {
    body: {
      mailbox_id: row.mailbox_id,
      to: row.to_email,
      subject: row.subject,
      body_html: row.body_html,
      body_text: row.body_text ?? htmlToText(row.body_html),
    },
  });
  // treat invoke error / missing id as send failure (same retry/DLQ semantics as today)
} else {
  // existing sendLovableEmail(...) noreply path, unchanged
}
```

Service-role auth is already accepted by both functions (`isInternalCall = bearer === SUPABASE_SERVICE_ROLE_KEY`). Success logging and `email_queue` status updates stay identical; `email_send_log.metadata` records `provider: 'gmail' | 'outlook' | 'lovable'` for visibility.

### 4. CreateQuoteDialog

No change required — DB trigger fills `created_by`. (Optional small follow-up: also set it explicitly in the insert payload so types stay strict; out of scope for this plan unless you want it.)

## Out of scope

- Per-user "Send as" picker in the Send Quote dialog (we always use the creator's mailbox). Add later if needed.
- Threading replies back into `email_messages` for the sent quote (gmail-send/outlook-send already persist to their own tables; wiring quote-thread linkage is a separate task).
- Backfilling `created_by` on existing draft quotes.

## Verification

1. As `leon@bluetickaccountants.com` (who has a Gmail/Outlook mailbox connected — to be confirmed), create and send a new quote.
2. Confirm the recipient sees the email from `leon@bluetickaccountants.com`, not `noreply@accountancyos.com`.
3. Confirm `email_queue.mailbox_id`, `provider`, `created_by` are populated and `email_send_log.metadata.provider` is `gmail` or `outlook`.
4. Delete/disable the mailbox and re-send a different draft quote → it falls back to the noreply path and still delivers.
