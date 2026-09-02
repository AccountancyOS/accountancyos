-- 003 — email_send_log.status must accept 'rate_limited'
--
-- LONDON ONLY. Do not place this file in supabase/migrations/ — see ./README.md.
-- Apply with: apply_migration, name `london_inc_003_email_send_log_rate_limited`.
--
-- ============================================================================
-- WHY
-- ============================================================================
--
-- process-email-queue records a rate-limited send as
--     await supabase.from('email_send_log').insert({ ..., status: 'rate_limited', ... })
-- but email_send_log_status_check permitted only
--     pending|sent|suppressed|failed|bounced|complained|dlq
-- so the insert was rejected with 23514. The worker discards that insert's error return, so
-- EVERY rate-limit event was recorded nowhere at all. The cooldown in
-- email_send_state.retry_after_until was still set, which is what made it invisible: rate-limited
-- sends simply vanished from the log rather than failing loudly.
--
-- WHY 'rate_limited' RATHER THAN REUSING 'failed'
-- -----------------------------------------------
-- The worker derives its retry budget by COUNTING email_send_log rows with status='failed' for a
-- message_id, and DLQs at MAX_RETRIES. Logging a rate limit as 'failed' would make provider
-- back-pressure consume the retry budget and walk authentication email into the dead letter
-- queue — the opposite of the intent. A rate limit is "not now", not "this failed".
--
-- Note this is the one place the programme deliberately WIDENS a status vocabulary, and it is not
-- in tension with increment 001, which collapsed synonyms instead. The test there is whether the
-- value names a genuinely distinct state or duplicates one that already exists. 'queued'
-- duplicated 'pending'; 'ignored' duplicated 'cancelled'. 'rate_limited' duplicates nothing — it
-- is the only state that must be recorded WITHOUT counting toward the retry budget, and there is
-- no existing value carrying that meaning.
--
-- ============================================================================
-- PROVENANCE — read this before assuming the file describes what happened
-- ============================================================================
--
-- The constraint change was applied to London on 2026-09-02 via `execute_sql`, which leaves NO row
-- in supabase_migrations.schema_migrations. London therefore carried a schema change its own
-- provenance did not record — the untracked-production-state defect this directory's convention
-- exists to prevent.
--
-- This file is that change, re-filed under the convention and made IDEMPOTENT so it can be applied
-- through apply_migration to record the missing ledger row. It verifies the end state either way:
-- if the value is already permitted it skips the ALTER and still runs every post-assertion,
-- including the behavioural probe. So a green apply proves the live state is correct regardless of
-- which path it took.
--
-- ROLLBACK
--   BEGIN;
--   ALTER TABLE public.email_send_log DROP CONSTRAINT email_send_log_status_check;
--   ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_status_check
--     CHECK (status = ANY (ARRAY['pending','sent','suppressed','failed','bounced','complained','dlq']));
--   COMMIT;
-- Safe only while no row holds status='rate_limited'; the ADD would otherwise fail validation.
-- First: DELETE FROM public.email_send_log WHERE status = 'rate_limited';

BEGIN;

-- ============================================================================
-- PRECONDITIONS
-- ============================================================================

DO $pre$
DECLARE
  v_count int;
  v_def text;
  v_value text;
BEGIN
  IF to_regclass('public.email_send_log') IS NULL THEN
    RAISE EXCEPTION '003: public.email_send_log does not exist';
  END IF;

  -- Exactly one check constraint may govern `status`. If a second exists under another name,
  -- replacing this one would leave the other still rejecting the value — the overlapping-
  -- constraint trap. Refuse rather than half-fix.
  SELECT count(*) INTO v_count
    FROM pg_constraint
   WHERE conrelid = 'public.email_send_log'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF v_count <> 1 THEN
    RAISE EXCEPTION '003: expected exactly 1 check constraint governing email_send_log.status, found %', v_count;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conrelid = 'public.email_send_log'::regclass
     AND conname = 'email_send_log_status_check';
  IF v_def IS NULL THEN
    RAISE EXCEPTION '003: email_send_log_status_check not found';
  END IF;

  -- The baseline vocabulary must be intact whether or not the new value is already present.
  FOREACH v_value IN ARRAY ARRAY['pending','sent','suppressed','failed','bounced','complained','dlq'] LOOP
    IF v_def NOT ILIKE '%' || v_value || '%' THEN
      RAISE EXCEPTION '003: existing constraint does not permit baseline value %', v_value;
    END IF;
  END LOOP;
END $pre$;

-- ============================================================================
-- CHANGE — idempotent
-- ============================================================================
--
-- Replaced in place under the same name, so exactly one constraint governs the column before and
-- after. Skipped entirely when the value is already permitted, which is what lets this run against
-- a database where the change was already applied out of band.

DO $mig$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conrelid = 'public.email_send_log'::regclass
     AND conname = 'email_send_log_status_check';

  IF v_def ILIKE '%rate_limited%' THEN
    RAISE NOTICE '003: rate_limited already permitted; skipping the ALTER and verifying the end state';
    RETURN;
  END IF;

  ALTER TABLE public.email_send_log DROP CONSTRAINT email_send_log_status_check;
  ALTER TABLE public.email_send_log ADD CONSTRAINT email_send_log_status_check
    CHECK (status = ANY (ARRAY[
      'pending'::text,
      'sent'::text,
      'suppressed'::text,
      'failed'::text,
      'bounced'::text,
      'complained'::text,
      'dlq'::text,
      'rate_limited'::text
    ]));
END $mig$;

-- ============================================================================
-- POST-ASSERTIONS
-- ============================================================================

DO $post$
DECLARE
  v_count int;
  v_def text;
  v_probe_id uuid;
  v_value text;
BEGIN
  SELECT count(*) INTO v_count
    FROM pg_constraint
   WHERE conrelid = 'public.email_send_log'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF v_count <> 1 THEN
    RAISE EXCEPTION '003: expected exactly 1 status check constraint after migration, found %', v_count;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conrelid = 'public.email_send_log'::regclass
     AND conname = 'email_send_log_status_check';
  IF v_def IS NULL THEN
    RAISE EXCEPTION '003: email_send_log_status_check is absent after replacement';
  END IF;

  FOREACH v_value IN ARRAY ARRAY[
    'pending','sent','suppressed','failed','bounced','complained','dlq','rate_limited'
  ] LOOP
    IF v_def NOT ILIKE '%' || v_value || '%' THEN
      RAISE EXCEPTION '003: constraint does not permit %', v_value;
    END IF;
  END LOOP;

  -- BEHAVIOURAL PROOF, not merely structural. Constraint text that looks right is not the same as
  -- the database accepting the value. Insert a real row, read it back, remove it — all inside this
  -- transaction, so it leaves nothing behind either way.
  INSERT INTO public.email_send_log (message_id, template_name, recipient_email, status, error_message)
  VALUES (
    gen_random_uuid()::text,
    'migration_003_probe',
    'probe@migration-003.invalid',
    'rate_limited',
    'Post-assert probe for London increment 003; deleted in the same transaction.'
  )
  RETURNING id INTO v_probe_id;

  IF v_probe_id IS NULL THEN
    RAISE EXCEPTION '003: rate_limited probe insert returned no id';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.email_send_log WHERE id = v_probe_id AND status = 'rate_limited') THEN
    RAISE EXCEPTION '003: rate_limited probe row not readable back';
  END IF;

  DELETE FROM public.email_send_log WHERE id = v_probe_id;
  IF EXISTS (SELECT 1 FROM public.email_send_log WHERE id = v_probe_id) THEN
    RAISE EXCEPTION '003: probe row could not be removed';
  END IF;

  -- ...and the constraint must still REJECT an unknown value. A CHECK that accepted everything
  -- would satisfy every assertion above.
  BEGIN
    INSERT INTO public.email_send_log (message_id, template_name, recipient_email, status)
    VALUES (gen_random_uuid()::text, 'migration_003_probe', 'probe@migration-003.invalid', 'not_a_real_status');
    RAISE EXCEPTION '003: constraint accepted an invalid status value';
  EXCEPTION
    WHEN check_violation THEN
      NULL; -- expected
  END;
END $post$;

COMMIT;
