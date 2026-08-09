# CT transport recovery — census, cutover and rollback runbook

**Read this before applying anything.** Every step below is to be executed by an authorised
deployment operator against production `moxpdejnucjjcplleefn`. I cannot reach the database; the
queries are prepared, not run, and their results gate the cutover.

---

## Step 0 — the census. Run this FIRST, before any migration.

The design was written on the assumption that `filing_queue` is empty, because
`queue_filing_for_submission` aborted on its illegal `filings.status = 'queued'` write until
DEF-035 and took the queue INSERT down with it. **That assumption must be verified, not
believed.** If rows exist, something created them by a path not in the migration history, and
that changes what cutover means.

### 0.1 Row count and state distribution

```sql
SELECT status,
       filing_type,
       count(*)                                        AS rows,
       min(created_at)                                 AS oldest,
       max(created_at)                                 AS newest,
       count(*) FILTER (WHERE completed_at IS NOT NULL) AS completed,
       count(*) FILTER (WHERE attempts > 0)             AS attempted
  FROM public.filing_queue
 GROUP BY status, filing_type
 ORDER BY status, filing_type;
```

### 0.2 Classification — which rows mean what

```sql
SELECT q.id,
       q.status,
       q.filing_type,
       q.created_at,
       q.attempts,
       q.error_message,
       f.status                                  AS filing_status,
       (SELECT count(*) FROM public.filing_submissions s
         WHERE s.filing_id = q.filing_id)        AS submission_count,
       (SELECT max(s.status) FROM public.filing_submissions s
         WHERE s.filing_id = q.filing_id)        AS latest_submission_status,
       CASE
         -- Terminal. Nothing to recover; keep as history.
         WHEN q.status IN ('completed','cancelled')                  THEN 'obsolete_terminal'
         -- Failed and the filing has moved on regardless.
         WHEN q.status = 'failed'
              AND f.status IN ('filed','accepted')                   THEN 'obsolete_superseded'
         -- Failed with the filing still open — a real unsubmitted filing.
         WHEN q.status = 'failed'                                    THEN 'recoverable_failed'
         -- Never picked up. The expected state if any rows exist at all.
         WHEN q.status = 'queued' AND q.attempts = 0                 THEN 'recoverable_unstarted'
         -- Claimed and abandoned: no worker has ever legitimately run.
         WHEN q.status = 'processing'                                THEN 'ambiguous_stranded'
         ELSE                                                             'ambiguous_other'
       END AS classification
  FROM public.filing_queue q
  LEFT JOIN public.filings f ON f.id = q.filing_id
 ORDER BY classification, q.created_at;
```

### 0.3 The dangerous one — rows whose filing may already be with HMRC

```sql
-- A queue row whose filing has a submission carrying a correlation id means a CT600 may be
-- lodged with HMRC and unreconciled. These are handled individually, never in bulk.
SELECT q.id AS queue_id, q.status AS queue_status,
       f.id AS filing_id, f.status AS filing_status,
       s.id AS submission_id, s.status AS submission_status,
       s.created_at
  FROM public.filing_queue q
  JOIN public.filings f            ON f.id = q.filing_id
  JOIN public.filing_submissions s ON s.filing_id = f.id
 WHERE s.status IN ('submitted','pending')
 ORDER BY s.created_at;
```

### 0.4 Recording the result

The counts, the classification table and the §0.3 result are pasted into the release receipt
before cutover. **A cutover that proceeds without them is not authorised**, whichever number the
census returns.

---

## Step 1 — decide, by census outcome

| Census result | Action |
|---|---|
| **Zero rows** | Proceed. `filing_queue` is untouched by the migration and stays as the submission queue. Record "zero rows, confirmed <date>" in the receipt. |
| **Only `obsolete_terminal` / `obsolete_superseded`** | Proceed. **Nothing is deleted.** These are historical records and remain readable; the new pipeline simply never selects them. |
| **Any `recoverable_*`** | Stop and decide per row. These are genuine unsubmitted filings. Options: re-enqueue through the repaired `queue_filing_for_submission` after DEF-035 lands, or leave and handle manually. **Do not migrate them into `transport_jobs`** — they are submissions, not transport work, and that distinction is the entire point of the change. |
| **Any `ambiguous_*`, or any row from §0.3** | **Stop. Operator decision required, per row.** A stranded `processing` row may correspond to a filing already lodged with HMRC. Re-enqueuing it could double-submit a CT600, which is the worst outcome this project can produce. |

**No historical queue record is discarded at any point.** `filing_queue` is not truncated, not
archived away and not dropped. The recovery adds a table; it does not remove one.

---

## Step 2 — cron authentication preflight. A release gate, not a footnote.

The CT workers have never been proven to run. Post-repair health still shows `succeeded | 0`
(`docs/audits/raw/2026-08-06-post-apply-verification.txt:129-130`). The cron jobs authenticate
with a vault secret named `email_queue_service_role_key`, against functions that require equality
with their own `SUPABASE_SERVICE_ROLE_KEY` (`hmrc-ct-poll/index.ts:315-318`). **If those two
differ, every invocation 401s and none of this works, however correct the code is.**

### 2.1 Secret documentation — names and shape only, never material

| Secret | Where | What it must equal | How to verify |
|---|---|---|---|
| `email_queue_service_role_key` | Supabase Vault | the project's `SUPABASE_SERVICE_ROLE_KEY` | §2.2 — compares digests, never values |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge function env | — | injected by the platform |

Despite the name, this secret authenticates **all** scheduled workers, not just the email queue.
Renaming it is a separate change; it is recorded here because the name is actively misleading.

### 2.2 Preflight — prove equality without printing either value

```sql
-- Run as an authorised operator. Compares DIGESTS, so neither secret is exposed, and returns a
-- boolean rather than any part of the material.
SELECT
  encode(digest(decrypted_secret, 'sha256'), 'hex') = :expected_service_key_sha256
    AS vault_secret_matches_service_role_key,
  length(decrypted_secret)                          AS secret_length,
  updated_at                                        AS secret_last_rotated
FROM vault.decrypted_secrets
WHERE name = 'email_queue_service_role_key';
```

The operator computes `:expected_service_key_sha256` locally from the project's service-role key
and passes it in. **The key itself never appears in a query, a log, a receipt or this document.**

**Gate: if `vault_secret_matches_service_role_key` is not `true`, the CT recovery is not
releasable.** Fix the secret first; nothing downstream is meaningful until this passes.

### 2.3 Post-deploy canary — distinguishing the four "nothing happened" causes

Zero processed items has four causes and they are not interchangeable:

| Observation | Meaning |
|---|---|
| Cron `succeeded = 0`, no HTTP response recorded | **Invocation failure** — the job never called out |
| HTTP 401 recorded | **Authentication failure** — the secret mismatch above |
| HTTP 200, canary row untouched | **Function ran, worker logic broken** |
| HTTP 200, canary row claimed | **Working; queue genuinely empty** |

```sql
-- 1. Did the schedule fire, and did the call succeed at the transport level?
SELECT * FROM public.mcp_cron_job_health()
 WHERE jobname IN ('hmrc-ct-poll-worker','hmrc-ct-delete-worker');

-- 2. Did the HTTP call return 2xx, and what status?
SELECT * FROM public.mcp_http_delivery_health()
 WHERE url LIKE '%hmrc-ct-poll%'
 ORDER BY created_at DESC LIMIT 10;

-- 3. Is there work, and is it moving?
SELECT * FROM public.mcp_transport_job_health();
```

**The canary itself** is a single `transport_jobs` row in a non-production organisation, seeded
with `operation = 'poll'`, `channel = 'hmrc_ct'` and a metadata flag `{"canary": true}`. The
worker recognises the flag, claims it, releases it as `completed` and makes **no external HMRC
call**. Within two cron intervals the row must show `status = 'completed'` and a `claimed_by`.

If it does not, the table above says which of the four causes applies. That distinction is the
whole point: "zero processed" has been the observed state for weeks and nobody could tell which
kind of nothing it was.

**Gate: the canary must complete before the CT recovery is declared working.** A green migration
and a passing test suite are not evidence that a scheduled worker runs.

---

## Step 3 — cutover order

Strictly sequential. Each step's verification passes before the next begins.

1. **DEF-035** (PR #8). Without it no `filing_queue` row can be created and there is nothing for
   a repaired poller to follow up. Verify: `queue_filing_for_submission` on an approved filing
   produces a `filing_queue` row with `status = 'queued'`.
2. **Census** (§0). Record the result. Decide per §1.
3. **Preflight** (§2.2). Must return `true`.
4. **DEF-036** — schema. Verify the post-assertions passed and `filing_queue` is unchanged.
5. **Edge functions** — submit, poll, delete deployed together. They are one change: a rewritten
   producer with an old consumer reintroduces exactly the producer/consumer vocabulary split this
   project exists to close.
6. **Canary** (§2.3). Must complete.
7. **Observe one real cycle end to end** before declaring the recovery done.

---

## Step 4 — rollback

| Stage reached | Rollback |
|---|---|
| After 4 (schema only) | Redeploy the previous edge functions. `transport_jobs` is unread and inert; leaving it costs nothing and dropping it costs a migration. The artefact-type constraint widening is **not** rolled back — it only permits more values, and narrowing it could invalidate rows written in the meantime. |
| After 5 (functions deployed) | Redeploy the previous function versions. In-flight `transport_jobs` rows stop being claimed and remain queued; **no data is destroyed**. Any HMRC submission already made is unaffected — it is recorded in `filing_submissions`, which this change does not touch. |
| After a partial cycle | Do **not** re-run submit for a filing whose `filing_submissions` row carries a correlation id. That is a lodged return. Poll manually against HMRC using the correlation id and reconcile by hand. |

**The irreversible act is a submission to HMRC, not a migration.** Every rollback step above is
designed around that: nothing in the recovery re-submits, and nothing deletes the record of what
was submitted.

---

## Step 5 — the filing transitions, and the evidence required for each

**No filing may be marked `submitted` because a queue row was created or claimed.** The exact
verified event for each transition:

| Transition | Trigger — the verified event, not an inference |
|---|---|
| *(none)* | Queue row created. `filings.status` **does not change.** |
| *(none)* | Worker claims a job. `filings.status` **does not change.** |
| → `submitted` | HMRC returns a response whose qualifier is `acknowledgement` **and** which carries a non-empty `CorrelationID`. Both conditions. An HTTP 200 alone is not an acknowledgement. |
| → `accepted` | HMRC returns qualifier `response` with `function = 'submit'` and **no** `<Error>` elements. |
| → `rejected` | HMRC returns qualifier `error`, or a `response` containing `<Error>` elements. |
| → `filed` | The delete/cleanup operation completes after acceptance. Terminal. |
| Failure or timeout | `transport_jobs.status` → `failed` with `error_code`; `filing_submissions.status` → `error`. **`filings.status` is not moved by a transport failure** — a transport problem is not evidence about the filing. |

### Open, and to be confirmed against a real HMRC response before step 5

These names come from the existing code's own parsing (`hmrc-ct-submit:1227`,
`hmrc-ct-poll:478,537`), which has **never successfully completed a cycle** — so they are
inferred from code that has never been proven against the live service.

**If HMRC's actual response semantics do not support these labels exactly, stop and bring the
evidence rather than forcing the names onto them.** Specifically to confirm: whether
`acknowledgement` always carries a correlation id; whether a `response` can be partially
successful; and whether the delete step can fail in a way that should prevent `filed`.

This is the one place in the recovery where I am relying on unverified assumptions, and it is
recorded here rather than buried in the code.
