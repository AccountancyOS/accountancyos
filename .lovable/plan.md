
# Phase 2 — CRM, Onboarding, Engagement, KYC/AML, HMRC Auth, CH Diff (single build)

Built on the Phase 1 safety layer. All external automations seed as `send_mode='draft'`, `scope='new_records'`, `applies_to_records_created_after=now()`. Owner must activate per category.

## Scope (9 areas)

1. **CRM follow-up chaser** — cadenced reminders on `LEAD_CREATED` + stage dwell time.
2. **Quote chaser** — cadenced reminders on `QUOTE_SENT` until `accepted`/`rejected`/`expired`.
3. **Quote → onboarding workflow** — multi-step on `QUOTE_ACCEPTED`: create client, port services/fees, send engagement letter, request KYC, request HMRC auth.
4. **Lost / dormant lead scan** — daily scan: `LEAD_DORMANT` event after N days no activity; `LEAD_LOST` on explicit mark.
5. **Engagement letter variants** — template variant model by `client_type`, `service_code`, `legal_entity`, `engagement_kind`. Resolver picks the right variant on send.
6. **KYC/AML multi-subject** — KYC packs supporting subjects `individual_client | director | partner | llp_member | trustee | psc | authorised_contact`; chaser per outstanding subject.
7. **HMRC auth chaser** — uses `client_tax_authorisations` from Phase 1; cadenced reminders until `active`; blocks filing per existing HMRC auth blocking memory.
8. **Companies House diff sync** — CH sync writes to staging diff table with accept/reject UI; never silent-overwrites user-entered fields.
9. **Quote → client port** — atomic RPC porting accepted quote's services, fees, billing cadence, and contacts into the new client record.

## Database changes

### New tables

- `engagement_letter_template_variants` — `template_id`, `client_type`, `service_code`, `legal_entity`, `engagement_kind`, `is_default bool`, `body`, `subject`, `merge_fields`. Unique partial index on `(org_id, client_type, service_code, legal_entity, engagement_kind)` where active.
- `kyc_packs` — `client_id`, `status` (`not_started|in_progress|submitted|approved|rejected|expired`), `due_at`, `submitted_at`, `approved_at`, `approved_by`, `expires_at`, `notes`.
- `kyc_pack_subjects` — `kyc_pack_id`, `subject_type` enum (7 values above), `subject_ref_type` (`contact|director|free_text`), `subject_ref_id`, `subject_name`, `subject_status` (`pending|documents_requested|partial|complete|waived|failed`), `due_at`, `last_chased_at`, `chaser_count`, `documents jsonb`, `waiver_reason`.
- `companies_house_diff_staging` — `client_id`, `company_number`, `field_path`, `current_value jsonb`, `incoming_value jsonb`, `source` (`ch_sync`), `detected_at`, `status` (`pending|accepted|rejected|superseded`), `decided_by`, `decided_at`, `decision_notes`. Index on `(org_id, status, detected_at)`.
- `lead_activity_summary` — materialised projection used by dormant scan: `lead_id`, `last_activity_at`, `last_stage_change_at`, `stage`, `dormant_threshold_days`, `is_dormant bool`. Refreshed by `dormant-lead-scan` edge function.

### Extend tables

- `automation_workflows`: add `definition_kind text` (`linear|branching`) and `seed_key text unique nullable` for idempotent seeding of the Quote→Onboarding workflow.
- `quotes`: add `ported_to_client_id uuid nullable`, `ported_at timestamptz nullable` (set by port RPC).
- `clients`: add `last_kyc_pack_id`, `last_engagement_letter_id` (FKs, nullable) — convenience pointers, not source of truth.
- `email_templates`: ensure `variant_group_key` exists to group engagement letter variants under one logical template.

### Trigger contracts (already seeded in Phase 1)

Phase 2 wires rules/chasers/workflows to:
`LEAD_CREATED`, `LEAD_STAGE_CHANGED`, `LEAD_DORMANT`, `LEAD_LOST`, `QUOTE_SENT` (add if missing), `QUOTE_ACCEPTED`, `QUOTE_REJECTED`, `ENGAGEMENT_LETTER_SENT`, `KYC_STATUS_CHANGED`, `HMRC_AUTH_REQUESTED`, `HMRC_AUTH_COMPLETED`, `CLIENT_ONBOARDING_STARTED`.

### RPCs

- `port_quote_to_client(quote_id) returns uuid` — atomic, SECURITY DEFINER. Creates `clients` row from accepted quote, copies services/fees/contacts, sets `quotes.ported_to_client_id`, fires `CLIENT_ONBOARDING_STARTED`. Idempotent via `quotes.ported_to_client_id` guard.
- `resolve_engagement_letter_variant(client_id, service_codes text[], engagement_kind) returns uuid` — picks most specific matching variant; falls back to default; logs choice.
- `start_kyc_pack(client_id, subjects jsonb) returns uuid` — creates `kyc_packs` + `kyc_pack_subjects`. Subject list derived from client_type by default.
- `record_kyc_subject_progress(subject_id, new_status, actor_id, notes)` — updates subject; recomputes pack status; emits `KYC_STATUS_CHANGED`.
- `apply_ch_diff(diff_id, decision text, notes)` — `accept` writes to live `companies` field, `reject` marks superseded. Audit-logged.
- `mark_lead_dormant(lead_id, reason)` / `mark_lead_lost(lead_id, reason)` — emits events.

### Seed inserts (data, via insert tool, not migration)

- 1 default engagement letter variant per `engagement_kind` (one_off / annual_renewal / recurring).
- Chaser policies (all `send_mode='draft'`, `scope='new_records'`, `applies_to_records_created_after=now()`):
  - CRM follow-up: 3 / 7 / 14 days after `LEAD_CREATED`, stop on stage change to `qualified`+ or `lost`.
  - Quote chaser: 3 / 7 / 14 / 21 days after `QUOTE_SENT`, stop on accept/reject/expire.
  - Engagement letter chaser: 3 / 7 / 14 days, stop on signed.
  - KYC subject chaser: 3 / 7 / 14 days per outstanding subject, stop on `complete|waived`.
  - HMRC auth chaser: 5 / 10 / 20 days, stop on `active`.
- Dormant threshold: 30 days default.

## Edge functions

### New
- `dormant-lead-scan` (cron daily 02:00 UTC) — refresh `lead_activity_summary`, emit `LEAD_DORMANT` for crossings.
- `companies-house-diff-sync` — extends existing `companies-house-sync` to write to staging instead of overwriting. (Modify existing function rather than duplicating.)

### Extend (no new schedulers per Amendment 7)
- `chaser-tick` — handle new policy categories: `crm_followup`, `quote_chaser`, `engagement_letter`, `kyc_subject`, `hmrc_auth`. Resolves recipient via Phase 1 `resolve_recipients`.
- `workflow-tick` — execute the seeded `quote_to_onboarding` workflow steps: port → create kyc pack → request hmrc auth → enqueue engagement letter draft.
- `process-automation-events` — route `QUOTE_ACCEPTED` to workflow trigger; `LEAD_STAGE_CHANGED` to stop CRM chaser when stage advances.

## UI surfaces

- **Settings Centre** — populate the existing 14-category shell:
  - CRM & Sales: CRM follow-up, Quote chaser, Lost/Dormant config.
  - Onboarding: Quote→Onboarding workflow editor (steps reorderable, draft/auto/disabled per step).
  - Engagement Letters: variant matrix editor (client_type × service_code × kind).
  - KYC / AML: subject defaults per client_type, chaser cadence.
  - HMRC Authorisation: chaser cadence; surfaces blocking status.
- **Client detail**
  - KYC Pack panel: subject list with status, "Mark Received / Waived", "Send Chaser Now".
  - Engagement Letter panel: variant resolved on send, re-sign trigger surfaced.
  - HMRC Authorisation panel (already in Phase 1) — wire chaser controls.
  - Companies House Diff panel: pending diffs with Accept / Reject buttons (per field).
- **Lead detail** — Dormant/Lost actions; show active CRM follow-up cadence + next scheduled chaser.
- **Quote detail** — Port-to-Client action (only when accepted and not yet ported); shows porting status.
- **CH Diff inbox** (`/settings/companies-house/diffs`) — global queue across clients for Owner/Admin.

## Migration safety

1. All new chaser policies seed paused for existing orgs; banner in Settings Centre lists what was seeded.
2. `port_quote_to_client` guarded by `ported_to_client_id IS NULL` — re-running is a no-op.
3. CH sync change is **opt-in per org**: existing orgs keep current behaviour until they flip "Use diff staging" in Companies House settings. New orgs default to diff staging on.
4. Engagement letter variant resolver falls back to existing global template if no variant matches — zero behaviour change for orgs that haven't created variants.
5. KYC pack creation does not auto-trigger for existing clients; only fires on new `CLIENT_ONBOARDING_STARTED`. Existing clients get a "Start KYC Pack" button.

## Files / functions touched

**New files**
- `src/pages/settings/CompaniesHouseDiffInbox.tsx`
- `src/components/clients/KycPackPanel.tsx`
- `src/components/clients/CompaniesHouseDiffPanel.tsx`
- `src/components/crm/LeadDormantActions.tsx`
- `src/components/quotes/PortQuoteToClientButton.tsx`
- `src/components/settings/automations/CrmFollowupEditor.tsx`
- `src/components/settings/automations/QuoteChaserEditor.tsx`
- `src/components/settings/automations/QuoteOnboardingWorkflowEditor.tsx`
- `src/components/settings/automations/EngagementLetterVariantMatrix.tsx`
- `src/components/settings/automations/KycSubjectDefaultsEditor.tsx`
- `src/components/settings/automations/HmrcAuthChaserEditor.tsx`
- `src/lib/kyc-pack-service.ts`
- `src/lib/quote-port-service.ts`
- `src/lib/engagement-variant-resolver.ts`
- `src/lib/ch-diff-service.ts`
- `supabase/functions/dormant-lead-scan/index.ts`

**Edited**
- `src/pages/settings/AutomationSettingsCentre.tsx` (mount Phase 2 editors per category)
- `src/components/clients/HmrcAuthorisationPanel.tsx` (wire chaser controls)
- `src/components/clients/EngagementLetterStatus.tsx` (use variant resolver)
- `src/pages/QuoteDetail.tsx` (port button)
- `src/pages/CRM.tsx` + `src/components/crm/LeadDetailPanel.tsx` (dormant/lost actions, chaser status)
- `src/lib/automation-actions.ts` (new action: `port_quote`, `start_kyc_pack`, `send_engagement_variant`)
- `src/lib/chaser-policy-service.ts` (new categories)
- `src/lib/ch-sync-service.ts` (route through diff staging)
- `supabase/functions/chaser-tick/index.ts` (new policy categories)
- `supabase/functions/workflow-tick/index.ts` (quote_to_onboarding execution)
- `supabase/functions/process-automation-events/index.ts` (route new events)
- `supabase/functions/companies-house-sync/index.ts` (write to staging)
- `supabase/functions/send-engagement-letter/index.ts` (variant resolution)

## Sequence of work

1. Schema migration (new tables + extends + GRANTs + RLS).
2. RPCs (`port_quote_to_client`, KYC pack RPCs, CH diff RPC, variant resolver, dormant/lost markers).
3. Backend services (`src/lib/*-service.ts`).
4. Edge function changes (extend existing; add `dormant-lead-scan`).
5. Schedule cron for `dormant-lead-scan`.
6. Seed inserts (default variants, paused chaser policies, seeded workflow).
7. UI: Settings Centre editors, client/quote/lead panels, CH diff inbox.
8. Verification: dry-run report shows 0 historic sends; integration tests for each chaser path; CH diff round-trip; port-quote idempotency.

## Phase 2 handover deliverables (required before any later work)

- Migration summary + RLS list.
- All new RPC signatures.
- Edge function diffs.
- UI surfaces added.
- Evidence: `email_send_log` shows 0 historic external sends after migration.
- Evidence: every seeded automation has `send_mode='draft'`, `scope='new_records'`.
- Tests: chaser stop conditions, KYC subject lifecycle, CH diff accept/reject, quote port idempotency, engagement variant resolution, HMRC chaser blocked when auth active.
- RLS cross-org isolation results for all new tables.
- Open issues / deferred items before Phase 3.

