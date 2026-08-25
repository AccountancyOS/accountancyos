# The remaining Lovable surface — beyond the database

**Established 2026-08-25 from live DNS, live TLS and the repository.** Everything below is
verified unless explicitly marked as inference.

The migration so far has moved the **database and Edge Functions**. That is genuinely done and
verified. But AccountancyOS depends on Lovable in **five further ways**, four of which were not
in the cutover plan. Two of them break email permanently if Lovable Cloud is removed first.

---

## 1. The frontend is hosted by Lovable

| Host | Resolves to | Reverse DNS |
|---|---|---|
| `app.accountancyos.com` | `185.158.133.1` | `lovable-app-cd-1-4.p.l5e.io` |
| `accountancyos.com` | `185.158.133.1` | same |

Serving `HTTP/2 200` with an `x-deployment-id` header and a Google Trust Services certificate —
i.e. Lovable's CDN terminates TLS and serves the app.

**The plan treated "repoint the frontend" as editing `vite.config.ts`.** It is not. It is
*find new hosting*, deploy the built app there, and move an A record. Until that is done,
`app.accountancyos.com` serves a bundle that points at the **legacy** Supabase project — so the
London database has no user-facing application in front of it.

## 2. The email sending domain is NS-delegated to Lovable

```
notify.accountancyos.com.   NS   ns3.lovable.cloud.
notify.accountancyos.com.   NS   ns4.lovable.cloud.
```

The parent zone `accountancyos.com` is at GoDaddy (`ns39/ns40.domaincontrol.com`), so the
delegation is **removable** — but while it stands, Lovable's nameservers are authoritative for
every record under `notify.accountancyos.com`, including SPF, DKIM and MX.

**Inference, not verified:** if Lovable Cloud is removed, those nameservers may stop serving the
zone, at which point `notify.accountancyos.com` ceases to resolve and *all* mail authentication
for the sending domain disappears at once. This is not something to discover empirically.

## 3. Lovable Email is Mailgun EU underneath

```
notify.accountancyos.com.  MX   10 mxa.eu.mailgun.org.
notify.accountancyos.com.  MX   10 mxb.eu.mailgun.org.
notify.accountancyos.com.  TXT  "v=spf1 include:mailgun.org ~all"
```

So the "Lovable Email API" is a Mailgun relay. Moving to Postmark therefore means replacing the
SPF include (`include:mailgun.org` → `include:spf.mtasv.net`), adding Postmark's DKIM selector
and a Return-Path CNAME — none of which can be created while the zone is delegated to Lovable.

## 4. DMARC reports for the apex domain go to Lovable

```
_dmarc.accountancyos.com.  TXT  "v=DMARC1; p=none; pct=100; rua=mailto:dmarcreports@lovable.dev"
```

This is on the **GoDaddy-hosted apex zone**, so it is editable today. Worth changing regardless
of migration timing: aggregate reports about your domain's mail are currently delivered to a
third party. Note `p=none`, so DMARC is in monitor-only mode and is not enforcing anything.

## 5. Lovable routes the auth emails — this is not Supabase's Send Email Hook

This is the one that matters most for the rewrite, and it was nearly mis-scoped as "swap the
email provider".

`supabase/functions/auth-email-hook/index.ts` verifies its inbound request with
`verifyWebhookRequest({ req, secret: LOVABLE_API_KEY, parser: parseEmailWebhookPayload })` from
`npm:@lovable.dev/webhooks-js`, accepts headers `x-lovable-signature` / `x-lovable-timestamp`,
and reads a `run_id` from the payload. `docs/email-system.md:159` states plainly:

> Rename the `auth-email-hook` edge function (**Lovable routes auth events to this exact name**)

**So the trigger is Lovable, not Supabase Auth.** Supabase's own Send Email Hook uses the
Standard Webhooks spec — `webhook-id` / `webhook-timestamp` / `webhook-signature` headers and a
`v1,whsec_…` secret — which is a *different inbound contract entirely*.

Consequence: when Lovable goes, **nothing will call `auth-email-hook`**. Swapping its sender to
Postmark would produce a correct function that is never invoked. It must be re-fronted as a
genuine Supabase Auth Send Email Hook, with Standard Webhooks verification, and registered in
Auth settings.

**Do not simply delete the Lovable verification.** That endpoint injects into the email queue; an
unauthenticated version could be used to send arbitrary branded mail from your domain.

---

## Why this is urgent rather than merely important

Passwords are not in the export, so **every user must reset via email at cutover**. That path is:

```
Supabase Auth  →  [hook]  →  auth-email-hook  →  enqueue_email  →  pgmq
               →  process-email-queue  →  [provider]  →  notify.accountancyos.com  →  user
```

Today, **four of those six links are Lovable-owned**: the hook trigger, the provider, the sending
domain's DNS, and the app the user lands on afterwards. Remove Lovable Cloud before replacing
them and the recovery path is broken with no quick fix — the DNS alone carries propagation delay.

## Ordered prerequisites, before Lovable Cloud is removed

1. **Reclaim `notify.accountancyos.com`** — delete the NS delegation at GoDaddy, recreate the zone
   there. *(Do first: everything else waits on DNS.)*
2. **Verify the domain at Postmark** — DKIM selector + Return-Path CNAME; replace the Mailgun SPF
   include.
3. **Repoint `_dmarc.accountancyos.com`** `rua` to an address you control.
4. **Re-front `auth-email-hook`** as a Supabase Auth Send Email Hook with Standard Webhooks
   verification, and register it in Auth settings.
5. **Rewrite `process-email-queue`'s provider path** to Postmark.
6. **Host the frontend somewhere you control** and move the `app.accountancyos.com` A record.
7. **Only then** consider removing Lovable Cloud — and remember the export becomes
   undownloadable at that moment.

## Open questions for the owner

- Where does the frontend go? (Vercel is already set up in this repo's tooling.)
- Keep `notify.accountancyos.com` as the sending subdomain, or send from something else?
- Does the Gmail/Outlook per-mailbox sending path stay as-is? It is independent of Lovable and
  currently works, so it need not change.
