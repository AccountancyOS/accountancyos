
# Fix Pack: 20 Reported Issues

Scope is large. I've grouped the 20 items into 5 sequential phases so each can be reviewed and built independently. Confirm or re-prioritise before I start Phase 1.

---

## Phase 1 — Settings, Labels & Quick Wins
Small, high-visibility fixes touching shared UI.

1. **(#1) Email Templates 404** — Wire `/settings/email-templates` route to `EmailTemplates.tsx` (page exists, route missing). Add nav link if absent.
2. **(#2) Team & Permissions — Add Team Member** — Add "Invite Member" button + dialog on `PermissionsSettings` page (email + role select, writes to `user_invitations` / triggers existing invite RPC).
3. **(#3) Title-Case enum labels everywhere** — Replace raw enums (`limited_company`, `sa_non_mtd`, `company_accounts`…) with human labels. Centralise via existing `CLIENT_TYPE_LABELS` map + new `SERVICE_CODE_LABELS` map; sweep all Selects, badges, tables, and engagement letter placeholders.
4. **(#7) Hide "Sample values: …" line** on engagement letter preview at `/engagement/sample-token`.
5. **(#6) Engagement letter `/sample-token` 404** — Render a built-in sample preview when token === `sample-token` instead of DB lookup.

## Phase 2 — Engagement Letter UX
6. **(#4) Better body editor** — Replace plain textarea with the existing rich-text editor (used in Email Templates) + insert-placeholder dropdown + live preview pane.
7. **(#5) Firm name auto-populated** — Bind firm name placeholder to `organization.name` from `AppContext`; remove manual field, fall back to manual override only if org name is empty.

## Phase 3 — Services, Workpapers, Email Templates
8. **(#8) Pre-load Services Catalog** — Seed migration inserting the 14 standard services (SA non-MTD, SA MTD, MTD quarterly, VAT, Payroll, Company Accounts, CT, CS01, Pensions, CIS, P11D, Registered Office, CGT, Advisory) per new org; editable.
9. **(#9) Workpapers — drop Schema JSON, add spreadsheet editor** — Replace JSON schema field with a grid (reuse existing TB grid component / Handsontable-style). Templates become "columns + row groups" rather than JSON.
10. **(#12) Email templates pre-loaded bodies** — Seed default body HTML for every system template (welcome, records request, chaser, year-end, etc.) so accountants start from a real draft.
11. **(#13) Per-user email signatures** — Add `email_signature` (HTML) to `user_profiles`; UI in Settings → My Profile; auto-append in `send-engagement-letter`, `send-transactional-email`, and queued outbound emails.

## Phase 4 — CRM, Records Requests, Documents
12. **(#10) CRM follow-up flows (Klaviyo-style)** — New `crm_followup_sequences` table (steps: delay, subject, body, stop_on_event). Visual step builder. Remove the "service" dropdown from prospect follow-up reminders.
13. **(#11) Document trigger explainer** — Add inline help + audit panel on Records Request showing exactly which automation triggers fire for the selected service (read-only mapping table sourced from existing `automation_rules` keyed by service_code).
14. **(#16) Client document folders** — Add `document_folders` table scoped to `client_id` (no folders for accountant-only docs). UI: create/rename/delete folders, drag-drop documents.

## Phase 5 — Clients, Onboarding, Dashboards
15. **(#14) Full client details view** — Add "Details" tab on client workspace surfacing DOB, UTR, NINO, address, MTD flags, etc. via `client_detail_*` joins (memory: client-detail-query-pattern).
16. **(#15) Multi-year service selection** — On adding/editing a client with SA/Accounts/VAT/CT/MTD services, require selection of one-or-more tax years (historic → current). Persist to `client_service_periods`; job-creation engine reads this to generate jobs per year. Trigger SA questionnaire on SA client creation.
17. **(#17) Force client creation via CRM** — Remove "Add Client" button on Clients page for non-CRM flow; replace with link "Start from CRM lead". Conversion path: Lead → Quote → Engagement Letter signed → Client auto-created (already partially built in `lead-conversion-service`).
18. **(#18) Onboarding wizard — connect email provider step** — Insert new optional step between PracticeProfile and Compliance: "Connect Gmail/Outlook" with clear warning that skipping means no outbound system emails.
19. **(#19a) Archive / delete client** — Add `status` column (`active|archived|deleted`) + UI actions with confirm dialogs; archived clients filtered out of default views.
20. **(#19b) Client-specific settings** — Replace placeholder with real panel: portal visibility, default service rates, automation overrides, communication preferences, branding override.
21. **(#20) Service Status Dashboard** — Replace "Coming Soon" with real KPIs per service: open jobs, overdue, completed-this-period, avg turnaround, breached SLAs. Reuse `useJobFilters` + existing KPI primitives.

---

## Technical notes
- Phases 3–5 require migrations: services seed, workpaper template schema change, email signatures, followup sequences, document folders, client status, client_service_periods.
- Memory rules respected: Title Case via `format-utils`, canonical `p-6 space-y-6` layout, no emojis, AppContext as single source, service codes drive automation.
- No edits to `src/integrations/supabase/{client,types}.ts` or auto-managed files.

## Question
Approve all 5 phases in order, or reprioritise (e.g. tackle Phase 1 + Phase 5 first)? Reply with the phase order you want and I'll start building.
