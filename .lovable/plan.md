

# Fix: Remove send-email Open Relay and Dead Code

## Diagnosis Summary

The `send-email` edge function has JWT verification enabled (gateway-level auth), so it is **not** an unauthenticated open relay. However, it performs **zero authorization** inside the function — any authenticated user (including portal clients) can send arbitrary emails to arbitrary recipients via Postmark, with spoofable sender addresses. All three modes (`direct`, `queue`, `process_queue`) are dead code or redundant with the canonical email system.

## Finding Correction

The original security finding overstated the risk ("unauthenticated open relay"). The actual risk is: **any authenticated user can send arbitrary emails without authorization checks**. This is still a serious vulnerability — a portal client could send phishing emails through your Postmark account — but it is not unauthenticated.

## Required Fix

### Step 1: Delete the send-email edge function entirely

All three modes are dead or redundant:
- `direct` mode — `sendEmailDirect()` is never imported or called anywhere in the codebase
- `queue` mode — `sendQueuedEmail()` is never imported or called anywhere
- `process_queue` mode — redundant with the dedicated `process-email-queue` edge function

**Action:** Delete `supabase/functions/send-email/` directory and remove `[functions.send-email]` from `supabase/config.toml`.

### Step 2: Remove dead client code

**File: `src/lib/email-service.ts`** — Delete `sendEmailDirect()`, `sendQueuedEmail()`, `processEmailQueue()`, and `queueAndSendEmail()` functions. These are never imported. The canonical email path is `email-safe-service.ts` (RPCs) + `process-email-queue` (cron).

### Step 3: Fix Settings.tsx process_queue call

**File: `src/pages/Settings.tsx`** — The manual "Process Email Queue" button currently calls `send-email` with `mode: "process_queue"`. Change this to invoke `process-email-queue` instead (the canonical cron function).

### Step 4: Update security finding

Mark the `send_email_open_relay` finding as fixed with explanation that the function was removed entirely.

## Regression Risks

- **None from deletion** — no code imports or calls the removed functions
- **Settings.tsx** — the manual queue processing button must be re-pointed to `process-email-queue`
- The canonical email flow (`email-safe-service.ts` → `queue_email_safe` RPC → `process-email-queue` cron) is completely unaffected

## Test Cases

1. Verify `process-email-queue` still processes queued emails correctly after `send-email` is deleted
2. Verify the Settings page "Process Queue" button works after re-pointing to `process-email-queue`
3. Verify no TypeScript compilation errors after removing dead exports
4. Confirm no other files import from `email-service.ts` functions that are being removed

## Files Changed

| File | Action |
|---|---|
| `supabase/functions/send-email/` | Delete directory |
| `supabase/config.toml` | Remove `[functions.send-email]` block |
| `src/lib/email-service.ts` | Remove dead functions (`sendEmailDirect`, `sendQueuedEmail`, `processEmailQueue`, `queueAndSendEmail`) |
| `src/pages/Settings.tsx` | Re-point queue processing to `process-email-queue` |

