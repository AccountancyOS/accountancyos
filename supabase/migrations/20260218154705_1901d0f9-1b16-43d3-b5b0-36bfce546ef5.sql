
-- ============================================================
-- Phase 1: Chaser Frequency Editor — step_key + chaser steps
-- ============================================================

-- 1a. Add step_key column (nullable initially for backfill)
ALTER TABLE public.automation_workflow_steps ADD COLUMN IF NOT EXISTS step_key TEXT;

-- 1b. Backfill ALL existing steps with semantic keys
-- Template b001: CRM_PROPOSAL_CHASER (5 steps)
UPDATE public.automation_workflow_steps SET step_key = 'WAIT_PROPOSAL_FOLLOWUP_1'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000001' AND step_order = 1 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'SEND_PROPOSAL_FOLLOWUP_1'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000001' AND step_order = 2 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'WAIT_PROPOSAL_FOLLOWUP_2'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000001' AND step_order = 3 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'SEND_PROPOSAL_FOLLOWUP_2'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000001' AND step_order = 4 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'CREATE_TASK_PROPOSAL_FOLLOWUP'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000001' AND step_order = 5 AND step_key IS NULL;

-- Template b002: ONBOARDING_NEW_CLIENT (5 steps)
UPDATE public.automation_workflow_steps SET step_key = 'SEND_WELCOME_EMAIL'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000002' AND step_order = 1 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'RELEASE_ONBOARDING_QUESTIONNAIRE'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000002' AND step_order = 2 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'WAIT_ONBOARDING_QUESTIONNAIRE'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000002' AND step_order = 3 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'CREATE_TASK_REVIEW_ONBOARDING'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000002' AND step_order = 4 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'SEND_NEXT_STEPS'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000002' AND step_order = 5 AND step_key IS NULL;

-- Template b003: SA_NON_MTD_ANNUAL (7 steps)
UPDATE public.automation_workflow_steps SET step_key = 'CREATE_JOB_SA'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000003' AND step_order = 1 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'SEND_RECORDS_REQUEST'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000003' AND step_order = 2 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'RELEASE_QUESTIONNAIRE_SA'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000003' AND step_order = 3 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'WAIT_QUESTIONNAIRE_SUBMITTED'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000003' AND step_order = 4 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'UPDATE_STATUS_RECORDS_RECEIVED'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000003' AND step_order = 5 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'CREATE_TASK_PREPARE_SA'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000003' AND step_order = 6 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'SET_SLA_TIMER_SA'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000003' AND step_order = 7 AND step_key IS NULL;

-- Template b004: SA_MTD_QUARTERLY (5 steps)
UPDATE public.automation_workflow_steps SET step_key = 'CREATE_JOB_MTD_Q'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000004' AND step_order = 1 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'SEND_MTD_Q_RECORDS_REQUEST'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000004' AND step_order = 2 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'WAIT_MTD_Q_QUESTIONNAIRE'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000004' AND step_order = 3 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'UPDATE_STATUS_MTD_Q_RECEIVED'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000004' AND step_order = 4 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'CREATE_TASK_MTD_Q'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000004' AND step_order = 5 AND step_key IS NULL;

-- Template b005: SA_MTD_ANNUAL_EOPS (5 steps)
UPDATE public.automation_workflow_steps SET step_key = 'CREATE_JOB_MTD_EOPS'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000005' AND step_order = 1 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'SEND_MTD_EOPS_RECORDS_REQUEST'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000005' AND step_order = 2 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'WAIT_MTD_EOPS_QUESTIONNAIRE'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000005' AND step_order = 3 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'UPDATE_STATUS_MTD_EOPS_RECEIVED'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000005' AND step_order = 4 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'CREATE_TASK_MTD_EOPS'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000005' AND step_order = 5 AND step_key IS NULL;

-- Template b006: LTD_ACCOUNTS_CT_ANNUAL (7 steps)
UPDATE public.automation_workflow_steps SET step_key = 'CREATE_JOB_LTD'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000006' AND step_order = 1 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'SEND_LTD_RECORDS_REQUEST'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000006' AND step_order = 2 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'RELEASE_QUESTIONNAIRE_LTD'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000006' AND step_order = 3 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'WAIT_LTD_QUESTIONNAIRE'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000006' AND step_order = 4 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'UPDATE_STATUS_LTD_RECEIVED'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000006' AND step_order = 5 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'CREATE_TASK_PREPARE_LTD'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000006' AND step_order = 6 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'SET_SLA_TIMER_LTD'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000006' AND step_order = 7 AND step_key IS NULL;

-- Template b007: LTD_CONFIRMATION_STATEMENT (3 steps)
UPDATE public.automation_workflow_steps SET step_key = 'CREATE_JOB_CS01'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000007' AND step_order = 1 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'CREATE_TASK_PREPARE_CS01'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000007' AND step_order = 2 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'SEND_CS01_REVIEW'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000007' AND step_order = 3 AND step_key IS NULL;

-- Template b008: VAT_QUARTERLY (6 steps)
UPDATE public.automation_workflow_steps SET step_key = 'CREATE_JOB_VAT'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000008' AND step_order = 1 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'SEND_VAT_RECORDS_REQUEST'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000008' AND step_order = 2 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'WAIT_VAT_QUESTIONNAIRE'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000008' AND step_order = 3 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'UPDATE_STATUS_VAT_RECEIVED'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000008' AND step_order = 4 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'CREATE_TASK_PREPARE_VAT'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000008' AND step_order = 5 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'SET_SLA_TIMER_VAT'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000008' AND step_order = 6 AND step_key IS NULL;

-- Template b009: PAYROLL_MONTHLY (4 steps)
UPDATE public.automation_workflow_steps SET step_key = 'CREATE_JOB_PAYROLL'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000009' AND step_order = 1 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'SEND_PAYROLL_CHANGES_REQUEST'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000009' AND step_order = 2 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'WAIT_PAYROLL_PROCESSING'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000009' AND step_order = 3 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'CREATE_TASK_RUN_PAYROLL'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000009' AND step_order = 4 AND step_key IS NULL;

-- Template b010: PAYROLL_P60 (3 steps)
UPDATE public.automation_workflow_steps SET step_key = 'CREATE_JOB_P60'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000010' AND step_order = 1 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'CREATE_TASK_PREPARE_P60'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000010' AND step_order = 2 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'SEND_P60_DISTRIBUTION'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000010' AND step_order = 3 AND step_key IS NULL;

-- Template b011: CIS_MONTHLY (3 steps)
UPDATE public.automation_workflow_steps SET step_key = 'CREATE_JOB_CIS'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000011' AND step_order = 1 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'SEND_CIS_DETAILS_REQUEST'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000011' AND step_order = 2 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'CREATE_TASK_PROCESS_CIS'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000011' AND step_order = 3 AND step_key IS NULL;

-- Template b012: CGT_60_DAY (4 steps)
UPDATE public.automation_workflow_steps SET step_key = 'CREATE_JOB_CGT'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000012' AND step_order = 1 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'SEND_CGT_RECORDS_REQUEST'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000012' AND step_order = 2 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'CREATE_TASK_PREPARE_CGT'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000012' AND step_order = 3 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'SET_SLA_TIMER_CGT'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000012' AND step_order = 4 AND step_key IS NULL;

-- Template b013: CHARITY_ANNUAL (4 steps)
UPDATE public.automation_workflow_steps SET step_key = 'CREATE_JOB_CHARITY'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000013' AND step_order = 1 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'SEND_CHARITY_RECORDS_REQUEST'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000013' AND step_order = 2 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'RELEASE_QUESTIONNAIRE_CHARITY'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000013' AND step_order = 3 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'CREATE_TASK_PREPARE_CHARITY'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000013' AND step_order = 4 AND step_key IS NULL;

-- Template b014: CONVERSATION_SLA_24H (2 steps)
UPDATE public.automation_workflow_steps SET step_key = 'SET_SLA_TIMER_CONV'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000014' AND step_order = 1 AND step_key IS NULL;
UPDATE public.automation_workflow_steps SET step_key = 'CREATE_TASK_RESPOND'
  WHERE template_id = 'b0000000-0000-0000-0000-000000000014' AND step_order = 2 AND step_key IS NULL;

-- 1c. Set NOT NULL constraint and UNIQUE
ALTER TABLE public.automation_workflow_steps ALTER COLUMN step_key SET NOT NULL;
ALTER TABLE public.automation_workflow_steps ADD CONSTRAINT uq_steps_template_step_key UNIQUE (template_id, step_key);

-- ============================================================
-- 1d. Standardise WAIT_UNTIL configs to use anchor_key + offset_days
-- ============================================================

-- b001 step 1: proposal followup wait (relative to trigger, not deadline-anchored)
UPDATE public.automation_workflow_steps
  SET config = '{"anchor_key":"TRIGGERING_EVENT","offset_days":3,"label":"Wait 3 days after quote sent","min_offset_days":1,"max_offset_days":30}'::jsonb
  WHERE template_id = 'b0000000-0000-0000-0000-000000000001' AND step_key = 'WAIT_PROPOSAL_FOLLOWUP_1';

-- b001 step 3: proposal followup wait 2
UPDATE public.automation_workflow_steps
  SET config = '{"anchor_key":"TRIGGERING_EVENT","offset_days":7,"label":"Wait 7 days after quote sent","min_offset_days":1,"max_offset_days":30}'::jsonb
  WHERE template_id = 'b0000000-0000-0000-0000-000000000001' AND step_key = 'WAIT_PROPOSAL_FOLLOWUP_2';

-- b009 step 3: payroll processing wait
UPDATE public.automation_workflow_steps
  SET config = '{"anchor_key":"PAYROLL_EPS_DEADLINE","offset_days":-14,"label":"Payroll processing deadline","min_offset_days":-28,"max_offset_days":-1}'::jsonb
  WHERE template_id = 'b0000000-0000-0000-0000-000000000009' AND step_key = 'WAIT_PAYROLL_PROCESSING';

-- ============================================================
-- 1e. Insert chaser step triplets (WAIT_UNTIL + CONDITION + SEND_EMAIL)
-- ============================================================
-- Renumber existing steps to make room. We'll insert chasers AFTER the
-- initial records request / wait-for-event sequence.

-- SA_NON_MTD_ANNUAL (b003): currently 7 steps. Insert chasers after step 2 (SEND_RECORDS_REQUEST).
-- Shift steps 3-7 to 12-16 to make room for chaser triplets (steps 3-11)
UPDATE public.automation_workflow_steps SET step_order = 16
  WHERE template_id = 'b0000000-0000-0000-0000-000000000003' AND step_key = 'SET_SLA_TIMER_SA';
UPDATE public.automation_workflow_steps SET step_order = 15
  WHERE template_id = 'b0000000-0000-0000-0000-000000000003' AND step_key = 'CREATE_TASK_PREPARE_SA';
UPDATE public.automation_workflow_steps SET step_order = 14
  WHERE template_id = 'b0000000-0000-0000-0000-000000000003' AND step_key = 'UPDATE_STATUS_RECORDS_RECEIVED';
UPDATE public.automation_workflow_steps SET step_order = 13
  WHERE template_id = 'b0000000-0000-0000-0000-000000000003' AND step_key = 'WAIT_QUESTIONNAIRE_SUBMITTED';
UPDATE public.automation_workflow_steps SET step_order = 12
  WHERE template_id = 'b0000000-0000-0000-0000-000000000003' AND step_key = 'RELEASE_QUESTIONNAIRE_SA';

-- Insert SA chasers (3 triplets = 9 steps at positions 3-11)
INSERT INTO public.automation_workflow_steps (template_id, step_order, step_type, step_key, config, is_blocking, is_optional) VALUES
  -- Chase 1: 120 days before SA filing deadline
  ('b0000000-0000-0000-0000-000000000003', 3, 'WAIT_UNTIL', 'RECORDS_CHASE_1_WAIT',
   '{"anchor_key":"SA_FILING_DEADLINE","offset_days":-120,"label":"Records Chase 1","min_offset_days":-365,"max_offset_days":-7}'::jsonb, false, false),
  ('b0000000-0000-0000-0000-000000000003', 4, 'CONDITION', 'RECORDS_CHASE_1_GATE',
   '{"condition_type":"JOB_STATUS_NOT_IN","values_ref":"CHASER_STOP_STATUSES","job_context_key":"jobId"}'::jsonb, false, false),
  ('b0000000-0000-0000-0000-000000000003', 5, 'SEND_EMAIL', 'RECORDS_CHASE_1_EMAIL',
   '{"message_template_key":"SA_RECORDS_CHASE_1","to_type":"client_primary"}'::jsonb, false, false),
  -- Chase 2: 60 days before (optional)
  ('b0000000-0000-0000-0000-000000000003', 6, 'WAIT_UNTIL', 'RECORDS_CHASE_2_WAIT',
   '{"anchor_key":"SA_FILING_DEADLINE","offset_days":-60,"label":"Records Chase 2","min_offset_days":-365,"max_offset_days":-7}'::jsonb, false, true),
  ('b0000000-0000-0000-0000-000000000003', 7, 'CONDITION', 'RECORDS_CHASE_2_GATE',
   '{"condition_type":"JOB_STATUS_NOT_IN","values_ref":"CHASER_STOP_STATUSES","job_context_key":"jobId"}'::jsonb, false, true),
  ('b0000000-0000-0000-0000-000000000003', 8, 'SEND_EMAIL', 'RECORDS_CHASE_2_EMAIL',
   '{"message_template_key":"SA_RECORDS_CHASE_2","to_type":"client_primary"}'::jsonb, false, true),
  -- Final warning: 14 days before
  ('b0000000-0000-0000-0000-000000000003', 9, 'WAIT_UNTIL', 'RECORDS_FINAL_WARNING_WAIT',
   '{"anchor_key":"SA_FILING_DEADLINE","offset_days":-14,"label":"Records Final Warning","min_offset_days":-365,"max_offset_days":-1}'::jsonb, false, false),
  ('b0000000-0000-0000-0000-000000000003', 10, 'CONDITION', 'RECORDS_FINAL_WARNING_GATE',
   '{"condition_type":"JOB_STATUS_NOT_IN","values_ref":"CHASER_STOP_STATUSES","job_context_key":"jobId"}'::jsonb, false, false),
  ('b0000000-0000-0000-0000-000000000003', 11, 'SEND_EMAIL', 'RECORDS_FINAL_WARNING_EMAIL',
   '{"message_template_key":"SA_RECORDS_FINAL_WARNING","to_type":"client_primary"}'::jsonb, false, false);

-- LTD_ACCOUNTS_CT_ANNUAL (b006): Insert chasers after step 2 (SEND_LTD_RECORDS_REQUEST)
-- Shift steps 3-7 to 12-16
UPDATE public.automation_workflow_steps SET step_order = 16
  WHERE template_id = 'b0000000-0000-0000-0000-000000000006' AND step_key = 'SET_SLA_TIMER_LTD';
UPDATE public.automation_workflow_steps SET step_order = 15
  WHERE template_id = 'b0000000-0000-0000-0000-000000000006' AND step_key = 'CREATE_TASK_PREPARE_LTD';
UPDATE public.automation_workflow_steps SET step_order = 14
  WHERE template_id = 'b0000000-0000-0000-0000-000000000006' AND step_key = 'UPDATE_STATUS_LTD_RECEIVED';
UPDATE public.automation_workflow_steps SET step_order = 13
  WHERE template_id = 'b0000000-0000-0000-0000-000000000006' AND step_key = 'WAIT_LTD_QUESTIONNAIRE';
UPDATE public.automation_workflow_steps SET step_order = 12
  WHERE template_id = 'b0000000-0000-0000-0000-000000000006' AND step_key = 'RELEASE_QUESTIONNAIRE_LTD';

INSERT INTO public.automation_workflow_steps (template_id, step_order, step_type, step_key, config, is_blocking, is_optional) VALUES
  ('b0000000-0000-0000-0000-000000000006', 3, 'WAIT_UNTIL', 'RECORDS_CHASE_1_WAIT',
   '{"anchor_key":"COMPANY_ACCOUNTS_DUE_DATE","offset_days":-180,"label":"Initial Records Request","min_offset_days":-365,"max_offset_days":-14}'::jsonb, false, false),
  ('b0000000-0000-0000-0000-000000000006', 4, 'CONDITION', 'RECORDS_CHASE_1_GATE',
   '{"condition_type":"JOB_STATUS_NOT_IN","values_ref":"CHASER_STOP_STATUSES","job_context_key":"jobId"}'::jsonb, false, false),
  ('b0000000-0000-0000-0000-000000000006', 5, 'SEND_EMAIL', 'RECORDS_CHASE_1_EMAIL',
   '{"message_template_key":"LTD_RECORDS_CHASE_1","to_type":"client_primary"}'::jsonb, false, false),
  ('b0000000-0000-0000-0000-000000000006', 6, 'WAIT_UNTIL', 'RECORDS_CHASE_2_WAIT',
   '{"anchor_key":"COMPANY_ACCOUNTS_DUE_DATE","offset_days":-120,"label":"Records Chase 2","min_offset_days":-365,"max_offset_days":-14}'::jsonb, false, true),
  ('b0000000-0000-0000-0000-000000000006', 7, 'CONDITION', 'RECORDS_CHASE_2_GATE',
   '{"condition_type":"JOB_STATUS_NOT_IN","values_ref":"CHASER_STOP_STATUSES","job_context_key":"jobId"}'::jsonb, false, true),
  ('b0000000-0000-0000-0000-000000000006', 8, 'SEND_EMAIL', 'RECORDS_CHASE_2_EMAIL',
   '{"message_template_key":"LTD_RECORDS_CHASE_2","to_type":"client_primary"}'::jsonb, false, true),
  ('b0000000-0000-0000-0000-000000000006', 9, 'WAIT_UNTIL', 'RECORDS_FINAL_WARNING_WAIT',
   '{"anchor_key":"COMPANY_ACCOUNTS_DUE_DATE","offset_days":-60,"label":"Records Final Warning","min_offset_days":-365,"max_offset_days":-1}'::jsonb, false, false),
  ('b0000000-0000-0000-0000-000000000006', 10, 'CONDITION', 'RECORDS_FINAL_WARNING_GATE',
   '{"condition_type":"JOB_STATUS_NOT_IN","values_ref":"CHASER_STOP_STATUSES","job_context_key":"jobId"}'::jsonb, false, false),
  ('b0000000-0000-0000-0000-000000000006', 11, 'SEND_EMAIL', 'RECORDS_FINAL_WARNING_EMAIL',
   '{"message_template_key":"LTD_RECORDS_FINAL_WARNING","to_type":"client_primary"}'::jsonb, false, false);

-- VAT_QUARTERLY (b008): Insert chasers after step 2 (SEND_VAT_RECORDS_REQUEST)
-- Shift steps 3-6 to 12-15
UPDATE public.automation_workflow_steps SET step_order = 15
  WHERE template_id = 'b0000000-0000-0000-0000-000000000008' AND step_key = 'SET_SLA_TIMER_VAT';
UPDATE public.automation_workflow_steps SET step_order = 14
  WHERE template_id = 'b0000000-0000-0000-0000-000000000008' AND step_key = 'CREATE_TASK_PREPARE_VAT';
UPDATE public.automation_workflow_steps SET step_order = 13
  WHERE template_id = 'b0000000-0000-0000-0000-000000000008' AND step_key = 'UPDATE_STATUS_VAT_RECEIVED';
UPDATE public.automation_workflow_steps SET step_order = 12
  WHERE template_id = 'b0000000-0000-0000-0000-000000000008' AND step_key = 'WAIT_VAT_QUESTIONNAIRE';

INSERT INTO public.automation_workflow_steps (template_id, step_order, step_type, step_key, config, is_blocking, is_optional) VALUES
  -- Records chase
  ('b0000000-0000-0000-0000-000000000008', 3, 'WAIT_UNTIL', 'RECORDS_CHASE_1_WAIT',
   '{"anchor_key":"VAT_SUBMISSION_DEADLINE","offset_days":-21,"label":"VAT Records Chase","min_offset_days":-60,"max_offset_days":-3}'::jsonb, false, false),
  ('b0000000-0000-0000-0000-000000000008', 4, 'CONDITION', 'RECORDS_CHASE_1_GATE',
   '{"condition_type":"JOB_STATUS_NOT_IN","values_ref":"CHASER_STOP_STATUSES","job_context_key":"jobId"}'::jsonb, false, false),
  ('b0000000-0000-0000-0000-000000000008', 5, 'SEND_EMAIL', 'RECORDS_CHASE_1_EMAIL',
   '{"message_template_key":"VAT_RECORDS_CHASE_1","to_type":"client_primary"}'::jsonb, false, false),
  -- Submission reminder
  ('b0000000-0000-0000-0000-000000000008', 6, 'WAIT_UNTIL', 'SUBMISSION_REMINDER_WAIT',
   '{"anchor_key":"VAT_SUBMISSION_DEADLINE","offset_days":-7,"label":"Submission Reminder","min_offset_days":-30,"max_offset_days":-1}'::jsonb, false, false),
  ('b0000000-0000-0000-0000-000000000008', 7, 'CONDITION', 'SUBMISSION_REMINDER_GATE',
   '{"condition_type":"JOB_STATUS_NOT_IN","values_ref":"CHASER_STOP_STATUSES","job_context_key":"jobId"}'::jsonb, false, false),
  ('b0000000-0000-0000-0000-000000000008', 8, 'SEND_EMAIL', 'SUBMISSION_REMINDER_EMAIL',
   '{"message_template_key":"VAT_SUBMISSION_REMINDER","to_type":"client_primary"}'::jsonb, false, false),
  -- Payment reminder
  ('b0000000-0000-0000-0000-000000000008', 9, 'WAIT_UNTIL', 'PAYMENT_REMINDER_WAIT',
   '{"anchor_key":"VAT_SUBMISSION_DEADLINE","offset_days":-3,"label":"Payment Reminder","min_offset_days":-14,"max_offset_days":-1}'::jsonb, false, true),
  ('b0000000-0000-0000-0000-000000000008', 10, 'CONDITION', 'PAYMENT_REMINDER_GATE',
   '{"condition_type":"JOB_STATUS_NOT_IN","values_ref":"CHASER_STOP_STATUSES","job_context_key":"jobId"}'::jsonb, false, true),
  ('b0000000-0000-0000-0000-000000000008', 11, 'SEND_EMAIL', 'PAYMENT_REMINDER_EMAIL',
   '{"message_template_key":"VAT_PAYMENT_REMINDER","to_type":"client_primary"}'::jsonb, false, true);

-- PAYROLL_MONTHLY (b009): Insert chasers after step 2 (SEND_PAYROLL_CHANGES_REQUEST)
-- Shift steps 3-4 to 9-10
UPDATE public.automation_workflow_steps SET step_order = 10
  WHERE template_id = 'b0000000-0000-0000-0000-000000000009' AND step_key = 'CREATE_TASK_RUN_PAYROLL';
UPDATE public.automation_workflow_steps SET step_order = 9
  WHERE template_id = 'b0000000-0000-0000-0000-000000000009' AND step_key = 'WAIT_PAYROLL_PROCESSING';

INSERT INTO public.automation_workflow_steps (template_id, step_order, step_type, step_key, config, is_blocking, is_optional) VALUES
  -- EPS submission reminder
  ('b0000000-0000-0000-0000-000000000009', 3, 'WAIT_UNTIL', 'SUBMISSION_REMINDER_WAIT',
   '{"anchor_key":"PAYROLL_EPS_DEADLINE","offset_days":-5,"label":"EPS Submission Reminder","min_offset_days":-14,"max_offset_days":-1}'::jsonb, false, false),
  ('b0000000-0000-0000-0000-000000000009', 4, 'CONDITION', 'SUBMISSION_REMINDER_GATE',
   '{"condition_type":"JOB_STATUS_NOT_IN","values_ref":"CHASER_STOP_STATUSES","job_context_key":"jobId"}'::jsonb, false, false),
  ('b0000000-0000-0000-0000-000000000009', 5, 'SEND_EMAIL', 'SUBMISSION_REMINDER_EMAIL',
   '{"message_template_key":"PAYROLL_SUBMISSION_REMINDER","to_type":"client_primary"}'::jsonb, false, false),
  -- PAYE payment reminder
  ('b0000000-0000-0000-0000-000000000009', 6, 'WAIT_UNTIL', 'PAYMENT_REMINDER_WAIT',
   '{"anchor_key":"PAYROLL_PAYE_PAYMENT_DEADLINE","offset_days":-3,"label":"PAYE Payment Reminder","min_offset_days":-14,"max_offset_days":-1}'::jsonb, false, true),
  ('b0000000-0000-0000-0000-000000000009', 7, 'CONDITION', 'PAYMENT_REMINDER_GATE',
   '{"condition_type":"JOB_STATUS_NOT_IN","values_ref":"CHASER_STOP_STATUSES","job_context_key":"jobId"}'::jsonb, false, true),
  ('b0000000-0000-0000-0000-000000000009', 8, 'SEND_EMAIL', 'PAYMENT_REMINDER_EMAIL',
   '{"message_template_key":"PAYROLL_PAYMENT_REMINDER","to_type":"client_primary"}'::jsonb, false, true);

-- CIS_MONTHLY (b011): Insert chasers after step 2 (SEND_CIS_DETAILS_REQUEST)
-- Shift step 3 to 6
UPDATE public.automation_workflow_steps SET step_order = 6
  WHERE template_id = 'b0000000-0000-0000-0000-000000000011' AND step_key = 'CREATE_TASK_PROCESS_CIS';

INSERT INTO public.automation_workflow_steps (template_id, step_order, step_type, step_key, config, is_blocking, is_optional) VALUES
  ('b0000000-0000-0000-0000-000000000011', 3, 'WAIT_UNTIL', 'SUBMISSION_REMINDER_WAIT',
   '{"anchor_key":"CIS_SUBMISSION_DEADLINE","offset_days":-5,"label":"CIS Submission Reminder","min_offset_days":-14,"max_offset_days":-1}'::jsonb, false, false),
  ('b0000000-0000-0000-0000-000000000011', 4, 'CONDITION', 'SUBMISSION_REMINDER_GATE',
   '{"condition_type":"JOB_STATUS_NOT_IN","values_ref":"CHASER_STOP_STATUSES","job_context_key":"jobId"}'::jsonb, false, false),
  ('b0000000-0000-0000-0000-000000000011', 5, 'SEND_EMAIL', 'SUBMISSION_REMINDER_EMAIL',
   '{"message_template_key":"CIS_SUBMISSION_REMINDER","to_type":"client_primary"}'::jsonb, false, false);

-- ============================================================
-- 1f. Seed message templates for chaser emails
-- ============================================================
-- Check if message_templates table exists first; if not, create a minimal version
CREATE TABLE IF NOT EXISTS public.chaser_message_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL DEFAULT '',
  variables_schema jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chaser_message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read chaser templates" ON public.chaser_message_templates FOR SELECT TO authenticated USING (true);

INSERT INTO public.chaser_message_templates (key, name, subject, body_html, variables_schema) VALUES
  ('SA_RECORDS_CHASE_1', 'SA Records Chase 1', 'Reminder: We need your tax records for {{period_key}}',
   '<p>Dear {{client_name}},</p><p>This is a friendly reminder that we still need your records for your Self Assessment tax return for the period {{period_key}}. The filing deadline is {{deadline_date}}.</p><p>Please send your records at your earliest convenience.</p>',
   '[{"key":"client_name","required":true},{"key":"period_key","required":true},{"key":"deadline_date","required":true}]'::jsonb),
  ('SA_RECORDS_CHASE_2', 'SA Records Chase 2', 'Second reminder: Tax records needed for {{period_key}}',
   '<p>Dear {{client_name}},</p><p>We wrote to you previously about your Self Assessment records for {{period_key}}. We still haven''t received them. The deadline is {{deadline_date}}.</p><p>Please prioritise sending these to avoid any delays.</p>',
   '[{"key":"client_name","required":true},{"key":"period_key","required":true},{"key":"deadline_date","required":true}]'::jsonb),
  ('SA_RECORDS_FINAL_WARNING', 'SA Records Final Warning', 'URGENT: Tax records overdue — {{period_key}}',
   '<p>Dear {{client_name}},</p><p><strong>This is our final reminder.</strong> Your Self Assessment records for {{period_key}} are still outstanding. The HMRC deadline is {{deadline_date}} and we need time to prepare your return.</p><p>Please send your records immediately to avoid late filing penalties.</p>',
   '[{"key":"client_name","required":true},{"key":"period_key","required":true},{"key":"deadline_date","required":true}]'::jsonb),
  ('LTD_RECORDS_CHASE_1', 'Ltd Records Chase 1', 'Reminder: Year-end records needed for {{company_name}}',
   '<p>Dear {{client_name}},</p><p>We need your year-end records for {{company_name}} (period {{period_key}}). The accounts filing deadline is {{deadline_date}}.</p>',
   '[{"key":"client_name","required":true},{"key":"company_name","required":true},{"key":"period_key","required":true},{"key":"deadline_date","required":true}]'::jsonb),
  ('LTD_RECORDS_CHASE_2', 'Ltd Records Chase 2', 'Second reminder: Records needed for {{company_name}}',
   '<p>Dear {{client_name}},</p><p>This is our second reminder regarding the year-end records for {{company_name}}. The deadline is {{deadline_date}}.</p>',
   '[{"key":"client_name","required":true},{"key":"company_name","required":true},{"key":"period_key","required":true},{"key":"deadline_date","required":true}]'::jsonb),
  ('LTD_RECORDS_FINAL_WARNING', 'Ltd Records Final Warning', 'URGENT: Records overdue for {{company_name}}',
   '<p>Dear {{client_name}},</p><p><strong>Final reminder.</strong> We urgently need the year-end records for {{company_name}} ({{period_key}}). The Companies House deadline is {{deadline_date}}.</p>',
   '[{"key":"client_name","required":true},{"key":"company_name","required":true},{"key":"period_key","required":true},{"key":"deadline_date","required":true}]'::jsonb),
  ('VAT_RECORDS_CHASE_1', 'VAT Records Chase', 'Reminder: VAT records needed for {{period_key}}',
   '<p>Dear {{client_name}},</p><p>We need your records for your VAT return ({{period_key}}). The submission deadline is {{deadline_date}}.</p>',
   '[{"key":"client_name","required":true},{"key":"period_key","required":true},{"key":"deadline_date","required":true}]'::jsonb),
  ('VAT_SUBMISSION_REMINDER', 'VAT Submission Reminder', 'VAT return due soon — {{period_key}}',
   '<p>Dear {{client_name}},</p><p>Your VAT return for {{period_key}} is due on {{deadline_date}}. Please ensure all records are submitted.</p>',
   '[{"key":"client_name","required":true},{"key":"period_key","required":true},{"key":"deadline_date","required":true}]'::jsonb),
  ('VAT_PAYMENT_REMINDER', 'VAT Payment Reminder', 'VAT payment due — {{period_key}}',
   '<p>Dear {{client_name}},</p><p>Your VAT payment for {{period_key}} is due on {{deadline_date}}. Please ensure payment is made on time to avoid penalties.</p>',
   '[{"key":"client_name","required":true},{"key":"period_key","required":true},{"key":"deadline_date","required":true}]'::jsonb),
  ('PAYROLL_SUBMISSION_REMINDER', 'Payroll EPS Reminder', 'Payroll submission reminder — {{period_key}}',
   '<p>Dear {{client_name}},</p><p>The EPS submission deadline for {{period_key}} is {{deadline_date}}. Please confirm any payroll changes.</p>',
   '[{"key":"client_name","required":true},{"key":"period_key","required":true},{"key":"deadline_date","required":true}]'::jsonb),
  ('PAYROLL_PAYMENT_REMINDER', 'PAYE Payment Reminder', 'PAYE payment due — {{period_key}}',
   '<p>Dear {{client_name}},</p><p>Your PAYE payment for {{period_key}} is due on {{deadline_date}}.</p>',
   '[{"key":"client_name","required":true},{"key":"period_key","required":true},{"key":"deadline_date","required":true}]'::jsonb),
  ('CIS_SUBMISSION_REMINDER', 'CIS Submission Reminder', 'CIS return reminder — {{period_key}}',
   '<p>Dear {{client_name}},</p><p>The CIS return for {{period_key}} is due on {{deadline_date}}. Please send subcontractor details.</p>',
   '[{"key":"client_name","required":true},{"key":"period_key","required":true},{"key":"deadline_date","required":true}]'::jsonb)
ON CONFLICT (key) DO NOTHING;
