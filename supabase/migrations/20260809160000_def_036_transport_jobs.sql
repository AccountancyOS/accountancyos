-- =====================================================================================
-- DEF-036 — transport_jobs: give HMRC follow-up work a table whose shape fits it.
-- =====================================================================================
-- NOT ADDITIVE, AND NOT RELEASABLE ALONE. An earlier draft of this header called the migration
-- "purely additive". That was wrong: §7 DROPS and REPLACES filing_artefacts_artefact_type_check.
-- Adding a table does not make the whole migration additive, and describing it that way would
-- have understated what an operator was being asked to apply.
--
-- This migration is one internal stage of the CT recovery and MUST NOT be applied on its own.
-- Applying it alone would give the database an unused transport subsystem and an altered
-- artefact vocabulary with no application cutover behind either. It ships when the producers,
-- consumers, tests, deployment controls and cutover ship — as one releasable change.
--
-- THE DEFECT THIS ADDRESSES IS A CATEGORY ERROR, NOT A SET OF TYPOS. `filing_queue` carries
-- `snapshot_hash NOT NULL`, `approval_id` and a snapshot-derived idempotency key — the
-- attributes of A FILING TO BE SUBMITTED. The edge functions reuse it for HMRC poll and delete
-- work, which has no snapshot, no approval and nothing to send. That is why those inserts fail
-- four ways at once: missing snapshot_hash (23502), a `metadata` column that exists in no
-- migration, an illegal filing_type `CT600_HMRC_DELETE`, and a status of `pending` that the
-- CHECK forbids. Owner ruling 2026-08-09: separate the table rather than relax the constraints,
-- because relaxing `snapshot_hash` would destroy the guarantee that a SUBMISSION is tied to an
-- approved snapshot — the one thing the filing engine architecture cannot give up.
--
-- THE VOCABULARY HINGE UNDERNEATH. Every producer and BOTH consumers use `pending`. The write
-- side and the read side agree with each other on a value the database forbids, and both
-- disagree with `queued`, which is what the one legal producer writes. So this table's DEFAULT
-- is deliberately the same literal its worker selects on — see §1.
--
-- PRECEDENT. `email_queue` is the only worker queue in this repo that functions, and it has
-- three properties `filing_queue` has none of: (1) the DEFAULT status is the literal the worker
-- selects on, so producer and consumer cannot drift apart; (2) the claim is an atomic
-- conditional UPDATE returning rows; (3) a stale-claim window makes crashes recoverable. This
-- table copies all three.
--
-- SCOPE. One table, one claim function, one release function, one artefact_type widening. No
-- existing table is altered except `filing_artefacts`'s CHECK constraint, which is replaced —
-- and its predecessor DROPPED in this same migration, per the DEF-034 discipline.
-- =====================================================================================

BEGIN;

-- -------------------------------------------------------------------------------------
-- §0  PRECONDITIONS
-- -------------------------------------------------------------------------------------

DO $mig$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='transport_jobs') THEN
    RAISE EXCEPTION 'DEF-036 precondition failed: public.transport_jobs already exists — refusing to re-apply.';
  END IF;

  -- The tables it hangs off must exist, or the FKs are built on sand.
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='filing_submissions') THEN
    RAISE EXCEPTION 'DEF-036 precondition failed: public.filing_submissions is missing.';
  END IF;

  -- filing_queue must keep its meaning. If snapshot_hash has already been made nullable,
  -- someone has taken the other option and this migration is the wrong answer.
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='filing_queue'
               AND column_name='snapshot_hash' AND is_nullable='YES') THEN
    RAISE EXCEPTION 'DEF-036 precondition failed: filing_queue.snapshot_hash is already nullable. This migration assumes filing_queue still means "a filing to be submitted"; that guarantee has been given up elsewhere and the design must be revisited.';
  END IF;

  RAISE NOTICE 'DEF-036 preconditions OK.';
END $mig$;

-- -------------------------------------------------------------------------------------
-- §1  transport_jobs
-- -------------------------------------------------------------------------------------

CREATE TABLE public.transport_jobs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- What this job follows up. A transport job exists BECAUSE a submission was made; without
  -- one there is nothing to poll and nothing to delete.
  filing_submission_id uuid NOT NULL REFERENCES public.filing_submissions(id) ON DELETE CASCADE,
  filing_id            uuid NOT NULL REFERENCES public.filings(id) ON DELETE CASCADE,

  -- INTERNAL identity, established BEFORE any external call. Deterministic, derived only from
  -- facts known at enqueue time: '<operation>:<filing_submission_id>'. This is the primary
  -- idempotency guarantee precisely because it does not depend on anything HMRC has told us.
  idempotency_key      text NOT NULL,

  -- EXTERNAL identity. HMRC's handle, and NULLABLE because it does not exist until an
  -- acknowledgement comes back. An earlier draft made this NOT NULL and keyed idempotency on
  -- (correlation_id, operation), which was wrong in the most dangerous direction: the window
  -- before acknowledgement is exactly when a duplicate submission can be issued, and a key
  -- that does not exist yet cannot prevent one. Postgres also permits multiple NULLs in a
  -- UNIQUE constraint, so that key would have silently stopped constraining anything the
  -- moment the column was made nullable to accommodate reality.
  correlation_id       text,

  -- `operation` and `channel` are SEPARATE. filing_type = 'CT600_HMRC_DELETE' conflated "what
  -- kind of filing" with "what operation"; splitting them is what stops that recurring.
  operation            text NOT NULL CHECK (operation IN ('poll','delete')),
  channel              text NOT NULL CHECK (channel IN ('hmrc_ct','hmrc_vat','ch')),

  -- Worker execution state ONLY. Not filing state, not HMRC submission state. The DEFAULT is
  -- the literal the worker selects on, so a producer and a consumer cannot drift apart — the
  -- single property whose absence broke filing_queue.
  status               text NOT NULL DEFAULT 'queued'
                         CHECK (status IN ('queued','processing','completed','failed','cancelled')),

  attempts             integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts         integer NOT NULL DEFAULT 100 CHECK (max_attempts > 0),
  next_attempt_at      timestamptz NOT NULL DEFAULT now(),
  claimed_at           timestamptz,
  -- Lease identity. Without it, "who is holding this job" is unanswerable and a stale-claim
  -- sweep cannot distinguish a crashed worker from a slow one.
  claimed_by           text,
  last_attempt_at      timestamptz,
  completed_at         timestamptz,

  -- Structured failure detail. error_code is for machines and dashboards; error_message for
  -- humans. filing_queue has an error_code column that nothing has ever written, which is how
  -- "why did this fail" became unanswerable there.
  error_code           text,
  error_message        text,

  -- Exists here deliberately: the edge functions already write it, and follow-up work
  -- genuinely has per-operation detail (HMRC poll interval, response qualifier) that does not
  -- belong in typed columns.
  metadata             jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  -- IDEMPOTENCY, in three layers, none of which can be evaded by a NULL.
  --
  -- 1. The internal key. Non-null, deterministic, known before the first external call.
  CONSTRAINT transport_jobs_idempotency_key_uniq UNIQUE (idempotency_key),
  --
  -- 2. THE INVARIANT THAT MATTERS: at most one transport job per operation per immutable
  --    filing submission version. Both columns are NOT NULL, so unlike a correlation-based key
  --    there is no NULL through which a duplicate can pass. Two concurrent requests to enqueue
  --    a poll for the same submission produce one row and one 23505 — the loser learns it lost
  --    rather than issuing a second call to HMRC.
  CONSTRAINT transport_jobs_one_per_submission_operation
    UNIQUE (filing_submission_id, operation),
  --
  -- 3. The external key, enforced only once it exists. A partial index rather than a
  --    constraint, because the column is legitimately NULL before acknowledgement and a plain
  --    UNIQUE would permit unlimited NULL rows.
  --    (Created below as transport_jobs_correlation_uniq — a partial index cannot be a
  --     table constraint.)

  -- Same-row consistency rules, declarative. A CHECK is preferable to a trigger here: it is
  -- visible to schema tooling, enforced uniformly by every write path including bulk loads and
  -- direct SQL, and cannot be disabled per-session the way a trigger can.
  --
  -- These embed `status IN (...)` as one TERM of a rule. That is not a vocabulary declaration,
  -- and the vocabulary generator now understands the difference by matching the whole check
  -- expression rather than scanning for `IN (`. The schema is written the way the schema should
  -- be written; the parser was corrected to read it.

  -- A finished job must record when it finished; a live one must not claim to have.
  CONSTRAINT transport_jobs_completion_consistent CHECK (
    (status IN ('completed','failed','cancelled') AND completed_at IS NOT NULL)
    OR (status IN ('queued','processing') AND completed_at IS NULL)
  ),

  -- Only a claimed job may be `processing`. A row in `processing` with no lease cannot be
  -- recovered by the stale-claim sweep, which keys on claimed_at — that is how a job strands
  -- forever with no error.
  CONSTRAINT transport_jobs_processing_is_claimed CHECK (
    status <> 'processing' OR claimed_at IS NOT NULL
  ),

  CONSTRAINT transport_jobs_max_attempts_sane CHECK (attempts <= max_attempts + 1)
);

-- The external key, enforced only where it exists. See layer 3 above.
CREATE UNIQUE INDEX transport_jobs_correlation_uniq
  ON public.transport_jobs (correlation_id, operation)
  WHERE correlation_id IS NOT NULL;

-- The internal key is DERIVED, not supplied, so a caller cannot weaken it by passing something
-- non-deterministic. Two enqueues of the same operation for the same submission version compute
-- the same key by construction.
ALTER TABLE public.transport_jobs
  ALTER COLUMN idempotency_key SET DEFAULT NULL;

CREATE OR REPLACE FUNCTION public.transport_jobs_derive_idempotency_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.idempotency_key := NEW.operation || ':' || NEW.filing_submission_id::text;
  RETURN NEW;
END $$;

CREATE TRIGGER transport_jobs_derive_key
  BEFORE INSERT ON public.transport_jobs
  FOR EACH ROW EXECUTE FUNCTION public.transport_jobs_derive_idempotency_key();

COMMENT ON TABLE public.transport_jobs IS
  'HMRC follow-up work (poll, delete). Worker execution state only — never filing state and never HMRC submission state. See docs/design/ct-transport-recovery.md. DEF-036.';
COMMENT ON COLUMN public.transport_jobs.status IS
  'Worker execution state. DEFAULT queued is deliberately the literal the worker selects on: filing_queue broke because its producers wrote pending and its DEFAULT was queued.';
COMMENT ON COLUMN public.transport_jobs.claimed_at IS
  'Lease timestamp. A job whose claimed_at is older than the stale window is re-claimable, so a crashed worker does not strand its jobs forever.';

-- The claim query: due, unclaimed or stale, for one channel and operation.
CREATE INDEX transport_jobs_due_idx
  ON public.transport_jobs (channel, operation, next_attempt_at)
  WHERE status = 'queued';

-- Stale-claim sweep and operational dashboards.
CREATE INDEX transport_jobs_claimed_idx
  ON public.transport_jobs (claimed_at)
  WHERE status = 'processing';

CREATE INDEX transport_jobs_submission_idx
  ON public.transport_jobs (filing_submission_id);


-- -------------------------------------------------------------------------------------
-- §2  RLS — org-scoped, matching filing_queue.
-- -------------------------------------------------------------------------------------

ALTER TABLE public.transport_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY transport_jobs_org_access ON public.transport_jobs
  FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
  ))
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
  ));

-- -------------------------------------------------------------------------------------
-- §3  Atomic claim, with a from-state guard and a stale-claim lease.
-- -------------------------------------------------------------------------------------
-- This is the `email_queue` pattern (claim_email_queue_row, 20260720095559) applied here.
--
-- The from-state predicate `status = 'queued'` is the whole point. The existing pollers mark a
-- job `processing` with `.eq('id', job.id)` and no from-state, so two overlapping cron runs
-- both "claim" the same row and both call HMRC. The poll cron runs every minute; any run
-- outstripping that interval double-claims. Returning zero rows is how a worker learns it lost.

CREATE OR REPLACE FUNCTION public.claim_transport_job(
  p_job_id       uuid,
  p_stale_before timestamptz,
  p_worker_id    text DEFAULT NULL
)
RETURNS SETOF public.transport_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.transport_jobs
     SET status          = 'processing',
         claimed_at      = now(),
         claimed_by      = COALESCE(p_worker_id, 'unknown'),
         last_attempt_at = now(),
         attempts        = attempts + 1,
         updated_at      = now()
   WHERE id = p_job_id
     AND status = 'queued'
     AND next_attempt_at <= now()
     AND (claimed_at IS NULL OR claimed_at < p_stale_before)
  RETURNING *;
$$;

COMMENT ON FUNCTION public.claim_transport_job(uuid, timestamptz, text) IS
  'Atomically claim one transport job. Returns zero rows if another worker won, if the job is not due, or if a live claim is held. Never raises for a lost race — losing is the normal case. DEF-036.';

-- -------------------------------------------------------------------------------------
-- §4  Release — the only sanctioned way out of `processing`.
-- -------------------------------------------------------------------------------------
-- Bounded attempts and backoff live HERE rather than in the worker, so a worker that forgets
-- to check max_attempts cannot loop forever. `attempts` is never reset, so the bound is real.

CREATE OR REPLACE FUNCTION public.release_transport_job(
  p_job_id         uuid,
  p_outcome        text,                  -- 'completed' | 'failed' | 'retry'
  p_error_code     text DEFAULT NULL,
  p_error_message  text DEFAULT NULL,
  p_retry_after_ms integer DEFAULT NULL,  -- HMRC's pollInterval when it supplies one
  p_metadata       jsonb DEFAULT NULL
)
RETURNS public.transport_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job     public.transport_jobs;
  v_backoff integer;
BEGIN
  IF p_outcome NOT IN ('completed','failed','retry') THEN
    RAISE EXCEPTION 'release_transport_job: unknown outcome %', p_outcome;
  END IF;

  SELECT * INTO v_job FROM public.transport_jobs WHERE id = p_job_id FOR UPDATE;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'release_transport_job: no such job %', p_job_id;
  END IF;
  -- Worker authority. These functions are SECURITY DEFINER and bypass RLS, so EXECUTE is
  -- granted to service_role only; this is the second gate, in case a grant is ever widened.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'release_transport_job: worker-only function.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_job.status <> 'processing' THEN
    RAISE EXCEPTION 'release_transport_job: job % is %, not processing. Releasing a job you do not hold would clear another worker''s claim.', p_job_id, v_job.status;
  END IF;

  IF p_outcome = 'retry' AND v_job.attempts >= v_job.max_attempts THEN
    -- The bound is enforced here, not in the caller. A worker that never checks still cannot
    -- retry forever.
    p_outcome := 'failed';
    p_error_code := COALESCE(p_error_code, 'MAX_ATTEMPTS_EXCEEDED');
    p_error_message := COALESCE(p_error_message,
      format('Exhausted %s attempts', v_job.max_attempts));
  END IF;

  IF p_outcome = 'retry' THEN
    -- HMRC's own interval when supplied; otherwise exponential with a 1-hour ceiling. The
    -- existing poller uses a flat 30s, which neither respects HMRC nor backs off under load.
    v_backoff := COALESCE(
      p_retry_after_ms,
      LEAST(3600000, 30000 * POWER(2, LEAST(v_job.attempts, 7))::integer)
    );
    UPDATE public.transport_jobs
       SET status          = 'queued',
           claimed_at      = NULL,          -- release the lease
           next_attempt_at = now() + make_interval(secs => v_backoff / 1000.0),
           error_code      = p_error_code,
           error_message   = p_error_message,
           metadata        = COALESCE(p_metadata, metadata),
           updated_at      = now()
     WHERE id = p_job_id
    RETURNING * INTO v_job;
  ELSE
    UPDATE public.transport_jobs
       SET status        = p_outcome,
           claimed_at    = NULL,
           completed_at  = now(),
           error_code    = p_error_code,
           error_message = p_error_message,
           metadata      = COALESCE(p_metadata, metadata),
           updated_at    = now()
     WHERE id = p_job_id
    RETURNING * INTO v_job;
  END IF;

  RETURN v_job;
END $$;

COMMENT ON FUNCTION public.release_transport_job IS
  'The only sanctioned exit from processing. Enforces max_attempts and backoff in the database so a worker cannot retry forever, and refuses to release a job it does not hold. DEF-036.';

-- -------------------------------------------------------------------------------------
-- §5  Stale-claim recovery.
-- -------------------------------------------------------------------------------------
-- A worker that crashes mid-claim leaves a row in `processing` forever. email_queue solved this
-- with a stale window; without it, one crash strands a filing permanently with no error.

CREATE OR REPLACE FUNCTION public.recover_stale_transport_jobs(
  p_stale_before timestamptz
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.transport_jobs
     SET status          = 'queued',
         claimed_at      = NULL,
         next_attempt_at = now(),
         error_code      = 'STALE_CLAIM_RECOVERED',
         error_message   = format('Claim held since %s was abandoned; requeued.', claimed_at),
         updated_at      = now()
   WHERE status = 'processing'
     AND claimed_at IS NOT NULL
     AND claimed_at < p_stale_before
     AND attempts < max_attempts;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- A stranded job that has also exhausted its attempts is failed, not requeued forever.
  UPDATE public.transport_jobs
     SET status        = 'failed',
         claimed_at    = NULL,
         completed_at  = now(),
         error_code    = 'STALE_CLAIM_EXHAUSTED',
         error_message = 'Claim abandoned and no attempts remain.',
         updated_at    = now()
   WHERE status = 'processing'
     AND claimed_at IS NOT NULL
     AND claimed_at < p_stale_before
     AND attempts >= max_attempts;

  RETURN v_count;
END $$;

-- -------------------------------------------------------------------------------------
-- §6  Observability — one projection, no secrets.
-- -------------------------------------------------------------------------------------
-- "Zero processed" must be distinguishable from "authentication failed", "never invoked" and
-- "queue genuinely empty". This projection answers the queue half; the cron half is answered by
-- mcp_cron_job_health() from DEF-019.

CREATE OR REPLACE FUNCTION public.mcp_transport_job_health()
RETURNS TABLE (
  channel          text,
  operation        text,
  status           text,
  job_count        bigint,
  oldest_created   timestamptz,
  next_due         timestamptz,
  stale_claims     bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- TENANCY. This is SECURITY DEFINER, so RLS on transport_jobs does NOT apply and the filter
  -- must be explicit. An earlier draft omitted it and aggregated every organisation's jobs for
  -- any authenticated caller — a cross-tenant leak introduced by the very function meant to
  -- make the pipeline observable.
  --
  -- COUNTS ONLY. No correlation_id, no error_message, no metadata, no filing or client
  -- identifiers. "How much work is stuck" is answerable without exposing what the work is.
  SELECT t.channel, t.operation, t.status,
         count(*),
         min(t.created_at),
         min(t.next_attempt_at) FILTER (WHERE t.status = 'queued'),
         count(*) FILTER (WHERE t.status = 'processing'
                            AND t.claimed_at < now() - interval '10 minutes')
    FROM public.transport_jobs t
   WHERE t.organization_id IN (
           SELECT ou.organization_id FROM public.organization_users ou
            WHERE ou.user_id = auth.uid()
         )
   GROUP BY t.channel, t.operation, t.status;
$$;

REVOKE ALL ON FUNCTION public.mcp_transport_job_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mcp_transport_job_health() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_transport_job(uuid, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_transport_job(uuid, timestamptz, text) TO service_role;
REVOKE ALL ON FUNCTION public.release_transport_job(uuid, text, text, text, integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_transport_job(uuid, text, text, text, integer, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.recover_stale_transport_jobs(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recover_stale_transport_jobs(timestamptz) TO service_role;

-- -------------------------------------------------------------------------------------
-- §7  Legal artefact types for the HMRC transport XML.
-- -------------------------------------------------------------------------------------
-- Every HMRC CT600 artefact write currently names a type outside the vocabulary, so no
-- submission, acknowledgement, poll or delete XML has ever been stored. Replaced and the
-- predecessor DROPPED in the same migration — the DEF-034 discipline, without exception.

ALTER TABLE public.filing_artefacts DROP CONSTRAINT IF EXISTS filing_artefacts_artefact_type_check;

ALTER TABLE public.filing_artefacts ADD CONSTRAINT filing_artefacts_artefact_type_check
  CHECK (artefact_type IN (
    -- Existing, unchanged.
    'CH_ACCOUNTS_XML', 'CT600_XML', 'IXBRL_ACCOUNTS', 'IXBRL_CT_COMPUTATION',
    'PDF_ACCOUNTS', 'PDF_CT_COMPUTATION',
    -- HMRC transport evidence. These are what the edge functions already attempt to write;
    -- storing them is the audit trail for what was actually sent and received.
    'HMRC_CT600_SUBMIT_REQUEST_XML', 'HMRC_CT600_SUBMIT_ACK_XML',
    'HMRC_CT600_POLL_REQUEST_XML', 'HMRC_CT600_POLL_RESPONSE_XML',
    'HMRC_CT600_FINAL_RESPONSE_XML',
    'HMRC_CT600_DELETE_REQUEST_XML', 'HMRC_CT600_DELETE_RESPONSE_XML'
  ));

-- -------------------------------------------------------------------------------------
-- §8  POST-ASSERTIONS
-- -------------------------------------------------------------------------------------

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='transport_jobs') THEN
    RAISE EXCEPTION 'DEF-036 post-assert failed: transport_jobs was not created.';
  END IF;

  -- The property whose absence broke filing_queue: the DEFAULT must equal the literal the
  -- worker selects on.
  IF (SELECT column_default FROM information_schema.columns
      WHERE table_schema='public' AND table_name='transport_jobs' AND column_name='status')
     NOT LIKE '%queued%' THEN
    RAISE EXCEPTION 'DEF-036 post-assert failed: transport_jobs.status DEFAULT is not queued. Producer and consumer must share one literal.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='transport_jobs_one_per_submission_operation') THEN
    RAISE EXCEPTION 'DEF-036 post-assert failed: the per-submission idempotency invariant is missing — two jobs could submit the same immutable filing submission version.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname='transport_jobs_idempotency_key_uniq') THEN
    RAISE EXCEPTION 'DEF-036 post-assert failed: the internal idempotency key is not unique.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                 WHERE schemaname='public' AND indexname='transport_jobs_correlation_uniq') THEN
    RAISE EXCEPTION 'DEF-036 post-assert failed: the partial correlation index is missing.';
  END IF;
  -- correlation_id MUST remain nullable. A NOT NULL here would force callers to invent a value
  -- before HMRC supplies one, which is how a fake correlation enters the audit trail.
  IF (SELECT is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name='transport_jobs'
        AND column_name='correlation_id') <> 'YES' THEN
    RAISE EXCEPTION 'DEF-036 post-assert failed: correlation_id is NOT NULL. It does not exist until acknowledgement.';
  END IF;

  FOR i IN 1..1 LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc
                   WHERE proname='claim_transport_job' AND pronamespace='public'::regnamespace) THEN
      RAISE EXCEPTION 'DEF-036 post-assert failed: claim_transport_job is missing.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc
                   WHERE proname='release_transport_job' AND pronamespace='public'::regnamespace) THEN
      RAISE EXCEPTION 'DEF-036 post-assert failed: release_transport_job is missing.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc
                   WHERE proname='recover_stale_transport_jobs' AND pronamespace='public'::regnamespace) THEN
      RAISE EXCEPTION 'DEF-036 post-assert failed: recover_stale_transport_jobs is missing.';
    END IF;
  END LOOP;

  -- The claim must carry a from-state guard. Without it this is the same broken claim
  -- filing_queue has, in a new table.
  IF (SELECT prosrc FROM pg_proc
      WHERE proname='claim_transport_job' AND pronamespace='public'::regnamespace)
     NOT LIKE '%status = ''queued''%' THEN
    RAISE EXCEPTION 'DEF-036 post-assert failed: claim_transport_job has no from-state guard.';
  END IF;

  -- RLS on, or transport rows are visible across tenants.
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.transport_jobs'::regclass) THEN
    RAISE EXCEPTION 'DEF-036 post-assert failed: RLS is not enabled on transport_jobs.';
  END IF;

  -- filing_queue is untouched and still means "a filing to be submitted".
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='filing_queue'
               AND column_name='snapshot_hash' AND is_nullable='YES') THEN
    RAISE EXCEPTION 'DEF-036 post-assert failed: filing_queue.snapshot_hash became nullable. This migration must not relax it.';
  END IF;

  -- Exactly one artefact_type constraint, and it admits the transport types.
  IF (SELECT count(*) FROM pg_constraint
      WHERE conrelid='public.filing_artefacts'::regclass AND contype='c'
        AND pg_get_constraintdef(oid) LIKE '%artefact_type%') <> 1 THEN
    RAISE EXCEPTION 'DEF-036 post-assert failed: filing_artefacts.artefact_type is governed by more than one CHECK — the DEF-034 failure mode.';
  END IF;
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conname='filing_artefacts_artefact_type_check')
     NOT LIKE '%HMRC_CT600_SUBMIT_REQUEST_XML%' THEN
    RAISE EXCEPTION 'DEF-036 post-assert failed: artefact_type still rejects the HMRC transport types.';
  END IF;

  -- The observability projection must filter by organisation. It is SECURITY DEFINER, so
  -- omitting the filter leaks every tenant's queue depth to any authenticated caller.
  IF (SELECT prosrc FROM pg_proc
      WHERE proname='mcp_transport_job_health' AND pronamespace='public'::regnamespace)
     NOT LIKE '%organization_users%' THEN
    RAISE EXCEPTION 'DEF-036 post-assert failed: mcp_transport_job_health does not filter by organisation.';
  END IF;
  -- ...and must not expose payload or external identifiers.
  IF (SELECT prosrc FROM pg_proc
      WHERE proname='mcp_transport_job_health' AND pronamespace='public'::regnamespace)
     LIKE '%correlation_id%' THEN
    RAISE EXCEPTION 'DEF-036 post-assert failed: mcp_transport_job_health exposes correlation ids.';
  END IF;
  -- Every SECURITY DEFINER function here must pin search_path.
  IF EXISTS (
    SELECT 1 FROM pg_proc
     WHERE pronamespace='public'::regnamespace AND prosecdef
       AND proname IN ('claim_transport_job','release_transport_job',
                       'recover_stale_transport_jobs','mcp_transport_job_health')
       AND (proconfig IS NULL OR NOT (proconfig::text LIKE '%search_path%'))
  ) THEN
    RAISE EXCEPTION 'DEF-036 post-assert failed: a SECURITY DEFINER function has no pinned search_path.';
  END IF;

  RAISE NOTICE 'DEF-036 post-assertions passed: transport_jobs created with atomic claim, lease recovery, bounded retry and idempotency; filing_queue untouched; artefact vocabulary corrected.';
END $mig$;

COMMIT;
