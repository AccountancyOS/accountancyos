## Automation Engine — What Is Left To Build

Below is the honest, end-to-end gap list against the original production-grade brief. Status is split into **Blockers** (engine cannot run safely or at all without these), **Important but non-blocking** (engine works but is missing depth or owner controls), and **Later phase** (nice-to-have).

---

### 1. Blockers

**1.1 Event emission coverage in app code**
Of the ~20 trigger contracts registered, real `emitAutomationEvent` call-sites only exist in four files: `OnboardingDetail.tsx`, `job-status-service.ts`, `deadline-engine.ts`, `auto-rollover-service.ts`. The following lifecycle events are **never emitted from production code paths**, so enabling the matching chaser policies would do nothing:

- `LEAD_CREATED`, `LEAD_STAGE_CHANGED`, `LEAD_LOST`
- `QUOTE_SENT`, `QUOTE_ACCEPTED`, `QUOTE_REJECTED`
- `ENGAGEMENT_LETTER_SENT`, `ENGAGEMENT_LETTER_SIGNED`
- `KYC_STATUS_CHANGED`
- `HMRC_AUTH_REQUESTED`
- `CLIENT_SERVICE_ENABLED` (services category)
- `QUESTIONNAIRE_SENT`, `QUESTIONNAIRE_SUBMITTED`
- `RECORDS_REQUESTED`
- `WORKPAPER_CREATED`
- `SIGNATURE_REQUESTED`
- `CONVERSATION_RECEIVED` (inbound message SLA)
- `PAYMENT_DUE_DATE_SET`, `INVOICE_OVERDUE`
- `FILING_ACCEPTED` (only emitted on rollover, not on actual filing)

**1.2 Casing mismatch in `automation-triggers.ts`**
Helper functions emit lowercase event types (`'quote_accepted'`, `'job_status_change'`, `'client_onboarded'`) but the trigger contract registry and chaser-policy constraint use UPPERCASE (`'QUOTE_ACCEPTED'`, `'JOB_STATUS_CHANGED'`, `'CLIENT_ONBOARDED'`). The router will never match. Fix: normalise helpers to UPPERCASE and audit `routeTriggerContractEvent` lookups.

**1.3 `chaser-tick` subject handlers — 9 categories silently no-op**
`processSubjectRun` only branches on `lead`, `quote`, `engagement_letter`, `kyc_subject`, `hmrc_auth`. The Slice-E seeded categories have **no runtime handler**:

- onboarding (`onboarding_subject`)
- services (`client_service`)
- jobs_records (`records_request`)
- questionnaires (`questionnaire_response`)
- workpapers (`workpaper`)
- deadlines_payments (`deadline`)
- documents_signatures (`signature_request`)
- messages_slas (`conversation`)
- billing_revenue (`invoice`)

Each needs: target finder, stop-condition check, recipient resolver, idempotency key, queue insert.

**1.4 Idempotency on subject-based sends**
The job-based chaser path computes `${org}:${run_id}:${next_send_at}` for dedupe. The subject path needs the same guard verified end-to-end before any policy is set to `send_mode = 'auto'` — otherwise a re-trigger inside one cron window can duplicate emails.

**1.5 Suppression / unsubscribe enforcement in chaser-tick**
Policies carry `suppression_category` and `stop_on_unsubscribe = true`, but chaser-tick does not check `email_suppressions` or `email_preferences` before enqueueing. Required before any policy goes `auto`.

---

### 2. Important but non-blocking

**2.1 Default email templates per category**
Most seeded policies have `email_template_id = null`. The send path will fall back to a generic body. Need 13 paused, org-scoped templates with proper placeholders (`{{client_name}}`, `{{job_name}}`, `{{deadline_date}}`, etc.) wired through the existing placeholder service.

**2.2 Settings Centre depth**
`CategoryAutomationEditor` currently exposes only Send Mode + Active. Missing:
- Cadence editor (frequency, interval, max sends)
- Template picker
- Recipient-resolver picker (primary contact vs all directors vs bookkeeper)
- Stop-condition picker
- "Test fire on a sample record" button
- `compliance_suppression` category panel (rule-only, currently empty)

**2.3 Workflow template library**
Only `Quote To Onboarding` exists. Brief implies at minimum:
- KYC pack kickoff (on `CLIENT_ONBOARDED`)
- Records request (on `JOB_CREATED` for relevant services)
- Year-end kickoff (on `PERIOD_END`)
- Signature follow-through (on `SIGNATURE_REQUESTED`)
- Invoice dunning (on `PAYMENT_DUE_DATE_SET` / `INVOICE_OVERDUE`)

**2.4 Rule templates seed**
`automation_rule_templates` and `automation_rules` are both empty. Need a starter library so Owners can switch rules on without authoring from scratch.

**2.5 Owner observability surface**
No UI for `automation_chaser_runs`, `automation_workflow_instances`, `automation_audit_logs`, `email_send_log`. Owners cannot answer "did this fire", "why didn't this fire", "show me what would fire if I enable this". Recommended: a per-category Activity drawer in the Settings Centre plus a global Automation Activity page.

**2.6 Dry-run / "what would happen" preview**
The seed RPC already supports dry-run. The runtime needs the equivalent: a button that runs one policy in shadow mode and reports candidates without sending.

**2.7 Per-org pause kill switch**
`automation_pauses` table exists but no UI to flip "Pause all automations for this org" — Owners need a one-click halt for incidents.

---

### 3. Risks the engine still leaves open

| Risk | Status |
|------|--------|
| Duplicate emails on rapid re-trigger | Open for subject-based runs until 1.4 lands |
| Emails to suppressed / unsubscribed users | Open until 1.5 lands |
| Wrong-client / wrong-org leakage | Covered (RLS evidence pack, Slice D) |
| Automations firing before onboarding / engagement complete | Mitigated — all seeds are `is_enabled = false` until an Owner flips them |
| Jobs moved to wrong status | Not an automation risk yet — no engine writes to `jobs.status` |
| Breaking existing flows | Mitigated — all new policies seed `scope = new_records`, `applies_to_records_created_after = now()` |
| Dashboard showing misleading overdue items | Open — no automation activity surface yet (see 2.5) |

---

### 4. Later phase

- Synthetic load test for `chaser-tick` (10k seeded subjects)
- Per-policy A/B template testing
- Per-policy quiet-hours / business-hours window
- Cross-org "library" sharing of Owner-authored templates
- Sweep the 355 pre-existing Supabase linter warnings (legacy `search_path` mutability) — unrelated to this engine

---

### 5. Recommended next slice (Slice F)

Tackle the runtime safety gaps first, in this order, before any policy is allowed to leave `send_mode = 'draft'`:

1. **F1**: Normalise event-type casing in `src/lib/automation-triggers.ts` and the router. *(small)*
2. **F2**: Add `email_suppressions` + `email_preferences` check at the top of `processSubjectRun` and the job path. *(small)*
3. **F3**: Add the 9 missing `subject_type` branches in `chaser-tick`, each with a target finder, stop check, recipient resolver, and idempotency key. *(largest)*
4. **F4**: Wire emit calls into the real code paths for quote lifecycle, lead lifecycle, KYC, HMRC auth, engagement letter, questionnaire, conversation, invoice, signature, records-request, workpaper. *(medium, touches many files)*
5. **F5**: Seed default email templates per category and link them to the seeded policies. *(small)*
6. **F6**: Add an Activity drawer per category in the Settings Centre (read-only view of last 50 runs + last send log entries). *(medium)*

After F1–F6 the engine is honestly production-safe and an Owner can confidently flip the first policy to `send_mode = 'auto'`.

---

## Slice F status — what shipped this turn

- **F1 — Casing normalised**: `AutomationEventType` rewritten to UPPERCASE (`QUOTE_ACCEPTED`, `JOB_STATUS_CHANGED`, etc.) so emits now match `automation_trigger_contracts.key`. All existing helpers updated; 18 new helpers added for the previously-uncovered events (lead, quote sent/rejected, engagement letter sent/signed, KYC, HMRC auth, questionnaire, conversation, records, workpaper, signature, invoice overdue, payment due).
- **F2 — Suppression / unsubscribe enforcement**: `isSuppressed()` helper added to `chaser-tick`. Both job-based and subject-based paths now hard-stop a run if the recipient appears in `email_suppressions` or has `opted_out_at IS NOT NULL` in `email_preferences` (category-aware when the policy specifies one, and only enforced when `policy.stop_on_unsubscribe = true`).
- **F3 — 9 missing subject handlers**: `processSubjectRun` extended with branches for `onboarding_subject`, `client_service`, `records_request`, `questionnaire_response`, `workpaper`, `deadline`, `signature_request`, `conversation`, `invoice`. Each resolves the subject, evaluates a category-appropriate stop condition, resolves the recipient via client/contact, and uses the same `${org}:${run_id}:${next_send_at}` idempotency key. The `chk_chaser_run_subject_type` CHECK constraint was widened in a migration to allow these new types.
- **F5 — Default email templates**: 13 paused templates (one per category) seeded per organisation and back-linked into any seeded chaser policy that lacked a template. All templates are `status='inactive'` with `requires_unsubscribe_link=true` so nothing sends until an Owner activates them.
- **F6 — Per-policy Activity drawer**: `CategoryAutomationEditor` now exposes an activity icon per policy that opens a side sheet listing the last 50 `automation_chaser_runs` for that policy (status, target, send count, next/last send timestamps). Read-only — Owners can answer "is this firing" without leaving Settings.

## Deferred to Slice G

- **F4 — Wire the new emit helpers into real production code paths.** The helpers exist and are typed, but actual call sites (lead create/stage change in CRM, quote send/accept/reject in quote services, KYC subject status change in `KycPackPanel`, engagement letter sent/signed in `EngagementLetterSection` and `DocumentSignatureFlow`, inbound `CONVERSATION_RECEIVED` in the email inbound handler, `INVOICE_OVERDUE` from a daily scan, `QUESTIONNAIRE_SUBMITTED` from the response submit path, `RECORDS_REQUESTED`/`WORKPAPER_CREATED`/`SIGNATURE_REQUESTED` from their creation services) are deferred. Until F4 lands, the matching chaser policies will not auto-create runs — they remain Owner-enable-only via the existing `chaser-trigger-scan` job-based path.
- **F1.x cleanup**: `EVENT_TO_TRIGGER_KEY` was inlined to identity (event types now equal contract keys). When confident no legacy lowercase callers remain, remove the entire map and the `triggerKey` variable.
- **Owner kill-switch UI** for `automation_pauses` (2.7) and a "Test fire" button per policy (2.2) are still open.