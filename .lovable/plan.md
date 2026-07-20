## Diagnosis

- There is 1 pending quote email in the outbound queue.
- It is due, unclaimed, and has a valid Gmail mailbox/provider.
- Queue config is normal: batch size is 10 and there is no rate-limit cooldown.
- Direct Gmail sending works for the same mailbox.
- The deployed `process-email-queue` function returns `processed: 0` without errors, so the issue is in the worker/runtime path, not the queued row or Gmail token.

## Plan

1. **Add worker visibility for the queue branch**
   - Add concise logs around the `email_queue` fetch and claim steps:
     - due row count selected
     - selected row ids/providers
     - claim success/failure
     - provider invoke result
   - Keep logs non-sensitive: no email bodies, tokens, or secrets.

2. **Patch the claim/fetch path defensively**
   - Keep the existing due-row filter.
   - Make the claim step return enough fields to continue from the claimed row, avoiding any stale mismatch between the initial read and update.
   - Add explicit handling if the query returns rows but all claims fail.

3. **Redeploy the worker**
   - Redeploy `process-email-queue` only.

4. **Validate immediately**
   - Invoke the worker once.
   - Confirm the pending quote row changes from `pending` to `sent` or, if it fails, that it now records a concrete failure reason on the row.
   - Check recent logs to verify whether it called `gmail-send`.

5. **If the worker sends successfully**
   - Confirm there are no remaining due pending emails.
   - Leave the once-per-minute scheduled worker in place.

6. **If it records a concrete failure**
   - Fix that specific failure next, using the new log/error detail rather than guessing.