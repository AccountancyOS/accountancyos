
SET LOCAL session_replication_role = 'replica';

DO $$
DECLARE
  v_company uuid := 'b3395d8b-fa5a-45d2-99ab-bf812f56f207';
  v_client  uuid := 'c71e87f7-08cc-4ebe-994b-e51d05319bef';
  v_user    uuid := 'ab6a0b5c-d9e4-49f2-8445-489bffcd8ef5';
  v_jobs uuid[];
BEGIN
  SELECT array_agg(id) INTO v_jobs FROM jobs WHERE company_id = v_company OR client_id = v_client;
  IF v_jobs IS NULL THEN v_jobs := ARRAY[]::uuid[]; END IF;

  DELETE FROM sla_instances WHERE entity_type = 'job' AND entity_id = ANY(v_jobs);
  DELETE FROM job_tasks                  WHERE job_id = ANY(v_jobs);
  DELETE FROM job_timeline               WHERE job_id = ANY(v_jobs);
  DELETE FROM job_documents              WHERE job_id = ANY(v_jobs);
  DELETE FROM job_artifacts              WHERE job_id = ANY(v_jobs);
  DELETE FROM job_workpaper_instances    WHERE job_id = ANY(v_jobs);
  DELETE FROM job_questionnaire_instances WHERE job_id = ANY(v_jobs);
  DELETE FROM job_conversations          WHERE job_id = ANY(v_jobs);
  DELETE FROM client_approval_packs      WHERE job_id = ANY(v_jobs);
  DELETE FROM record_request_items       WHERE job_id = ANY(v_jobs);
  DELETE FROM chaser_job_periods         WHERE job_id = ANY(v_jobs);
  DELETE FROM automation_workflow_instances WHERE client_id = v_client OR company_id = v_company;

  DELETE FROM jobs WHERE id = ANY(v_jobs);

  DELETE FROM deadlines           WHERE company_id = v_company OR client_id = v_client;
  DELETE FROM engagement_letters  WHERE onboarding_application_id IN (SELECT id FROM onboarding_applications WHERE company_id = v_company OR client_id = v_client OR email ILIKE 'leon5440%');
  DELETE FROM engagements         WHERE company_id = v_company OR client_id = v_client;
  DELETE FROM quote_acceptance_tokens WHERE quote_id IN (SELECT id FROM quotes WHERE company_id = v_company OR client_id = v_client);
  DELETE FROM quote_lines         WHERE quote_id IN (SELECT id FROM quotes WHERE company_id = v_company OR client_id = v_client);
  DELETE FROM quotes              WHERE company_id = v_company OR client_id = v_client;
  DELETE FROM kyc_pack_subjects   WHERE kyc_pack_id IN (SELECT id FROM kyc_packs WHERE client_id = v_client);
  DELETE FROM kyc_packs           WHERE client_id = v_client;
  DELETE FROM client_tasks        WHERE company_id = v_company OR client_id = v_client;
  DELETE FROM client_messages     WHERE company_id = v_company OR client_id = v_client;
  DELETE FROM client_tax_authorisations WHERE client_id = v_client;
  DELETE FROM client_detail_cgt         WHERE client_id = v_client;
  DELETE FROM client_detail_charity     WHERE client_id = v_client;
  DELETE FROM client_detail_partnership WHERE client_id = v_client;
  DELETE FROM client_detail_sa          WHERE client_id = v_client;

  DELETE FROM crm_activities   WHERE client_id = v_client OR lead_id IN (SELECT id FROM leads WHERE email ILIKE 'leon5440%');
  DELETE FROM lead_activities  WHERE lead_id IN (SELECT id FROM leads WHERE email ILIKE 'leon5440%');
  DELETE FROM leads            WHERE email ILIKE 'leon5440%';

  DELETE FROM onboarding_events       WHERE application_id IN (SELECT id FROM onboarding_applications WHERE company_id = v_company OR client_id = v_client OR email ILIKE 'leon5440%');
  DELETE FROM onboarding_documents    WHERE application_id IN (SELECT id FROM onboarding_applications WHERE company_id = v_company OR client_id = v_client OR email ILIKE 'leon5440%');
  DELETE FROM onboarding_applications WHERE company_id = v_company OR client_id = v_client OR email ILIKE 'leon5440%';

  DELETE FROM message_entity_links WHERE entity_id IN (v_company, v_client) OR entity_id = ANY(v_jobs);
  DELETE FROM email_queue          WHERE company_id = v_company OR client_id = v_client OR to_email ILIKE 'leon5440%';
  DELETE FROM email_attachments    WHERE email_message_id IN (SELECT id FROM email_messages WHERE company_id = v_company OR client_id = v_client);
  DELETE FROM email_messages       WHERE company_id = v_company OR client_id = v_client;
  DELETE FROM email_suppressions   WHERE email ILIKE 'leon5440%';
  DELETE FROM email_unsubscribe_tokens WHERE email ILIKE 'leon5440%';
  DELETE FROM email_preferences    WHERE email ILIKE 'leon5440%' OR client_id = v_client;
  DELETE FROM notifications        WHERE user_id = v_user;

  DELETE FROM portal_access            WHERE company_id = v_company OR client_id = v_client OR user_id = v_user;
  DELETE FROM portal_visibility_settings WHERE company_id = v_company OR client_id = v_client;

  DELETE FROM contacts WHERE company_id = v_company OR client_id = v_client OR email ILIKE 'leon5440%';

  DELETE FROM company_register_events  WHERE company_id = v_company;
  DELETE FROM company_share_allotments WHERE company_id = v_company;
  DELETE FROM company_share_transfers  WHERE company_id = v_company;
  DELETE FROM company_shareholders     WHERE company_id = v_company;
  DELETE FROM company_share_classes    WHERE company_id = v_company;
  DELETE FROM company_officers         WHERE company_id = v_company;
  DELETE FROM company_pscs             WHERE company_id = v_company;
  DELETE FROM companies_house_diff_staging WHERE company_id = v_company;

  DELETE FROM user_roles    WHERE user_id = v_user;
  DELETE FROM user_sessions WHERE user_id = v_user;
  DELETE FROM profiles      WHERE id = v_user;
  DELETE FROM organization_users WHERE user_id = v_user;

  DELETE FROM companies WHERE id = v_company;
  DELETE FROM clients   WHERE id = v_client;
  DELETE FROM auth.users WHERE id = v_user;
END $$;
