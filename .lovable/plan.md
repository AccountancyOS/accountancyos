
# AccountancyOS Automation Engine — Approved Plan (Amendments Applied)

Plan approved. Preserve existing primitives: `automation_rules`, `automation_chaser_policies`, `automation_workflows`, `sla_definitions`. No engine refactor — safe extension only.

**Build order:** Phase 1 first, in isolation. Phases 2–4 follow only after Phase 1 sign-off.

---

## Phase 1 Scope (this build)

Engine safety + migration layer. No external automations are wired in Phase 1.

### Tables to create

All tables: `id uuid pk`, `org_id`, `created_at`, `updated_at`, RLS scoped via `current_user_org_ids()`, GRANTs to `authenticated` + `service_role`.

| Table | Purpose | Notable columns |
|---|---|---|
| `automation_pauses` | Pause at org/client/job/rule level | `scope`, `target_id`, `paused_by`, `reason`, `expires_at` |
| `email_suppressions` | Bounces, complaints, unsubscribes | `email`, `category nullable`, `reason`, `source` |
| `email_unsubscribe_tokens` | One token per email per org | `email`, `token`, `used_at` |
| `email_preferences` | Contact-level prefs (Amendment 12) | `email`, `client_id nullable`, `contact_id nullable`, `lead_id nullable`, `category`, `opted_out_at` |
| `automation_client_overrides` | Per-client rule config | `client_id`, `rule_id`, `enabled`, `config_overrides jsonb` |
| `automation_job_overrides` | Per-job rule config | `job_id`, `rule_id`, `enabled`, `config_overrides jsonb` |
| `automation_audit_logs` | Settings change history (insert-only) | `actor_id`, `entity_type`, `entity_id`, `action`, `before jsonb`, `after jsonb` |
| `client_tax_authorisations` | HMRC auth lifecycle (Amendment 4) | Decision-3 fields + `next_chase_at`, `chaser_count`, `last_email_template_id`; **partial unique index** on `(org_id, client_id, tax_service_type, coalesce(client_service_id,'00000000-...'::uuid))` |
| `record_request_items` | Itemised records (Amendments 2 & 3) | `client_id`, `job_id`, `label`, `status` (11 values below), `due_at`, `last_chased_at`, `chaser_count`, `requested_by`, `received_by`, `verified_by`, `waived_by`, `waiver_reason`, `source`, `client_visible bool default true`, `sort_order`, `metadata jsonb` |
| `client_approval_packs` | Versioned approval (Amendment 13) | `client_id`, `job_id`, `status`, `version_number`, `superseded_by`, `sent_at`, `approved_at`, `approved_by_contact_id`, `approval_method`, `approval_ip`, `approval_user_agent`, `approval_notes`, `documents jsonb` |
| `recurring_invoice_schedules` | Idempotent billing (Amendment 15) | `client_id`, `service_id`, `cadence`, `start_date`, `end_date`, `billing_day`, `payment_terms_days`, `tax_rate_id`, `invoice_template_id`, `auto_send bool`, `create_draft_only bool`, `next_run_at`, `last_run_at`, `last_invoice_id`, `failure_count`, `amount`, `currency`, `status` (active/paused/cancelled/completed/failed) |
| `revenue_events` | Append-only ledger (Amendment 14) | `client_id`, `service_id`, `invoice_id`, `event_type`, `source_type`, `source_id`, `reversal_of_event_id`, `currency`, `tax_amount`, `net_amount`, `gross_amount`, `recognition_period_start`, `recognition_period_end`, `occurred_at`; no UPDATE/DELETE policies |
| `automation_idempotency_keys` | Dedup ledger (Amendment 8) | `key text unique`, `rule_id`, `created_at` |
| `automation_entity_link_suggestions` | Suggestion-first tagging (Amendment 17) | `source_entity_type`, `source_entity_id`, `suggested_entity_type`, `suggested_entity_id`, `confidence_score`, `suggestion_reason`, `accepted_by`, `accepted_at`, `rejected_by`, `rejected_at` (reuse existing entity link table if present; otherwise create) |

**`record_request_items.status` enum:** `not_requested`, `requested`, `pending`, `received`, `invalid`, `missing`, `waived`, `not_applicable`, `client_says_unavailable`, `reviewed`, `verified`.

### Tables to extend

- `automation_rules`: add `scope text default 'all_records'` (`new_records`|`all_records`), `applies_to_records_created_after timestamptz`, `paused_at`, `category text`, `send_mode text` (`auto`|`draft`|`task_only`|`disabled` — Amendment 9), `recipient_resolver text` (Amendment 11), `idempotency_template text` (Amendment 8).
- `automation_rule_templates`: align `category` to the 14 Settings Centre categories; add `default_scope`, `default_frequency`, `default_template_id`, `default_send_mode`, `default_recipient_resolver`, `is_sales_category bool` (Amendment 5).
- `automation_trigger_contracts`: seed all missing contracts (full list below).
- `automation_chaser_policies`: add `scope`, `applies_to_records_created_after`, `category`, `suppression_category`, `stop_on_unsubscribe bool default true`, `send_mode`, `recipient_resolver`, `is_sales bool`.
- `sla_definitions`: add `category`, `feeds_dashboard bool`.
- `templates` / `message_templates`: add `requires_unsubscribe_link bool`, `required_merge_fields text[]`, `recipient_rule text`.

### Trigger contracts to seed (Amendment 1 — full list, 35)

Original 18: `LEAD_CREATED`, `LEAD_STAGE_CHANGED`, `LEAD_LOST`, `LEAD_DORMANT`, `QUOTE_ACCEPTED`, `QUOTE_REJECTED`, `ENGAGEMENT_LETTER_SENT`, `KYC_STATUS_CHANGED`, `HMRC_AUTH_REQUESTED`, `HMRC_AUTH_COMPLETED`, `RECORDS_REQUESTED`, `RECORDS_PARTIAL`, `RECORDS_RECEIVED`, `RECORDS_VERIFIED`, `WORKPAPER_APPROVED`, `FILING_REJECTED`, `INVOICE_PAYMENT_FAILED`, `DOCUMENT_SIGNED`.

Added (Amendment 1): `SERVICE_ACTIVATED`, `SERVICE_DEACTIVATED`, `SERVICE_FEE_CHANGED`, `JOB_CREATED`, `JOB_COMPLETED`, `WORKPAPER_CREATED`, `WORKPAPER_LOCKED`, `DOCUMENT_UPLOADED`, `DOCUMENT_SIGNATURE_REQUESTED`, `MESSAGE_RECEIVED`, `INVOICE_CREATED`, `PAYMENT_DUE`, `CLIENT_PORTAL_INVITE_SENT`, `CLIENT_ONBOARDING_STARTED`, `RECORD_ITEM_STATUS_CHANGED`, `CLIENT_APPROVAL_PACK_SENT`, `CLIENT_APPROVAL_PACK_APPROVED`.

### Settings Centre categories (14)

CRM & Sales · Onboarding · Engagement Letters · KYC / AML · HMRC Authorisation · Services · Jobs & Records · Questionnaires · Workpapers · Deadlines & Payments · Documents & Signatures · Messages & SLAs · Billing & Revenue · Compliance / Suppression.

**Sales vs service distinction (Amendment 5):** CRM & Sales = sales category, mandatory unsubscribe footer + token. All others = service-critical; respect `email_preferences` category opt-outs but not bulk unsubscribe. UI badges each automation accordingly.

### RPCs

- `pause_automation(scope, target_id, reason, expires_at)` / `resume_automation(...)`
- `apply_client_override(...)` / `apply_job_override(...)`
- `record_automation_audit(...)` — invoked by triggers on rule/policy/template writes
- `check_suppression(email, category) returns boolean`
- `enqueue_unsubscribe_token(email) returns token` / `consume_unsubscribe_token(token, category)`
- `seed_org_automation_defaults(org_id, dry_run boolean default true)` returns JSON summary (Amendment 6)
- `claim_idempotency_key(key, rule_id) returns boolean` (Amendment 8)
- `validate_template(template_id, automation_context) returns jsonb` (Amendment 10)
- `resolve_recipients(rule_id, entity_type, entity_id) returns table` (Amendment 11)

### Edge functions

**New (Phase 1 only):** `handle-email-unsubscribe`, `handle-email-suppression`, `seed-org-defaults` (wraps `seed_org_automation_defaults`).

**Extend (gating only — no new automations yet):**
- `process-email-queue`: check `email_suppressions`, `email_preferences`, `automation_pauses`.
- `chaser-tick` / `chaser-trigger-scan`: honour scope, `applies_to_records_created_after`, pauses, overrides, `send_mode`, idempotency.
- `process-automation-events`: same gating.
- `workflow-tick`: same gating per step.

**Amendment 7 — no duplicate schedulers.** `lead-followup-tick` and `quote-chaser-tick` are dropped. `chaser-tick` handles them via policy `category`. Only true scans/non-chaser ticks remain for later phases: `dormant-lead-scan`, `recurring-invoice-tick`, `deadline-risk-scan`, `document-archive-tick`, `revenue-rollup`.

### UI (Phase 1)

- `src/pages/settings/AutomationSettingsCentre.tsx` — shell with 14 categories, abstracts primitive type. Per-item editor: enable, frequency, template, scope, send_mode, recipient resolver, test send. Sales vs service badge.
- `src/pages/settings/EmailPreferencesPage.tsx` + per-client/contact drawer (Amendment 12).
- Client detail: HMRC Authorisation panel (Amendment 4).
- Migration review banner with dry-run report (Amendment 6): templates seeded, policies seeded, rules seeded, 0 historic emails queued, 0 historic records activated.
- Unsubscribe public page `/unsubscribe`.
- Template editor: live validation panel (Amendment 10) — block save/activation on validation failure.
- Audit log viewer (Owner/Admin).

### Migration safety (Amendment 6 — dry-run)

1. Deploy schema.
2. For every existing org: call `seed_org_automation_defaults(org_id, dry_run=true)` and store summary.
3. Settings Centre shows banner: "Review N seeded automations. 0 emails will be sent until you activate them."
4. External-facing rules/chasers seeded with `scope='new_records'`, `applies_to_records_created_after=now()`, `send_mode='draft'` (Amendment 9).
5. Internal-only rules may be seeded as `scope='all_records'` + `send_mode='auto'`.
6. Bulk activation for historic records requires explicit Owner confirmation per category.

### Cross-cutting amendments (applied to all future phases too)

- **#8 Idempotency** — every rule declares an `idempotency_template`; engine calls `claim_idempotency_key` before any external side effect. Examples documented in code comments per rule.
- **#10 Template validation** — `validate_template` runs on save and on activation. Required merge fields, recipient rule, non-blank subject/body, unsubscribe link for sales categories, portal/action links where required.
- **#11 Recipient resolution** — named resolvers: `lead_primary`, `client_primary_contact`, `all_signers`, `payroll_contact`, `bookkeeping_contact`, `director_contact`, `partner_or_trustee`, `assigned_accountant`, `assigned_reviewer`, `partner_in_charge`.
- **#16 Deadline risk levels** — `green|amber|red|critical|blocked` with explainable reasoning stored as `risk_reason text` (built in Phase 4 but contract defined now).
- **#17 Suggestion-first tagging** — store via `automation_entity_link_suggestions`, never auto-apply low-confidence.
- **#18 Engagement letter templates** — templating model supports variants by `client_type`, `service_code`, `legal_entity`, `firm_preference`, `engagement_kind` (one_off/recurring/annual_renewal). Seed one default; allow full replacement.
- **#19 KYC subjects** — KYC entity model must allow subjects of type `individual_client`, `director`, `partner`, `llp_member`, `trustee`, `psc`, `authorised_contact`. Phase 1 only confirms the data model can express this; build occurs in Phase 2.
- **#20 Companies House diff** — sync writes to a staging diff with accept/reject UI; never silent overwrite of user-entered fields. Phase 1 only formalises the contract.
- **#21 Dashboard feeds** — every Phase 1 table and counter is exposed via a `v_automation_dashboard_*` view set so later phases can plug straight in.

### RLS / security tests (Amendment 22)

- Org A cannot read/write Org B `automation_rules`, `automation_chaser_policies`, `templates`, `automation_audit_logs`.
- Org A cannot trigger Org B chasers via RPC.
- Unsubscribe token cannot opt-out an address in another org's suppression list.
- Public `/unsubscribe` endpoint leaks no client data — only success/already-unsubscribed/invalid.
- Service-role writes scoped through SECURITY DEFINER RPCs that re-check `org_id`.
- Client portal role cannot read internal automation settings tables.

---

## Phase 1 Deliverables (handover required before Phase 2)

After Phase 1 ships, the build response must include:
1. Migration summary (all new/extended tables).
2. Full RLS policy list.
3. All new RPCs with signatures.
4. Edge function diffs (gating only, no new sends).
5. UI surfaces added.
6. Evidence: `email_send_log` shows 0 historic sends queued post-migration for any existing org.
7. Evidence: suppression / pause / scope checks pass integration tests.
8. RLS cross-org isolation test results.
9. Template validation test results.
10. Open issues / deferred items before Phase 2.

---

## Later Phases (locked, not built now)

- **Phase 2:** CRM follow-up, quote chaser, quote→onboarding workflow, lost/dormant, engagement letter (variant templates), KYC/AML (multi-subject), HMRC auth chaser, Companies House diff sync, quote→client/services/fees port.
- **Phase 3:** Service activate/deactivate/fee-change, job create/rollover, records & partial records chasers (using 11-status model + items table), questionnaires, workpapers (create/approve/lock), internal review, client approval packs (versioned), filing accepted/rejected.
- **Phase 4:** Deadline reminders + risk scan (5 levels), payment reminders, document upload + signature chasers, 7-year archive, message SLA, suggestion-first tagging, quote→billing, recurring invoices, payment failed, revenue rollup.

All use cases reuse `chaser-tick` where the behaviour is cadenced; only true scans get dedicated edge functions.
