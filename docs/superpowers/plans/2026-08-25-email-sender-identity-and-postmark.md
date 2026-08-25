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

## 8. DNS — NOT a gate (owner decision, 2026-08-25)

**`notify.accountancyos.com` stays delegated to Lovable for now.** It may remain while the
existing Lovable email path is still present, and be reclaimed or retired later, once every
Lovable email dependency is removed and verified.

Postmark sends via the **existing verified Return-Path**, confirmed against live DNS:

```
pm-bounces.accountancyos.com.  CNAME  pm.mtasv.net.
```

This works because a custom Return-Path makes SPF evaluate the **envelope** domain
(`pm-bounces.accountancyos.com` → Postmark's own SPF), not the From header domain. The apex SPF
therefore needs no Postmark include, and DMARC aligns under relaxed alignment since
`pm-bounces.accountancyos.com` is a subdomain of the From domain.

**So there is no DNS gate on this work.**

## 9. Classification — CONFIRMED (owner, 2026-08-25)

**Postmark (`system`):**
- Staff-facing AccountancyOS notifications to accountants or practice staff
- Authentication, invitations, security notices, platform alerts

**Practice mailbox (everything else):**
- Any email addressed to a practice's client or external contact
- Anything presented as correspondence from the practice

**Postmark must never be a fallback sender for client-facing practice correspondence.**

## 10. Hold + escalation — CONFIRMED (owner, 2026-08-25)

1. Mark the message `blocked_mailbox_unavailable` immediately; show a prominent UI warning with
   the count of held messages.
2. **One-hour grace period** for transient mailbox problems — no alert during it.
3. Still blocked after 1 hour → Postmark **system** notification to the practice administrator.
4. Reminder after 24 hours, then at most once per 24 hours while unresolved.
5. Escalation stops immediately when the mailbox recovers.
6. On recovery: revalidate held messages, cancel or supersede stale ones, send the valid ones
   through the original practice mailbox.
7. Every hold, alert, recovery, cancellation and eventual send is recorded in the audit trail.
8. **The held client-facing message itself is never sent through Postmark.** Only the *alert about
   it* goes via Postmark, and that alert is a system email to practice staff — which is squarely
   inside the `system` classification.

### Implementation note: `blocked_mailbox_unavailable` is an error code, not a status

It is recorded as `last_error_code = 'blocked_mailbox_unavailable'` with `status` staying
`'pending'` — deliberately, for three reasons:

- `email_queue_status_check` permits only `pending|sent|failed|cancelled`. Widening a status
  vocabulary is the exact defect class behind DEF-026 (eight months undetected) and DEF-032.
- That constraint is in the drift registry, and the Emails page already crashed once on an
  unhandled status value (`cancelled`), so adding another is a known hazard.
- `pending` is semantically *correct*: the message is genuinely still waiting to be sent, and will
  go out through the practice mailbox on recovery. It is not failed and not cancelled.

The user-visible behaviour is identical — the message is marked, held, counted and surfaced.

## 11. Sender address — CONFIRMED (owner, 2026-08-25)

```
POSTMARK_FROM_EMAIL = noreply@accountancyos.com
From header          = AccountancyOS <noreply@accountancyos.com>
```

Deliverable via the verified Return-Path in §8.

## 12. Escalation recipients — CONFIRMED (owner, 2026-08-25), with a schema correction

**Intent:** active members of the organisation whose `organization_users.role IN ('owner','admin')`,
alerted at their **AccountancyOS account/login email** — never an address taken from the
disconnected mailbox connection. Deduplicate. Exclude inactive or suspended users.

**Schema correction — "active" is not where you would expect it.** Verified against London:

- `public.organization_users` has only `id, organization_id, user_id, role, created_at`. There is
  **no status, `is_active` or `deleted_at` column** — membership is binary, a row exists or it
  does not. (This is the same finding recorded under DEF-012: a "pending membership" cannot exist
  in this schema.)
- `public.profiles` exposes `id` and `email` and carries no activity or suspension field either.

So eligibility must be derived from `auth.users`, which does carry it:

```sql
SELECT DISTINCT lower(u.email) AS recipient
FROM public.organization_users ou
JOIN auth.users u ON u.id = ou.user_id
WHERE ou.organization_id = $1
  AND ou.role IN ('owner','admin')
  AND u.deleted_at IS NULL                              -- not soft-deleted
  AND (u.banned_until IS NULL OR u.banned_until <= now()) -- not suspended
  AND coalesce(u.is_anonymous, false) = false
  AND u.email IS NOT NULL AND btrim(u.email) <> '';
```

Notes on the choices:
- **`auth.users.email`, not `profiles.email`.** The account/login email is the authoritative one;
  `profiles.email` is a mirror that can drift.
- **`lower()` + `DISTINCT`** satisfies the deduplication requirement, including the case where one
  person holds two memberships.
- **Email confirmation is deliberately NOT required.** An unconfirmed admin still owns that login
  address, and withholding an outage alert from them would make the failure quieter — the opposite
  of the intent. Flagged in case the owner disagrees.

**Zero eligible recipients:** do not substitute other staff. Record an escalation failure for
platform operations (an `audit_log` entry with a distinct action, so it is queryable) and leave
the messages held. An owner should always exist, so this indicates malformed legacy data and
should be visible as such rather than silently absorbed.

## 13. Open questions

1. What makes a held message "stale" on recovery — age, or superseded by a newer message for the
   same entity? (Needed for increment 4.)
2. Should escalation alerts be suppressed while a practice has *never* connected a mailbox — i.e.
   is "never connected" a different state from "connection broke"? The first is an onboarding
   gap, the second an outage.
