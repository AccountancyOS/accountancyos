
# AccountancyOS Architecture Overhaul & UX Refinement Plan

## Progress Tracker

| Phase | Status | Completed Items |
|-------|--------|-----------------|
| Phase 1 | ✅ COMPLETE | Client type schema, detail tables, lead_type alignment, UI components |
| Phase 2 | ✅ COMPLETE | CRM 5-stage pipeline, stage timestamps, Lead Detail Panel with Quotes tab |
| Phase 3 | ✅ COMPLETE | SLA engine tables, sla-engine.ts service, practice settings expansion |
| Phase 4 | ✅ COMPLETE | Welcome Dashboard cleanup, Overview redesign with Overdue Actions + Staff Variance |
| Phase 5 | ✅ COMPLETE | Document signature flow, visibility tracking, contacts simplification (director/bookkeeper/other) |
| Phase 6 | ✅ COMPLETE | Notifications clearable, session management tables, HMRC authorisations, text cleanup |

---

## Executive Summary

This plan addresses your comprehensive review to transform AccountancyOS into a production-grade practice management system. Based on your priorities, we're implementing **architecture-first** changes, followed by UX refinements. The work is organised into 6 phases over approximately 8-12 weeks of development.

---

## Phase 1: Client Type Architecture (Foundation)

### 1.1 Database Schema: Type-Specific Detail Tables

Create validated sub-schemas for each client type while maintaining a unified core client record:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                         CORE TABLES                                     │
├─────────────────────────────────────────────────────────────────────────┤
│  clients (existing)                                                      │
│    + client_type ENUM (sa_non_mtd, sa_mtd, partnership, llp,            │
│                        limited_company, charity, cgt, other)             │
│    + preferred_name TEXT                                                 │
│    + mobile_number TEXT                                                  │
│                                                                          │
│  companies (existing - becomes the "Limited Company" detail schema)      │
│    + auth_code TEXT (CH auth code)                                       │
│    + trading_status ENUM                                                 │
│    + trading_address JSONB                                               │
│    + ch_personal_code TEXT (director)                                    │
│    + director_nationality TEXT                                           │
│    + partner_in_charge UUID                                              │
│    + staff_in_charge UUID                                                │
│    + internal_reference TEXT                                             │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                    TYPE-SPECIFIC DETAIL TABLES                          │
├─────────────────────────────────────────────────────────────────────────┤
│  client_detail_sa (Self-Assessment - MTD and Non-MTD)                   │
│    - client_id FK                                                        │
│    - is_mtd BOOLEAN                                                      │
│    - mtd_quarters JSONB (for MTD)                                        │
│    - mtd_final_declaration_deadline DATE                                 │
│    - payment_on_account_jan DECIMAL                                      │
│    - payment_on_account_jul DECIMAL                                      │
│    - refund_expected BOOLEAN                                             │
│                                                                          │
│  client_detail_partnership                                               │
│    - client_id FK (the partnership itself)                               │
│    - partnership_utr TEXT                                                │
│    - partnership_address JSONB                                           │
│    - partners JSONB[] (array of partner details with UTR/address/DOB)   │
│                                                                          │
│  client_detail_cgt                                                       │
│    - client_id FK                                                        │
│    - cgt_number TEXT                                                     │
│    - home_address JSONB                                                  │
│    - property_address JSONB                                              │
│    - disposal_date DATE                                                  │
│                                                                          │
│  client_detail_charity                                                   │
│    - client_id FK                                                        │
│    - charity_number TEXT                                                 │
│    - charity_status ENUM                                                 │
│    - trading_as TEXT                                                     │
│    - charity_year_end DATE                                               │
│    - gift_aid_claim_expiry DATE                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Lead Type Alignment

Add `lead_type` to leads table with same ENUM values as client types:

```sql
ALTER TABLE leads ADD COLUMN lead_type TEXT NOT NULL DEFAULT 'other';
-- Options: sa_non_mtd, sa_mtd, partnership, llp, limited_company, charity, cgt, other
```

### 1.3 Companies House Integration at Lead Stage

- When lead_type is `limited_company` or `llp`, show "Lookup Company" button
- Call Companies House API to pre-populate company data
- Store fetched data in `leads.ch_company_profile` JSONB
- On conversion to client, data flows to companies table

### 1.4 UI Components

**Unified Client Form with Conditional Visibility:**
- Core fields always visible (name, email, phone, address)
- Type selector dropdown with all 8 options
- On type selection, reveal type-specific panel
- Validate against the appropriate sub-schema before save

---

## Phase 2: CRM & Quotes Consolidation

### 2.1 Remove Qualified Stage

Update pipeline from 6 stages to 5:
```
New → Proposal Sent → Chasing → Won → Lost
```

### 2.2 Integrate Quotes into CRM

**Lead Detail Panel (slideout or modal):**
- Overview tab: lead info, stage history, activity log
- Conversations tab: email history with client
- Quotes tab: create/view/send quotes directly from lead
- Documents tab: shared files

**CRM Page Changes:**
- "Send Quote" button added alongside "Create Lead"
- Clicking lead opens detail panel instead of edit modal
- Quote status visible in lead card (Draft/Sent/Accepted/Rejected)
- Outstanding quotes column in CRM Kanban view

### 2.3 Lead Stage Timestamps

Add columns to track progression:
```sql
ALTER TABLE leads ADD COLUMN qualified_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN proposal_sent_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN chasing_started_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN won_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN lost_at TIMESTAMPTZ;
```

Auto-populate on stage change for automation triggers.

---

## Phase 3: SLA Engine & Practice Settings

### 3.1 SLA Configuration Tables

```sql
CREATE TABLE sla_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  sla_type TEXT NOT NULL, -- 'client_email', 'in_app_message', 'internal_message', 'job', 'task'
  job_type TEXT, -- only for job SLAs
  service_code TEXT, -- links to services_catalog
  trigger_event TEXT NOT NULL,
  trigger_status TEXT, -- for jobs: status that starts SLA
  pause_conditions JSONB DEFAULT '[]',
  stop_conditions JSONB DEFAULT '[]',
  default_duration_hours INTEGER NOT NULL,
  urgent_duration_hours INTEGER,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sla_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  sla_definition_id UUID REFERENCES sla_definitions(id),
  entity_type TEXT NOT NULL, -- 'email', 'message', 'job', 'task'
  entity_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  paused_at TIMESTAMPTZ,
  paused_total_seconds INTEGER DEFAULT 0,
  due_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  breached BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active', -- 'active', 'paused', 'completed', 'breached'
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 3.2 Practice Settings Expansion

Add to `org_settings`:
```sql
ALTER TABLE org_settings ADD COLUMN business_hours_start TIME DEFAULT '09:00';
ALTER TABLE org_settings ADD COLUMN business_hours_end TIME DEFAULT '17:30';
ALTER TABLE org_settings ADD COLUMN business_days TEXT[] DEFAULT ARRAY['monday','tuesday','wednesday','thursday','friday'];
ALTER TABLE org_settings ADD COLUMN deadline_buffer_days_vat INTEGER DEFAULT 7;
ALTER TABLE org_settings ADD COLUMN deadline_buffer_days_sa INTEGER DEFAULT 14;
ALTER TABLE org_settings ADD COLUMN sla_email_response_hours INTEGER DEFAULT 24;
ALTER TABLE org_settings ADD COLUMN sla_internal_message_hours INTEGER DEFAULT 8;
```

### 3.3 SLA Engine Service

Create `src/lib/sla-engine.ts`:
- `startSLA(entityType, entityId, triggeredBy)` - creates SLA instance
- `pauseSLA(slaInstanceId, reason)` - pauses with timestamp
- `resumeSLA(slaInstanceId)` - resumes, adds paused time
- `completeSLA(slaInstanceId)` - marks complete
- `checkSLABreaches()` - background job to flag breached SLAs
- `calculateAdjustedDueDate(startTime, durationHours, businessHours)` - respects business hours

### 3.4 Deadline Override Logic

When statutory deadline is sooner than SLA expiry:
```typescript
if (deadlineDate < slaInstance.due_at) {
  slaInstance.due_at = deadlineDate;
  slaInstance.compressed = true;
  flagJobAsAtRisk(jobId);
}
```

---

## Phase 4: Dashboard & Overview Redesign

### 4.1 Replace Current Overview

Remove current widgets, replace with:

**KPI Cards Row:**
- Total Clients (count)
- Total Leads (count with pipeline breakdown)
- Current Month Revenue (from active engagements)
- Lead Revenue (from unsent/pending quotes)

**Overdue Actions Panel:**
- Overdue Conversations (grouped by SLA breach severity)
- Overdue Emails (same)
- Overdue Tasks (same)
- Each shows staff member responsible

**Deadlines Panel:**
- Overdue Deadlines (red, linked to service)
- Upcoming Deadlines (this week, this month)
- Filterable by staff member

**Staff Variance (practice owner view):**
- Table showing each staff member's workload and SLA performance

### 4.2 Welcome Dashboard Cleanup

Remove from WelcomeDashboard.tsx:
- "🎉" emoji from "Welcome to AccountancyOS!"
- Remove "Next Steps" section entirely
- Make setup progress tasks skippable (add skip button)

---

## Phase 5: Documents & Contacts Refinement

### 5.1 Document Management Enhancement

**Add columns to document storage:**
```sql
ALTER TABLE job_documents ADD COLUMN client_visible BOOLEAN DEFAULT false;
ALTER TABLE job_documents ADD COLUMN signature_required BOOLEAN DEFAULT false;
ALTER TABLE job_documents ADD COLUMN signed_at TIMESTAMPTZ;
ALTER TABLE job_documents ADD COLUMN signed_by UUID;
ALTER TABLE job_documents ADD COLUMN signature_ip TEXT;
ALTER TABLE job_documents ADD COLUMN auto_archive_at DATE; -- upload_date + 7 years
```

**Signature Flow:**
1. Document upload with `signature_required = true`
2. Client must scroll through entire document (track scroll position)
3. Signature bar only enabled after scroll complete
4. Capture typed signature, timestamp, IP
5. Auto-save signed version with watermark

**Bulk Operations:**
- Multi-select documents
- Toggle visibility/signature for selected
- Bulk delete with confirmation

### 5.2 Contact Types Simplification

Update contacts role options:
```typescript
const CONTACT_ROLES = ['director', 'bookkeeper', 'other'] as const;
// Remove: 'fd', 'secretary', 'personal'
```

**Contact Permissions:**
- Director: `can_sign` toggle, `is_primary` toggle
- Bookkeeper: limited visibility, no signing
- Other: limited visibility, no signing

### 5.3 Auto-Archive

Background job (daily cron):
```sql
UPDATE job_documents 
SET archived = true, archived_at = now()
WHERE created_at < now() - INTERVAL '7 years'
AND archived = false;
```

---

## Phase 6: Miscellaneous Fixes & Polish

### 6.1 Notifications

**Make notifications clearable:**
- Add "Clear All" button to notification bell dropdown
- Add individual dismiss (X) button per notification
- Add "Mark all as read" option

**Database change:**
```sql
ALTER TABLE notifications ADD COLUMN dismissed BOOLEAN DEFAULT false;
ALTER TABLE notifications ADD COLUMN dismissed_at TIMESTAMPTZ;
```

### 6.2 Text Cleanup

**Remove all emojis and exclamation marks from:**
- Toast messages
- Welcome text
- Button labels
- Placeholder text

Replace with professional periods.

### 6.3 Session Management

**Auto logout settings:**
```sql
ALTER TABLE org_settings ADD COLUMN session_timeout_minutes INTEGER DEFAULT 480; -- 8 hours
ALTER TABLE org_settings ADD COLUMN single_session_only BOOLEAN DEFAULT false;
```

**Implementation:**
- Track session in `user_sessions` table
- On new login with `single_session_only = true`, invalidate previous sessions
- Background check for session timeout

### 6.4 Services Tab on Client

**Show fees with toggle:**
- Display all active services with current fees
- "One-off" vs "Monthly" indicator
- Fee adjustment triggers new engagement letter requirement
- Total monthly and one-off fees calculated at bottom

### 6.5 HMRC Authorisations Tracking

Add to client/company detail:
```sql
CREATE TABLE hmrc_authorisations (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  client_id UUID,
  company_id UUID,
  auth_type TEXT NOT NULL, -- 'personal', 'company', 'paye'
  authorised_at DATE,
  expires_at DATE,
  status TEXT DEFAULT 'pending',
  notes TEXT
);
```

---

## Technical Implementation Notes

### Database Migrations

All schema changes will be atomic migrations with:
- Forward migration
- RLS policies for new tables
- Indexes for query performance

### API Endpoints

New edge functions required:
- `sla-check` - periodic SLA breach detection
- `document-archive` - daily archive job
- `session-cleanup` - session timeout enforcement

### UI Components

New components to create:
- `LeadDetailPanel.tsx` - slideout for lead management
- `QuoteBuilderInline.tsx` - quote creation within lead panel
- `SLAIndicator.tsx` - shows SLA status on items
- `ClientTypeForm.tsx` - unified form with conditional sections
- `DocumentSignatureFlow.tsx` - scroll-to-sign implementation
- `StaffVarianceTable.tsx` - dashboard component

### Existing Components to Modify

| Component | Changes |
|-----------|---------|
| `CRM.tsx` | Remove Qualified column, add Send Quote button, add lead detail slideout |
| `AddClientDialog.tsx` | Expand to 8 client types with type-specific fields |
| `WelcomeDashboard.tsx` | Remove emoji, remove Next Steps, add skip to tasks |
| `NotificationBell.tsx` | Add clear all, dismiss individual, mark all read |
| `Overview.tsx` | Complete redesign per 4.1 |
| `ClientPortal.tsx` | Add Services tab with fees, HMRC auth tab |
| `ClientDocumentsTab.tsx` | Full implementation with visibility/signature |

---

## Prioritised Delivery Order

| Week | Phase | Key Deliverables |
|------|-------|------------------|
| 1-2 | Phase 1 | Client type schema, detail tables, Companies House lookup |
| 3-4 | Phase 2 | CRM consolidation, Quotes integration, stage timestamps |
| 5-6 | Phase 3 | SLA engine, practice settings, deadline override logic |
| 7-8 | Phase 4 | Dashboard redesign, Overview rebuild |
| 9-10 | Phase 5 | Documents enhancement, signature flow, contacts simplification |
| 11-12 | Phase 6 | Polish, session management, text cleanup |

---

## Questions Resolved from Your Review

| Your Note | Resolution |
|-----------|------------|
| "Remove emoji and !" | Phase 6.2 - comprehensive text cleanup |
| "Notifications should be clearable" | Phase 6.1 - dismiss individual and clear all |
| "Remove Qualified column" | Phase 2.1 - 5-stage pipeline |
| "Send Quote button in CRM" | Phase 2.2 - quotes integrated into lead panel |
| "Lead type dropdown" | Phase 1.2 - aligned with client types |
| "Companies House at lead stage" | Phase 1.3 - lookup on lead creation |
| "8 client types with specific fields" | Phase 1.1 - type-specific detail tables |
| "SLA system" | Phase 3 - complete deterministic SLA engine |
| "Auto logout / single session" | Phase 6.3 - session management |
| "Document signature scroll-through" | Phase 5.1 - signature flow |
| "Contact types simplification" | Phase 5.2 - director/bookkeeper/other only |
| "Services with fees on client" | Phase 6.4 - full implementation |

---

## What's Not Changing (Already Correct)

- Lead-to-client conversion workflow (already implemented correctly)
- Deadline engine architecture (solid foundation)
- Jobs module structure (matches your spec)
- Automation engine (well-designed)
- Engagement letter e-signature (already works)
- Bookkeeping module (comprehensive)

---

## Next Steps

Upon approval of this plan:

1. **Phase 1 begins** with database migrations for client type architecture
2. Each phase will be implemented incrementally with testing
3. RLS policies updated alongside schema changes
4. UI components built with existing design system
5. Each phase ends with integration testing before moving to next

