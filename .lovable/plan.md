# Unblock publish and ship today's frontend batch

You're right — I mis-stated the scope. Today's UI edits (Timeline banner, Add-Client removal, Cosec fix, portal bookkeeping nav gating, PortalMessages subject dropdown, AddServiceDialog + ClientServicesTab, CompanyDocumentsTab + CompanyDetail) are in git but stale on `app.*` and `client.*` until we publish.

## The three findings and how each clears

Verified against current source before writing this plan:

1. **`agent_security` → `edit_queue_html_xss`** — **stale, mark as fixed.**
   `src/components/email/EditQueuedEmailDialog.tsx` line 199 already renders through `<SafeEmailHtml html={...} />` (which sanitises via DOMPurify in `src/lib/sanitizeHtml.ts`). There is no `dangerouslySetInnerHTML` in that file anymore. The scanner is looking at an older revision.
   Action: `security--manage_security_finding` → `mark_as_fixed` with the explanation that the raw sink was already replaced by `SafeEmailHtml`.

2. **`supabase` → `SUPA_anon_security_definer_function_executable`** — **ignore, architectural.**
   The entire public-facing surface of this app is SECURITY DEFINER RPCs (quote acceptance by token, portal invite signup, onboarding token validation, etc.). Each function performs its own auth/tenant check internally (`user_has_organization_access`, token validation, etc.), which is the correct pattern for anon-callable RPCs. The scanner flags this as a generic pattern warning and it's `warn`-level, not a real defect.
   Action: `ignore` with a rationale that also updates security memory so future scans don't re-block on the same pattern.

3. **`supabase` → `SUPA_authenticated_security_definer_function_executable`** — **ignore, architectural.**
   Same story for the signed-in surface: every accountant-facing RPC (`lifecycle_send_quote`, `lifecycle_materialize_jobs`, `add_service_to_client`, `flush_email_queue_now`, `verify_aml_and_approve`, …) is SECURITY DEFINER with in-body `user_has_organization_access` tenancy checks. That's how tenant isolation is enforced on top of RLS, per the project's Security & Tenancy model.
   Action: `ignore` with the same rationale.

Note on the `SUPA_security_definer_view` `error`-level linter row that also appears in the raw scanner output: it isn't part of the 3 items the publish tool counted (the publish gate is fed by the `critical_findings` list, which is what `preview_ui--publish` returned as "3"). If publish still returns a block after we clear items 1–3, I'll surface that separately rather than sweep it — SECURITY DEFINER views need real remediation, not an ignore.

## Update security memory

Rewrite `security-memory` in one call to capture:
- App shape: multi-tenant accountant/portal split, tenancy enforced by `user_has_organization_access` inside SECURITY DEFINER RPCs on top of RLS.
- What to never do: expose raw HTML from any queue/inbox view without `sanitizeEmailHtml` / `SafeEmailHtml`; add anon-callable RPCs without an in-body token or org check; grant EXECUTE on a SECURITY DEFINER function without a matching internal auth check.
- What not to re-flag: SECURITY DEFINER RPCs with in-body tenant checks (linter items 0028/0029) — those are the intended pattern here.

## Publish

After the three findings are cleared, call `preview_ui--publish` with no slug/visibility change. Report:
- The returned live URL(s) for `accountancyos.lovable.app` (Lovable URL) and both custom domains (`app.accountancyos.com`, `client.accountancyos.com`) — the last two update automatically because they're already connected.
- Reminder that the deploy takes ~1 min and a hard-refresh on `app.*` and `client.*` will confirm today's UI batch is live.
- No metadata edits: `index.html` already has the AccountancyOS title/description; nothing to change.

## Out of scope

- No new database migrations.
- No edge function redeploys (already done in the previous turn).
- No code changes — the XSS finding is stale, not open.
- No visibility change (project stays public per current setting).
