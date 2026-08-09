# CT submission pipeline — recovery specification

**Status: specification, approved in principle. Not implemented.**
Owner ruling 2026-08-09: **model transport work in its own `transport_jobs` table.** Keep
`filing_queue` meaning "filings awaiting submission".

---

## 1. What is actually broken

The Corporation Tax pipeline has never completed a cycle. Not one defect — six, in three layers.

### 1.1 The vocabulary hinge

`filing_queue.status` permits `queued, processing, completed, failed, cancelled`
(`20251214185814:42`, never altered).

| Component | Writes / reads | Legal? |
|---|---|---|
| `queue_filing_for_submission:225` | writes `queued` | ✅ the only legal producer |
| `hmrc-ct-submit:1250` | writes `pending` (poll job) | ❌ 23514 |
| `hmrc-ct-poll:522` | writes `pending` (delete job) | ❌ 23514 |
| `hmrc-ct-poll:466,584` | writes `pending` (requeue) | ❌ 23514 |
| `hmrc-ct-poll:336` | **reads** `.eq('status','pending')` | ❌ finds nothing, ever |
| `hmrc-ct-delete:236` | **reads** `.eq('status','pending')` | ❌ finds nothing, ever |

**The write side and the read side agree with each other on a vocabulary the database forbids,
and both disagree with the one row the database will accept.** The only legal producer writes
`queued`, which no consumer ever looks for.

### 1.2 The inserts are structurally invalid regardless of status

Both edge-function INSERTs (`hmrc-ct-submit:1246`, `hmrc-ct-poll:518`) would fail even with a
legal status:

- **`snapshot_hash` is `NOT NULL` with no default** (`:44`) and neither supplies it → `23502`.
- Both write **`metadata`**, a column that exists in no migration and in no generated type
  (`src/integrations/supabase/types.ts:8958-8976`) → PostgREST schema-cache rejection.
- `hmrc-ct-poll:521` writes **`filing_type = 'CT600_HMRC_DELETE'`**; the CHECK permits only
  `ACCOUNTS_CH, CT600_HMRC, VAT_HMRC` → a second `23514` on the same statement.

**These are not three bugs. They are one category error**, and it is why the ruling is a separate
table: `snapshot_hash`, `approval_id` and a snapshot-derived idempotency key are the attributes of
*a filing to be submitted*. A poll has no snapshot, no approval and nothing to send.

### 1.3 Every failure is silent

`hmrc-ct-submit:1246` and `hmrc-ct-poll:518` are bare `await supabase.from(...).insert({...})`
with **no destructuring and no error check**. The submit path returns success to the UI, sets
`filings.status = 'submitted'`, and the job that would reconcile that submission was never
created. Nothing logs. Nothing alerts.

A CT600 can be filed with HMRC and acknowledged, and the product will never learn the outcome.

### 1.4 Two conditions that persist even after the above

- **The claim is not atomic.** The mark-`processing` UPDATEs (`hmrc-ct-poll:371`,
  `hmrc-ct-delete:274`) key on `.eq('id', job.id)` alone — no from-state predicate, no
  `claimed_at`. The poll cron runs every minute (`20260806083238:108`); any run outstripping that
  interval double-claims. `email_queue` solved exactly this with `claim_email_queue_row`
  (`20260720095559:23-28`).
- **Transport state is being written onto the filing.** `submitting`, `polling`,
  `polling_timeout`, `submission_failed`, `failed` are all written to `filings.status` and none is
  legal there. Per the architecture the HMRC layer must never own figures of record — and per the
  DEF-035 ruling, transport state does not live on the filing.

---

## 2. The precedent to copy

`email_queue` is the only worker queue in this repo that functions, and it satisfies three
properties `filing_queue` satisfies none of:

1. **The DEFAULT status is the literal the worker selects on.** Producer and consumer cannot
   drift apart, because there is one value.
2. **The claim is an atomic conditional UPDATE that returns rows.**
   `claim_email_queue_row(p_email_id, p_stale_before)` — `UPDATE ... WHERE id = ... AND status =
   'pending' AND (claimed_at IS NULL OR claimed_at < p_stale_before) RETURNING ...`. Zero rows
   returned means another worker won; the row is skipped.
3. **A stale-claim window makes crashes recoverable** — `claimed_at < now() - 10 minutes` is
   re-claimable (`process-email-queue/index.ts:433,440`).

`transport_jobs` copies all three.

---

## 3. `transport_jobs`

```sql
CREATE TABLE public.transport_jobs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- What this job is following up. A transport job exists because a submission was made.
  filing_submission_id    uuid NOT NULL REFERENCES filing_submissions(id) ON DELETE CASCADE,
  filing_id               uuid NOT NULL REFERENCES filings(id) ON DELETE CASCADE,
  correlation_id          text NOT NULL,          -- HMRC's handle. No correlation, no job.

  operation               text NOT NULL,          -- CHECK (operation IN ('poll','delete'))
  channel                 text NOT NULL,          -- CHECK (channel IN ('hmrc_ct','hmrc_vat','ch'))

  -- Worker state. DEFAULT is the value the worker selects on — property 1.
  status                  text NOT NULL DEFAULT 'queued'
                            CHECK (status IN ('queued','processing','completed','failed','cancelled')),

  attempts                int NOT NULL DEFAULT 0,
  max_attempts            int NOT NULL DEFAULT 100,
  next_attempt_at         timestamptz NOT NULL DEFAULT now(),
  claimed_at              timestamptz,            -- property 3
  last_attempt_at         timestamptz,
  completed_at            timestamptz,

  error_code              text,
  error_message           text,
  metadata                jsonb NOT NULL DEFAULT '{}'::jsonb,   -- exists here, deliberately

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  -- One live job per operation per correlation. Idempotent by construction: a retried
  -- acknowledgement cannot create a second poll job.
  CONSTRAINT transport_jobs_idempotent
    UNIQUE (correlation_id, operation)
);

CREATE INDEX transport_jobs_due_idx
  ON public.transport_jobs (channel, operation, next_attempt_at)
  WHERE status = 'queued';
```

Notes on the shape:

- **No `snapshot_hash`, no `approval_id`.** That is the whole point. A poll has neither, and a
  nullable column on `filing_queue` would have destroyed the guarantee that a *submission* is
  tied to an approved snapshot.
- **`correlation_id NOT NULL`.** Today `hmrc-ct-poll:363` handles a missing correlation id by
  marking the job failed — a state that cannot arise if the column requires one.
- **`operation` and `channel` are separate.** `filing_type = 'CT600_HMRC_DELETE'` conflated "what
  kind of filing" with "what operation"; splitting them is what stops that recurring.
- **`metadata` exists here**, so the edge functions' existing writes become legal rather than
  needing removal.
- RLS org-scoped `FOR ALL`, matching `filing_queue` (`20251214185814:62-65`).

### 3.1 Atomic claim

```sql
CREATE FUNCTION public.claim_transport_job(p_job_id uuid, p_stale_before timestamptz)
RETURNS SETOF public.transport_jobs
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.transport_jobs
     SET status = 'processing',
         claimed_at = now(),
         last_attempt_at = now(),
         attempts = attempts + 1
   WHERE id = p_job_id
     AND status = 'queued'
     AND (claimed_at IS NULL OR claimed_at < p_stale_before)
  RETURNING *;
$$;
```

Zero rows returned = another worker won, or the row is not due. The worker skips it. This is the
`email_queue` pattern verbatim.

---

## 4. State separation

Three layers, three homes. No value appears in two of them.

| Layer | Column | Vocabulary |
|---|---|---|
| **Filing** — where the return is in its own lifecycle | `filings.status` | the 13 in `chk_filing_status`; **no transport value** |
| **Submission** — what happened with the authority | `filing_submissions.status` | `pending, submitted, accepted, rejected, error` |
| **Transport work** — the worker's own progress | `transport_jobs.status` | `queued, processing, completed, failed, cancelled` |

The illegal `filings.status` writes are re-homed:

| Currently written to `filings.status` | Goes to |
|---|---|
| `submitting` | `filing_submissions.status = 'pending'` (already legal) |
| `polling` | `transport_jobs.status = 'processing'` — the filing does not change while we poll |
| `polling_timeout` | `transport_jobs.status = 'failed'` + `error_code`; `filing_submissions.status = 'error'` |
| `submission_failed` / `failed` | `filing_submissions.status = 'error'` |

`filings.status` moves only on outcomes that are genuinely the filing's: `submitted` on
acknowledgement, `accepted` on a final response, `rejected` on an error response, `filed` on
completion. Those four are already legal.

`filing_submissions.status` also currently receives `blocked` (`ch-submit:193`), `failed`
(`hmrc-ct-submit:1209`) and `timeout` (`hmrc-ct-poll:458`), none legal. All three map to `error`
with the distinction carried in `error_code` — one column, one meaning.

---

## 5. Lifecycle

```
approve → queue_filing_for_submission
             └─ filing_queue: queued ──▶ processing ──▶ completed
                                                │
                        submit to HMRC ─────────┘
                                │
                    acknowledgement + correlation_id
                                │
                                ▼
            transport_jobs (operation='poll') : queued
                                │  claim_transport_job()
                                ▼
                             processing
                    ┌───────────┼───────────────┐
             still ack      response          error
                    │           │               │
          under max?│           ▼               ▼
             ┌──────┘      completed          failed
             ▼             filings.accepted   filings.rejected
        queued (backoff)        │             submissions.error
        next_attempt_at         ▼
        = HMRC pollInterval   transport_jobs (operation='delete') : queued
             │                     │
        at max_attempts            ▼
             ▼                 completed → filings.filed
          failed
       submissions.error
```

Requeue writes `queued`, which is what the worker selects on. Producer and consumer share one
value — the property whose absence broke the original.

---

## 6. Error propagation

Every insert and update is destructured and checked. The current bare `await ... .insert()` is
what made six failures invisible.

- **A failed transport-job insert is loud.** If the poll job cannot be created after a successful
  HMRC submission, that is a reconciliation gap: the submission succeeded and nothing will follow
  it up. It must raise, log with the correlation id, and mark
  `filing_submissions.status = 'error'` with an explicit `error_code`, so the filing is visibly
  stuck rather than invisibly abandoned.
- **Backoff** uses HMRC's own `pollInterval` where supplied, falling back to exponential with a
  ceiling — not the current fixed 30 s (`hmrc-ct-poll:583`).
- **`attempts` is never reset** on requeue, so `max_attempts` remains a real bound.

---

## 7. Migration and cutover

1. Create `transport_jobs`, the claim function, RLS policies and grants. Additive; nothing reads
   it yet.
2. Rewrite `hmrc-ct-submit`, `hmrc-ct-poll`, `hmrc-ct-delete` to produce and consume
   `transport_jobs`, with error checks and atomic claiming.
3. `filing_queue` is untouched and keeps its meaning. No rows migrate — **there are none.** No
   legal `filing_queue` row has ever existed, because `queue_filing_for_submission` aborted on
   the illegal `filings.status` write until DEF-035. Confirm the count is zero before cutover;
   if it is not, the assumption is wrong and this plan needs revisiting.
4. Add the app-surface baseline entries this removes.

**Ordering:** DEF-035 must be applied first. Until it is, no `filing_queue` row can be created at
all, so there is nothing for a repaired poller to follow up.

---

## 8. Verification — behavioural, not structural

Structural checks would pass on a pipeline that still moves nothing. Required evidence:

1. `queue_filing_for_submission` on an approved filing creates a `filing_queue` row with
   `status='queued'` — **impossible before DEF-035**.
2. A submission producing an acknowledgement creates exactly one `transport_jobs` row,
   `operation='poll'`, `status='queued'`.
3. The poll worker claims it: exactly one row moves to `processing`, `attempts=1`.
4. Two concurrent worker invocations claim it **once** — the property `filing_queue` never had.
5. A final response drives `transport_jobs → completed`, `filings.status → accepted`, and creates
   the delete job.
6. `filings.status` never holds `submitting`, `polling`, `polling_timeout`, `submission_failed`
   or `failed` at any point in the cycle.
7. A deliberately failed insert surfaces an error and marks the submission `error` — it does not
   return success.

Checks 4 and 7 are the ones that matter: they are the two failure modes that were silent.

---

## 9. Open

- **Does `ch-submit` / `hmrc-vat-submit` move too?** They write the same illegal
  `filings.status` values. CH has no poll cycle; VAT is synchronous. Both need the state-separation
  fix; neither needs `transport_jobs`. Recommend re-homing their status writes in the same change,
  since it is the same rule.
- **The cron authentication has never been proven to work.** Post-repair health still shows
  `succeeded | 0` (`docs/audits/raw/2026-08-06-post-apply-verification.txt:129-130`). The jobs
  authenticate with a vault secret named `email_queue_service_role_key` against functions that
  require equality with `SUPABASE_SERVICE_ROLE_KEY`. **If those differ, every invocation 401s and
  none of this runs.** That must be verified before the recovery is declared working — it is not
  something this specification can fix.
