
-- Seed trigger contracts, library set, templates, steps, and trigger map

INSERT INTO public.automation_trigger_contracts (key, name, description, payload_schema) VALUES
  ('CLIENT_CREATED', 'Client Created', 'Fires when a new client record is created', '{"required":["client_id","org_id"]}'::jsonb),
  ('CLIENT_SERVICE_ENABLED', 'Client Service Enabled', 'Fires when a service is toggled on', '{"required":["client_id","org_id","service_type"]}'::jsonb),
  ('ENGAGEMENT_LETTER_SIGNED', 'Engagement Letter Signed', 'Fires when engagement letter is signed', '{"required":["client_id","org_id","engagement_letter_id"]}'::jsonb),
  ('QUESTIONNAIRE_SUBMITTED', 'Questionnaire Submitted', 'Fires when client submits questionnaire', '{"required":["client_id","org_id","questionnaire_id"]}'::jsonb),
  ('JOB_STATUS_CHANGED', 'Job Status Changed', 'Fires when job transitions status', '{"required":["job_id","org_id","old_status","new_status"]}'::jsonb),
  ('DEADLINE_APPROACHING', 'Deadline Approaching', 'Fires when deadline within threshold', '{"required":["deadline_id","org_id","days_remaining"]}'::jsonb),
  ('PERIOD_START', 'Period Start', 'Fires at period start', '{"required":["org_id","period_key","period_start_date"]}'::jsonb),
  ('PERIOD_END', 'Period End', 'Fires at period end', '{"required":["org_id","period_key","period_end_date"]}'::jsonb),
  ('FILING_ACCEPTED', 'Filing Accepted', 'Fires when filing accepted', '{"required":["filing_id","org_id"]}'::jsonb),
  ('CONVERSATION_RECEIVED', 'Conversation Received', 'Fires when client message received', '{"required":["conversation_id","org_id","client_id"]}'::jsonb),
  ('QUOTE_SENT', 'Quote/Proposal Sent', 'Fires when quote sent', '{"required":["quote_id","org_id"]}'::jsonb),
  ('PAYMENT_DUE_DATE_SET', 'Payment Due Date Set', 'Fires when payment due date assigned', '{"required":["invoice_id","org_id","due_date"]}'::jsonb);

INSERT INTO public.automation_library_sets (id, name, version, description, is_default) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'UK Standard Automation Library', 'v1.0.0', 'Pre-built workflow templates for UK accounting practices.', true);

INSERT INTO public.automation_workflow_templates (id, org_id, library_set_id, key, name, description, service_type, applies_to_client_types, default_enabled) VALUES
  ('b0000000-0000-0000-0000-000000000001', NULL, 'a0000000-0000-0000-0000-000000000001', 'CRM_PROPOSAL_CHASER', 'Proposal Follow-Up', 'Automated follow-up after quote', 'CRM', '{}', true),
  ('b0000000-0000-0000-0000-000000000002', NULL, 'a0000000-0000-0000-0000-000000000001', 'ONBOARDING_NEW_CLIENT', 'New Client Onboarding', 'Onboarding after engagement letter', 'ONBOARDING', '{}', true),
  ('b0000000-0000-0000-0000-000000000003', NULL, 'a0000000-0000-0000-0000-000000000001', 'SA_NON_MTD_ANNUAL', 'SA Non-MTD Annual', 'Annual SA workflow', 'SA_NON_MTD', '{SOLE_TRADER,PARTNERSHIP,INDIVIDUAL}', true),
  ('b0000000-0000-0000-0000-000000000004', NULL, 'a0000000-0000-0000-0000-000000000001', 'SA_MTD_QUARTERLY', 'SA MTD Quarterly', 'Quarterly MTD workflow', 'SA_MTD', '{SOLE_TRADER,PARTNERSHIP}', true),
  ('b0000000-0000-0000-0000-000000000005', NULL, 'a0000000-0000-0000-0000-000000000001', 'SA_MTD_ANNUAL_EOPS', 'SA MTD Annual EOPS', 'MTD EOPS and final declaration', 'SA_MTD', '{SOLE_TRADER,PARTNERSHIP}', true),
  ('b0000000-0000-0000-0000-000000000006', NULL, 'a0000000-0000-0000-0000-000000000001', 'LTD_ACCOUNTS_CT_ANNUAL', 'Ltd Accounts & CT Annual', 'Annual accounts and CT filing', 'LTD_ACCOUNTS_CT', '{LIMITED_COMPANY}', true),
  ('b0000000-0000-0000-0000-000000000007', NULL, 'a0000000-0000-0000-0000-000000000001', 'LTD_CONFIRMATION_STATEMENT', 'Confirmation Statement', 'Annual CS01 filing', 'COSEC', '{LIMITED_COMPANY}', true),
  ('b0000000-0000-0000-0000-000000000008', NULL, 'a0000000-0000-0000-0000-000000000001', 'VAT_QUARTERLY', 'VAT Quarterly Return', 'Quarterly VAT return', 'VAT', '{LIMITED_COMPANY,SOLE_TRADER,PARTNERSHIP}', true),
  ('b0000000-0000-0000-0000-000000000009', NULL, 'a0000000-0000-0000-0000-000000000001', 'PAYROLL_MONTHLY', 'Payroll Monthly', 'Monthly payroll', 'PAYROLL', '{LIMITED_COMPANY}', true),
  ('b0000000-0000-0000-0000-000000000010', NULL, 'a0000000-0000-0000-0000-000000000001', 'PAYROLL_P60', 'P60 Annual', 'Annual P60 distribution', 'PAYROLL', '{LIMITED_COMPANY}', true),
  ('b0000000-0000-0000-0000-000000000011', NULL, 'a0000000-0000-0000-0000-000000000001', 'CIS_MONTHLY', 'CIS Monthly Return', 'Monthly CIS return', 'CIS', '{LIMITED_COMPANY,SOLE_TRADER}', true),
  ('b0000000-0000-0000-0000-000000000012', NULL, 'a0000000-0000-0000-0000-000000000001', 'CGT_60_DAY', 'CGT 60-Day Report', 'CGT 60-day reporting', 'CGT_60DAY', '{INDIVIDUAL,SOLE_TRADER}', true),
  ('b0000000-0000-0000-0000-000000000013', NULL, 'a0000000-0000-0000-0000-000000000001', 'CHARITY_ANNUAL', 'Charity Annual Return', 'Annual charity return', 'CHARITY', '{CHARITY}', true),
  ('b0000000-0000-0000-0000-000000000014', NULL, 'a0000000-0000-0000-0000-000000000001', 'CONVERSATION_SLA_24H', 'Client Message SLA (24h)', '24h SLA timer', 'SLA', '{}', true);

INSERT INTO public.automation_workflow_steps (template_id, step_order, step_type, config, is_blocking, is_optional) VALUES
  ('b0000000-0000-0000-0000-000000000001',1,'WAIT_UNTIL','{"delay_days":3,"relative_to":"triggering_event"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000001',2,'SEND_EMAIL','{"message_key":"CRM_PROPOSAL_FOLLOWUP_1","to":"{{lead.email}}"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000001',3,'WAIT_UNTIL','{"delay_days":7,"relative_to":"previous_step"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000001',4,'SEND_EMAIL','{"message_key":"CRM_PROPOSAL_FOLLOWUP_2","to":"{{lead.email}}"}'::jsonb,false,true),
  ('b0000000-0000-0000-0000-000000000001',5,'CREATE_INTERNAL_TASK','{"title":"Follow up on proposal for {{lead.name}}","assigned_to":"{{assigned_staff}}"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000002',1,'SEND_EMAIL','{"message_key":"ONBOARDING_WELCOME","to":"{{client.email}}"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000002',2,'RELEASE_QUESTIONNAIRE','{"questionnaire_key":"NEW_CLIENT_INFO","to":"{{client.email}}"}'::jsonb,true,false),
  ('b0000000-0000-0000-0000-000000000002',3,'WAIT_FOR_EVENT','{"event_key":"QUESTIONNAIRE_SUBMITTED","match_rules":{"correlation_keys":["client_id"]}}'::jsonb,true,false),
  ('b0000000-0000-0000-0000-000000000002',4,'CREATE_INTERNAL_TASK','{"title":"Review onboarding for {{client.preferred_name}}","assigned_to":"{{assigned_staff}}"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000002',5,'SEND_PORTAL_MESSAGE','{"message_key":"ONBOARDING_NEXT_STEPS","to":"{{client.email}}"}'::jsonb,false,true),
  ('b0000000-0000-0000-0000-000000000003',1,'CREATE_JOB','{"job_name":"SA Tax Return {{period.label}}","service_type":"SA_NON_MTD","deadline_offset":"31 January +1Y"}'::jsonb,true,false),
  ('b0000000-0000-0000-0000-000000000003',2,'SEND_EMAIL','{"message_key":"SA_RECORDS_REQUEST","to":"{{client.email}}"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000003',3,'RELEASE_QUESTIONNAIRE','{"questionnaire_key":"SA_TAX_RETURN_INFO","to":"{{client.email}}"}'::jsonb,true,false),
  ('b0000000-0000-0000-0000-000000000003',4,'WAIT_FOR_EVENT','{"event_key":"QUESTIONNAIRE_SUBMITTED","match_rules":{"correlation_keys":["client_id","job_id"]}}'::jsonb,true,false),
  ('b0000000-0000-0000-0000-000000000003',5,'UPDATE_JOB_STATUS','{"status":"records_received"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000003',6,'CREATE_INTERNAL_TASK','{"title":"Prepare SA return {{client.preferred_name}} {{period.label}}","assigned_to":"{{assigned_staff}}"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000003',7,'SET_SLA_TIMER','{"sla_days":14,"escalation_message_key":"SA_SLA_BREACH"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000004',1,'CREATE_JOB','{"job_name":"MTD Quarterly {{period.label}}","service_type":"SA_MTD","deadline_offset":"1 month 7 days after period_end"}'::jsonb,true,false),
  ('b0000000-0000-0000-0000-000000000004',2,'SEND_EMAIL','{"message_key":"MTD_QUARTERLY_RECORDS_REQUEST","to":"{{client.email}}"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000004',3,'WAIT_FOR_EVENT','{"event_key":"QUESTIONNAIRE_SUBMITTED","match_rules":{"correlation_keys":["client_id","job_id"]}}'::jsonb,true,false),
  ('b0000000-0000-0000-0000-000000000004',4,'UPDATE_JOB_STATUS','{"status":"records_received"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000004',5,'CREATE_INTERNAL_TASK','{"title":"Process MTD quarterly {{client.preferred_name}}","assigned_to":"{{assigned_staff}}"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000005',1,'CREATE_JOB','{"job_name":"MTD EOPS {{period.label}}","service_type":"SA_MTD","deadline_offset":"31 January +1Y"}'::jsonb,true,false),
  ('b0000000-0000-0000-0000-000000000005',2,'SEND_EMAIL','{"message_key":"MTD_EOPS_RECORDS_REQUEST","to":"{{client.email}}"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000005',3,'WAIT_FOR_EVENT','{"event_key":"QUESTIONNAIRE_SUBMITTED","match_rules":{"correlation_keys":["client_id","job_id"]}}'::jsonb,true,false),
  ('b0000000-0000-0000-0000-000000000005',4,'UPDATE_JOB_STATUS','{"status":"records_received"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000005',5,'CREATE_INTERNAL_TASK','{"title":"Prepare EOPS {{client.preferred_name}} {{period.label}}","assigned_to":"{{assigned_staff}}"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000006',1,'CREATE_JOB','{"job_name":"Annual Accounts & CT {{period.label}}","service_type":"LTD_ACCOUNTS_CT","deadline_offset":"9 months after period_end"}'::jsonb,true,false),
  ('b0000000-0000-0000-0000-000000000006',2,'SEND_EMAIL','{"message_key":"LTD_RECORDS_REQUEST","to":"{{client.email}}"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000006',3,'RELEASE_QUESTIONNAIRE','{"questionnaire_key":"LTD_YEAR_END_INFO","to":"{{client.email}}"}'::jsonb,true,false),
  ('b0000000-0000-0000-0000-000000000006',4,'WAIT_FOR_EVENT','{"event_key":"QUESTIONNAIRE_SUBMITTED","match_rules":{"correlation_keys":["client_id","company_id","job_id"]}}'::jsonb,true,false),
  ('b0000000-0000-0000-0000-000000000006',5,'UPDATE_JOB_STATUS','{"status":"records_received"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000006',6,'CREATE_INTERNAL_TASK','{"title":"Prepare accounts {{company.company_name}} {{period.label}}","assigned_to":"{{assigned_staff}}"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000006',7,'SET_SLA_TIMER','{"sla_days":21,"escalation_message_key":"LTD_SLA_BREACH"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000007',1,'CREATE_JOB','{"job_name":"Confirmation Statement {{period.label}}","service_type":"COSEC","deadline_offset":"14 days after anniversary"}'::jsonb,true,false),
  ('b0000000-0000-0000-0000-000000000007',2,'CREATE_INTERNAL_TASK','{"title":"Prepare CS01 {{company.company_name}}","assigned_to":"{{assigned_staff}}"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000007',3,'SEND_EMAIL','{"message_key":"CS01_REVIEW_REQUEST","to":"{{client.email}}"}'::jsonb,false,true),
  ('b0000000-0000-0000-0000-000000000008',1,'CREATE_JOB','{"job_name":"VAT Return {{period.label}}","service_type":"VAT","deadline_offset":"1 month 7 days after period_end"}'::jsonb,true,false),
  ('b0000000-0000-0000-0000-000000000008',2,'SEND_EMAIL','{"message_key":"VAT_RECORDS_REQUEST","to":"{{client.email}}"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000008',3,'WAIT_FOR_EVENT','{"event_key":"QUESTIONNAIRE_SUBMITTED","match_rules":{"correlation_keys":["client_id","company_id","job_id"]}}'::jsonb,true,true),
  ('b0000000-0000-0000-0000-000000000008',4,'UPDATE_JOB_STATUS','{"status":"records_received"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000008',5,'CREATE_INTERNAL_TASK','{"title":"Prepare VAT {{company.company_name}} {{period.label}}","assigned_to":"{{assigned_staff}}"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000008',6,'SET_SLA_TIMER','{"sla_days":7,"escalation_message_key":"VAT_SLA_BREACH"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000009',1,'CREATE_JOB','{"job_name":"Payroll {{period.label}}","service_type":"PAYROLL","deadline_offset":"19th of following month"}'::jsonb,true,false),
  ('b0000000-0000-0000-0000-000000000009',2,'SEND_EMAIL','{"message_key":"PAYROLL_CHANGES_REQUEST","to":"{{client.email}}"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000009',3,'WAIT_UNTIL','{"delay_days":5,"relative_to":"period_end"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000009',4,'CREATE_INTERNAL_TASK','{"title":"Run payroll {{company.company_name}} {{period.label}}","assigned_to":"{{assigned_staff}}"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000010',1,'CREATE_JOB','{"job_name":"P60s {{period.label}}","service_type":"PAYROLL","deadline_offset":"31 May"}'::jsonb,true,false),
  ('b0000000-0000-0000-0000-000000000010',2,'CREATE_INTERNAL_TASK','{"title":"Prepare P60s {{company.company_name}}","assigned_to":"{{assigned_staff}}"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000010',3,'SEND_EMAIL','{"message_key":"P60_DISTRIBUTION","to":"{{client.email}}"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000011',1,'CREATE_JOB','{"job_name":"CIS Return {{period.label}}","service_type":"CIS","deadline_offset":"19th of following month"}'::jsonb,true,false),
  ('b0000000-0000-0000-0000-000000000011',2,'SEND_EMAIL','{"message_key":"CIS_SUBCONTRACTOR_DETAILS_REQUEST","to":"{{client.email}}"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000011',3,'CREATE_INTERNAL_TASK','{"title":"Process CIS {{company.company_name}} {{period.label}}","assigned_to":"{{assigned_staff}}"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000012',1,'CREATE_JOB','{"job_name":"CGT 60-Day Report","service_type":"CGT_60DAY","deadline_offset":"60 days from completion_date"}'::jsonb,true,false),
  ('b0000000-0000-0000-0000-000000000012',2,'SEND_EMAIL','{"message_key":"CGT_RECORDS_REQUEST","to":"{{client.email}}"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000012',3,'CREATE_INTERNAL_TASK','{"title":"Prepare CGT report {{client.preferred_name}}","assigned_to":"{{assigned_staff}}"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000012',4,'SET_SLA_TIMER','{"sla_days":7,"escalation_message_key":"CGT_SLA_BREACH"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000013',1,'CREATE_JOB','{"job_name":"Charity Annual Return {{period.label}}","service_type":"CHARITY","deadline_offset":"10 months after period_end"}'::jsonb,true,false),
  ('b0000000-0000-0000-0000-000000000013',2,'SEND_EMAIL','{"message_key":"CHARITY_RECORDS_REQUEST","to":"{{client.email}}"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000013',3,'RELEASE_QUESTIONNAIRE','{"questionnaire_key":"CHARITY_YEAR_END_INFO","to":"{{client.email}}"}'::jsonb,true,true),
  ('b0000000-0000-0000-0000-000000000013',4,'CREATE_INTERNAL_TASK','{"title":"Prepare charity return {{company.company_name}} {{period.label}}","assigned_to":"{{assigned_staff}}"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000014',1,'SET_SLA_TIMER','{"sla_hours":24,"escalation_message_key":"SLA_BREACH_24H"}'::jsonb,false,false),
  ('b0000000-0000-0000-0000-000000000014',2,'CREATE_INTERNAL_TASK','{"title":"Respond to {{client.preferred_name}} (SLA: 24h)","assigned_to":"{{assigned_staff}}"}'::jsonb,false,false);

-- Trigger map
INSERT INTO public.automation_workflow_trigger_map (workflow_template_id, trigger_contract_id, filter_config)
SELECT 'b0000000-0000-0000-0000-000000000001', id, '{}'::jsonb FROM automation_trigger_contracts WHERE key='QUOTE_SENT';
INSERT INTO public.automation_workflow_trigger_map (workflow_template_id, trigger_contract_id, filter_config)
SELECT 'b0000000-0000-0000-0000-000000000002', id, '{}'::jsonb FROM automation_trigger_contracts WHERE key='ENGAGEMENT_LETTER_SIGNED';
INSERT INTO public.automation_workflow_trigger_map (workflow_template_id, trigger_contract_id, filter_config)
SELECT 'b0000000-0000-0000-0000-000000000003', id, '{"service_type":"SA_NON_MTD"}'::jsonb FROM automation_trigger_contracts WHERE key='CLIENT_SERVICE_ENABLED';
INSERT INTO public.automation_workflow_trigger_map (workflow_template_id, trigger_contract_id, filter_config)
SELECT 'b0000000-0000-0000-0000-000000000004', id, '{"service_type":"SA_MTD"}'::jsonb FROM automation_trigger_contracts WHERE key='PERIOD_END';
INSERT INTO public.automation_workflow_trigger_map (workflow_template_id, trigger_contract_id, filter_config)
SELECT 'b0000000-0000-0000-0000-000000000005', id, '{"service_type":"SA_MTD","period_type":"tax_year"}'::jsonb FROM automation_trigger_contracts WHERE key='PERIOD_END';
INSERT INTO public.automation_workflow_trigger_map (workflow_template_id, trigger_contract_id, filter_config)
SELECT 'b0000000-0000-0000-0000-000000000006', id, '{"service_type":"LTD_ACCOUNTS_CT"}'::jsonb FROM automation_trigger_contracts WHERE key='CLIENT_SERVICE_ENABLED';
INSERT INTO public.automation_workflow_trigger_map (workflow_template_id, trigger_contract_id, filter_config)
SELECT 'b0000000-0000-0000-0000-000000000007', id, '{"service_type":"COSEC","period_type":"anniversary"}'::jsonb FROM automation_trigger_contracts WHERE key='PERIOD_START';
INSERT INTO public.automation_workflow_trigger_map (workflow_template_id, trigger_contract_id, filter_config)
SELECT 'b0000000-0000-0000-0000-000000000008', id, '{"service_type":"VAT","period_type":"vat_quarter"}'::jsonb FROM automation_trigger_contracts WHERE key='PERIOD_END';
INSERT INTO public.automation_workflow_trigger_map (workflow_template_id, trigger_contract_id, filter_config)
SELECT 'b0000000-0000-0000-0000-000000000009', id, '{"service_type":"PAYROLL","period_type":"monthly"}'::jsonb FROM automation_trigger_contracts WHERE key='PERIOD_END';
INSERT INTO public.automation_workflow_trigger_map (workflow_template_id, trigger_contract_id, filter_config)
SELECT 'b0000000-0000-0000-0000-000000000010', id, '{"service_type":"PAYROLL","period_type":"tax_year"}'::jsonb FROM automation_trigger_contracts WHERE key='PERIOD_END';
INSERT INTO public.automation_workflow_trigger_map (workflow_template_id, trigger_contract_id, filter_config)
SELECT 'b0000000-0000-0000-0000-000000000011', id, '{"service_type":"CIS","period_type":"monthly"}'::jsonb FROM automation_trigger_contracts WHERE key='PERIOD_END';
INSERT INTO public.automation_workflow_trigger_map (workflow_template_id, trigger_contract_id, filter_config)
SELECT 'b0000000-0000-0000-0000-000000000012', id, '{"service_type":"CGT_60DAY"}'::jsonb FROM automation_trigger_contracts WHERE key='CLIENT_SERVICE_ENABLED';
INSERT INTO public.automation_workflow_trigger_map (workflow_template_id, trigger_contract_id, filter_config)
SELECT 'b0000000-0000-0000-0000-000000000013', id, '{"service_type":"CHARITY"}'::jsonb FROM automation_trigger_contracts WHERE key='CLIENT_SERVICE_ENABLED';
INSERT INTO public.automation_workflow_trigger_map (workflow_template_id, trigger_contract_id, filter_config)
SELECT 'b0000000-0000-0000-0000-000000000014', id, '{}'::jsonb FROM automation_trigger_contracts WHERE key='CONVERSATION_RECEIVED';
