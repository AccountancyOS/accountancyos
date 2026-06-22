# Emails view for clients and leads (accountant-facing, Level 1)

## Goal

Add an accountant-facing **Emails** tab to client records and lead records that shows AccountancyOS-recorded email history (sent, pending, failed) for that specific record. No external mailbox sync. Reuse `EmailList`.

## Schema reality check (important deltas from earlier assumptions)

I inspected the live tables — two assumptions in the previous brief are wrong and the plan adapts:

- `email_messages` has **no `lead_id`** column and **no `to_email`** column. It has `to_emails text[]`, `client_id`, `company_id`, `job_id`, plus a `matched_entities jsonb` array and `from_email`. Lead linkage today flows through `matched_entities` (or address match).
- `email_queue` has **no `lead_id`** column either. It links to leads via the generic `entity_type='lead', entity_id=<lead.id>` pair, and has `client_id`, `company_id`, `job_id`, `to_email`, `status`, `mailbox_id`, `created_by`, `scheduled_at`, `sent_at`, `last_error_message`.

No DB migration is required. We will use these existing columns.

## Scope (Level 1 only)

In scope: AccountancyOS-generated/queued/sent/failed emails recorded in `email_queue` and `email_messages`, across all team members and connected mailboxes, org-scoped.

Out of scope: external Gmail/Outlook sync, full activity timeline, reply-from-UI, retry system, global `/emails` redesign, backfill, sender/template/queue logic changes, portal exposure.

## Implementation

### 1. Extend `src/components/email/EmailList.tsx`

Add optional props (keep existing behaviour intact):

```ts
clientId?: string;
companyId?: string;
leadId?: string;        // matches email_queue.entity_id where entity_type='lead'
jobId?: string;
recipientEmail?: string; // exact-address fallback, org-scoped
showQueue?: boolean;     // render Outgoing/Pending/Failed section above history
```

History query (`email_messages`) — inclusive OR across provided relational ids, always AND `organization_id`:

```
organization_id = currentOrg
AND (
  client_id = :clientId
  OR company_id = :companyId
  OR job_id = :jobId
  OR (recipientEmail IS PROVIDED AND (
        :recipientEmail = ANY(to_emails)
     OR from_email = :recipientEmail
  ))
  OR (leadId IS PROVIDED AND matched_entities @> '[{"type":"lead","id":":leadId"}]')
)
```

The `recipientEmail` branch is the **fallback only**, used when no relational id is provided (lead case) or the caller explicitly opts in. It is org-scoped and never used to mutate rows.

### 2. Add "Outgoing / Pending / Failed" section (driven by `showQueue`)

Reads `email_queue` with the same OR filter (using `entity_type='lead' AND entity_id=:leadId` for leads). Surfaces only user-friendly fields:

- subject, recipient (to_name/to_email), status (Pending / Scheduled / Sending / Failed), scheduled_at, sent_at (if any), failing reason as a clean label, sender mailbox display name (via `mailbox_id`), sender user display name (via `created_by`), and `context` translated to a friendly label (Onboarding, Invoice, Chase, Filing, Portal, Ad-hoc).

Hidden from the UI: raw `merge_data`, provider payloads, `last_error_code`, queue ids, retry counts, edge-function internals, raw context strings.

Failed row CTA: a small "Open in Emails queue" link to `/emails` (no new retry mechanism built here).

### 3. Client workspace Emails tab (`src/pages/ClientPortal.tsx`)

- Add `<TabsTrigger value="emails">Emails</TabsTrigger>` and a `TabsContent`.
- Resolve `linkedCompanyId` from the client (existing client→company link).
- Resolve `originatingLeadId` from the lead-conversion relationship (see §5).
- Render:

```tsx
<EmailList
  clientId={client.id}
  companyId={linkedCompanyId}
  leadId={originatingLeadId}
  showQueue
  title="Emails"
/>
```

Empty state: "No AccountancyOS emails recorded for this client yet."

### 4. Lead detail Emails tab (`src/components/crm/LeadDetailPanel.tsx`)

- Add `<TabsTrigger value="emails">Emails</TabsTrigger>` between Messages and Docs.
- Render:

```tsx
<EmailList
  leadId={lead.id}
  recipientEmail={lead.email ?? undefined}
  showQueue
  title="Emails"
/>
```

Address-fallback rows are labelled "Address match" (small muted badge) to signal it isn't a hard relational link. Empty state: "No AccountancyOS emails recorded for this lead yet."

### 5. Lead → client continuity

Check the existing lead conversion path (`src/lib/lead-conversion-service.ts` and `leads` table) for an existing `converted_client_id` / `client_id` foreign key. If present, the client tab resolves `originatingLeadId` from it. If not present, the client tab simply omits `leadId` — no backfill, no mutation. I will report the actual situation in the implementation note rather than silently guess.

### 6. Security / RLS

- Every query passes `organization_id = currentOrg` explicitly (defence in depth on top of existing RLS on `email_messages` and `email_queue`).
- Address fallback always ANDed with `organization_id`, so a lead email shared with another org cannot leak.
- No new policies, no policy relaxations.
- Feature lives in accountant-facing routes only (`/clients/...`, CRM `LeadDetailPanel`). Not added to `src/portal/`.

## Files touched

- `src/components/email/EmailList.tsx` — new props, OR filter, queue section.
- `src/pages/ClientPortal.tsx` — new Emails tab, resolve `linkedCompanyId` and `originatingLeadId`.
- `src/components/crm/LeadDetailPanel.tsx` — new Emails tab.
- (Optional, if helpers grow) `src/lib/email-history-query.ts` — small shared query builder.

No migrations. No edge function changes. No changes to `/emails` page layout.

## Acceptance checks (manual)

- Client with `client_id`-linked emails: visible.
- Client with `company_id`-linked emails (no client_id): visible.
- Client with both: both visible, no duplicates.
- Email sent through AccountancyOS by user A then user B: both appear on the same client/lead.
- Pending and failed queue items appear in the Outgoing section with clean status; no raw payloads visible.
- Lead with `entity_type='lead'` queue rows: visible.
- Lead with only `to_email` address-match history: visible, labelled as address match, scoped to current org.
- Cross-org probe (manipulating route id) returns empty due to org scoping.
- Portal users cannot reach the new tabs (route not exposed in `src/portal/`).
