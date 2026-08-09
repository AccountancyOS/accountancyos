# UK Property CGT return — design proposal

**Status: proposal. Nothing implemented.** Owner ruling 2026-08-09: the CGT job is the
operational identity for a UK Property CGT return. One job per return. No natural key on
client, property, date or asset. Not a general-purpose CGT asset system.

---

## 1. The date question — confirmed, and it changes the design

You were right to separate these. UK law puts them on **different dates**, and the current
`client_detail_cgt.disposal_date` overloads both.

### 1.1 Which date determines the CGT tax year — **exchange (contract) date**

**TCGA 1992 s28(1)**: where an asset is disposed of under a contract, the time of disposal is
**the time the contract is made**, not the time of completion or conveyance.

**TCGA 1992 s28(2)**: where the contract is **conditional** — including a contract conditional
on the exercise of an option — the time of disposal is **the time the condition is satisfied**.

So the gain falls into the tax year of exchange, and that is the year whose Self Assessment
return must carry it.

### 1.2 Which date starts the 60-day clock — **completion date**

**FA 2019 Sch 2**: the UK property return and the payment on account are due within **60 days
of the completion day** (30 days originally; 60 days for completions on or after 27 October
2021). The clock is completion, irrespective of when contracts were exchanged.

This is corroborated inside the repo: the automation contract seeded at
`20260217113834_0a67eb9c:91` already declares
`{"job_name":"CGT 60-Day Report","service_type":"CGT_60DAY","deadline_offset":"60 days from completion_date"}`.
The intent was recorded and never built.

### 1.3 Why this matters — the straddle case

| | Date | Consequence |
|---|---|---|
| Exchange | **20 March 2026** | Gain falls in tax year **2025-26**. Goes on the 2025-26 SA return, due 31 Jan 2027. |
| Completion | **15 May 2026** | 60-day return due **~14 July 2026** — which is in the *following* tax year. |

A single `disposal_date` field cannot express this. If it holds completion, the gain is filed in
the wrong SA year. If it holds exchange, the statutory 60-day deadline is wrong — and that one
carries a penalty.

Roughly one in six residential transactions exchanges and completes either side of 5 April, so
this is not an edge case.

### 1.4 Recommendation

**Yes — exchange/contract date must also be mandatory.** Without it the system cannot determine
which Self Assessment year the gain belongs to, which makes the entire SA integration below
unsound. Both dates are mandatory at job creation:

| Field | Mandatory | Drives |
|---|---|---|
| `exchange_date` | **yes** | CGT tax year → which SA return |
| `completion_date` | **yes** (your ruling) | 60-day filing/payment deadline |
| `condition_satisfied_date` | conditional contracts only | **overrides** `exchange_date` for the tax year (s28(2)) |

### 1.5 Conditional and unusual contracts

- **Conditional contract** — `is_conditional_contract boolean`. When true,
  `condition_satisfied_date` becomes mandatory and is the s28(2) disposal date. The tax year
  derives from it, not from `exchange_date`. `exchange_date` is still stored, because it is
  evidence of the arrangement.
- **Option exercised** — treated identically: the date of exercise is the condition-satisfied
  date.
- **Completion never occurs** (contract rescinded) — no 60-day obligation arises. The job needs
  a terminal state that is not "filed"; see §7.
- **Sub-sales, part disposals, contract variation** — flagged as out of scope for v1 and
  recorded in `disposal_notes` for manual treatment.

> **Verification note.** The s28 exchange-date rule and the FA 2019 Sch 2 60-day rule are
> long-standing and I am confident in both. Rates, the annual exempt amount and the residential
> property surcharge change at most Budgets and should be verified against current HMRC guidance
> before any computation logic is written. I have not proposed any computation logic here.

---

## 2. Does the job model suffice, or is a separate table needed?

You asked me not to create a general-purpose `cgt_disposals` table unless the job model cannot
hold the record. **It cannot hold it alone — but the answer is not a general-purpose table.**

### What `jobs` already gives us

`jobs` carries `service_type`, `canonical_service_code`, `period_start`, `period_end`,
`period_label`, `filing_deadline`, `workpaper_instance_id`, `status`, `assigned_to`,
`source_job_id`, `prerequisite_job_id`, `tags`, and the full workflow vocabulary. Identity,
lifecycle, assignment, audit and deadline linkage are all already there. **The job is the
identity, exactly as ruled.**

### What it cannot hold

`jobs` is the generic workflow table for every service in the product — accounts, VAT, payroll,
CoSec, SA. Adding ~18 CGT-specific columns to it would put property addresses and disposal
proceeds on every payroll job. That is the same "one column, two concepts" failure the wider
vocabulary programme exists to close.

The dates in particular cannot live in a jsonb blob: `completion_date` drives a **statutory
deadline** and `exchange_date` drives **which SA return the gain belongs to**. Both must be
typed, indexed and queryable. A deadline derived from an unvalidated JSON key is exactly how
`on_cgt_disposal_date_changed` came to be broken in four ways at once.

### Proposal — a job **extension**, not a registry

```
cgt_property_returns
  job_id  uuid PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE
```

`job_id` as the **primary key** is the whole design. It is 1:1 with the job, so:

- the job remains the sole identity — this table cannot exist without one;
- there is no independent disposal registry to accumulate its own semantics;
- **no natural key is possible** — two jobs for the same client, property, date and tax year are
  two rows, because they are two jobs;
- it is a UK-Property-CGT-return record, not a chargeable-asset model. Shares and cryptoassets
  have no route into this table.

This is a detail extension of the job, in the same spirit as `client_detail_cgt` extending the
client. It is not the general-purpose table you ruled against.

---

## 3. Proposed fields

### 3.1 `jobs` — no new columns

`service_type = 'CGT_60DAY'`, `canonical_service_code = 'CGT_PROPERTY_60DAY'`.
`period_start`/`period_end` hold the **CGT tax year** (derived from the s28 disposal date, so
2025-26 → 2025-04-06 / 2026-04-05), `period_label = '2025-26'`, and `filing_deadline` holds the
60-day date. That keeps CGT jobs sorting, filtering and reporting alongside every other job with
no special-casing.

### 3.2 `cgt_property_returns`

| Field | Type | Req | Notes |
|---|---|---|---|
| `job_id` | uuid PK FK jobs | ✔ | The identity. Cascade delete. |
| `organization_id` | uuid | ✔ | RLS tenancy boundary |
| `client_id` | uuid | ✔ | Denormalised from the job for RLS and reporting |
| **Dates** | | | |
| `exchange_date` | date | ✔ | s28(1) — drives the tax year |
| `completion_date` | date | ✔ | FA 2019 Sch 2 — drives the 60-day deadline |
| `is_conditional_contract` | bool | ✔ | default false |
| `condition_satisfied_date` | date | if conditional | s28(2) — **overrides** exchange for the tax year |
| `disposal_tax_year` | text | ✔ | Stored, e.g. `2025-26`. Derived on write, not at query time — the 6 April boundary makes this a constant filter. |
| **Property snapshot (immutable once finalised)** | | | |
| `property_address_line1` … `property_postcode` | text | ✔ | Structured, not one blob — HMRC requires them separately |
| `property_uprn` | text | | Where known |
| `property_type` | text | ✔ | Vocabulary, `lower_snake`, per the standing rule |
| `is_uk_residential` | bool | ✔ | Determines whether the 60-day regime applies at all |
| `ownership_share_percent` | numeric | ✔ | Joint ownership; default 100 |
| `acquisition_date` | date | ✔ | |
| `acquisition_cost` | numeric | ✔ | |
| `disposal_proceeds` | numeric | ✔ | |
| `incidental_costs` | numeric | | |
| `improvement_costs` | numeric | | |
| **Reliefs and residence** | | | |
| `ppr_relief_claimed` | numeric | | Private Residence Relief |
| `lettings_relief_claimed` | numeric | | |
| `other_reliefs` | jsonb | | |
| `taxpayer_residence_status` | text | ✔ | Vocabulary. **Non-residents must report every UK land disposal regardless of gain**; UK residents only where tax is due. This field decides whether a return is required at all. |
| **Computation and reconciliation** | | | |
| `computed_gain` | numeric | | |
| `tax_calculated` | numeric | | |
| `tax_paid` | numeric | | Payment on account under the 60-day return |
| `hmrc_property_return_reference` | text | | HMRC's reference for the 60-day return |
| `hmrc_payment_reference` | text | | |
| **Optional links — never identity** | | | |
| `linked_fixed_asset_id` | uuid NULL | | **Nullable, no unique constraint.** Convenience only. |
| `linked_property_id` | uuid NULL | | Likewise, if a property register is added later. |
| **Snapshot integrity** | | | |
| `snapshot_locked_at` / `snapshot_locked_by` | timestamptz/uuid | | Set when the return is filed; see §5 |
| `snapshot_hash` | text | | Hash of the disposal fields at filing — evidence the filed figures are these figures |
| `disposal_notes` | text | | Sub-sales, variations, anything v1 does not model |

**No UNIQUE constraint on any business field.** The only unique key is `job_id`, which is the
job's own identity. Two identical disposals are two jobs, by design.

---

## 4. How the job connects to everything else

```
                       ┌──────────────────────────┐
   accountant  ───────▶│  jobs  (CGT_60DAY)       │  ◀── the identity
   creates            └──┬────────┬──────────┬────┘
                         │        │          │
        1:1 extension    │        │ 1:1      │ generates
                         ▼        ▼          ▼
        cgt_property_returns   workpaper_   deadlines
        (the disposal record)  instances    (CGT_60_DAY, due = completion + 60)
                                   │
                                   │  workpaper_instance_links (role: 'owner' | 'referenced')
                                   │
                                   ├──────────────▶  jobs (CGT_60DAY)      role = 'owner'
                                   └──────────────▶  jobs (SA_NON_MTD)     role = 'referenced'
                                   │
                              filings / filing_submissions (the 60-day return to HMRC)
```

### 4.1 Deadline

On job creation, one `deadlines` row: `deadline_code = 'CGT_60_DAY'`,
`deadline_type = 'statutory'`, `filing_body = 'HMRC'`,
`due_date = completion_date + 60 days`, `period_start = completion_date`,
`status = 'pending'`, `job_id` set.

Created **only if a return is required** — `is_uk_residential` and `taxpayer_residence_status`
decide this (see §8, the remaining decision).

Generated by an explicit function called from job creation, **not by a trigger on a detail
table**. The existing `on_cgt_disposal_date_changed` trigger fires on
`client_detail_cgt.disposal_date` and is retired entirely (§6).

### 4.2 Workpaper — one instance, two jobs

`workpaper_instances.job_id` is a single FK, so a workpaper belongs to one job. Your requirement
is one source of truth surfaced in two places, which that column cannot express.

**Proposal: `workpaper_instance_links`**

| Field | Notes |
|---|---|
| `workpaper_instance_id` | FK |
| `job_id` | FK |
| `role` | `owner` \| `referenced` — exactly one `owner` per instance, enforced by a partial unique index |
| `linked_at`, `linked_by` | audit |
| `link_reason` | e.g. `cgt_disposal_in_sa_year` |

The CGT job holds the `owner` link. The SA job holds a `referenced` link. **There is one row in
`workpaper_instances`.** Both jobs open the same record; an edit from either surface is the same
edit, and the existing `field_values` / audit trail covers it with no synchronisation logic —
because there is nothing to synchronise.

`workpaper_instances.job_id` stays as the owner pointer for backward compatibility.

### 4.3 Self Assessment integration

On CGT job creation:

1. Derive the CGT tax year from the s28 disposal date (`condition_satisfied_date` if conditional,
   else `exchange_date`) — **not from completion date**.
2. Look for an active SA engagement for that client and that tax year.
3. **If found** — create the CGT disposal workpaper, `owner`-linked to the CGT job, and add a
   `referenced` link to the SA job for that year.
4. **If the SA job does not exist yet** — record the intent. When an SA job is created, its
   creation path queries `cgt_property_returns` for that client and `disposal_tax_year` and
   attaches every matching workpaper automatically as `referenced`.
5. **If SA is not provided at all** — still store everything. `disposal_tax_year` is the key that
   makes later attachment automatic if the service is added; nothing needs re-keying.

Step 4 is why `disposal_tax_year` is stored rather than computed. It is the join key for an
event that may happen a year later.

### 4.4 Reconciliation — 60-day return vs annual SA return

`cgt_property_returns` holds `computed_gain`, `tax_calculated`, `tax_paid`,
`hmrc_property_return_reference`. The SA computation produces the annual figures. Reconciliation
is a projection over the two, per tax year:

| Line | Source |
|---|---|
| Gain declared on the 60-day return | `cgt_property_returns.computed_gain` |
| Tax paid on account | `cgt_property_returns.tax_paid` |
| Gain in the final SA computation | SA workpaper |
| Difference and reason | derived; commonly a changed rate band, a later loss, or a revised PPR claim |
| Balancing payment or repayment due | derived |

The 60-day figure is routinely provisional — the final annual position often differs once other
income is known. The reconciliation is a **first-class output**, not an exception report, and it
is why the reference fields must be on the disposal record rather than only in a workpaper blob.

---

## 5. Amendment and correction

The snapshot is immutable **from the point of filing**, not from creation.

| State | Rule |
|---|---|
| Job open, not filed | Fields freely editable. `snapshot_locked_at` NULL. Editing the completion date **recomputes the deadline**; editing the exchange date **may move the SA year**, which re-evaluates the SA link and warns if it moves the gain out of a year already filed. |
| Filed | `snapshot_locked_at` set, `snapshot_hash` computed. The row becomes read-only. |
| Amendment needed | A **new CGT job** is created with `source_job_id` pointing at the original, carrying `amendment_of_job_id` and `amendment_reason`. The original is never mutated. |

This matches how amendments already work elsewhere in the product
(`amended-filing-service.ts` creates a new filing referencing the original) and it is the only
model that keeps "what did we file, and on what figures" answerable. HMRC's own 60-day service
supports amending a return; the amendment job carries the same
`hmrc_property_return_reference` so both sides reconcile.

Corrections *before* filing are ordinary edits with the existing audit trail. Corrections
*after* filing are amendments. There is no third case.

---

## 6. Duplicate detection without invalid uniqueness

No unique constraint. **Detection is advisory, at creation time, and never blocks.**

On creating a CGT job, warn if an existing non-cancelled CGT job for the same client has:

- the same `completion_date`, **and**
- a property postcode matching case-insensitively with whitespace normalised.

Present it as: *"This client already has a CGT return for a property at LS1 4AB completing on
15 May 2026 (job CGT-2026-014). Create another?"* — with **Create anyway** as an equal option,
not a buried one. A genuine second flat in the same building completing the same day is
legitimate and must remain possible.

A second, cheaper signal: two jobs created for the same client within a short window with
identical `completion_date` **and** identical `disposal_proceeds` is far more likely to be a
double-submit than a real coincidence. Worth surfacing more prominently.

Everything here is advisory. The database imposes no uniqueness beyond `job_id`.

---

## 7. Job lifecycle

The generic `chk_jobs_status` vocabulary (`blank`, `records_requested`, …, `completed`) covers
preparation. Two CGT-specific terminal situations are not expressible today:

- **Contract rescinded / completion never occurred** — no obligation arose. Not "completed".
- **No return required** — below threshold, fully covered by PPR, UK resident. The job exists as
  evidence the position was considered.

Both need a resolution field on `cgt_property_returns` (`return_required`, `no_return_reason`)
rather than new `jobs.status` values, so the generic vocabulary stays generic. Flagged as part
of the remaining decision.

---

## 8. Migration from `client_detail_cgt`

`client_detail_cgt` is `UNIQUE(client_id)` with columns `cgt_number`, `disposal_date`,
`property_address`, `home_address`.

**Step 1 — establish production volume before anything else.** I have not been able to query
production. The migration below assumes a small number of rows; if that is wrong the plan needs
revisiting, and the count is the first thing to confirm.

**Step 2 — split the concepts.**

| Current column | Destination |
|---|---|
| `cgt_number` | Client-level. **Stays** on `client_detail_cgt`. |
| `home_address` | Client-level. **Stays.** |
| `disposal_date` | Disposal-level. Moves to `cgt_property_returns.completion_date`. |
| `property_address` | Disposal-level. Moves, parsed into structured lines where possible. |

**Step 3 — backfill.** For each existing row with a non-null `disposal_date`, create one CGT job
plus one `cgt_property_returns` row. `UNIQUE(client_id)` guarantees 1:1, so this is mechanical.

**`exchange_date` is unknown for historical rows.** It cannot be invented — that would fabricate
a tax year. Backfilled rows get `exchange_date = NULL` with `requires_date_review = true`, and
appear in a review queue. This is the one place the new NOT NULL rule is relaxed, and only for
rows that predate it.

**Step 4 — retire the trigger.** Drop `trg_cgt_deadline` and
`on_cgt_disposal_date_changed` entirely. It is broken four ways (§ the state-machine audit) and
its replacement is an explicit call from job creation.

**Step 5 — drop `client_detail_cgt.disposal_date` and `property_address`** once backfill is
verified, in a **separate later migration**, so the two are independently reversible.

---

## 9. The remaining CGT design decision

One decision left, and it is genuinely yours because it is a policy question about liability, not
a schema question.

**When a UK-resident client's disposal produces no CGT liability — fully covered by Private
Residence Relief, or below the annual exempt amount — should the system create the 60-day
deadline anyway?**

No return is legally due in that case (unlike a non-resident, who must report every UK land
disposal regardless). But the determination depends on figures that are often not final when the
job is created, and the penalty for getting it wrong sits with the practice.

The trade-off is: create the deadline and let a human waive it, and the deadline list fills with
items that were never due (and `waived` is not currently a legal `deadlines.status` — it existed
only in the constraint DEF-034 retired). Or suppress it and rely on the figures being right early.

I'll put this to you as a separate decision once you've reviewed the design above, along with
the two vocabulary/state-machine rulings and the ownership model still outstanding.

---

## 10. What this does not decide

- **Computation logic.** No rates, bands, annual exempt amount or PPR arithmetic is proposed
  here. Those change at Budgets and need current HMRC figures.
- **HMRC transport.** Whether the 60-day return is filed through the product or recorded as
  filed elsewhere. This design supports both — `hmrc_property_return_reference` is a plain text
  field either way.
- **Non-resident CGT** beyond the `taxpayer_residence_status` flag deciding whether a return is
  required.
- **The ownership model** separating preparation / client approval / HMRC transport / queue
  state. Still outstanding, and it will determine where the CGT filing's own status lives.
