-- =============================================================================
-- Filing Engine v2 — Sprint 0 DB-level enforcement tests
-- =============================================================================
-- These assertions require a LIVE database (the schema + triggers + RLS) and
-- therefore are NOT run by the runtime-agnostic bun harness. Run against a
-- disposable/staging database:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/tests/sprint0-enforcement.sql
--
-- A clean run prints "SPRINT0 DB ENFORCEMENT: PASS". Any failed invariant aborts
-- with an exception. Everything runs inside a transaction that is rolled back, so
-- no data is mutated.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- DoD #13 — canonical approval spine exists; no duplicate approval artefact
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.filing_approvals') IS NULL THEN
    RAISE EXCEPTION 'MISSING canonical table public.filing_approvals';
  END IF;
  IF to_regclass('public.filing_model_snapshots') IS NULL THEN
    RAISE EXCEPTION 'MISSING canonical table public.filing_model_snapshots';
  END IF;

  IF to_regclass('public.approved_financial_model_versions') IS NOT NULL THEN
    RAISE EXCEPTION 'PROHIBITED duplicate approval artefact present: approved_financial_model_versions';
  END IF;
  RAISE NOTICE 'OK  approval spine present, no duplicate artefact';
END $$;

-- ---------------------------------------------------------------------------
-- DoD #4 — the source-hash / approval gate RPC exists
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'validate_filing_submission'
  ) THEN
    RAISE EXCEPTION 'MISSING approval gate function validate_filing_submission()';
  END IF;
  RAISE NOTICE 'OK  validate_filing_submission() present (approval gate)';
END $$;

-- ---------------------------------------------------------------------------
-- DoD #3 — approved snapshots are immutable (RLS + trigger)
-- We attempt an UPDATE and assert it is blocked. Requires at least one row;
-- if none exists we only assert the protective trigger is installed.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  has_trigger boolean;
  sample_id uuid;
  blocked boolean := false;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'filing_model_snapshots' AND NOT t.tgisinternal
  ) INTO has_trigger;

  IF NOT has_trigger THEN
    RAISE EXCEPTION 'MISSING immutability trigger on filing_model_snapshots';
  END IF;

  SELECT id INTO sample_id FROM public.filing_model_snapshots LIMIT 1;
  IF sample_id IS NOT NULL THEN
    BEGIN
      UPDATE public.filing_model_snapshots SET snapshot_hash = 'tampered' WHERE id = sample_id;
    EXCEPTION WHEN OTHERS THEN
      blocked := true;
    END;
    IF NOT blocked THEN
      RAISE EXCEPTION 'filing_model_snapshots UPDATE was NOT blocked — immutability broken';
    END IF;
    RAISE NOTICE 'OK  filing_model_snapshots is immutable (update blocked)';
  ELSE
    RAISE NOTICE 'OK  immutability trigger present (no rows to mutate)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- DoD #6/#7 — tenant isolation: every filing-engine table carries
-- organization_id and has RLS enabled. (Cross-tenant read/write with real JWTs
-- is exercised by the TS RLS harness — see note at the bottom of this file.)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'filing_provider_events',
    'filing_model_snapshots',
    'filing_approvals',
    'filings'
  ];
  rls_on boolean;
  has_org boolean;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE; -- table optional in some envs
    END IF;

    SELECT relrowsecurity INTO rls_on FROM pg_class WHERE relname = t;
    IF NOT rls_on THEN
      RAISE EXCEPTION 'RLS not enabled on public.%', t;
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'organization_id'
    ) INTO has_org;
    IF NOT has_org THEN
      RAISE EXCEPTION 'table public.% has no organization_id tenant column', t;
    END IF;
  END LOOP;
  RAISE NOTICE 'OK  filing-engine tables enforce RLS + organization_id';
END $$;

DO $$ BEGIN RAISE NOTICE 'SPRINT0 DB ENFORCEMENT: PASS'; END $$;

ROLLBACK;

-- =============================================================================
-- Cross-tenant read/write proof (DoD #6, #7) — TS harness
-- =============================================================================
-- Pure SQL cannot fully impersonate two authenticated JWTs. The cross-tenant
-- read/write rejection is proven by signing in as two synthetic users in
-- different organizations and asserting row visibility, following the existing
-- pattern documented in .lovable/plan.md (scripts/tests/phase1-rls.ts) and
-- docs/automation/rls-isolation-evidence.md:
--
--   1. user A (org A) inserts a filings/filing_provider_events row
--   2. user B (org B) SELECTs it            -> expect 0 rows
--   3. user B attempts UPDATE/INSERT for org A -> expect RLS denial
--
-- This reuses public.user_has_organization_access(organization_id), the same
-- helper every other tenant-scoped table uses — no parallel tenant helper.
-- =============================================================================
