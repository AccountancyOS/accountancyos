# Email sender identity + Postmark — design

**Owner rule, 2026-08-25.** Two strictly separated sender identities:

1. **AccountancyOS → Postmark.** The platform's own mail only: password reset, auth, account
   notices.
2. **Accountant → their client → the accountant's connected mailbox** (Gmail/Outlook). All
   practice-to-client mail: quotes, proposals, engagement letters, chasers, invoices, portal
   invites.

**A connected mailbox is mandatory for an accountant user** — an onboarding requirement.

**If no mailbox is connected, or the mailbox send fails:** the email **stays in the queue**. It is
not sent by any other route, not marked failed, not dropped, not DLQ'd. **There is no Postmark
fallback for client mail, ever.** The user sees a warning.

---

## 1. The schema already supports this

No new columns are required. `public.email_queue` on London already has:

| Column | Relevance |
|---|---|
| `provider text DEFAULT 'postmark'` | CHECK allows `postmark \| gmail \| outlook` |
| `context text` | CHECK allows `quote \| onboarding \| engagement \| job \| invoice \| system \| general` |
| `mailbox_id uuid` | the accountant's connected mailbox |
| `last_error_code`, `last_error_message` | surfacing the failure |
| `acknowledged_at`, `acknowledged_by` | user dismissing the warning |
| `retry_count`, `claimed_at`, `idempotency_key` | retry + atomic claim |

The table was clearly designed for this model. Only the **code** diverges.

## 2. The defect this rule exposes

`process-email-queue/index.ts:534` selects the provider by **presence**:

```ts
if (queueRow.mailbox_id && queueRow.provider) { /* accountant mailbox */ }
else { /* default provider */ }
```

So a client email with **no mailbox falls through to the default provider**. Today that is
Lovable; the moment it becomes Postmark, a missing mailbox silently sends client mail from
AccountancyOS's domain — visible to the client, and the exact opposite of the rule.

Compounding it, `provider` **defaults to `'postmark'`**, so any sender that omits it inherits the
wrong identity. `queue_email_safe` takes no `provider`, no `mailbox_id` and no `context`
parameter at all, so every quote it enqueues currently defaults to Postmark.

**Routing must be positive, not by absence.**

## 3. Routing rule

Decide on `context`, never on whether a mailbox happens to be present:

```
context = 'system'   ->  Postmark
otherwise (incl NULL) ->  the organisation's active connected mailbox
                          if none, or the send fails -> HOLD (stay pending, warn)
```

NULL routes to the mailbox path deliberately: an unclassified email must never reach Postmark by
accident. The failure direction is "held and visible", never "sent as the wrong identity".

### Proposed classification — needs owner confirmation

Split by *relationship*, not by template:

| To the practice user, from the platform → `system` → Postmark | To the client, on the accountant's behalf → mailbox |
|---|---|
| Password reset, magic link, email change, reauthentication | Quotes / proposals |
| Signup confirmation, staff invite | Engagement letters |
| "Onboarding ready for review" (staff notification) | Chasers / reminders |
| Account and billing notices | Invoices |
| | Portal invites to clients |

## 4. Holding semantics — no new status value

Held rows keep `status='pending'`. **Do not add a `blocked` status**: `email_queue_status_check`
permits only `pending|sent|failed|cancelled`, that constraint is in the drift registry, and
widening a status vocabulary is the exact defect class behind DEF-026 and DEF-032.

Instead, on a hold:
- leave `status='pending'`
- set `last_error_code` (e.g. `no_mailbox_connected`, `mailbox_send_failed`)
- set `last_error_message` with something a human can act on
- do **not** increment `retry_count` for `no_mailbox_connected` — it is not a transient failure,
  and inflating the count would eventually trip retry limits and mask the real cause
- back off rescheduling so the drainer does not hammer a mailbox that is down

## 5. Postmark integration

`POST https://api.postmarkapp.com/email`, header `X-Postmark-Server-Token`, body
`{From, To, Subject, HtmlBody, TextBody, ReplyTo, MessageStream}`.

**The trap:** Postmark returns **HTTP 200 with a non-zero `ErrorCode`** for several failure
classes (inactive recipient, invalid address). Treating 200 as success would mark unsent mail as
`sent` — the silent-failure class this programme keeps hitting. Success requires
**`ErrorCode === 0`**; anything else is a failure with `Message` recorded.

New secrets:

| Name | Purpose |
|---|---|
| `POSTMARK_SERVER_TOKEN` | server API token |
| `POSTMARK_FROM_EMAIL` | verified From address |
| `POSTMARK_MESSAGE_STREAM` | optional, defaults to `outbound` |

Retire `LOVABLE_API_KEY`, `LOVABLE_SEND_URL`.

## 6. `auth-email-hook` must be re-fronted, not just re-plumbed

It is **not** Supabase's Send Email Hook. It verifies with `LOVABLE_API_KEY` via
`@lovable.dev/webhooks-js`, reads `x-lovable-signature`/`x-lovable-timestamp`, and
`docs/email-system.md:159` states Lovable routes auth events to that exact function name.

So when Lovable goes, **nothing calls it**. Swapping only its sender yields a correct function
that is never invoked. It must become a genuine Supabase Auth Send Email Hook — Standard Webhooks
verification (`webhook-id` / `webhook-timestamp` / `webhook-signature`, `v1,whsec_…` secret) —
and be registered in Auth settings.

**Its verification must not simply be deleted.** The endpoint injects into the email queue; an
unauthenticated version would let anyone send branded mail from the domain.

## 7. Increments

Small and additive, per the repo's discipline. Each stops for review.

1. **Drainer routing** — route on `context`; hold instead of falling back; Postmark provider with
   `ErrorCode` handling. Regression tests for "no mailbox ⇒ held, never Postmark".
2. **Sender classification** — set `context` and mailbox on every sender; extend
   `queue_email_safe` to carry them. One additive migration.
3. **Auth hook re-front** — Standard Webhooks + Postmark + register in Auth settings.
4. **Warning surface** — show held emails and their reason; wire `acknowledged_at/by`.
5. **Mandatory mailbox** — surface the requirement during onboarding.

## 8. Prerequisite outside the code

`notify.accountancyos.com` is **NS-delegated to Lovable** (`ns3/ns4.lovable.cloud`) and its SPF
points at Mailgun. Postmark cannot verify a domain whose DNS Lovable controls. Reclaim the zone at
GoDaddy first — see `docs/migration/london-baseline/LOVABLE-SURFACE.md`. DNS carries propagation
delay, so this gates everything.

## 9. Open questions

1. Confirm the §3 classification, particularly staff-facing notifications like "Onboarding ready
   for review" — platform mail, or practice mail?
2. Sending domain for Postmark: reclaim `notify.accountancyos.com`, or use a different subdomain
   and leave the Lovable-delegated zone alone until the frontend moves?
3. Should a held email eventually escalate (alert after N hours), or only surface in the UI?
