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

**How often this happens is not quantified here.** An earlier draft of this document asserted
"roughly one in six residential transactions", which was unsupported and has been removed. Any
transaction exchanging in late March and completing in April is affected; the exchange-to-
completion gap is typically a few weeks, so the affected share is small but not negligible. If a
figure is needed to justify the work, it should come from the firm's own transaction data, not
from an estimate. The correctness argument does not depend on frequency: a single straddling
disposal filed into the wrong tax year is a wrong return.

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
| `condition_satisfied_date` | date | if conditional | s28(2) condition-precedent satisfaction |
| `statutory_disposal_date` | date | ✔ | **GENERATED, not entered.** See §3.3. |
| `disposal_tax_year` | text | ✔ | **GENERATED from `statutory_disposal_date`.** Not independently editable. See §3.3. |
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

### 3.3 The tax year cannot be allowed to disagree with the legal facts

Owner ruling: `disposal_tax_year` must not be an independently editable fact stored merely
because it joins conveniently. It is a *conclusion*, and a stored conclusion that can drift from
its premises is how a gain ends up on the wrong return with nothing failing.

**Both derived fields are generated columns, so drift is not merely discouraged — it is
unrepresentable.**

```sql
-- The statutory disposal date. TCGA 1992 s28(1) for the ordinary case; s28(2) where the
-- contract is conditional. There is no third rule, so there is no third branch.
statutory_disposal_date date GENERATED ALWAYS AS (
  CASE WHEN is_conditional_contract THEN condition_satisfied_date
       ELSE exchange_date END
) STORED,

-- The UK tax year containing that date. The 6 April boundary, expressed once.
disposal_tax_year text GENERATED ALWAYS AS (
  CASE
    WHEN <statutory date> IS NULL THEN NULL
    WHEN EXTRACT(MONTH FROM d) > 4
      OR (EXTRACT(MONTH FROM d) = 4 AND EXTRACT(DAY FROM d) >= 6)
    THEN to_char(d, 'YYYY') || '-' || to_char(d + interval '1 year', 'YY')
    ELSE to_char(d - interval '1 year', 'YYYY') || '-' || to_char(d, 'YY')
  END
) STORED,
```

Generated columns are indexable, so the join key requirement is met with no separate fact to
keep in step. Nothing can write `disposal_tax_year` directly — Postgres rejects the attempt.

Two supporting constraints:

```sql
-- A conditional contract must say when the condition was satisfied; an unconditional one
-- must not pretend it had one.
CONSTRAINT cgt_conditional_date_present CHECK (
  (is_conditional_contract AND condition_satisfied_date IS NOT NULL)
  OR (NOT is_conditional_contract AND condition_satisfied_date IS NULL)
),
-- A condition cannot be satisfied before the contract exists.
CONSTRAINT cgt_condition_after_exchange CHECK (
  condition_satisfied_date IS NULL OR exchange_date IS NULL
  OR condition_satisfied_date >= exchange_date
)
```

The Self Assessment link is then validated against `disposal_tax_year`, which is validated
against the legal facts by construction. There is one path from contract to return.

### 3.4 UI: default to unconditional, and warn

The conditional-contract branch is legally narrow and easy to over-claim. An ordinary
contractual obligation — a seller agreeing to fix a defect, a buyer arranging finance — is **not**
a condition precedent. Getting this wrong moves the disposal into the wrong tax year.

- The form defaults to **unconditional**. `condition_satisfied_date` is not rendered at all
  until "conditional contract" is selected.
- Selecting it reveals an inline warning: *"A condition precedent suspends the contract until it
  is met. Ordinary obligations such as repairs, finance or vacant possession are usually not
  conditions precedent. If in doubt, treat the contract as unconditional and take advice — this
  choice changes which tax year the gain falls in."*
- Selecting it sets `conditional_treatment_confirmed_by` and `..._at`. The choice is a
  professional judgement and is recorded as one.

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

### 4.2 Workpaper — one instance, one owner, many references

Owner ruling: **reuse `workpaper_instances.job_id` as the owning job.** An earlier draft proposed
an `owner`/`referenced` role on the link table, which would have created a second way to express
ownership competing with the FK that already expresses it — the same "one concept, two homes"
failure this whole programme exists to close. Withdrawn.

**Ownership is `workpaper_instances.job_id`. It is `NOT NULL`, so every workpaper has exactly one
owner, guaranteed by the column, not by an index.** That is the point you made about partial
unique indexes: they guarantee *at most one*, never *exactly one*. A `NOT NULL` FK guarantees
exactly one and needs no index to do it.

**References only:**

```
workpaper_instance_references
  workpaper_instance_id  uuid NOT NULL REFERENCES workpaper_instances(id) ON DELETE CASCADE
  referencing_job_id     uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE
  reference_reason       text NOT NULL      -- e.g. 'cgt_disposal_in_sa_year'
  linked_at, linked_by
  PRIMARY KEY (workpaper_instance_id, referencing_job_id)

  CONSTRAINT reference_is_not_ownership CHECK (...)   -- see below
```

Three properties fall out:

1. **A reference cannot masquerade as ownership.** The table has no role column and no way to
   express one. Ownership lives in exactly one place.
2. **The owning job cannot also reference its own workpaper** — enforced by a trigger asserting
   `referencing_job_id <> (SELECT job_id FROM workpaper_instances WHERE id = ...)`. A CHECK
   cannot subquery, so this is a constraint trigger.
3. **Removing a reference can never delete the workpaper.** `ON DELETE CASCADE` runs from
   `workpaper_instances` *to* the reference row, never the reverse. Deleting a reference row is a
   plain `DELETE` on this table and touches nothing else. The only route to deleting a workpaper
   is deleting its owning job.

So: the CGT job **owns** the CGT workpaper via `workpaper_instances.job_id`. The relevant SA job
**references** it. There is **one workpaper row and one audit history** — an edit from either
surface is the same edit, so there is no synchronisation logic, because there is nothing to
synchronise.

`jobs.workpaper_instance_id` (the reverse pointer) stays as-is for the owning job only. It is not
set on referencing jobs — that would be a second ownership claim.

### 4.2.1 Access control

**A reference must not widen access.** Visibility of a workpaper is determined by the
organisation and client on the workpaper itself, exactly as today:

- `workpaper_instances` already carries `organization_id` and `client_id`. RLS continues to
  evaluate against those columns and **not** against the reference table.
- A reference row therefore cannot grant a user sight of a workpaper they could not already see.
  If the SA job and the CGT job belong to the same client — which they must, since the SA link is
  derived from that client's disposal — the question does not arise; but the policy must not
  depend on that holding.
- Creating a reference requires write access to the **referencing** job and read access to the
  workpaper. It does not confer write access to the workpaper; that follows the workpaper's own
  policy.
- A cross-client or cross-organisation reference is rejected outright by a constraint trigger
  comparing `organization_id`/`client_id` on both sides.

The rule stated plainly: **a link records a relationship; it never grants a permission.**

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

## 5. Amendment and correction — a product decision, not a schema one

Two things are **not** in question, whichever option is chosen:

- The submitted return is immutable once filed. `snapshot_locked_at`, `snapshot_locked_by` and
  `snapshot_hash` are set at submission and the figures become read-only.
- Every amended submission gets its **own** version row: its own figures, calculation, evidence,
  HMRC response and audit trail. Nothing overwrites a filed submission.

What *is* in question is whether the accountant sees one case or several. An earlier draft
assumed a new job per amendment; that was an assumption, not a conclusion, and is withdrawn
pending your decision.

### Option 1 — one enduring disposal job, versioned submissions *(recommended)*

`cgt_property_returns` keeps the current figures. A child table `cgt_return_submissions` holds
one row per submission — `version`, `submission_type` (`original` | `amendment`),
`submitted_at`, `figures` snapshot, `snapshot_hash`, `hmrc_property_return_reference`,
`hmrc_response`, `submitted_by`, `amendment_reason`.

| Dimension | Consequence |
|---|---|
| **UX** | One case per property. "Amend return" opens v2 in place; history is a version list. The accountant's mental model — *one disposal, one case* — matches the screen. |
| **Billing** | Amendment work is billed against the existing job. If a separately commissioned amendment needs its own fee, it is a billable item on the job, which the schema already supports. |
| **Task assignment** | Assignee, tags and watchers persist. No re-assignment, no dropped context. |
| **Deadlines** | The original 60-day deadline stays satisfied. An amendment does not create a second statutory deadline, because there isn't one — this is the strongest argument for Option 1. A new job would invite a new deadline that does not legally exist. |
| **Workpapers** | The workpaper stays owned by the one job, so the SA reference never needs re-pointing. Under Option 2 the SA job would reference the *original* job's workpaper while the live figures moved to a new job — an active trap. |
| **HMRC references** | Original and amendment references sit on their own version rows, correctly distinguished. |
| **Reporting** | "How many CGT disposals this year" counts jobs and is right. Under Option 2 it double-counts unless every query filters amendments. |
| **Audit** | Complete and linear: one case, N versions, each immutable. |

### Option 2 — a new linked job per amendment

Mirrors `amended-filing-service.ts`, which creates a new filing referencing the original.

| Dimension | Consequence |
|---|---|
| **UX** | A property disposal amended twice shows as three jobs in the client's list. The accountant must know which is current. |
| **Billing** | Natural fit *if* the amendment is separately commissioned and separately billed. |
| **Task assignment** | Amendment can be assigned to someone else outright, with its own workflow status. |
| **Deadlines** | Risk: a job of this service type is expected to carry a 60-day deadline, and there is no second statutory deadline to carry. Needs a suppression rule. |
| **Workpapers** | Either re-point the SA reference or leave it on the superseded job. Both are wrong in some case. |
| **Reporting** | Disposal counts need amendment filtering everywhere. |
| **Audit** | Complete, but the chain is across jobs rather than within one. |

### Recommendation — Option 1, with a named exception

**Option 1.** The deciding argument is the deadline: an amendment creates no new statutory
obligation, and a model that spawns a job which *looks like* it should carry a 60-day deadline is
inviting a false one. The workpaper/SA re-pointing problem is a close second — under Option 2 the
Self Assessment return would reference a superseded job's workpaper while the live figures lived
elsewhere.

This matches your stated preference. The named exception: where an amendment is **separately
commissioned and separately billed** — a client returns months later and instructs the firm to
revisit a filed return — that is genuinely new work, and a new job linked via `source_job_id` is
right. That is a commercial trigger, chosen deliberately, not the default path for correcting a
figure.

Note this diverges from `amended-filing-service.ts`. That is intentional: an amended CT600 or set
of accounts *is* a fresh statutory filing with its own obligations, whereas an amended 60-day CGT
return is a correction to one that has already been made.

### Corrections before filing

Ordinary edits under the existing audit trail. Editing the completion date recomputes the
deadline; editing the exchange date may move the SA year, which re-evaluates the SA link and
warns if the gain would leave a year already filed.

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

**`exchange_date` is unknown for historical rows and must never be inferred.** Copying
`completion_date` into it would fabricate a statutory disposal date and therefore a tax year —
the single most damaging thing this migration could do, and it would be invisible afterwards
because the result looks like ordinary data.

Five rules govern the backfill:

1. **Never infer.** No default, no copy from completion, no interpolation. `exchange_date` is
   `NULL` where it is unknown, and the migration contains no statement that could set it.

2. **An unresolved row cannot reach Self Assessment.** `statutory_disposal_date` is generated
   from `exchange_date`, so it is `NULL` too, and `disposal_tax_year` is `NULL` in turn. The SA
   attachment routine joins on `disposal_tax_year`, so **a row with no exchange date cannot
   match any Self Assessment year** — it is excluded by the data, not by a flag someone might
   forget to check. A guard makes the intent explicit rather than incidental:
   ```sql
   CONSTRAINT sa_link_requires_statutory_date CHECK (
     linked_sa_job_id IS NULL OR statutory_disposal_date IS NOT NULL
   )
   ```

3. **Surface the review operationally, not as a hidden boolean.** A `requires_date_review` flag
   nobody queries is not a control. Instead each unresolved row gets a real **`deadlines` row**:
   `deadline_code = 'CGT_DATE_REVIEW'`, `deadline_type = 'internal'`, owned and dated, appearing
   in the ordinary deadline list and chaser flow. It is closed by supplying the exchange date.
   The work is visible in the tool the firm already uses, alongside everything else.

4. **Preserve the legacy value and its provenance.** The original row is not discarded:
   ```
   legacy_source_table       text     -- 'client_detail_cgt'
   legacy_source_row_id      uuid
   legacy_disposal_date      date     -- the ORIGINAL single overloaded value, verbatim
   legacy_property_address   text     -- the original unparsed blob
   migrated_at, migrated_by
   ```
   `legacy_disposal_date` is retained precisely because we do **not** know whether whoever
   entered it meant exchange or completion. Recording it unaltered lets the reviewer see what was
   actually stored rather than our interpretation of it. Address parsing is likewise
   non-destructive — the blob is kept beside the structured columns.

5. **Report before rollout.** These counts are produced and reviewed *before* any migration runs,
   not after:
   - total `client_detail_cgt` rows;
   - rows with a non-null `disposal_date` (the rows that become jobs);
   - **distinct clients affected**, with names, for the review queue;
   - rows whose `disposal_date` falls within 60 days of today — these may have a **live statutory
     deadline** and are the ones to handle first;
   - rows whose `property_address` does not parse into structured lines.

   I cannot run these; the database connector is unavailable to me. They are the first executor
   step and the migration is not scheduled until they are read.

**Step 4 — retire the trigger.** Drop `trg_cgt_deadline` and
`on_cgt_disposal_date_changed` entirely. It is broken four ways (§ the state-machine audit) and
its replacement is an explicit call from job creation.

**Step 5 — drop `client_detail_cgt.disposal_date` and `property_address`** once backfill is
verified, in a **separate later migration**, so the two are independently reversible.

---

## 9. "No tax due" — legal edge cases, states and controls

Your provisional direction is sound and I recommend adopting it. It is also, on the law below,
the only safe one: the obligation for a UK resident genuinely depends on the computed figures, so
any model that decides at creation time decides on information it does not yet have.

### 9.1 The legal position

| Case | 60-day return required? |
|---|---|
| **UK resident, UK residential property, CGT payable** | **Yes** — within 60 days of completion. |
| **UK resident, UK residential property, no CGT payable** (full PPR, covered by annual exempt amount, or an allowable loss) | **No.** The obligation is conditional on there being tax to pay. |
| **UK resident, UK *non-residential* property** | **No.** The 60-day regime covers residential property only for UK residents. |
| **Non-UK resident, any UK land — residential *or* non-residential** | **Yes, always.** Reportable regardless of whether tax is due, and regardless of whether the disposal produced a gain, a nil result or a loss. Extended from residential to all UK land on 6 April 2019. |
| **Non-resident already within Self Assessment** | Return still due within 60 days; the *payment* may be deferred to the normal SA due date. Deadline and payment are separate obligations. |
| **Mixed-use property** | Apportioned. The residential element can trigger the obligation on its own. |
| **Trustees and personal representatives** | Within scope on the same basis. |
| **Joint owners** | Each owner reports their own share separately — so a jointly owned disposal is one CGT job **per client**, not one job with two clients. |

The asymmetry is the whole design problem: **residence status determines whether the obligation
is conditional at all.** For a non-resident it is unconditional and known at creation. For a UK
resident it depends on a computation that may take weeks.

> Confirm against current HMRC guidance before implementation. The structural rules above are
> long-standing and I am confident in them; the annual exempt amount and rates change at Budgets
> and no figure is proposed here.

### 9.2 The three states

A new field on `cgt_property_returns`, `lower_snake` per the standing rule:

```
filing_obligation  text NOT NULL DEFAULT 'assessing'
  CHECK (filing_obligation IN ('assessing','required','not_required'))
```

| State | Meaning | Set by | Deadline shown |
|---|---|---|---|
| `assessing` | Obligation not yet determined. **Default for UK residents.** | Job creation | **Yes** — dated `completion_date + 60`, `deadline_type = 'internal'`, labelled *"Potential 60-day CGT deadline — obligation under assessment"* |
| `required` | Statutory obligation confirmed. | Automatic for non-residents at creation; explicit for residents once the computation shows tax due | **Yes** — same date, promoted to `deadline_type = 'statutory'`, `filing_body = 'HMRC'` |
| `not_required` | Concluded no return is due. | Explicit accountant action only | **Yes, closed** — never deleted |

**The date is identical in all three states.** Only its legal character changes. That is the
point of your direction: the firm sees the date from the moment the job exists, so it cannot be
missed while liability is being assessed, and no calculation reaching nil can make it disappear.

**Non-residents skip `assessing` entirely** — `filing_obligation` is set to `required` at
creation, because the obligation does not depend on the figures.

### 9.3 Controls on `not_required`

Concluding no return is due is a professional judgement with a penalty behind it. It is recorded
as one, and all five are `NOT NULL` when the state is entered:

```
not_required_reason        text     -- vocabulary, see below
not_required_narrative     text     -- free text: why, in the reviewer's words
not_required_evidence      jsonb    -- computation reference, workpaper version, PPR basis
not_required_reviewed_by   uuid     -- a person, not a service account
not_required_reviewed_at   timestamptz

CONSTRAINT not_required_is_fully_evidenced CHECK (
  filing_obligation <> 'not_required' OR (
    not_required_reason IS NOT NULL AND not_required_narrative IS NOT NULL
    AND not_required_reviewed_by IS NOT NULL AND not_required_reviewed_at IS NOT NULL
  )
)
```

Reason vocabulary: `full_ppr_relief`, `covered_by_annual_exempt_amount`, `allowable_loss`,
`non_residential_uk_resident`, `no_disposal_occurred`, `other` (narrative mandatory).

A further guard: **`not_required` is unreachable for a non-resident**, because for them the
obligation does not depend on the outcome.

```sql
CONSTRAINT non_resident_must_report CHECK (
  taxpayer_residence_status <> 'non_resident' OR filing_obligation <> 'not_required'
)
```

Transitions: `assessing → required`, `assessing → not_required`, and `not_required → required`
(reopened if figures change). **`required → not_required` is blocked once a return has been
filed** — you cannot un-owe a return you have already made; that is an amendment.

### 9.4 Closing the deadline — corrected, and it needs no vocabulary change

**An earlier draft of this section recommended adding `not_required` to `deadlines.status`, and
that recommendation was wrong.** Owner challenge 2026-08-09, upheld: `not_required` is the outcome
of a *statutory-obligation assessment*. It is not a lifecycle state of a deadline, and it is not
universal.

**The test it fails.** A value belongs in `deadlines.status` only if it is meaningful for every
deadline in the product. Take the others: a Companies House confirmation statement, a VAT return,
a PAYE payment, an internal review date. None of them can be "not required" — the obligation
either exists or the deadline should never have been created. **`not_required` is meaningful for
exactly one class: obligations that are conditional on a computation.** Putting a
one-class concept into the vocabulary every class shares is the same error as the `journal_type`
/ `source_type` overload that DEF-033 had to unpick.

Worse, it would have made the deadline row *assert something about tax law*. A deadline records
that a date matters. Whether a statutory obligation arose is a professional conclusion about the
client's figures, and it belongs where that conclusion is evidenced.

**The proposed constraint replacement is therefore: none. `deadlines.status` is unchanged.**

```sql
-- deadlines_status_check — UNCHANGED by this design.
--   pending, in_progress, completed, filed, overdue, cancelled
-- No migration. No DROP CONSTRAINT. No widening.
```

### 9.5 Three separated concerns

| Concern | Where it lives | Vocabulary |
|---|---|---|
| **Deadline lifecycle** | `deadlines.status` | `pending, in_progress, completed, filed, overdue, cancelled` — **unchanged** |
| **Obligation assessment** | `cgt_property_returns.filing_obligation` | `assessing, required, not_required` |
| **Closure reason** | `cgt_property_returns.not_required_reason` | `full_ppr_relief, covered_by_annual_exempt_amount, allowable_loss, no_chargeable_gain, outside_scope, other` |

The deadline never claims to know why. It is closed; the CGT record says what was concluded and
who concluded it.

### 9.6 What happens when a return is assessed as not required

Four things, in order, as one audited operation:

1. **The calculated potential due date is preserved**, on the CGT record, not the deadline:
   ```sql
   potential_60_day_due_date date GENERATED ALWAYS AS (completion_date + 60) STORED
   ```
   Generated, so it survives the deadline's closure and cannot be edited away. If the assessment
   is later reopened — figures change, a relief is withdrawn — the statutory date is still there,
   unaltered, and was never recomputed from a mutable field.

2. **The actionable deadline is closed as `cancelled`** — the existing vocabulary, meaning
   "this is no longer actionable". That is all the deadline layer needs to say.

3. **`filing_obligation = 'not_required'`** on the CGT record, with the five mandatory evidence
   fields from §9.3: reason, narrative, reviewer, timestamp, evidence.

4. **The closure is audited** through a single `SECURITY DEFINER` function rather than two
   independent writes, so the deadline can never be cancelled without the assessment that
   justifies it:

   ```sql
   CREATE FUNCTION public.close_cgt_obligation_not_required(
     p_job_id uuid, p_reason text, p_narrative text, p_evidence jsonb
   ) RETURNS void ...
   -- One transaction:
   --   1. asserts filing_obligation = 'assessing' (never after 'required' + filed)
   --   2. asserts the caller is a real user, not a service account
   --   3. sets filing_obligation, reason, narrative, evidence, reviewed_by, reviewed_at
   --   4. UPDATE deadlines SET status = 'cancelled' WHERE job_id = p_job_id
   --        AND deadline_code = 'CGT_60_DAY'
   --   5. writes a bookkeeping_audit_log row: action 'cgt_obligation_not_required'
   ```

   No path cancels the deadline alone. No path records the assessment without closing the
   deadline. They are one operation because they are one decision.

**Reopening** is the same shape in reverse: `filing_obligation` returns to `required`, a fresh
deadline row is created from the preserved `potential_60_day_due_date`, and both are audited.
The cancelled row is never resurrected — closure history stays intact.

**This was the last CGT design decision. The design is now settled and ready to implement.**
