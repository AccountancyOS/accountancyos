# Increment 2 — Preview & one-click "Prepare accounts" from a job — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** From a job, one action produces a *draft*, ledger-backed, job-bound accounts-preparation workpaper — no Bookkeeping detour, no manual job re-selection, nothing locked.

**Architecture:** A job-side "Prepare accounts" action lets the accountant pick the TB source (native ledger / import / manual), creates or refreshes a **draft** `trial_balance_snapshots` row (RPC-backed, from the single-source `get_trial_balance_from_ledger`), and calls the existing `createWorkpaperFromSnapshot` with `jobId` pre-bound. Draft snapshots/workpapers are badged "Draft — not for filing"; nothing lockable, finalise/filing is Increment 3.

**Tech Stack:** Supabase Postgres (plpgsql SECURITY DEFINER RPCs, migrations applied via Lovable), React + TanStack Query + shadcn/ui, Vitest.

## Global Constraints (verbatim from spec `docs/accountancyos-accounts-prep-handoff-spec.md`)
- Preview **never locks** the period or the snapshot. Locking is only in "Finalise & prepare accounts" (Increment 3).
- The workpaper is built from a **trial-balance snapshot**; TB source is chosen, not assumed (native / import / manual).
- Draft snapshots are badged **"Draft — not for filing"**; downstream filing must refuse a non-final snapshot.
- Action label is **"Prepare accounts"** — never "Export to filing engine".
- Every migration ships as one small additive migration, verified live per the release contract (receipt + Lovable post-publish verifier). Owner applies via Lovable.
- Single source of truth for the native TB is `public.get_trial_balance_from_ledger(org, client_id, company_id, period_start, period_end)` (migration 20260608141410) — do NOT re-implement TB math client-side.

---

### Task 1: Draft TB-snapshot lifecycle RPCs (create + regenerate), status constraint, uniqueness

**Files:**
- Create: `supabase/migrations/2026XXXXXXXXXX_tb_snapshot_draft_lifecycle.sql`
- Create receipt: `docs/releases/pending/<date>-tb-snapshot-draft-lifecycle.json`
- Test: `src/test/regression/tb-snapshot-lifecycle.test.ts` (static migration-content assertions, matching the repo's existing regression-test style, e.g. `job-creation-single-source.test.ts`)

**Interfaces:**
- Produces RPC `public.create_tb_snapshot(p_org uuid, p_client_id uuid, p_company_id uuid, p_job_id uuid, p_period_start date, p_period_end date, p_source_type text, p_balances jsonb DEFAULT NULL) RETURNS uuid` — when `p_source_type='native'` and `p_balances IS NULL`, builds balances from `get_trial_balance_from_ledger`; else stores `p_balances`. Inserts `status='draft'`, `locked=false`. Supersedes any existing live draft for the same (org, client/company, period) by setting it `status='superseded'`. Role-gated (org membership) + writes `audit_log`.
- Produces RPC `public.regenerate_tb_snapshot(p_snapshot_id uuid) RETURNS uuid` — only for a `draft` snapshot; rebuilds balances from the ledger for its period, supersedes the old draft, returns the new snapshot id. Rejects if the snapshot is `finalised`/`locked`.
- Produces CHECK constraint on `trial_balance_snapshots.status IN ('draft','finalised','superseded','used_in_workpaper')`.

- [ ] **Step 1: Write the failing test** — assert the migration set defines both RPCs, the status CHECK, and that `create_tb_snapshot` references `get_trial_balance_from_ledger`.

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
const migAll = readdirSync(resolve(__dirname, "../../../supabase/migrations"))
  .filter(f => f.endsWith(".sql"))
  .map(f => readFileSync(resolve(__dirname, "../../../supabase/migrations", f), "utf8")).join("\n");
describe("tb snapshot draft lifecycle", () => {
  it("defines create_tb_snapshot sourced from the ledger SoT", () => {
    expect(migAll).toMatch(/FUNCTION public\.create_tb_snapshot/);
    expect(migAll).toMatch(/create_tb_snapshot[\s\S]*?get_trial_balance_from_ledger/);
  });
  it("defines regenerate_tb_snapshot and supersession", () => {
    expect(migAll).toMatch(/FUNCTION public\.regenerate_tb_snapshot/);
    expect(migAll).toMatch(/status\s*=\s*'superseded'/);
  });
  it("constrains snapshot status", () => {
    expect(migAll).toMatch(/status[\s\S]{0,80}IN \('draft'[\s\S]{0,60}'superseded'/);
  });
});
```

- [ ] **Step 2: Run test, verify it FAILS** — `npx vitest run src/test/regression/tb-snapshot-lifecycle.test.ts` → FAIL (functions not present).
- [ ] **Step 3: Write the migration.** Implement `create_tb_snapshot` (native path calls `get_trial_balance_from_ledger` and aggregates into the `balances` jsonb shape used by `trial_balance_snapshots.balances`; supersede prior live draft; role check via `user_has_organization_access`; `audit_log` insert), `regenerate_tb_snapshot` (draft-only, rebuild-from-ledger, supersede), the status CHECK (guarded `DO $$` add-if-absent), and a partial unique index `WHERE status='draft'` on (org, coalesce(client_id), coalesce(company_id), period_start, period_end). Follow the SECURITY DEFINER + `SET search_path=public` pattern of existing lifecycle RPCs.
- [ ] **Step 4: Run test, verify it PASSES.**
- [ ] **Step 5: Write the release receipt** (path + sha256 + expected_objects: both RPCs exist via `catalog_functions`, CHECK exists, a native `create_tb_snapshot` on a real job produces a draft snapshot whose `balances` equals `get_trial_balance_from_ledger`). Run the receipt-gate test.
- [ ] **Step 6: Commit + push** (`feat(accounts-prep): draft TB-snapshot lifecycle RPCs`). Then hand to owner to apply via Lovable; verify live + complete receipt.

---

### Task 2: Make `workpaper_instances.job_id` mandatory for accounts-prep + bind on create

**Files:**
- Modify: `src/lib/workpaper-from-tb.ts:441` (change `job_id: options.jobId || null` → require jobId; throw if absent)
- Modify signature at `src/lib/workpaper-from-tb.ts:348` — make `jobId` required in the options type
- Test: `src/test/lib/workpaper-from-tb.test.ts`

**Interfaces:**
- Consumes: `createWorkpaperFromSnapshot(snapshotId, workpaperType, options)` from Task 0/existing.
- Produces: `createWorkpaperFromSnapshot(snapshotId: string, workpaperType: WorkpaperServiceType, options: { jobId: string; name?: string })` — `jobId` now **required**; function throws `Error("jobId is required to create an accounts-prep workpaper")` if missing/empty.

- [ ] **Step 1: Write failing test** — calling `createWorkpaperFromSnapshot(id, 'accounts', { name })` without jobId rejects with that message.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Add the guard** at the top of `createWorkpaperFromSnapshot`: `if (!options?.jobId) throw new Error("jobId is required to create an accounts-prep workpaper");` and drop the `|| null` fallback (`job_id: options.jobId`). Update the TS options type to `jobId: string`.
- [ ] **Step 4: Run, verify PASS.** Also grep-confirm no remaining caller passes no jobId except the one being replaced in Task 3.
- [ ] **Step 5: Commit** (`fix(workpaper): require jobId when creating an accounts-prep workpaper`).

---

### Task 3: "Prepare accounts" action on the job with a TB-source picker

**Files:**
- Modify: `src/components/jobs/JobWorkpaperTab.tsx` (add the action + empty-state CTA when no Model-B workpaper exists for the job)
- Create: `src/components/jobs/PrepareAccountsDialog.tsx` (source picker: Native ledger / Import / Manual)
- Test: `src/test/components/PrepareAccountsDialog.test.tsx`

**Interfaces:**
- Consumes: `create_tb_snapshot` RPC (Task 1), `createWorkpaperFromSnapshot({ jobId })` (Task 2), existing `ImportTrialBalanceDialog` and `TBGridEditor` (pre-bound to the job's entity+period), the job's `client_id`/`company_id`/`period_start`/`period_end`.
- Produces: a `PrepareAccountsDialog` opened from `JobWorkpaperTab` that, on "Native ledger" → calls `supabase.rpc('create_tb_snapshot', {...})` then `createWorkpaperFromSnapshot(snapshotId, serviceTypeForJob, { jobId })`, navigates to the new draft workpaper. On "Import"/"Manual" → opens the existing dialog with `jobId`, entity and period pre-filled (no dropdown).

- [ ] **Step 1: Write failing test** — render `PrepareAccountsDialog` with a job context; selecting "Native ledger" and confirming calls the `create_tb_snapshot` RPC with the job's org/entity/period, then `createWorkpaperFromSnapshot` with `{ jobId }`. Mock the supabase client + lib fn.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement `PrepareAccountsDialog`** (three radio options; native branch wires the RPC + lib call; import/manual branch renders the existing dialogs with props pre-bound). Add a **"Prepare accounts"** button to `JobWorkpaperTab`'s empty state (shown when no Model-B workpaper for the job) — label exactly "Prepare accounts". Do NOT expose any lock/finalise here.
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** (`feat(jobs): one-click Prepare accounts from a job with TB-source picker`).

---

### Task 4: "Draft — not for filing" badge + refuse non-final snapshot downstream

**Files:**
- Modify: `src/components/jobs/JobWorkpaperTab.tsx` (badge when the workpaper's snapshot is a draft) + wherever a snapshot/workpaper card renders status (`src/components/bookkeeping/SnapshotHistoryPanel.tsx`)
- Modify: the finalise/create-filing path (`src/components/workpaper/WorkpaperStatusActions.tsx`) to block if the underlying TB snapshot is not `finalised`/`locked`
- Test: `src/test/components/DraftNotForFiling.test.tsx`

**Interfaces:**
- Consumes: `trial_balance_snapshots.status`/`locked` on the workpaper's snapshot.
- Produces: a visible `Draft — not for filing` badge on any draft-backed workpaper/snapshot; the "Finalise & Create Filing" action is disabled (with an explanatory tooltip "Finalise the trial-balance snapshot first") when the snapshot is not final.

- [ ] **Step 1: Write failing test** — a workpaper whose snapshot `status='draft'` renders the "Draft — not for filing" badge and the finalise-to-filing action is disabled.
- [ ] **Step 2: Run, verify FAIL.**
- [ ] **Step 3: Implement** the badge (shadcn `Badge variant="outline"` with warning styling) and the disabled-guard on the filing action (read the snapshot status; disable + tooltip when not final). This is the Increment-2 half of the "only a final snapshot reaches filing" gate; the DB-level gate is Increment 3.
- [ ] **Step 4: Run, verify PASS.**
- [ ] **Step 5: Commit** (`feat(accounts-prep): Draft — not for filing badge + block filing from a draft snapshot`).

---

## Self-Review
- **Spec coverage (spec §3):** action from job ✔ (T3); draft snapshot RPC from ledger SoT ✔ (T1); regenerate ✔ (T1); workpaper pre-bound to job + job_id fix ✔ (T2, T3); "Draft — not for filing" + downstream refusal ✔ (T4). Finalise/lock/approve/compute-tax are correctly **out of scope** (Increment 3).
- **Placeholders:** none — RPC responsibilities, exact files/lines, and test intent specified. Executing subagents read the exact file bodies (JobWorkpaperTab 401 lines, workpaper-from-tb 612 lines) before editing.
- **Type consistency:** `createWorkpaperFromSnapshot(snapshotId, workpaperType, { jobId })` used identically in T2 and T3; `create_tb_snapshot` arg list identical in T1 and T3.
- **Note:** T1 is DB (owner applies via Lovable, gated on receipt verification). T2–T4 are app code (ship with the build). Sequence: T1 → T2 → T3 → T4, but T2/T3/T4 (app) can proceed while T1's migration awaits apply, since the RPC is only invoked at runtime in T3.
