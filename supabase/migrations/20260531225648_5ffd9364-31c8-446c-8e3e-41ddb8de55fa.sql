
-- pause / resume
CREATE OR REPLACE FUNCTION public.pause_automation(
  p_org_id uuid, p_scope text, p_target_id uuid, p_rule_id uuid, p_reason text, p_expires_at timestamptz
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT user_in_organization(auth.uid(), p_org_id) THEN
    RAISE EXCEPTION 'not a member of organization';
  END IF;
  INSERT INTO automation_pauses(organization_id, scope, target_id, rule_id, reason, paused_by, expires_at)
  VALUES (p_org_id, p_scope, p_target_id, p_rule_id, p_reason, auth.uid(), p_expires_at)
  RETURNING id INTO v_id;
  INSERT INTO automation_audit_logs(organization_id, actor_id, entity_type, entity_id, action, after_state)
  VALUES (p_org_id, auth.uid(), 'automation_pause', v_id, 'pause',
          jsonb_build_object('scope',p_scope,'target_id',p_target_id,'rule_id',p_rule_id,'reason',p_reason));
  RETURN v_id;
END;$$;
REVOKE ALL ON FUNCTION public.pause_automation(uuid,text,uuid,uuid,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pause_automation(uuid,text,uuid,uuid,text,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.resume_automation(p_pause_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM automation_pauses WHERE id = p_pause_id;
  IF v_org IS NULL THEN RETURN false; END IF;
  IF NOT user_in_organization(auth.uid(), v_org) THEN RAISE EXCEPTION 'not a member'; END IF;
  DELETE FROM automation_pauses WHERE id = p_pause_id;
  INSERT INTO automation_audit_logs(organization_id, actor_id, entity_type, entity_id, action)
  VALUES (v_org, auth.uid(), 'automation_pause', p_pause_id, 'resume');
  RETURN true;
END;$$;
REVOKE ALL ON FUNCTION public.resume_automation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resume_automation(uuid) TO authenticated;

-- audit log helper
CREATE OR REPLACE FUNCTION public.record_automation_audit(
  p_org_id uuid, p_entity_type text, p_entity_id uuid, p_action text,
  p_before jsonb, p_after jsonb, p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT user_in_organization(auth.uid(), p_org_id) THEN
    RAISE EXCEPTION 'not a member';
  END IF;
  INSERT INTO automation_audit_logs(organization_id, actor_id, entity_type, entity_id, action, before_state, after_state, metadata)
  VALUES (p_org_id, auth.uid(), p_entity_type, p_entity_id, p_action, p_before, p_after, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;$$;
REVOKE ALL ON FUNCTION public.record_automation_audit(uuid,text,uuid,text,jsonb,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_automation_audit(uuid,text,uuid,text,jsonb,jsonb,jsonb) TO authenticated;

-- suppression check
CREATE OR REPLACE FUNCTION public.check_suppression(p_org_id uuid, p_email text, p_category text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM email_suppressions
    WHERE organization_id = p_org_id
      AND lower(email) = lower(p_email)
      AND (category IS NULL OR category = p_category)
  ) OR EXISTS(
    SELECT 1 FROM email_preferences
    WHERE organization_id = p_org_id
      AND lower(coalesce(email,'')) = lower(p_email)
      AND category = p_category
      AND opted_out_at IS NOT NULL
  );
$$;
REVOKE ALL ON FUNCTION public.check_suppression(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_suppression(uuid,text,text) TO authenticated, service_role;

-- unsubscribe tokens
CREATE OR REPLACE FUNCTION public.enqueue_unsubscribe_token(p_org_id uuid, p_email text, p_category text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_token text;
BEGIN
  v_token := encode(gen_random_bytes(24), 'hex');
  INSERT INTO email_unsubscribe_tokens(organization_id, email, token, category)
  VALUES (p_org_id, p_email, v_token, p_category);
  RETURN v_token;
END;$$;
REVOKE ALL ON FUNCTION public.enqueue_unsubscribe_token(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_unsubscribe_token(uuid,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_unsubscribe_token(p_token text, p_category text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_cat text;
BEGIN
  SELECT * INTO r FROM email_unsubscribe_tokens WHERE token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','invalid'); END IF;
  IF r.used_at IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'already',true); END IF;
  v_cat := COALESCE(p_category, r.category);
  INSERT INTO email_suppressions(organization_id, email, category, reason, source)
  VALUES (r.organization_id, r.email, v_cat, 'unsubscribe', 'one_click_token')
  ON CONFLICT DO NOTHING;
  UPDATE email_unsubscribe_tokens SET used_at = now() WHERE id = r.id;
  RETURN jsonb_build_object('ok',true);
END;$$;
REVOKE ALL ON FUNCTION public.consume_unsubscribe_token(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_unsubscribe_token(text,text) TO anon, authenticated, service_role;

-- idempotency
CREATE OR REPLACE FUNCTION public.claim_idempotency_key(
  p_org_id uuid, p_key text, p_rule_id uuid DEFAULT NULL,
  p_chaser_policy_id uuid DEFAULT NULL, p_workflow_instance_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    INSERT INTO automation_idempotency_keys(organization_id, key, rule_id, chaser_policy_id, workflow_instance_id)
    VALUES (p_org_id, p_key, p_rule_id, p_chaser_policy_id, p_workflow_instance_id);
    RETURN true;
  EXCEPTION WHEN unique_violation THEN
    RETURN false;
  END;
END;$$;
REVOKE ALL ON FUNCTION public.claim_idempotency_key(uuid,text,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_idempotency_key(uuid,text,uuid,uuid,uuid) TO authenticated, service_role;

-- template validation
CREATE OR REPLACE FUNCTION public.validate_template(p_template_id uuid, p_context jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t record;
  errs text[] := ARRAY[]::text[];
  body text;
  subject text;
BEGIN
  SELECT * INTO t FROM templates WHERE id = p_template_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid',false,'errors',ARRAY['template_not_found']);
  END IF;
  IF t.organization_id IS NOT NULL AND NOT user_in_organization(auth.uid(), t.organization_id) THEN
    RAISE EXCEPTION 'not a member';
  END IF;
  subject := coalesce(t.content->>'subject','');
  body := coalesce(t.content->>'body', t.content->>'body_html', '');
  IF length(trim(subject)) = 0 THEN errs := errs || 'subject_blank'; END IF;
  IF length(trim(body)) = 0 THEN errs := errs || 'body_blank'; END IF;
  IF t.requires_unsubscribe_link AND position('{{unsubscribe_url}}' in body) = 0 THEN
    errs := errs || 'missing_unsubscribe_link';
  END IF;
  IF t.recipient_rule IS NULL OR length(trim(t.recipient_rule)) = 0 THEN
    errs := errs || 'missing_recipient_rule';
  END IF;
  IF t.required_merge_fields IS NOT NULL THEN
    DECLARE f text;
    BEGIN
      FOREACH f IN ARRAY t.required_merge_fields LOOP
        IF position('{{'||f||'}}' in body) = 0 AND position('{{'||f||'}}' in subject) = 0 THEN
          errs := errs || ('missing_merge:'||f);
        END IF;
      END LOOP;
    END;
  END IF;
  RETURN jsonb_build_object('valid', array_length(errs,1) IS NULL, 'errors', to_jsonb(errs));
END;$$;
REVOKE ALL ON FUNCTION public.validate_template(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_template(uuid,jsonb) TO authenticated, service_role;

-- seed org automation defaults (dry-run by default)
CREATE OR REPLACE FUNCTION public.seed_org_automation_defaults(p_org_id uuid, p_dry_run boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rule_template_count int;
  v_rule_count int;
  v_chaser_count int;
  v_template_count int;
BEGIN
  IF NOT user_in_organization(auth.uid(), p_org_id) THEN
    RAISE EXCEPTION 'not a member';
  END IF;
  SELECT count(*) INTO v_rule_template_count FROM automation_rule_templates WHERE is_system = true;
  SELECT count(*) INTO v_rule_count FROM automation_rules WHERE organization_id = p_org_id;
  SELECT count(*) INTO v_chaser_count FROM automation_chaser_policies WHERE organization_id = p_org_id;
  SELECT count(*) INTO v_template_count FROM templates WHERE organization_id = p_org_id;

  IF NOT p_dry_run THEN
    -- Actual seeding is done by Phase 2 onward; Phase 1 only reports.
    INSERT INTO automation_audit_logs(organization_id, actor_id, entity_type, entity_id, action, metadata)
    VALUES (p_org_id, auth.uid(), 'org_seed', p_org_id, 'seed_invoked',
            jsonb_build_object('dry_run', false, 'phase', 1));
  END IF;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'rule_templates_available', v_rule_template_count,
    'existing_rules', v_rule_count,
    'existing_chaser_policies', v_chaser_count,
    'existing_templates', v_template_count,
    'historic_emails_to_be_queued', 0,
    'historic_records_to_be_activated', 0,
    'note', 'Phase 1 seeding is a no-op; only reports current state. External-facing automations will default to scope=new_records and send_mode=draft when seeded in later phases.'
  );
END;$$;
REVOKE ALL ON FUNCTION public.seed_org_automation_defaults(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_org_automation_defaults(uuid,boolean) TO authenticated, service_role;

-- client / job overrides
CREATE OR REPLACE FUNCTION public.apply_client_override(
  p_org_id uuid, p_client_id uuid, p_rule_id uuid, p_chaser_policy_id uuid,
  p_enabled boolean, p_config jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT user_in_organization(auth.uid(), p_org_id) THEN RAISE EXCEPTION 'not a member'; END IF;
  INSERT INTO automation_client_overrides(organization_id, client_id, rule_id, chaser_policy_id, enabled, config_overrides)
  VALUES (p_org_id, p_client_id, p_rule_id, p_chaser_policy_id, p_enabled, p_config)
  ON CONFLICT (client_id, rule_id) WHERE rule_id IS NOT NULL
  DO UPDATE SET enabled = excluded.enabled, config_overrides = excluded.config_overrides, updated_at = now()
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    INSERT INTO automation_client_overrides(organization_id, client_id, rule_id, chaser_policy_id, enabled, config_overrides)
    VALUES (p_org_id, p_client_id, p_rule_id, p_chaser_policy_id, p_enabled, p_config)
    ON CONFLICT (client_id, chaser_policy_id) WHERE chaser_policy_id IS NOT NULL
    DO UPDATE SET enabled = excluded.enabled, config_overrides = excluded.config_overrides, updated_at = now()
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;$$;
REVOKE ALL ON FUNCTION public.apply_client_override(uuid,uuid,uuid,uuid,boolean,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_client_override(uuid,uuid,uuid,uuid,boolean,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_job_override(
  p_org_id uuid, p_job_id uuid, p_rule_id uuid, p_chaser_policy_id uuid,
  p_enabled boolean, p_config jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT user_in_organization(auth.uid(), p_org_id) THEN RAISE EXCEPTION 'not a member'; END IF;
  INSERT INTO automation_job_overrides(organization_id, job_id, rule_id, chaser_policy_id, enabled, config_overrides)
  VALUES (p_org_id, p_job_id, p_rule_id, p_chaser_policy_id, p_enabled, p_config)
  ON CONFLICT (job_id, rule_id) WHERE rule_id IS NOT NULL
  DO UPDATE SET enabled = excluded.enabled, config_overrides = excluded.config_overrides, updated_at = now()
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    INSERT INTO automation_job_overrides(organization_id, job_id, rule_id, chaser_policy_id, enabled, config_overrides)
    VALUES (p_org_id, p_job_id, p_rule_id, p_chaser_policy_id, p_enabled, p_config)
    ON CONFLICT (job_id, chaser_policy_id) WHERE chaser_policy_id IS NOT NULL
    DO UPDATE SET enabled = excluded.enabled, config_overrides = excluded.config_overrides, updated_at = now()
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;$$;
REVOKE ALL ON FUNCTION public.apply_job_override(uuid,uuid,uuid,uuid,boolean,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_job_override(uuid,uuid,uuid,uuid,boolean,jsonb) TO authenticated;
