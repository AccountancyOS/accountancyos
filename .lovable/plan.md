
# Skip Setup Progress Implementation

## Problem Summary

The WelcomeDashboard shows a Setup Progress checklist that cannot be skipped or dismissed. According to the practice onboarding flow requirements, setup tasks should be skippable so firms can transition to active practice management immediately.

**Current behavior:**
- User completes OnboardingWizard → routed to `/welcome`
- WelcomeDashboard always shows Setup Progress card
- No way to skip or dismiss the checklist
- No clear path to the main `/overview` dashboard

**Expected behavior:**
- Users can skip the setup checklist and go straight to the Overview dashboard
- Once dismissed, the setup checklist stays hidden (stored in database)
- Users can still access setup tasks from Settings if needed later

---

## Technical Implementation

### File 1: Database Migration

**New column needed:**

Add `setup_dismissed` boolean column to the `organizations` table to persist the user's choice to skip setup.

```sql
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS setup_dismissed boolean DEFAULT false;
```

---

### File 2: `src/pages/WelcomeDashboard.tsx`

**Changes:**

1. Add state for `setupDismissed` (fetched from organization)
2. Add "Skip Setup" button to the Setup Progress card header
3. On skip: update `organizations.setup_dismissed = true` and redirect to `/overview`
4. If `setup_dismissed` is true: redirect to `/overview` on mount
5. Auto-redirect to `/overview` when all 4 checklist items are complete

| New State | Type | Source |
|-----------|------|--------|
| `setupDismissed` | `boolean` | `organization.setup_dismissed` |

| New Function | Purpose |
|--------------|---------|
| `handleSkipSetup()` | Sets `setup_dismissed = true`, shows toast, redirects to `/overview` |

**UI Changes:**

```text
┌─────────────────────────────────────────────────────────────────┐
│  Setup Progress                                    [Skip Setup] │
│  2 of 4 tasks completed                                         │
│  ═══════════════════░░░░░░░░░░░░░░░░░░░░░░░░░░░  50%           │
│                                                                 │
│  ☑ Confirm branding                                             │
│  ☐ Import clients                                    [Go →]     │
│  ☐ Add first lead                                    [Go →]     │
│  ☑ Connect Companies House & HMRC                               │
└─────────────────────────────────────────────────────────────────┘
```

The "Skip Setup" button will be a ghost/outline button in the card header.

---

### File 3: `src/pages/Index.tsx`

**Changes:**

Update Priority 5 routing logic:

```text
Before:
  Priority 5: All good → welcome dashboard (/welcome)

After:
  Priority 5: Check setup_dismissed
    - If setup_dismissed = true → /overview
    - If setup_dismissed = false → /welcome
```

This ensures users who skipped setup go directly to the operational dashboard on future logins.

---

### File 4: `src/lib/app-context.tsx` (or organization types)

**Changes:**

Ensure `setup_dismissed` is included in the organization type definition so TypeScript is aware of the field.

---

## User Flow After Implementation

```text
┌─────────────────────────────────────────────────────────────────┐
│ User completes OnboardingWizard                                 │
│      ↓                                                          │
│ Routed to /welcome                                              │
│      ↓                                                          │
│ User sees Setup Progress card                                   │
│      ↓                                                          │
│ [Option A] User completes all tasks → Auto-redirect to /overview│
│      OR                                                         │
│ [Option B] User clicks "Skip Setup" → Redirect to /overview     │
│      ↓                                                          │
│ On future logins: Goes directly to /overview                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| User skips, then wants to complete tasks | Access via Settings or sidebar navigation |
| All tasks complete before skip | Auto-redirect to Overview, no skip needed |
| Organization data not loaded | Show loading state, don't redirect |
| User navigates directly to /welcome after skip | Allow access (it's a valid route) |

---

## Files Summary

| File | Changes |
|------|---------|
| Database migration | Add `setup_dismissed` boolean column to `organizations` |
| `src/pages/WelcomeDashboard.tsx` | Add Skip Setup button, auto-redirect logic |
| `src/pages/Index.tsx` | Update routing to respect `setup_dismissed` |
| `src/lib/app-context.tsx` | Ensure `setup_dismissed` type is defined |
| `src/integrations/supabase/types.ts` | Auto-updated when migration runs |
