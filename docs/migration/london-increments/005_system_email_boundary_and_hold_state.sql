-- 005 — the system-email creation boundary, and persistent hold/escalation state
--
-- LONDON ONLY. Do not place this file in supabase/migrations/ — see ./README.md.
--
-- ⚠ NUMBERING PROVENANCE — read before reconciling the ledger.
--
-- This file was authored and applied as `004`, and is recorded on London under the migration
-- name `london_inc_004_system_email_boundary_and_hold_state`, version `20260902145129`.
-- It is renumbered to 005 HERE ONLY, because a different increment —
-- `004_protect_existing_system_rows.sql`, London version `20260902133344` — had already taken
-- the number 004 and was applied about 75 minutes earlier.
--
-- The applied migration name is NOT rewritten to match: London's history records what actually
-- ran, and falsifying it to tidy the numbering would be the precise defect this convention
-- exists to prevent. So London carries two `london_inc_004_*` entries, distinguished by their
-- suffixes and versions, and this file's number and its applied name deliberately disagree.
-- Reconcile by name+version, never by file number.
--
-- The two are complementary, not conflicting: 004_protect closed the UPDATE/DELETE USING gaps
-- and revoked the queue_email_safe over-grants; this one adds queue_system_email_safe, the
-- hold/escalation columns, and the extended claim return shape. Where they overlap
-- (retry_count NOT NULL, the queue_email_safe REVOKEs) both statements are idempotent, and
-- this migration's preconditions passed precisely BECAUSE 004_protect had already landed —
-- they assert the policy guards it created.
--
-- ============================================================================
-- WHAT 002 ALREADY DID — verified live immediately before authoring this file
-- ============================================================================
--
-- Re-reading pg_policy on 2026-09-02 shows increment 002 already closed the direct-write
-- bypass on all three write commands:
--
--   email_queue_insert_org  WITH CHECK  org access AND context IS DISTINCT FROM 'system'
--   email_queue_update_org  USING       org access AND context IS DISTINCT FROM 'system'
--                           WITH CHECK  org access AND context IS DISTINCT FROM 'system'
--   email_queue_delete_org  USING       org access AND context IS DISTINCT FROM 'system'
--
-- So an authenticated member can neither create a system row, convert an ordinary row into
-- one, modify an existing one, nor delete one. This migration does NOT re-state those
-- policies — it asserts them as preconditions and fails if they have regressed. Re-issuing a
-- policy that is already correct risks replacing it with a subtly different expression.
--
-- service_role holds rolbypassrls = true, so every edge-function writer (send-invoice,
-- chaser-tick, workflow-tick, send-engagement-letter, process-automation-events) is unaffected
-- by those policies. The direct-writer inventory therefore needs no compatibility carve-out:
-- the four authenticated frontend writers (email-service, filing-service, automation-actions,
-- workflow-step-executor) set no `context` at all, so they land NULL and route to the practice
-- mailbox, which is the intended behaviour.
--
-- ============================================================================
-- WHAT THIS MIGRATION ADDS
-- ============================================================================
--
-- 1. queue_system_email_safe — the ONLY sanctioned way to create AccountancyOS system mail.
--    RLS blocks authenticated users from writing context='system' directly, which means
--    nothing can currently create it except an unconstrained service-role INSERT. This gives
--    that path one reviewed front door with fixed context and provider.
--
-- 2. queue_email_safe — revoke PUBLIC and anon EXECUTE. Its body already rejects
--    p_context='system' and returns 'Not authenticated' when auth.uid() is NULL, so the extra
--    grants are inert today; they are removed so the privilege surface matches the intent
--    rather than relying on a body check to hold the line.
--
-- 3. Persistent hold/escalation state on email_queue. The escalation clock must measure the
--    first UNINTERRUPTED hold. Every timestamp already on the row is unsuitable:
--    updated_at moves on every write, claimed_at is cleared by the hold itself, and
--    scheduled_at is pushed forward by the back-off. A held message would therefore never
--    reach a one-hour threshold measured from any of them.
--
-- 4. retry_count normalisation — NOT NULL DEFAULT 0 with a non-negative check. The worker
--    does arithmetic on it for the hold back-off (2 ** retry_count), where NULL propagates
--    to NaN rather than failing loudly. claim_email_queue_row already COALESCEs it; this
--    makes the column itself honest.
--
-- 5. claim_email_queue_row — extended ONCE to return the hold fields as well. The worker
--    consumes them after claiming, and the claim result replaces the pre-claim row object,
--    so anything absent from the return shape is silently undefined at the point of use.
--
-- ============================================================================
-- ROLLBACK
-- ============================================================================
--
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.queue_system_email_safe(uuid, text, text, text, text, text, uuid, text, timestamptz);
--   GRANT EXECUTE ON FUNCTION public.queue_email_safe(uuid, text, text, text, text, uuid, jsonb, timestamptz, text, uuid, text) TO PUBLIC, anon;
--   ALTER TABLE public.email_queue DROP CONSTRAINT IF EXISTS email_queue_retry_count_nonneg;
--   ALTER TABLE public.email_queue ALTER COLUMN retry_count DROP NOT NULL;
--   ALTER TABLE public.email_queue DROP CONSTRAINT IF EXISTS email_queue_hold_disposition_check;
--   ALTER TABLE public.email_queue
--     DROP COLUMN IF EXISTS held_since,        DROP COLUMN IF EXISTS last_held_at,
--     DROP COLUMN IF EXISTS hold_recovered_at, DROP COLUMN IF EXISTS first_escalated_at,
--     DROP COLUMN IF EXISTS last_escalated_at, DROP COLUMN IF EXISTS escalation_count,
--     DROP COLUMN IF EXISTS hold_disposition;
--   -- then restore claim_email_queue_row to its 15-column 002 shape from
--   -- docs/migration/london-increments/002_sender_identity_enforcement.sql
--   COMMIT;
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- PRECONDITIONS
-- ---------------------------------------------------------------------------
DO $pre$
DECLARE
  v_expr text;
  v_n int;
BEGIN
  IF to_regclass('public.email_queue') IS NULL THEN
    RAISE EXCEPTION '004 precondition failed: public.email_queue does not exist';
  END IF;

  -- 002's boundary must still be in place. If it has regressed, this migration would add a
  -- front door to a building with no walls.
  SELECT pg_get_expr(polwithcheck, polrelid) INTO v_expr
  FROM pg_policy WHERE polrelid = 'public.email_queue'::regclass AND polname = 'email_queue_insert_org';
  IF v_expr IS NULL OR v_expr NOT LIKE '%context IS DISTINCT FROM ''system''%' THEN
    RAISE EXCEPTION '004 precondition failed: email_queue_insert_org does not exclude context=system (002 regressed?)';
  END IF;

  SELECT pg_get_expr(polqual, polrelid) INTO v_expr
  FROM pg_policy WHERE polrelid = 'public.email_queue'::regclass AND polname = 'email_queue_update_org';
  IF v_expr IS NULL OR v_expr NOT LIKE '%context IS DISTINCT FROM ''system''%' THEN
    RAISE EXCEPTION '004 precondition failed: email_queue_update_org USING does not exclude context=system';
  END IF;

  SELECT pg_get_expr(polwithcheck, polrelid) INTO v_expr
  FROM pg_policy WHERE polrelid = 'public.email_queue'::regclass AND polname = 'email_queue_update_org';
  IF v_expr IS NULL OR v_expr NOT LIKE '%context IS DISTINCT FROM ''system''%' THEN
    RAISE EXCEPTION '004 precondition failed: email_queue_update_org WITH CHECK does not exclude context=system';
  END IF;

  SELECT pg_get_expr(polqual, polrelid) INTO v_expr
  FROM pg_policy WHERE polrelid = 'public.email_queue'::regclass AND polname = 'email_queue_delete_org';
  IF v_expr IS NULL OR v_expr NOT LIKE '%context IS DISTINCT FROM ''system''%' THEN
    RAISE EXCEPTION '004 precondition failed: email_queue_delete_org does not exclude context=system';
  END IF;

  -- 'system' must be a permitted context value, or the new RPC cannot insert.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.email_queue'::regclass
      AND conname = 'email_queue_context_check'
      AND pg_get_constraintdef(oid) LIKE '%''system''%'
  ) THEN
    RAISE EXCEPTION '004 precondition failed: email_queue_context_check does not permit system';
  END IF;

  -- 'postmark' must be a permitted provider value, for the same reason.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.email_queue'::regclass
      AND conname = 'email_queue_provider_check'
      AND pg_get_constraintdef(oid) LIKE '%''postmark''%'
  ) THEN
    RAISE EXCEPTION '004 precondition failed: email_queue_provider_check does not permit postmark';
  END IF;

  -- Exactly one queue_email_safe. A stale 10-argument overload alongside the hardened
  -- 11-argument one would let a caller reach the version with no context guard at all.
  SELECT count(*) INTO v_n
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'queue_email_safe';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '004 precondition failed: expected exactly 1 queue_email_safe, found % (stale overload?)', v_n;
  END IF;

  -- ...and it must be the hardened one that rejects system.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'queue_email_safe'
      AND p.prosrc LIKE '%cannot be sent as AccountancyOS system mail%'
  ) THEN
    RAISE EXCEPTION '004 precondition failed: queue_email_safe is not the hardened definition that rejects system context';
  END IF;

  -- Exactly one claim_email_queue_row, carrying 002's routing fields.
  SELECT count(*) INTO v_n
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'claim_email_queue_row';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '004 precondition failed: expected exactly 1 claim_email_queue_row, found %', v_n;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'claim_email_queue_row'
      AND pg_get_function_result(p.oid) LIKE '%context text%'
      AND pg_get_function_result(p.oid) LIKE '%retry_count integer%'
  ) THEN
    RAISE EXCEPTION '004 precondition failed: claim_email_queue_row lacks 002 return shape';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'queue_system_email_safe'
  ) THEN
    RAISE EXCEPTION '004 precondition failed: queue_system_email_safe already exists (already applied?)';
  END IF;
END $pre$;

-- ---------------------------------------------------------------------------
-- 1. HOLD / ESCALATION STATE
--
-- Additive and nullable. A NULL held_since means "not currently held", which is the correct
-- reading for every existing row.
-- ---------------------------------------------------------------------------
ALTER TABLE public.email_queue
  -- Start of the CURRENT uninterrupted hold incident. Set on the first hold, left alone on
  -- subsequent holds of the same incident, cleared on recovery. THE one-hour escalation
  -- threshold is measured from this and nothing else.
  ADD COLUMN IF NOT EXISTS held_since timestamptz,
  -- Most recent hold observation. Moves on every hold; never drives the threshold.
  ADD COLUMN IF NOT EXISTS last_held_at timestamptz,
  -- When the current incident last cleared. Retained after recovery as audit history.
  ADD COLUMN IF NOT EXISTS hold_recovered_at timestamptz,
  -- First escalation of the current incident (the one-hour alert).
  ADD COLUMN IF NOT EXISTS first_escalated_at timestamptz,
  -- Most recent escalation/reminder; the >=24h cadence is measured from this.
  ADD COLUMN IF NOT EXISTS last_escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalation_count integer NOT NULL DEFAULT 0,
  -- How the held message finally resolved. NULL while unresolved.
  ADD COLUMN IF NOT EXISTS hold_disposition text;

DO $$ BEGIN
  ALTER TABLE public.email_queue
    ADD CONSTRAINT email_queue_hold_disposition_check
    CHECK (hold_disposition IS NULL OR hold_disposition IN ('sent', 'cancelled', 'superseded'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.email_queue
    ADD CONSTRAINT email_queue_escalation_count_nonneg CHECK (escalation_count >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.email_queue.held_since IS
  'Start of the current uninterrupted hold incident; NULL when not held. The 1-hour escalation '
  'threshold is measured from this column ONLY — updated_at, claimed_at and scheduled_at all '
  'move with retries and back-off, so a held row measured from any of them would never mature.';

-- Partial index: the escalation worker scans only currently-held rows, which are a small
-- minority of a table the drainer reads every minute.
CREATE INDEX IF NOT EXISTS email_queue_held_since_idx
  ON public.email_queue (held_since)
  WHERE held_since IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. retry_count — no-op backfill, then make the column honest
-- ---------------------------------------------------------------------------
UPDATE public.email_queue SET retry_count = 0 WHERE retry_count IS NULL;

ALTER TABLE public.email_queue ALTER COLUMN retry_count SET DEFAULT 0;
ALTER TABLE public.email_queue ALTER COLUMN retry_count SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.email_queue
    ADD CONSTRAINT email_queue_retry_count_nonneg CHECK (retry_count >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 3. queue_system_email_safe — the only sanctioned creator of AccountancyOS system mail
--
-- context and provider are FIXED in the body. There is no argument that can influence either,
-- so there is no caller-controlled escape: the worst a compromised caller can do is send
-- system mail it was already trusted to send.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.queue_system_email_safe(
  p_organization_id uuid,
  p_to_email        text,
  p_subject         text,
  p_body_html       text,
  p_body_text       text        DEFAULT NULL,
  p_entity_type     text        DEFAULT NULL,
  p_entity_id       uuid        DEFAULT NULL,
  p_idempotency_key text        DEFAULT NULL,
  p_scheduled_at    timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email_id uuid;
BEGIN
  -- Validate rather than coerce. A system email with an empty body or a malformed recipient is
  -- a defect in the caller, and silently queueing it would send AccountancyOS-branded nonsense
  -- to a practice administrator.
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'queue_system_email_safe: organization_id is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id) THEN
    RAISE EXCEPTION 'queue_system_email_safe: organization % does not exist', p_organization_id;
  END IF;
  IF p_to_email IS NULL OR btrim(p_to_email) = '' THEN
    RAISE EXCEPTION 'queue_system_email_safe: to_email is required';
  END IF;
  IF position('@' IN p_to_email) = 0 THEN
    RAISE EXCEPTION 'queue_system_email_safe: to_email % is not a valid address', p_to_email;
  END IF;
  IF p_subject IS NULL OR btrim(p_subject) = '' THEN
    RAISE EXCEPTION 'queue_system_email_safe: subject is required';
  END IF;
  IF p_body_html IS NULL OR btrim(p_body_html) = '' THEN
    RAISE EXCEPTION 'queue_system_email_safe: body_html is required';
  END IF;

  -- Idempotency: a repeatable system event (the hourly held-mailbox escalation) passes a key
  -- so a retry cannot send a second copy. ON CONFLICT DO NOTHING makes the retry a no-op and
  -- returns the existing row's id rather than a spurious NULL.
  INSERT INTO public.email_queue (
    organization_id, to_email, subject, body_html, body_text,
    context, provider, status, scheduled_at,
    entity_type, entity_id, idempotency_key
  ) VALUES (
    p_organization_id, btrim(p_to_email), p_subject, p_body_html, p_body_text,
    'system',     -- FIXED. Not a parameter, and deliberately so.
    'postmark',   -- FIXED. System mail leaves via AccountancyOS's own sender.
    'pending', coalesce(p_scheduled_at, now()),
    p_entity_type, p_entity_id, p_idempotency_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_email_id;

  IF v_email_id IS NULL AND p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_email_id
    FROM public.email_queue
    WHERE idempotency_key = p_idempotency_key;
  END IF;

  RETURN v_email_id;
END;
$function$;

ALTER FUNCTION public.queue_system_email_safe(uuid, text, text, text, text, text, uuid, text, timestamptz)
  OWNER TO postgres;

REVOKE EXECUTE ON FUNCTION public.queue_system_email_safe(uuid, text, text, text, text, text, uuid, text, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.queue_system_email_safe(uuid, text, text, text, text, text, uuid, text, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.queue_system_email_safe(uuid, text, text, text, text, text, uuid, text, timestamptz) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.queue_system_email_safe(uuid, text, text, text, text, text, uuid, text, timestamptz) TO service_role;

COMMENT ON FUNCTION public.queue_system_email_safe(uuid, text, text, text, text, text, uuid, text, timestamptz) IS
  'Creates AccountancyOS system mail (context=system, provider=postmark), both fixed in the body '
  'and not settable by any caller. service_role only — RLS blocks authenticated users from '
  'writing context=system directly, and this is the reviewed front door for the trusted path.';

-- ---------------------------------------------------------------------------
-- 4. queue_email_safe — narrow the privilege surface to match the intent
--
-- The body already rejects p_context='system' and returns 'Not authenticated' when auth.uid()
-- is NULL, so PUBLIC/anon EXECUTE is inert. Removing it means the boundary does not depend on
-- a body check continuing to be correct. authenticated is RETAINED: src/lib/email-safe-service.ts
-- calls this as the signed-in user, which is its whole purpose.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.queue_email_safe(
  uuid, text, text, text, text, uuid, jsonb, timestamptz, text, uuid, text
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.queue_email_safe(
  uuid, text, text, text, text, uuid, jsonb, timestamptz, text, uuid, text
) FROM anon;

-- ---------------------------------------------------------------------------
-- 5. claim_email_queue_row — one replacement, final shape
--
-- Return type changes require DROP + CREATE; CREATE OR REPLACE cannot alter it. The DROP
-- discards grants, so they are re-established below and asserted afterwards.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.claim_email_queue_row(uuid, timestamptz);

CREATE FUNCTION public.claim_email_queue_row(p_email_id uuid, p_stale_before timestamptz)
RETURNS TABLE(
  id uuid, organization_id uuid, to_email text, to_name text, subject text,
  body_html text, body_text text, mailbox_id uuid, provider text, created_by uuid,
  attachments jsonb, context text, retry_count integer, entity_type text, entity_id uuid,
  held_since timestamptz, last_held_at timestamptz, hold_recovered_at timestamptz,
  first_escalated_at timestamptz, last_escalated_at timestamptz,
  escalation_count integer, hold_disposition text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  UPDATE public.email_queue q
     SET claimed_at = now(),
         updated_at = now()
   WHERE q.id = p_email_id
     AND q.status = 'pending'
     AND (q.claimed_at IS NULL OR q.claimed_at < p_stale_before)
  RETURNING
     q.id, q.organization_id, q.to_email, q.to_name, q.subject,
     q.body_html, q.body_text, q.mailbox_id, q.provider, q.created_by,
     q.attachments,
     -- The routing decision.
     q.context,
     q.retry_count,
     q.entity_type, q.entity_id,
     -- Hold/escalation state. The worker reads held_since to decide whether a hold starts a
     -- new incident or continues one; anything omitted here is undefined at the point of use,
     -- because the claim result REPLACES the pre-claim row object in the drainer.
     q.held_since, q.last_held_at, q.hold_recovered_at,
     q.first_escalated_at, q.last_escalated_at,
     q.escalation_count, q.hold_disposition;
END;
$function$;

ALTER FUNCTION public.claim_email_queue_row(uuid, timestamptz) OWNER TO postgres;

REVOKE EXECUTE ON FUNCTION public.claim_email_queue_row(uuid, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_email_queue_row(uuid, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_email_queue_row(uuid, timestamptz) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_email_queue_row(uuid, timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- POST-ASSERTIONS — a partial apply must not be able to commit.
-- ---------------------------------------------------------------------------
DO $post$
DECLARE
  v_acl text;
  v_result text;
  v_col text;
  v_probe_org uuid;
  v_probe_id uuid;
BEGIN
  -- 5a. Hold columns all present.
  FOREACH v_col IN ARRAY ARRAY[
    'held_since','last_held_at','hold_recovered_at',
    'first_escalated_at','last_escalated_at','escalation_count','hold_disposition'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='email_queue' AND column_name=v_col
    ) THEN
      RAISE EXCEPTION '004 post-assert failed: email_queue.% was not added', v_col;
    END IF;
  END LOOP;

  -- 5b. retry_count is now NOT NULL, defaulted and non-negative.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='email_queue'
      AND column_name='retry_count' AND is_nullable='YES'
  ) THEN
    RAISE EXCEPTION '004 post-assert failed: retry_count is still nullable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.email_queue'::regclass AND conname='email_queue_retry_count_nonneg'
  ) THEN
    RAISE EXCEPTION '004 post-assert failed: retry_count non-negative constraint missing';
  END IF;

  -- 5c. queue_system_email_safe is service_role ONLY.
  SELECT coalesce(array_to_string(p.proacl, ' | '), '(default: PUBLIC)') INTO v_acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='queue_system_email_safe';

  IF v_acl IS NULL THEN
    RAISE EXCEPTION '004 post-assert failed: queue_system_email_safe was not created';
  END IF;
  IF v_acl LIKE '%anon=X%' OR v_acl LIKE '%authenticated=X%' OR v_acl LIKE '=X/%' THEN
    RAISE EXCEPTION '004 post-assert failed: queue_system_email_safe is executable beyond service_role (acl=%)', v_acl;
  END IF;
  IF v_acl NOT LIKE '%service_role=X%' THEN
    RAISE EXCEPTION '004 post-assert failed: queue_system_email_safe is not executable by service_role (acl=%)', v_acl;
  END IF;

  -- 5d. queue_email_safe no longer executable by PUBLIC or anon, still by authenticated.
  SELECT coalesce(array_to_string(p.proacl, ' | '), '(default: PUBLIC)') INTO v_acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='queue_email_safe';

  IF v_acl LIKE '%anon=X%' THEN
    RAISE EXCEPTION '004 post-assert failed: queue_email_safe is still executable by anon (acl=%)', v_acl;
  END IF;
  IF v_acl LIKE '=X/%' THEN
    RAISE EXCEPTION '004 post-assert failed: queue_email_safe is still executable by PUBLIC (acl=%)', v_acl;
  END IF;
  IF v_acl NOT LIKE '%authenticated=X%' THEN
    RAISE EXCEPTION '004 post-assert failed: queue_email_safe lost authenticated EXECUTE, which its real callers need (acl=%)', v_acl;
  END IF;

  -- 5e. claim_email_queue_row: one signature, complete shape, service_role only.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='claim_email_queue_row') <> 1 THEN
    RAISE EXCEPTION '004 post-assert failed: claim_email_queue_row is not exactly one function';
  END IF;

  SELECT pg_get_function_result(p.oid) INTO v_result
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='claim_email_queue_row';

  FOREACH v_col IN ARRAY ARRAY[
    'id uuid','organization_id uuid','to_email text','to_name text','subject text',
    'body_html text','body_text text','mailbox_id uuid','provider text','created_by uuid',
    'attachments jsonb','context text','retry_count integer','entity_type text','entity_id uuid',
    'held_since timestamp with time zone','last_held_at timestamp with time zone',
    'hold_recovered_at timestamp with time zone','first_escalated_at timestamp with time zone',
    'last_escalated_at timestamp with time zone','escalation_count integer','hold_disposition text'
  ] LOOP
    IF v_result NOT LIKE '%' || v_col || '%' THEN
      RAISE EXCEPTION '004 post-assert failed: claim_email_queue_row return shape is missing %', v_col;
    END IF;
  END LOOP;

  SELECT coalesce(array_to_string(p.proacl, ' | '), '(default: PUBLIC)') INTO v_acl
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='claim_email_queue_row';

  IF v_acl LIKE '%anon=X%' OR v_acl LIKE '%authenticated=X%' OR v_acl LIKE '=X/%' THEN
    RAISE EXCEPTION '004 post-assert failed: claim_email_queue_row executable beyond service_role (acl=%)', v_acl;
  END IF;
  IF v_acl NOT LIKE '%service_role=X%' THEN
    RAISE EXCEPTION '004 post-assert failed: claim_email_queue_row not executable by service_role (acl=%)', v_acl;
  END IF;

  -- 5f. BEHAVIOURAL PROOF that the new RPC really writes a system row, removed in the same
  -- transaction. Structure looking right is not the same as the insert being accepted: the
  -- context and provider CHECK constraints, and the NOT NULL on organization_id, are only
  -- exercised by actually running it.
  SELECT id INTO v_probe_org FROM public.organizations LIMIT 1;
  IF v_probe_org IS NOT NULL THEN
    v_probe_id := public.queue_system_email_safe(
      v_probe_org,
      'probe@migration-004.invalid',
      'Migration 004 probe',
      '<p>Post-assert probe; deleted in the same transaction.</p>',
      'Post-assert probe; deleted in the same transaction.',
      NULL, NULL,
      'migration-004-probe',
      now()
    );

    IF v_probe_id IS NULL THEN
      RAISE EXCEPTION '004 post-assert failed: queue_system_email_safe returned no id';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.email_queue
      WHERE id = v_probe_id AND context = 'system' AND provider = 'postmark' AND status = 'pending'
    ) THEN
      RAISE EXCEPTION '004 post-assert failed: probe row is not context=system/provider=postmark/pending';
    END IF;

    -- Idempotency: the same key must NOT create a second row.
    IF public.queue_system_email_safe(
         v_probe_org, 'probe@migration-004.invalid', 'Migration 004 probe',
         '<p>second call</p>', NULL, NULL, NULL, 'migration-004-probe', now()
       ) IS DISTINCT FROM v_probe_id THEN
      RAISE EXCEPTION '004 post-assert failed: idempotency key did not de-duplicate';
    END IF;

    IF (SELECT count(*) FROM public.email_queue WHERE idempotency_key = 'migration-004-probe') <> 1 THEN
      RAISE EXCEPTION '004 post-assert failed: idempotent call created a duplicate row';
    END IF;

    -- Validation must actually reject bad input.
    BEGIN
      PERFORM public.queue_system_email_safe(v_probe_org, '', 'x', '<p>x</p>');
      RAISE EXCEPTION '004 post-assert failed: empty recipient was accepted';
    EXCEPTION WHEN raise_exception THEN
      IF sqlerrm LIKE '004 post-assert failed%' THEN RAISE; END IF;
    END;

    DELETE FROM public.email_queue WHERE id = v_probe_id;
    IF EXISTS (SELECT 1 FROM public.email_queue WHERE id = v_probe_id) THEN
      RAISE EXCEPTION '004 post-assert failed: probe row could not be removed';
    END IF;
  ELSE
    RAISE WARNING '004: no organization row available, behavioural probe skipped';
  END IF;
END $post$;

COMMIT;
