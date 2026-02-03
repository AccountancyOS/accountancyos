
# Add Week and Month View Options to Deadlines Calendar

## Problem Summary

The current Deadlines calendar view only allows clicking individual days to see deadlines. This is cumbersome when users want to review all deadlines for an entire week or month at a glance - a common workflow for practice managers planning workload.

**Current Behavior:** Click a day → see that day's deadlines only
**Desired Behavior:** Toggle between Day/Week/Month views → see aggregated deadlines

---

## Solution Overview

Add a view mode toggle (Day | Week | Month) above the calendar that changes both how the calendar displays and how deadlines are filtered in the side panel.

---

## UI Design

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  Calendar View                                                          │
│                                                                         │
│  View: [Day] [Week] [Month]     ← NEW toggle group                      │
│                                                                         │
│  ┌─────────────────────────────────┐  ┌───────────────────────────────┐ │
│  │                                 │  │ Week of 3 Feb 2025            │ │
│  │     February 2025               │  │                               │ │
│  │  [calendar with week highlight] │  │ ┌── Mon 3 Feb ─────────────┐  │ │
│  │                                 │  │ │ SA Return - John Smith   │  │ │
│  │                                 │  │ │ VAT Return - ABC Ltd     │  │ │
│  │                                 │  │ └─────────────────────────-┘  │ │
│  │                                 │  │                               │ │
│  │                                 │  │ ┌── Thu 6 Feb ─────────────┐  │ │
│  │                                 │  │ │ CT600 - XYZ Corp         │  │ │
│  └─────────────────────────────────┘  │ └─────────────────────────-┘  │ │
│                                       │                               │ │
│                                       │ Total: 3 deadlines this week  │ │
│                                       └───────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

For **Month** view, the right panel shows deadlines grouped by week or simply lists all deadlines for the visible month with counts.

---

## Technical Implementation

### File: `src/components/deadlines/DeadlinesCalendar.tsx`

**Changes:**

1. Add view mode state:
   ```typescript
   type ViewMode = "day" | "week" | "month";
   const [viewMode, setViewMode] = useState<ViewMode>("day");
   ```

2. Add ToggleGroup for view selection (above the calendar card)

3. Add date range calculation based on view mode:
   - Day: Single selected date (current behavior)
   - Week: `startOfWeek(selectedDate)` to `endOfWeek(selectedDate)`
   - Month: `startOfMonth(selectedDate)` to `endOfMonth(selectedDate)`

4. Update deadline filtering to use date range:
   ```typescript
   const deadlinesInRange = deadlines?.filter((d) => {
     const dueDate = new Date(d.due_date);
     return isWithinInterval(dueDate, { start: rangeStart, end: rangeEnd });
   });
   ```

5. Update right panel display:
   - Day view: Current behavior (list deadlines for that day)
   - Week view: Group deadlines by day within the week
   - Month view: Group deadlines by week or show full list with date column

6. Update header text:
   - Day: "February 3, 2025"
   - Week: "Week of February 3, 2025"  
   - Month: "February 2025"

7. Add visual highlighting on calendar:
   - Day: Highlight selected day (current)
   - Week: Highlight entire week row
   - Month: Highlight all days in month

---

## New Imports Required

```typescript
import { 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  isWithinInterval,
  eachDayOfInterval,
  isSameWeek
} from "date-fns";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
```

---

## Data Flow

```text
┌───────────────────────────────────────────────────────────────────────┐
│ User clicks "Week" toggle                                             │
│     ↓                                                                 │
│ setViewMode("week")                                                   │
│     ↓                                                                 │
│ rangeStart = startOfWeek(selectedDate)                                │
│ rangeEnd = endOfWeek(selectedDate)                                    │
│     ↓                                                                 │
│ deadlinesInRange filters all deadlines within that week               │
│     ↓                                                                 │
│ Panel shows deadlines grouped by day of week                          │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Files Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/components/deadlines/DeadlinesCalendar.tsx` | Modify | Add view mode toggle, date range calculation, grouped deadline display |

---

## Edge Cases

- Empty weeks/months show "No deadlines this week/month" message
- Week starts on Monday (UK accountant standard) - use `{ weekStartsOn: 1 }` option
- Clicking a day in the calendar still updates the selected date, which then determines the week/month range
- Counts shown in each grouping (e.g., "3 deadlines" next to day header)

---

## Summary

This enhancement allows users to quickly scan all deadlines for a week or month without clicking through individual days, matching how accountants typically plan their workload around weekly/monthly cycles.
