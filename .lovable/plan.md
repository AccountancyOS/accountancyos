
# Slice A — Automation Runtime Wiring

Goal: make everything that's been built so far actually fire. The variants, KYC packs, port RPC, and dormant scan exist but nothing dispatches them yet. This slice turns the dormant infrastructure into a running system, while keeping the Phase 1 safety promise (all new automations seed as `draft` / `new_records` / `applies_to_records_created_after = now()`).

## 1. Seed paused chaser policies (migration, per-org)

Insert one row per org per category into `chaser_policies` if not already present:

| Category            | Trigger event              | Cadence (days) | Stop conditions                                |
|---------------------|----------------------------|----------------|------------------------------------------------|
| `crm_followup`      | `LEAD_CREATED`             | 3 / 7 / 14     | stage advances to `qualified+` or `lost`       |
| `quote_chaser`      | `QUOTE_SENT`               | 3 / 7 / 14 / 21| `accepted` / `rejected` / `expired`            |
| `engagement_letter` | `ENGAGEMENT_LETTER_SENT`   | 3 / 7 / 14     | `signed_at` set                                |
| `kyc_subject`       | `KYC_STATUS_CHANGED`       | 3 / 7 / 14     | subject `complete` / `waived`                  |
| `hmrc_auth`         | `HMRC_AUTH_REQUESTED`      | 5 / 10 / 20    | auth `active`                                  |

All rows: `send_mode='draft'`, `scope='new_records'`, `applies_to_records_created_after = now()`, `is_active = false`. Owner activates per category in the Settings Centre.

## 2. Extend `chaser-tick` edge function

Add a handler per new category that:
- finds matching open targets (leads / quotes / engagement letters / kyc subjects / hmrc auth requests),
- respects the policy's cadence offsets vs the anchor timestamp,
- checks stop conditions before queuing,
- resolves recipient through Phase 1 `resolve_recipients`,
- enqueues via the existing email queue when `send_mode='auto'`, otherwise writes a draft row.

Keep cron interval unchanged (Amendment 7 — no new schedulers).

## 3. Extend `workflow-tick` — Quote → Onboarding

Execute the seeded `quote_to_onboarding` workflow when triggered by `QUOTE_ACCEPTED`:

```text
step 1: port_quote_to_client(quote_id)             → client_id
step 2: start_kyc_pack(client_id, default_subjects)
step 3: enqueue HMRC auth request (sets HMRC_AUTH_REQUESTED)
step 4: enqueue engagement letter draft via send-engagement-letter
```

Each step records its own status; failures park the workflow run for retry. Idempotent via `quotes.ported_to_client_id` guard already in the port RPC.

## 4. Extend `process-automation-events`

- `QUOTE_ACCEPTED` → enqueue `quote_to_onboarding` workflow run for that org.
- `LEAD_STAGE_CHANGED` → if new stage ≥ `qualified` or = `lost`, stop any open `crm_followup` chaser instances for that lead.
- `QUOTE_REJECTED` / `QUOTE_EXPIRED` → stop `quote_chaser` instances.
- `KYC_STATUS_CHANGED` → on subject `complete`/`waived`, stop matching `kyc_subject` chaser instances.

## 5. Schedule `dormant-lead-scan` cron

Schedule via `cron.schedule` (using the insert tool, not migration, since URL + anon key are project-specific) to run daily at 02:00 UTC. Calls the existing edge function, which refreshes `lead_activity_summary` and emits `LEAD_DORMANT`.

## 6. Verification

- Confirm `email_send_log` shows 0 historic external sends after the seed (every seeded policy is `is_active=false`, `send_mode='draft'`).
- Manually trigger one `QUOTE_ACCEPTED` event in a test org and confirm: client created, KYC pack created, HMRC auth requested, engagement letter draft enqueued.
- Manually fire `LEAD_STAGE_CHANGED` to `qualified` and confirm any pending CRM chaser is stopped.
- Run `dormant-lead-scan` manually and confirm `LEAD_DORMANT` event emitted for stale leads.

## Files / functions touched

**Migration**
- One migration to seed `chaser_policies` rows per org (idempotent via `NOT EXISTS`).

**Edge function edits**
- `supabase/functions/chaser-tick/index.ts` — five new category handlers.
- `supabase/functions/workflow-tick/index.ts` — `quote_to_onboarding` executor.
- `supabase/functions/process-automation-events/index.ts` — new event routes.

**Cron**
- One `cron.schedule` insert for `dormant-lead-scan` (via insert tool).

**No UI changes in this slice.** The five dedicated Settings Centre editors remain Slice B.

## Slice status

- **Slice A — Automation Runtime Wiring**: DONE. Five paused chaser policies seeded per org, `process-automation-events` routes Quote→Onboarding workflow and stop signals, `dormant-lead-scan` scheduled daily.
- **Slice B — Per-category Settings Centre editors**: DONE. Seeded policy categories remapped to the UI keys (`crm_sales`, `engagement_letters`, `kyc_aml`, `hmrc_authorisation`); the generic `CategoryAutomationEditor` now renders them with send-mode, scope and active toggles per policy.
- **Slice C — CH sync diff-staging route + per-org opt-in**: DONE. `companies_house_diff_staging` already in place; `organization_integrations_companies_house.ch_sync_opt_in` added (default false); `companies-house-sync` edge function returns HTTP 409 `ch_sync_opt_in_required` when disabled; opt-in toggle added to Settings → Companies House.
- **Slice D — Cross-org RLS isolation evidence pack**: DONE. Audit captured in `docs/automation/rls-isolation-evidence.md`. All 23 automation/CH tables enforce RLS; non-catalog policies scope via `organization_users` membership.

## Out of scope (future)

- Synthetic load test (10k subjects) for `chaser-tick`.
- Sweep the 355 pre-existing Supabase linter warnings (legacy `search_path` mutability) — unrelated to automation engine.
