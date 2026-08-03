-- =====================================================================================
-- DEF-015 — revoke anonymous EXECUTE from privileged functions with no internal check.
-- =====================================================================================
-- The audit enumerated SECURITY DEFINER functions that `anon` may execute and that carry
-- no internal authorisation check of their own. A SECURITY DEFINER function runs as its
-- owner (postgres) and therefore bypasses RLS, so for these two gates are open at once:
-- anyone may call them, and the body checks nothing. `find_entities_by_email` was
-- confirmed live returning a real client record to the anon key with no session.
--
-- The anon key ships inside the frontend bundle, so "reachable by anon" means reachable
-- by anyone who opens developer tools.
--
-- SCOPE: 89 function NAMES, listed explicitly below. Selected by sweeping all 368 public
-- function bodies (db_rpc mcp_list_functions, 2026-08-01) for SECURITY DEFINER,
-- non-trigger functions containing none of: auth.uid(), auth.role(), current_setting,
-- user_in_organization, user_has_organization_access, user_has_role_at_least,
-- has_organization_role, portal_has_perm, portal_can_access, an onboarding-token check,
-- or a token validator.
--
-- WHY REVOKE RATHER THAN ADD CHECKS. Most of these are not defective. Some ARE the check
-- (can_manage_team(_user_id, _org_id) answers a question about a user it was handed);
-- some are pure computation (calculate_deadline); some are cron-driven infrastructure.
-- The defect is the grant, not the body — so the grant is what changes.
--
-- WHY THIS IS EXPECTED TO BREAK NOTHING. Verified before writing:
--   * No candidate is called from any anonymous page. PublicQuoteView, PublicOnboarding,
--     EngagementLetterPreview and the portal call only public_*/portal_* functions, every
--     one of which authorises on a token or portal permission — none is in this set.
--   * All 28 candidates called from client code are called from AUTHENTICATED screens
--     (permission hooks, the automation engine, CreateQuoteDialog, chart of accounts,
--     filing approval, the MCP catalog tools). `authenticated` keeps EXECUTE.
--   * All 13 candidates called from edge functions are called with the SERVICE-ROLE key
--     (outlook-sync, auth-email-hook, process-email-queue). `service_role` keeps EXECUTE.
--   * A SECURITY DEFINER function calling another executes it as the definer, so internal
--     helpers stay reachable from the public endpoints that use them. Proven already by
--     el_signature_progress, revoked on 2026-07-28 with the client signing page unaffected.
--
-- Portal users are `authenticated` — signed in, simply not organisation members — so
-- portal functionality is unaffected.
--
-- sandbox_exec and any other independent grantee are untouched: REVOKE FROM PUBLIC and
-- FROM anon do not affect a separate grantee's own grant.
--
-- Driven off the catalog by NAME so every overload is covered and each signature is
-- resolved by the database itself (oid::regprocedure) rather than transcribed here.
-- Idempotent: re-running changes nothing. el_signature_progress is included and is
-- already revoked — harmless.
--
-- ONE ADDITION beyond the 89. grant_person_portal_access is included although it does NOT
-- meet the "no internal check" test: it calls user_has_organization_access() and raises on
-- failure, so an anonymous caller is already refused. The audit listed it among its
-- highest-risk functions because its pattern list did not recognise helper-based checks —
-- a false positive there, and part of why that enumeration reached 93 where a body sweep
-- reaches 89. It is revoked anyway: a function that grants portal access should not be
-- callable without a session even when it would refuse. Defence in depth, stated as such.
-- =====================================================================================

BEGIN;

DO $$
DECLARE
  r record;
  v_done int := 0;
  v_bad text[] := ARRAY[]::text[];
  v_lost text[] := ARRAY[]::text[];
  v_names text[] := ARRAY[
    '_canonical_spine_enabled', '_check_questionnaire_token_rate_limit', 'assert_no_locked_period_write', 'automation_engine_enabled',
    'calculate_deadline', 'can_approve_filings', 'can_execute_automation', 'can_finalise',
    'can_finalize_workpapers', 'can_manage_automation_rules', 'can_manage_practice_settings', 'can_manage_team',
    'can_manage_templates', 'can_modify_jobs', 'can_submit_filings', 'check_automation_rate_limit',
    'check_suppression', 'claim_email_queue_row', 'claim_idempotency_key', 'cleanup_expired_gmail_auth_states',
    'cleanup_expired_outlook_auth_states', 'cleanup_old_rate_limits', 'client_has_portal_access', 'create_job_from_template',
    'create_test_ct600_filing', 'delete_email', 'el_signature_progress', 'email_queue_dispatch',
    'emit_automation_event', 'enqueue_email', 'ensure_client_document_folder', 'ensure_default_templates_for_org',
    'ensure_org_settings', 'entity_has_active_bookkeeping', 'find_entities_by_email', 'generate_quote_number',
    'grant_person_portal_access',
    'get_active_vat_registration', 'get_check_constraint_values', 'get_cron_job_status', 'get_general_ledger_from_ledger',
    'get_org_settings_safe', 'get_portal_bank_accounts_for_entity', 'get_portal_entities_for_user', 'get_portal_kpis_for_entity',
    'get_portal_visibility_for_entity', 'get_trial_balance_from_ledger', 'get_user_organization_id', 'get_user_role',
    'governance_record_merge_field', 'has_any_role', 'has_portal_role', 'has_role',
    'increment_automation_rate_limit', 'is_active_onboarding_path', 'is_canonical_lifecycle_enabled', 'is_period_locked',
    'lifecycle_activate_client_services', 'lifecycle_generate_deadlines_for_job', 'lifecycle_generate_jobs_for_service', 'lifecycle_materialize_jobs',
    'lifecycle_onboarding_gates', 'lifecycle_upsert_job_with_deadlines', 'mcp_list_cron_jobs', 'mcp_list_functions',
    'mcp_list_grants', 'mcp_list_indexes', 'mcp_list_policies', 'mcp_list_rls_status',
    'mcp_list_schema', 'mcp_list_triggers', 'move_to_dlq', 'portal_user_has_entity_access',
    'process_due_recurring_invoices', 'process_questionnaire_submission', 'queue_filing_for_submission', 'read_email_batch',
    'record_automation_execution', 'regress_filing_status', 'resolve_company_director', 'resolve_engagement_letter_variant',
    'revoke_approval_with_audit', 'seed_default_chart_of_accounts', 'seed_default_vat_codes', 'seed_organization_defaults',
    'user_has_org_role', 'user_role_is_at_least', 'validate_filing_submission', 'validate_submission_integrity',
    'vault_secret_exists'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY(v_names)
       AND p.prosecdef                                   -- SECURITY DEFINER only
       AND p.prorettype <> 'pg_catalog.trigger'::regtype  -- never a trigger function
     ORDER BY 1
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    v_done := v_done + 1;
  END LOOP;

  RAISE NOTICE 'DEF-015: revoked anon/PUBLIC EXECUTE on % function signature(s).', v_done;

  -- A name that matches nothing means the catalogue moved under us. Fail rather than
  -- silently under-applying and reporting success.
  IF v_done = 0 THEN
    RAISE EXCEPTION 'DEF-015: no matching functions found — refusing to report success';
  END IF;

  -- Verify in the SAME block (a separate DO block cannot see v_names) and BEFORE COMMIT,
  -- so a partial application aborts itself rather than persisting.
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY(v_names)
       AND p.prosecdef
       AND p.prorettype <> 'pg_catalog.trigger'::regtype
  LOOP
    IF has_function_privilege('anon', r.sig, 'EXECUTE') THEN
      v_bad := v_bad || r.sig::text;
    END IF;
    IF NOT has_function_privilege('authenticated', r.sig, 'EXECUTE') THEN
      v_lost := v_lost || r.sig::text;
    END IF;
  END LOOP;

  IF array_length(v_bad, 1) > 0 THEN
    RAISE EXCEPTION 'DEF-015 incomplete: anon still holds EXECUTE on %', array_to_string(v_bad, ', ');
  END IF;
  IF array_length(v_lost, 1) > 0 THEN
    RAISE EXCEPTION 'DEF-015 broke staff access: authenticated lacks EXECUTE on %', array_to_string(v_lost, ', ');
  END IF;
END $$;

COMMIT;