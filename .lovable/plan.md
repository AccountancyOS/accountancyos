### Goal
Send the signup confirmation email from a branded address on `accountancyos.co.uk` instead of `no-reply@auth.lovable.cloud`.

### Approach
Use Lovable's built-in branded email system (Postmark isn't natively supported on Lovable Cloud; the managed system gives the same outcome — branded sender, high deliverability — without you managing a third-party account).

### Steps

1. **Check email domain status** — see whether `accountancyos.co.uk` is already configured for sending.

2. **Set up sender domain (if not already)** — open the email domain setup dialog so you can add `accountancyos.co.uk`. This delegates a subdomain (e.g. `notify.accountancyos.co.uk`) to Lovable's nameservers via NS records you'll add at your DNS provider. The display From address can still appear on the root domain (e.g. `no-reply@accountancyos.co.uk`) using the "display from root" option in the setup dialog.

3. **Set up email infrastructure** — runs automatically after the domain dialog completes. Provisions the queue, send log, and dispatcher.

4. **Scaffold branded auth email templates** — creates the 6 auth email templates (signup confirm, magic link, password recovery, invite, email change, reauthentication) and the `auth-email-hook` edge function.

5. **Apply AccountancyOS brand styling** to the scaffolded templates — read `src/index.css` tokens (primary, foreground, muted, radius) and project fonts, apply them inline to each template, match the professional tone (Title Case, no emojis). White email body background per the design rule.

6. **Deploy the `auth-email-hook` edge function** — activates the templates.

7. **Tell you what to do next** — add NS records at your DNS provider, monitor DNS verification in Cloud → Emails. Auth emails start sending from your branded address once DNS is verified (default Lovable templates continue in the meantime so signups aren't blocked).

### Notes on Postmark
- Lovable Cloud's managed email pipeline uses Mailgun under the hood, not Postmark. You don't need a Postmark account.
- If you specifically need Postmark for any reason later (e.g. an existing Postmark template library), it would have to be wired in as a custom SMTP provider on Supabase Auth, which sits outside Lovable Cloud's managed flow and would require disabling Lovable Emails first. Recommend staying on the managed path.

### Files touched (in build mode)
- `supabase/functions/auth-email-hook/index.ts` + `deno.json` (created by scaffold)
- `supabase/functions/_shared/email-templates/*.tsx` (6 templates, styled to AccountancyOS brand)
- `supabase/config.toml` (function config added by scaffold)