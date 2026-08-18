-- AccountancyOS — London reference-data seed.
-- Product/system reference data only. NO tenant data: every table below has no
-- organization_id/client_id/user_id column, verified against the schema.
-- Source: the verified export (sha256 28420b17...3c5321), data-only, public schema.
-- The two email addresses present are documentation placeholders in
-- template_merge_fields example values (john@example.com, hello@smithco.co.uk).
-- Apply AFTER london-baseline.sql, into empty tables.

BEGIN;

COPY public.automation_library_sets (id, name, version, description, is_default, created_at, updated_at) FROM stdin;
a0000000-0000-0000-0000-000000000001	UK Standard Automation Library	v1.0.0	Pre-built workflow templates for UK accounting practices.	t	2026-02-17 11:38:33.6988+00	2026-02-17 11:38:33.6988+00
\.

COPY public.automation_trigger_contracts (id, key, name, description, payload_schema, is_active, created_at, updated_at) FROM stdin;
9c30aa4d-94ca-405c-94c5-1d69934d7a0c	CLIENT_CREATED	Client Created	Fires when a new client record is created	{"required": ["client_id", "org_id"]}	t	2026-02-17 11:38:33.6988+00	2026-02-17 11:38:33.6988+00
9a1b81c5-1782-48b9-8e6b-7489a01e3875	CLIENT_SERVICE_ENABLED	Client Service Enabled	Fires when a service is toggled on	{"required": ["client_id", "org_id", "service_type"]}	t	2026-02-17 11:38:33.6988+00	2026-02-17 11:38:33.6988+00
63b34e9b-00ea-47df-a378-f09ffb0d9f57	ENGAGEMENT_LETTER_SIGNED	Engagement Letter Signed	Fires when engagement letter is signed	{"required": ["client_id", "org_id", "engagement_letter_id"]}	t	2026-02-17 11:38:33.6988+00	2026-02-17 11:38:33.6988+00
0e8cdb0a-9a0c-474e-8fa6-dfcb7282720d	QUESTIONNAIRE_SUBMITTED	Questionnaire Submitted	Fires when client submits questionnaire	{"required": ["client_id", "org_id", "questionnaire_id"]}	t	2026-02-17 11:38:33.6988+00	2026-02-17 11:38:33.6988+00
2ec8d717-796f-42ed-93e1-8058e49f0930	JOB_STATUS_CHANGED	Job Status Changed	Fires when job transitions status	{"required": ["job_id", "org_id", "old_status", "new_status"]}	t	2026-02-17 11:38:33.6988+00	2026-02-17 11:38:33.6988+00
619c36d5-7eb5-4b8a-b444-ea869549d0c4	DEADLINE_APPROACHING	Deadline Approaching	Fires when deadline within threshold	{"required": ["deadline_id", "org_id", "days_remaining"]}	t	2026-02-17 11:38:33.6988+00	2026-02-17 11:38:33.6988+00
7e1d900c-b5be-4407-837d-d8451c58babe	PERIOD_START	Period Start	Fires at period start	{"required": ["org_id", "period_key", "period_start_date"]}	t	2026-02-17 11:38:33.6988+00	2026-02-17 11:38:33.6988+00
7b073006-c6ec-4e3b-9fd2-f1a3f299d809	PERIOD_END	Period End	Fires at period end	{"required": ["org_id", "period_key", "period_end_date"]}	t	2026-02-17 11:38:33.6988+00	2026-02-17 11:38:33.6988+00
da18ce83-167a-4e4c-8285-5728819cab34	FILING_ACCEPTED	Filing Accepted	Fires when filing accepted	{"required": ["filing_id", "org_id"]}	t	2026-02-17 11:38:33.6988+00	2026-02-17 11:38:33.6988+00
e5eb8505-64cc-4d4a-9928-0ce8ffc89445	CONVERSATION_RECEIVED	Conversation Received	Fires when client message received	{"required": ["conversation_id", "org_id", "client_id"]}	t	2026-02-17 11:38:33.6988+00	2026-02-17 11:38:33.6988+00
2e843873-84fa-4e07-9d20-1ede31c5559a	QUOTE_SENT	Quote/Proposal Sent	Fires when quote sent	{"required": ["quote_id", "org_id"]}	t	2026-02-17 11:38:33.6988+00	2026-02-17 11:38:33.6988+00
9b7ed950-80cb-4b40-ad87-62c5de5ad21b	PAYMENT_DUE_DATE_SET	Payment Due Date Set	Fires when payment due date assigned	{"required": ["invoice_id", "org_id", "due_date"]}	t	2026-02-17 11:38:33.6988+00	2026-02-17 11:38:33.6988+00
750cd105-27b3-49ca-b82b-f3ae41b81d71	LEAD_CREATED	Lead Created	New CRM lead created	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
0037ed94-c6e6-4cbe-beab-aafe3c2244a1	LEAD_STAGE_CHANGED	Lead Stage Changed	Lead pipeline stage changed	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
09662005-3959-4d57-b0dd-3e1a6ab1a7c0	LEAD_LOST	Lead Lost	Lead marked as lost	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
610cc066-6f08-4b9d-896d-c0f8e4622c34	LEAD_DORMANT	Lead Dormant	Lead has gone dormant	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
a3012651-58c4-418d-be8c-a63fcbc0a32f	QUOTE_ACCEPTED	Quote Accepted	Client accepted a quote	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
273d96ae-97b5-44ad-a02c-5db27096c907	QUOTE_REJECTED	Quote Rejected	Client rejected a quote	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
25a92bf6-8162-48e2-9057-1a86157eea7d	ENGAGEMENT_LETTER_SENT	Engagement Letter Sent	Letter sent to client	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
bda678f7-7bbc-45a6-884f-76340166f376	KYC_STATUS_CHANGED	KYC Status Changed	KYC subject status changed	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
11025f34-ac19-4583-ab8f-add12163b7a1	HMRC_AUTH_REQUESTED	HMRC Authorisation Requested	64-8 / agent auth requested	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
2a672f39-ada1-4433-abca-cd8166a6a22f	HMRC_AUTH_COMPLETED	HMRC Authorisation Completed	HMRC authorisation completed	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
7435ae1a-dddb-4257-b8fb-6ab87fa96d00	RECORDS_REQUESTED	Records Requested	Records request sent to client	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
3bb07faa-ab37-4740-a281-82c8f4fcfbeb	RECORDS_PARTIAL	Records Partial	Some records received, others outstanding	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
0bb6af87-2435-44d6-ac41-687942d327fe	RECORDS_RECEIVED	Records Received	All records received	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
e0c73d6a-d483-42f9-b160-f93077378d44	RECORDS_VERIFIED	Records Verified	Records verified by accountant	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
dc06233b-e394-4aff-a8d7-d3e86abe4f7c	WORKPAPER_APPROVED	Workpaper Approved	Workpaper approved	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
f9b7412a-73db-46d7-9e39-623563490348	FILING_REJECTED	Filing Rejected	HMRC/CH rejected a filing	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
7b785c2b-eaf0-42f6-812c-209303038ff1	INVOICE_PAYMENT_FAILED	Invoice Payment Failed	Payment attempt failed	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
a30242ad-785d-44f7-a36a-8266fc73f778	DOCUMENT_SIGNED	Document Signed	Document signed by client	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
a289800d-d04d-4918-bc96-16068dd1062b	SERVICE_ACTIVATED	Service Activated	Service activated for a client	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
c53d52c8-1cbc-4c0e-b16c-6a240dd54605	SERVICE_DEACTIVATED	Service Deactivated	Service deactivated	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
fb90a2ee-fe3c-494e-b06d-74cc589653dd	SERVICE_FEE_CHANGED	Service Fee Changed	Service fee changed	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
4e42ce32-be65-4e54-869e-454adef1cae0	JOB_CREATED	Job Created	New job created	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
fc6bb7e3-1c89-450f-8bad-3d95958f6856	JOB_COMPLETED	Job Completed	Job marked complete	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
eedb5222-54d3-4878-b860-487967c16c2c	WORKPAPER_CREATED	Workpaper Created	New workpaper created	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
0c93a4e7-1e43-4767-b9f4-9dc8fea27e6b	WORKPAPER_LOCKED	Workpaper Locked	Workpaper locked	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
e104cd6a-962e-4fa4-a6e3-4cd5a0cd10c6	DOCUMENT_UPLOADED	Document Uploaded	Document uploaded	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
db1e4e4e-ae8c-40d1-ab32-ce04562b6778	DOCUMENT_SIGNATURE_REQUESTED	Document Signature Requested	Signature requested	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
a4ca990d-2210-4d77-8720-92aaf175d373	MESSAGE_RECEIVED	Message Received	Inbound message received	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
8095a716-33ff-4be0-8f80-2fa950d04beb	INVOICE_CREATED	Invoice Created	Invoice created	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
760f4338-9710-4647-bcc5-2e3cf2c0bf52	PAYMENT_DUE	Payment Due	Payment is due	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
65d2130c-b90a-4309-be53-9904a613fe43	CLIENT_PORTAL_INVITE_SENT	Client Portal Invite Sent	Portal invite sent	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
16e6d150-2fde-41a7-b4c9-84b7197f0158	CLIENT_ONBOARDING_STARTED	Client Onboarding Started	Onboarding started	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
8fecd81c-1408-4bed-a261-a55f6ed49103	RECORD_ITEM_STATUS_CHANGED	Record Item Status Changed	Record item status changed	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
518b1d2a-de12-4527-8af9-5061cdd0febd	CLIENT_APPROVAL_PACK_SENT	Client Approval Pack Sent	Approval pack sent	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
c0586635-b717-499e-bcbf-1ce45dc879c1	CLIENT_APPROVAL_PACK_APPROVED	Client Approval Pack Approved	Approval pack approved	{}	t	2026-05-31 22:55:39.485301+00	2026-05-31 22:55:39.485301+00
\.

COPY public.automation_workflow_steps (id, template_id, step_order, step_type, config, is_blocking, is_optional, created_at, updated_at, step_key) FROM stdin;
de376e96-ab2d-4bb9-9227-22c114aa1d72	cd35feb4-5f3f-4432-850d-a811b223d456	10	PORT_QUOTE	{}	t	f	2026-06-01 12:09:29.799219+00	2026-06-01 12:09:29.799219+00	port_quote
d23d9dd7-a73b-403c-a357-c9abffc82703	cd35feb4-5f3f-4432-850d-a811b223d456	20	START_KYC_PACK	{"subjects": []}	f	f	2026-06-01 12:09:29.799219+00	2026-06-01 12:09:29.799219+00	start_kyc_pack
1f37e752-2ac3-4404-acb7-1addd907da55	cd35feb4-5f3f-4432-850d-a811b223d456	30	SEND_EMAIL	{"to_type": "primary_contact", "message_template_key": "engagement_letter_default"}	f	f	2026-06-01 12:09:29.799219+00	2026-06-01 12:09:29.799219+00	send_engagement
cc17ea06-9c49-4158-bfb9-7018ce88e482	cd35feb4-5f3f-4432-850d-a811b223d456	40	REQUEST_HMRC_AUTH	{"tax_regime": "ITSA"}	f	t	2026-06-01 12:09:29.799219+00	2026-06-01 12:09:29.799219+00	request_hmrc_auth
\.

COPY public.automation_workflow_templates (id, org_id, library_set_id, key, name, description, service_type, applies_to_client_types, default_enabled, created_at, updated_at, definition_kind) FROM stdin;
cd35feb4-5f3f-4432-850d-a811b223d456	\N	\N	quote_to_onboarding	Quote To Onboarding	When a quote is accepted, port it into a client, request KYC, draft the engagement letter, and request HMRC authorisation.	\N	{}	t	2026-06-01 12:09:29.799219+00	2026-06-01 12:09:29.799219+00	linear
\.

COPY public.automation_workflow_trigger_map (id, workflow_template_id, trigger_contract_id, filter_config, created_at) FROM stdin;
347a299e-ca7d-4b20-8fb1-545e2233947f	cd35feb4-5f3f-4432-850d-a811b223d456	a3012651-58c4-418d-be8c-a63fcbc0a32f	{}	2026-06-01 12:09:29.799219+00
\.

COPY public.ca_rate_tables (id, effective_from, effective_to, aia_limit, wda_main_rate, wda_special_rate, full_expensing_available, full_expensing_rate, fya_50_rate, fya_zero_emission_rate, car_zero_emission_threshold, car_low_emission_max, created_at, updated_at) FROM stdin;
e8a0cbf5-ae8a-45d8-bb0b-bbc09c7c6a2b	2021-01-01	2023-03-31	1000000	0.18	0.06	f	0	0	1.0	0	50	2026-02-17 12:53:42.152411+00	2026-02-17 12:53:42.152411+00
a8d461bf-b595-4885-92d7-6e3648b2b5f7	2023-04-01	\N	1000000	0.18	0.06	t	1.0	0.5	1.0	0	50	2026-02-17 12:53:42.152411+00	2026-02-17 12:53:42.152411+00
\.

COPY public.canonical_deadline_rules (deadline_code, canonical_service_code, job_template_code, deadline_name, deadline_type, source, calculation_method, required_facts, default_visible_to_client, default_triggers_chasers, default_chaser_policy, effective_from, effective_to, notes, active, created_at, updated_at) FROM stdin;
companies_house_accounts_filing	accounts_production_ltd	ltd_accounts_production	Companies House accounts filing	filing	companies_house_api	{"fallback": "first_accounts_or_9_months_after_year_end", "api_field": "accounts_next_due", "normal_months_after_year_end": 9, "first_accounts_months_from_incorporation": 21}	{company_number,year_end,incorporation_date}	t	t	\N	1900-01-01	\N	CH API preferred; fallback 9 months after year end; first accounts 21 months from incorporation or 3 months after ARD if later.	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
accounts_records_request_internal_target	accounts_production_ltd	ltd_accounts_production	Accounts records request (internal)	internal_target	calculated	{"default_days": 90, "offset_days_before": "companies_house_accounts_filing"}	{companies_house_accounts_filing}	f	t	\N	1900-01-01	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
accounts_client_approval_target	accounts_production_ltd	ltd_accounts_production	Accounts client approval (internal)	client_approval	calculated	{"default_days": 14, "offset_days_before": "companies_house_accounts_filing"}	{companies_house_accounts_filing}	f	t	\N	1900-01-01	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
ct600_filing	corporation_tax_return	ct600_preparation_and_filing	CT600 filing	filing	calculated	{"months": 12, "add_months_to": "accounting_period_end"}	{accounting_period_end}	t	t	\N	1900-01-01	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
corporation_tax_payment	corporation_tax_return	ct600_preparation_and_filing	Corporation tax payment	payment	calculated	{"days": 1, "add_to": "accounting_period_end", "months": 9}	{accounting_period_end}	t	t	\N	1900-01-01	\N	Normal companies; large/very large pay in instalments.	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
ct600_client_approval_target	corporation_tax_return	ct600_preparation_and_filing	CT600 client approval (internal)	client_approval	calculated	{"default_days": 14, "offset_days_before": "ct600_filing"}	{ct600_filing}	f	t	\N	1900-01-01	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
confirmation_statement_due	confirmation_statement	confirmation_statement_filing	Confirmation statement due	filing	companies_house_api	{"fallback": "review_period_end_plus_14_days", "api_field": "confirmation_statement_next_due"}	{company_number,review_period_end}	t	t	\N	1900-01-01	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
sa_tax_return_filing	self_assessment_non_mtd	sa100_tax_return	SA tax return filing	filing	calculated	{"fixed_date": "31 January", "after_tax_year": true}	{tax_year}	t	t	\N	1900-01-01	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
sa_balancing_payment	self_assessment_non_mtd	sa100_tax_return	SA balancing payment	payment	calculated	{"fixed_date": "31 January", "after_tax_year": true}	{tax_year}	t	t	\N	1900-01-01	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
sa_first_payment_on_account	self_assessment_non_mtd	sa100_tax_return	SA first payment on account	payment	calculated	{"fixed_date": "31 January", "after_tax_year": true}	{tax_year}	t	t	\N	1900-01-01	\N	Where applicable based on prior year liability.	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
sa_second_payment_on_account	self_assessment_non_mtd	sa100_tax_return	SA second payment on account	payment	calculated	{"fixed_date": "31 July", "after_tax_year": true}	{tax_year}	t	t	\N	1900-01-01	\N	Where applicable based on prior year liability.	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
paper_tax_return_deadline	self_assessment_non_mtd	sa100_tax_return	Paper SA tax return filing	filing	calculated	{"fixed_date": "31 October", "after_tax_year": true}	{tax_year}	f	f	\N	1900-01-01	\N	Default disabled unless firm files paper returns.	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
mtd_itsa_q1_update	self_assessment_mtd_quarterly	mtd_itsa_quarterly_update	MTD ITSA quarter 1 update	filing	calculated	{"due_date": "7 August", "period_end": "5 July"}	{tax_year}	t	t	\N	1900-01-01	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
mtd_itsa_q2_update	self_assessment_mtd_quarterly	mtd_itsa_quarterly_update	MTD ITSA quarter 2 update	filing	calculated	{"due_date": "7 November", "period_end": "5 October"}	{tax_year}	t	t	\N	1900-01-01	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
mtd_itsa_q3_update	self_assessment_mtd_quarterly	mtd_itsa_quarterly_update	MTD ITSA quarter 3 update	filing	calculated	{"due_date": "7 February", "period_end": "5 January"}	{tax_year}	t	t	\N	1900-01-01	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
mtd_itsa_q4_update	self_assessment_mtd_quarterly	mtd_itsa_quarterly_update	MTD ITSA quarter 4 update	filing	calculated	{"due_date": "7 May", "period_end": "5 April"}	{tax_year}	t	t	\N	1900-01-01	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
mtd_itsa_final_declaration_due	mtd_itsa_final_declaration	mtd_itsa_final_declaration	MTD ITSA final declaration	filing	calculated	{"fixed_date": "31 January", "after_tax_year": true}	{tax_year}	t	t	\N	1900-01-01	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
uk_property_cgt_report_and_pay	capital_gains_tax_return	cgt_return	UK property CGT report and pay	filing	calculated	{"days": 60, "add_to": "completion_date"}	{completion_date,property_type}	t	t	\N	1900-01-01	\N	UK residential property: report and pay within 60 days of completion.	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
partnership_tax_return_filing	partnership_tax_return	sa800_partnership_tax_return	Partnership tax return filing	filing	calculated	{"fixed_date": "31 January", "after_tax_year": true}	{tax_year}	t	t	\N	1900-01-01	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
partner_statement_delivery_target	partnership_tax_return	sa800_partnership_tax_return	Partner statement delivery (internal)	internal_target	calculated	{"default_days": 30, "offset_days_before": "partnership_tax_return_filing"}	{partnership_tax_return_filing}	f	t	\N	1900-01-01	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
vat_return_filing	vat_return	vat_return_period	VAT return filing	filing	calculated	{"days": 7, "add_to": "vat_period_end", "months": 1}	{vat_period_end,vat_scheme}	t	t	\N	1900-01-01	\N	Standard scheme; annual accounting / POA use scheme-specific rules.	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
vat_payment	vat_return	vat_return_period	VAT payment	payment	calculated	{"days": 7, "add_to": "vat_period_end", "months": 1}	{vat_period_end,vat_scheme}	t	t	\N	1900-01-01	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
fps_submission	payroll	payroll_run	FPS submission	filing	calculated	{"on_or_before": "pay_date"}	{pay_date}	f	t	\N	1900-01-01	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
eps_submission	payroll	payroll_run	EPS submission	filing	calculated	{"fixed_day": 19, "month_offset": "next_tax_month"}	{tax_month_end}	f	t	\N	1900-01-01	\N	Required when EPS values apply.	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
paye_nic_payment	payroll	payroll_run	PAYE / NIC payment	payment	calculated	{"default": "electronic", "month_offset": "next_tax_month", "fixed_day_post": 19, "fixed_day_electronic": 22}	{tax_month_end}	t	t	\N	1900-01-01	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
p60_delivery	payroll	payroll_run	P60 delivery	filing	calculated	{"fixed_date": "31 May", "after_tax_year": true}	{tax_year}	t	t	\N	1900-01-01	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
p11d_filing	p11d_benefits	p11d_preparation_and_filing	P11D filing	filing	calculated	{"fixed_date": "6 July", "after_tax_year": true}	{tax_year}	t	t	\N	1900-01-01	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
class_1a_payment	p11d_benefits	p11d_preparation_and_filing	Class 1A NIC payment	payment	calculated	{"default": "electronic", "after_tax_year": true, "fixed_date_post": "19 July", "fixed_date_electronic": "22 July"}	{tax_year}	t	t	\N	1900-01-01	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
cis_return_filing	cis_monthly_return	cis_monthly_return	CIS return filing	filing	calculated	{"fixed_day": 19, "month_offset": "next_tax_month"}	{cis_period_end}	f	t	\N	1900-01-01	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
cis_payment	cis_monthly_return	cis_monthly_return	CIS payment	payment	calculated	{"default": "electronic", "month_offset": "next_tax_month", "fixed_day_post": 19, "fixed_day_electronic": 22}	{cis_period_end}	t	t	\N	1900-01-01	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
charity_commission_annual_return	charity_accounts	charity_accounts_preparation	Charity Commission annual return	filing	calculated	{"months": 10, "add_months_to": "financial_year_end"}	{financial_year_end,charity_number}	t	t	\N	1900-01-01	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
charity_accounts_to_companies_house	charity_accounts	charity_accounts_preparation	Charity accounts to Companies House	filing	companies_house_api	{"fallback": "9_months_after_year_end", "api_field": "accounts_next_due"}	{company_number,financial_year_end}	t	t	\N	1900-01-01	\N	Charitable companies only.	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
gift_aid_claim_window	gift_aid_claim	gift_aid_claim	Gift Aid claim window	renewal	calculated	{"claim_window_years": 4}	{donation_year_end}	f	f	\N	1900-01-01	\N	Warning window — claims valid for up to 4 years.	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
trust_tax_return_filing	trust_tax_return	trust_estate_tax_return	Trust / estate tax return filing	filing	calculated	{"fixed_date": "31 January", "after_tax_year": true}	{tax_year}	t	t	\N	1900-01-01	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
trust_tax_payment	trust_tax_return	trust_estate_tax_return	Trust / estate tax payment	payment	calculated	{"fixed_date": "31 January", "after_tax_year": true}	{tax_year}	t	t	\N	1900-01-01	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
\.

COPY public.canonical_job_templates (job_template_code, canonical_service_code, display_name, period_type, default_status, requires_client_records, requires_questionnaire, requires_workpaper, requires_client_approval, requires_filing, rollover_rule, active, created_at, updated_at) FROM stdin;
ltd_accounts_production	accounts_production_ltd	Limited company accounts	accounting_period	planned	t	t	t	t	t	next_accounting_period	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
ct600_preparation_and_filing	corporation_tax_return	CT600 preparation and filing	accounting_period	planned	t	t	t	t	t	next_accounting_period	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
confirmation_statement_filing	confirmation_statement	Confirmation statement filing	ad_hoc	planned	f	t	t	f	t	next_review_period	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
registered_office_mail_review	registered_office	Registered office mail review	month	planned	f	f	f	f	f	next_month	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
company_secretarial_change	company_secretarial_changes	Company secretarial change	ad_hoc	planned	t	t	t	f	t	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
sa100_tax_return	self_assessment_non_mtd	SA100 tax return	tax_year	planned	t	t	t	t	t	next_tax_year	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
mtd_itsa_quarterly_update	self_assessment_mtd_quarterly	MTD ITSA quarterly update	quarter	planned	t	t	t	f	t	next_quarter	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
mtd_itsa_final_declaration	mtd_itsa_final_declaration	MTD ITSA final declaration	tax_year	planned	t	t	t	t	t	next_tax_year	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
cgt_return	capital_gains_tax_return	CGT return	ad_hoc	planned	t	t	t	t	t	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
sa800_partnership_tax_return	partnership_tax_return	Partnership tax return SA800	tax_year	planned	t	t	t	t	t	next_tax_year	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
llp_accounts_production	llp_accounts	LLP accounts production	accounting_period	planned	t	t	t	t	t	next_accounting_period	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
vat_return_period	vat_return	VAT return	vat_period	planned	t	t	t	f	t	next_vat_period	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
vat_registration_application	vat_registration	VAT registration application	ad_hoc	planned	t	t	t	f	t	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
vat_deregistration_application	vat_deregistration	VAT deregistration application	ad_hoc	planned	t	t	t	f	t	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
final_vat_return	vat_deregistration	Final VAT return	vat_period	planned	t	t	t	f	t	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
payroll_run	payroll	Payroll run	pay_period	planned	t	t	t	f	t	next_pay_period	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
pension_submission	auto_enrolment_pension	Pension contribution submission	month	planned	t	f	t	f	t	next_month	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
auto_enrolment_redeclaration	auto_enrolment_pension	Auto-enrolment re-declaration	ad_hoc	planned	f	t	t	f	t	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
p11d_preparation_and_filing	p11d_benefits	P11D preparation and filing	tax_year	planned	t	t	t	t	t	next_tax_year	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
cis_monthly_return	cis_monthly_return	CIS monthly return	month	planned	t	t	t	f	t	next_month	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
cis_subcontractor_verification	cis_subcontractor_verification	CIS subcontractor verification	ad_hoc	planned	t	t	f	f	t	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
monthly_bookkeeping	bookkeeping	Monthly bookkeeping	month	planned	t	t	t	f	f	next_month	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
quarterly_bookkeeping	bookkeeping	Quarterly bookkeeping	quarter	planned	t	t	t	f	f	next_quarter	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
management_accounts_preparation	management_accounts	Management accounts preparation	month	planned	t	t	t	f	f	next_month	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
year_end_bookkeeping_cleanup	annual_bookkeeping_cleanup	Year-end bookkeeping cleanup	accounting_period	planned	t	t	t	f	f	next_accounting_period	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
sole_trader_accounts_preparation	sole_trader_accounts	Sole trader accounts preparation	tax_year	planned	t	t	t	f	f	next_tax_year	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
property_accounts_preparation	property_accounts_landlord	Property accounts preparation	tax_year	planned	t	t	t	f	f	next_tax_year	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
charity_accounts_preparation	charity_accounts	Charity accounts preparation	accounting_period	planned	t	t	t	t	t	next_accounting_period	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
gift_aid_claim	gift_aid_claim	Gift Aid claim	quarter	planned	t	t	t	f	t	next_quarter	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
trust_estate_tax_return	trust_tax_return	Trust / estate tax return	tax_year	planned	t	t	t	t	t	next_tax_year	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
trust_registration_or_update	trust_registration_service	Trust registration or update	ad_hoc	planned	t	t	t	f	t	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
hmrc_enquiry_response	tax_investigation_support	HMRC enquiry response	ad_hoc	planned	t	t	t	f	f	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
tax_planning_advisory	tax_planning_advisory	Tax planning advisory	ad_hoc	planned	t	t	t	f	f	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
software_setup	software_subscription	Software setup	ad_hoc	planned	f	f	f	f	f	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
software_renewal_review	software_subscription	Software renewal review	ad_hoc	planned	f	f	f	f	f	next_renewal	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
custom_advisory_job	custom_advisory	Custom advisory job	ad_hoc	planned	f	f	f	f	f	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
\.

COPY public.canonical_services (code, name, category, allowed_client_types, is_recurring, default_billing_frequency, requires_period, requires_companies_house_data, requires_hmrc_authorisation, requires_vat_settings, requires_payroll_settings, requires_completion_date, requires_property_details, creates_jobs, creates_deadlines, filing_regime, notes, active, created_at, updated_at) FROM stdin;
accounts_production_ltd	Limited company accounts production	accounts	{limited_company,llp,charity_company}	t	annual	t	t	f	f	f	f	f	t	t	companies_house	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
corporation_tax_return	Corporation tax return / CT600	tax	{limited_company,llp,charity_company}	t	annual	t	f	t	f	f	f	f	t	t	hmrc_ct	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
confirmation_statement	Confirmation statement / CS01	company_secretarial	{limited_company,llp}	t	annual	f	t	f	f	f	f	f	t	t	companies_house	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
registered_office	Registered office service	company_secretarial	{limited_company,llp,charity_company}	t	monthly	f	t	f	f	f	f	f	f	f	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
company_secretarial_changes	Company secretarial changes	company_secretarial	{limited_company,llp}	f	one_off	f	t	f	f	f	f	f	t	t	companies_house	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
self_assessment_non_mtd	Self Assessment tax return — non-MTD	personal_tax	{individual,landlord,sole_trader,director,partner}	t	annual	t	f	t	f	f	f	f	t	t	hmrc_sa	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
self_assessment_mtd_quarterly	MTD ITSA quarterly updates	personal_tax_mtd	{individual,landlord,sole_trader}	t	quarterly	t	f	t	f	f	f	f	t	t	hmrc_mtd_it	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
mtd_itsa_final_declaration	MTD ITSA final declaration	personal_tax_mtd	{individual,landlord,sole_trader}	t	annual	t	f	t	f	f	f	f	t	t	hmrc_mtd_it	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
capital_gains_tax_return	Capital gains tax return	capital_gains_tax	{individual,trust,personal_representative,non_resident}	f	one_off	f	f	t	f	f	t	t	t	t	hmrc_cgt	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
tax_advisory_personal	Personal tax advisory	advisory	{individual,landlord,sole_trader,director,partner}	f	one_off	f	f	f	f	f	f	f	t	f	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
partnership_tax_return	Partnership tax return	partnership_tax	{partnership,llp}	t	annual	t	f	t	f	f	f	f	t	t	hmrc_sa	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
llp_accounts	LLP accounts production	accounts	{llp}	t	annual	t	t	f	f	f	f	f	t	t	companies_house	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
vat_return	VAT return	vat	{limited_company,sole_trader,partnership,llp,charity}	t	quarterly	t	f	t	t	f	f	f	t	t	hmrc_mtd_vat	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
vat_registration	VAT registration	vat	{limited_company,sole_trader,partnership,llp,charity}	f	one_off	f	f	t	f	f	f	f	t	f	hmrc_vat	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
vat_deregistration	VAT deregistration	vat	{limited_company,sole_trader,partnership,llp,charity}	f	one_off	t	f	t	t	f	f	f	t	t	hmrc_vat	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
payroll	Payroll	payroll	{limited_company,sole_trader,partnership,llp,charity}	t	monthly	t	f	t	f	t	f	f	t	t	hmrc_rti	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
auto_enrolment_pension	Auto-enrolment pension compliance	payroll_pension	{limited_company,sole_trader,partnership,llp,charity}	t	monthly	t	f	f	f	t	f	f	t	t	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
p11d_benefits	P11D / benefits reporting	payroll_tax	{limited_company,sole_trader,partnership,llp,charity}	t	annual	t	f	t	f	t	f	f	t	t	hmrc_p11d	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
cis_monthly_return	CIS monthly return	cis	{limited_company,sole_trader,partnership,llp}	t	monthly	t	f	t	f	t	f	f	t	t	hmrc_cis	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
cis_subcontractor_verification	CIS subcontractor verification	cis	{limited_company,sole_trader,partnership,llp}	f	one_off	f	f	t	f	f	f	f	t	f	hmrc_cis	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
bookkeeping	Bookkeeping	bookkeeping	{limited_company,sole_trader,partnership,llp,charity,landlord}	t	monthly	t	f	f	f	f	f	f	t	t	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
management_accounts	Management accounts	management_reporting	{limited_company,sole_trader,partnership,llp}	t	monthly	t	f	f	f	f	f	f	t	t	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
annual_bookkeeping_cleanup	Year-end bookkeeping cleanup	bookkeeping	{limited_company,sole_trader,partnership,llp,charity}	t	annual	t	f	f	f	f	f	f	t	t	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
sole_trader_accounts	Sole trader accounts	accounts	{sole_trader,individual}	t	annual	t	f	f	f	f	f	f	t	t	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
property_accounts_landlord	Landlord / property accounts	property_tax	{landlord,individual,partnership}	t	annual	t	f	f	f	f	f	t	t	t	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
charity_accounts	Charity accounts	charity	{charity,charity_company,cio}	t	annual	t	t	f	f	f	f	f	t	t	charity_commission	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
gift_aid_claim	Gift Aid claim	charity_tax	{charity,charity_company,cio}	t	quarterly	t	f	t	f	f	f	f	t	t	hmrc_gift_aid	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
trust_tax_return	Trust and estate tax return	trust_tax	{trust,estate}	t	annual	t	f	t	f	f	f	f	t	t	hmrc_sa	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
trust_registration_service	Trust Registration Service	trust_compliance	{trust}	f	one_off	f	f	t	f	f	f	f	t	t	hmrc_trs	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
tax_investigation_support	HMRC enquiry / investigation support	advisory	{individual,limited_company,sole_trader,partnership,llp,charity,trust}	f	one_off	f	f	f	f	f	f	f	t	f	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
tax_planning_advisory	Tax planning advisory	advisory	{individual,limited_company,sole_trader,partnership,llp,charity,trust}	f	one_off	f	f	f	f	f	f	f	t	f	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
software_subscription	Software subscription	software	{limited_company,sole_trader,partnership,llp,charity}	t	monthly	f	f	f	f	f	f	f	f	f	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
custom_advisory	Custom advisory / other service	custom	{individual,limited_company,sole_trader,partnership,llp,charity,trust,landlord}	f	one_off	f	f	f	f	f	f	f	t	f	\N	\N	t	2026-06-21 18:08:03.566436+00	2026-06-21 18:08:03.566436+00
\.

COPY public.chaser_message_templates (id, key, name, subject, body_html, variables_schema, created_at, updated_at) FROM stdin;
5d3e6aae-1296-4940-b8f4-9a5bcb487ff7	SA_RECORDS_CHASE_1	SA Records Chase 1	Reminder: We need your tax records for {{period_key}}	<p>Dear {{client_name}},</p><p>This is a friendly reminder that we still need your records for your Self Assessment tax return for the period {{period_key}}. The filing deadline is {{deadline_date}}.</p><p>Please send your records at your earliest convenience.</p>	[{"key": "client_name", "required": true}, {"key": "period_key", "required": true}, {"key": "deadline_date", "required": true}]	2026-02-18 15:47:02.954755+00	2026-02-18 15:47:02.954755+00
8a8519f8-92bf-421e-a2c3-3ee6709ae520	SA_RECORDS_CHASE_2	SA Records Chase 2	Second reminder: Tax records needed for {{period_key}}	<p>Dear {{client_name}},</p><p>We wrote to you previously about your Self Assessment records for {{period_key}}. We still haven't received them. The deadline is {{deadline_date}}.</p><p>Please prioritise sending these to avoid any delays.</p>	[{"key": "client_name", "required": true}, {"key": "period_key", "required": true}, {"key": "deadline_date", "required": true}]	2026-02-18 15:47:02.954755+00	2026-02-18 15:47:02.954755+00
a014c944-ede2-4a9c-a411-55cbe3120298	SA_RECORDS_FINAL_WARNING	SA Records Final Warning	URGENT: Tax records overdue — {{period_key}}	<p>Dear {{client_name}},</p><p><strong>This is our final reminder.</strong> Your Self Assessment records for {{period_key}} are still outstanding. The HMRC deadline is {{deadline_date}} and we need time to prepare your return.</p><p>Please send your records immediately to avoid late filing penalties.</p>	[{"key": "client_name", "required": true}, {"key": "period_key", "required": true}, {"key": "deadline_date", "required": true}]	2026-02-18 15:47:02.954755+00	2026-02-18 15:47:02.954755+00
06546cad-84b7-44d2-b957-cc304613f7f9	LTD_RECORDS_CHASE_1	Ltd Records Chase 1	Reminder: Year-end records needed for {{company_name}}	<p>Dear {{client_name}},</p><p>We need your year-end records for {{company_name}} (period {{period_key}}). The accounts filing deadline is {{deadline_date}}.</p>	[{"key": "client_name", "required": true}, {"key": "company_name", "required": true}, {"key": "period_key", "required": true}, {"key": "deadline_date", "required": true}]	2026-02-18 15:47:02.954755+00	2026-02-18 15:47:02.954755+00
cd8c1510-d1f0-469b-9eef-ee859b46fbe3	LTD_RECORDS_CHASE_2	Ltd Records Chase 2	Second reminder: Records needed for {{company_name}}	<p>Dear {{client_name}},</p><p>This is our second reminder regarding the year-end records for {{company_name}}. The deadline is {{deadline_date}}.</p>	[{"key": "client_name", "required": true}, {"key": "company_name", "required": true}, {"key": "period_key", "required": true}, {"key": "deadline_date", "required": true}]	2026-02-18 15:47:02.954755+00	2026-02-18 15:47:02.954755+00
74f9521a-f4b5-4495-84ec-1f12f1058a80	LTD_RECORDS_FINAL_WARNING	Ltd Records Final Warning	URGENT: Records overdue for {{company_name}}	<p>Dear {{client_name}},</p><p><strong>Final reminder.</strong> We urgently need the year-end records for {{company_name}} ({{period_key}}). The Companies House deadline is {{deadline_date}}.</p>	[{"key": "client_name", "required": true}, {"key": "company_name", "required": true}, {"key": "period_key", "required": true}, {"key": "deadline_date", "required": true}]	2026-02-18 15:47:02.954755+00	2026-02-18 15:47:02.954755+00
d93723b0-24b0-47ce-9ce2-b835f4ce9f55	VAT_RECORDS_CHASE_1	VAT Records Chase	Reminder: VAT records needed for {{period_key}}	<p>Dear {{client_name}},</p><p>We need your records for your VAT return ({{period_key}}). The submission deadline is {{deadline_date}}.</p>	[{"key": "client_name", "required": true}, {"key": "period_key", "required": true}, {"key": "deadline_date", "required": true}]	2026-02-18 15:47:02.954755+00	2026-02-18 15:47:02.954755+00
ac7b81d8-4f58-4a7b-ab16-92c479f0d5e1	VAT_SUBMISSION_REMINDER	VAT Submission Reminder	VAT return due soon — {{period_key}}	<p>Dear {{client_name}},</p><p>Your VAT return for {{period_key}} is due on {{deadline_date}}. Please ensure all records are submitted.</p>	[{"key": "client_name", "required": true}, {"key": "period_key", "required": true}, {"key": "deadline_date", "required": true}]	2026-02-18 15:47:02.954755+00	2026-02-18 15:47:02.954755+00
db4ec8f9-9404-4ca6-897f-785ab4a5716b	VAT_PAYMENT_REMINDER	VAT Payment Reminder	VAT payment due — {{period_key}}	<p>Dear {{client_name}},</p><p>Your VAT payment for {{period_key}} is due on {{deadline_date}}. Please ensure payment is made on time to avoid penalties.</p>	[{"key": "client_name", "required": true}, {"key": "period_key", "required": true}, {"key": "deadline_date", "required": true}]	2026-02-18 15:47:02.954755+00	2026-02-18 15:47:02.954755+00
3800a904-938f-4caa-85d1-bcb64f160b1e	PAYROLL_SUBMISSION_REMINDER	Payroll EPS Reminder	Payroll submission reminder — {{period_key}}	<p>Dear {{client_name}},</p><p>The EPS submission deadline for {{period_key}} is {{deadline_date}}. Please confirm any payroll changes.</p>	[{"key": "client_name", "required": true}, {"key": "period_key", "required": true}, {"key": "deadline_date", "required": true}]	2026-02-18 15:47:02.954755+00	2026-02-18 15:47:02.954755+00
f00f07d4-6f03-4bb7-9021-af4231f7d184	PAYROLL_PAYMENT_REMINDER	PAYE Payment Reminder	PAYE payment due — {{period_key}}	<p>Dear {{client_name}},</p><p>Your PAYE payment for {{period_key}} is due on {{deadline_date}}.</p>	[{"key": "client_name", "required": true}, {"key": "period_key", "required": true}, {"key": "deadline_date", "required": true}]	2026-02-18 15:47:02.954755+00	2026-02-18 15:47:02.954755+00
7d32a4fc-87a1-41d6-a08c-8ed315c6024f	CIS_SUBMISSION_REMINDER	CIS Submission Reminder	CIS return reminder — {{period_key}}	<p>Dear {{client_name}},</p><p>The CIS return for {{period_key}} is due on {{deadline_date}}. Please send subcontractor details.</p>	[{"key": "client_name", "required": true}, {"key": "period_key", "required": true}, {"key": "deadline_date", "required": true}]	2026-02-18 15:47:02.954755+00	2026-02-18 15:47:02.954755+00
\.

COPY public.ct_rate_tables (id, effective_from, effective_to, main_rate, small_profits_rate, lower_limit, upper_limit, marginal_relief_fraction, created_at) FROM stdin;
86e8dedb-0e60-4232-a334-9a073939f830	2023-04-01	\N	0.2500	0.1900	50000.00	250000.00	0.015000	2025-12-14 19:20:58.125524+00
2cfaf2cd-a359-454a-a96e-56c5468436f1	2015-04-01	2023-03-31	0.1900	0.1900	0.00	0.00	0.000000	2025-12-14 19:20:58.125524+00
\.

COPY public.data_requirements (id, field_key, subject_kind, applies_entity_types, applies_service_condition, sensitivity, provider, requires_verification, authoritative_table, authoritative_column, created_at, updated_at) FROM stdin;
1208f74d-d022-47bf-8c3e-c246cdd8532b	person.nino	person	{}	\N	sensitive	client	t	company_persons	nino	2026-07-22 16:20:46.42873+00	2026-07-22 16:20:46.42873+00
eca0fb0f-ac16-4a05-9ab2-3318e839708a	person.utr	person	{}	\N	sensitive	client	t	company_persons	utr	2026-07-22 16:20:46.42873+00	2026-07-22 16:20:46.42873+00
f8e27b03-1387-4926-b324-fba0d82bf8dd	person.date_of_birth	person	{}	\N	sensitive	client	t	company_persons	date_of_birth	2026-07-22 16:20:46.42873+00	2026-07-22 16:20:46.42873+00
6f7390f6-c0cf-4570-a9bb-14dd23aa518c	person.home_address	person	{}	\N	sensitive	client	t	company_persons	residential_address_line_1	2026-07-22 16:20:46.42873+00	2026-07-22 16:20:46.42873+00
a97e895e-1395-465e-b0d5-1883cbfc1d62	company.utr	company	{}	\N	normal	client	f	companies	utr	2026-07-22 16:20:46.42873+00	2026-07-22 16:20:46.42873+00
48d3b407-5afc-4eb4-a320-f8476a1a6fa1	company.vat_number	company	{}	vat	normal	client	f	companies	vat_number	2026-07-22 16:20:46.42873+00	2026-07-22 16:20:46.42873+00
55444a69-a2bd-4c97-80c4-0b4784870ff6	company.paye_reference	company	{}	payroll	normal	client	f	paye_schemes	employer_paye_reference	2026-07-22 16:20:46.42873+00	2026-07-22 16:20:46.42873+00
06e42b4a-0474-4636-aabe-5e89ec119bcb	company.registered_office	company	{}	\N	normal	companies_house	f	companies	registered_office_address	2026-07-22 16:20:46.42873+00	2026-07-22 16:20:46.42873+00
de989c48-fb92-4194-afb3-84a0508dbdad	company.trading_address	company	{}	\N	normal	firm	f	companies	trading_address	2026-07-22 16:20:46.42873+00	2026-07-22 16:20:46.42873+00
\.

COPY public.sa_rate_tables (id, tax_year, effective_from, effective_to, personal_allowance, taper_threshold, basic_rate_limit, higher_rate_limit, basic_rate, higher_rate, additional_rate, dividend_allowance, dividend_basic_rate, dividend_higher_rate, dividend_additional_rate, savings_nil_rate_basic, savings_nil_rate_higher, class2_threshold, class2_weekly_rate, class4_lower_limit, class4_upper_limit, class4_main_rate, class4_additional_rate, cgt_basic_rate, cgt_higher_rate, cgt_residential_basic, cgt_residential_higher, cgt_annual_exempt_amount, student_loan_plan1_threshold, student_loan_plan2_threshold, student_loan_plan4_threshold, student_loan_plan5_threshold, student_loan_pg_threshold, student_loan_plan1_rate, student_loan_plan2_rate, student_loan_plan4_rate, student_loan_plan5_rate, student_loan_pg_rate, marriage_allowance_amount, hicbc_threshold, hicbc_upper_threshold, pension_annual_allowance, pension_taper_threshold, pension_taper_floor, pension_mpaa, created_at, updated_at) FROM stdin;
4e6510f7-ba49-4a2e-8c07-7fbf643f1b76	2023/24	2023-04-06	2024-04-05	12570	100000	37700	125140	0.20	0.40	0.45	1000	0.0875	0.3375	0.3935	1000	500	12570	3.45	12570	50270	0.09	0.02	0.10	0.20	0.18	0.28	6000	22015	27295	27660	25000	21000	0.09	0.09	0.09	0.09	0.06	1260	50000	60000	60000	260000	10000	10000	2026-02-17 12:53:42.152411+00	2026-02-17 12:53:42.152411+00
8162a53f-78fc-4c6a-a64e-7929b2132711	2024/25	2024-04-06	2025-04-05	12570	100000	37700	125140	0.20	0.40	0.45	500	0.0875	0.3375	0.3935	1000	500	12570	3.45	12570	50270	0.06	0.02	0.10	0.20	0.18	0.28	3000	22015	27295	27660	25000	21000	0.09	0.09	0.09	0.09	0.06	1260	60000	80000	60000	260000	10000	10000	2026-02-17 12:53:42.152411+00	2026-02-17 12:53:42.152411+00
\.

COPY public.template_merge_fields (id, field_key, field_label, field_category, description, example_value, created_at, template_types) FROM stdin;
6e8f5c57-a430-4e48-bbed-d1f084cf36d6	client.first_name	Client First Name	client	First name of the individual client	John	2025-11-26 11:36:15.262367+00	{all}
509314ad-36ae-4f48-b85e-703ecec51f22	client.last_name	Client Last Name	client	Last name of the individual client	Smith	2025-11-26 11:36:15.262367+00	{all}
3c97fdc4-2948-45f8-9c7b-4baafa928b74	client.email	Client Email	client	Email address of the client	john@example.com	2025-11-26 11:36:15.262367+00	{all}
8a03da8a-5a05-40c2-ad61-cec855d17853	client.phone	Client Phone	client	Phone number of the client	07700 900000	2025-11-26 11:36:15.262367+00	{all}
8502fae8-2ab5-4197-9773-769583978cdf	company.name	Company Name	company	Registered company name	Acme Ltd	2025-11-26 11:36:15.262367+00	{all}
5b0280c0-7a21-4839-89fc-eb108bbdbb7b	company.company_number	Company Number	company	Companies House number	12345678	2025-11-26 11:36:15.262367+00	{all}
9e60e221-8b38-4e0a-b615-49f0f8d12419	service.name	Service Name	service	Name of the service	Annual Accounts	2025-11-26 11:36:15.262367+00	{all}
17a1a3d5-19b8-4a33-a615-e635cbffa7b5	job.period_end	Job Period End	job	Period end date for the job	31/12/2024	2025-11-26 11:36:15.262367+00	{all}
121d4541-7d39-49ba-aade-413c1d99dd35	user.first_name	Staff First Name	user	First name of staff member	Sarah	2025-11-26 11:36:15.262367+00	{all}
338a858f-e7d0-4aab-b6ce-9c67012aa848	organization.name	Practice Name	organization	Name of the accounting firm	Smith & Co Accountants	2025-11-26 11:36:15.262367+00	{all}
6290fad0-e02e-4196-9281-79b6e85dcdf2	client.full_name	Client Full Name	client	Full name of the client	John Smith	2025-12-03 12:02:11.856557+00	{all}
15f9ac34-4d4b-46a9-a4e1-3d615770ed45	company.utr	Company UTR	company	Unique Taxpayer Reference	1234567890	2025-12-03 12:02:11.856557+00	{all}
753846d5-5b51-40b2-ac8b-1defe626b590	filing.type	Filing Type	filing	Type of filing	Self Assessment	2025-12-03 12:02:11.856557+00	{all}
c8a7a26e-f4f8-4ad1-a004-de4a5a290644	filing.tax_year	Tax Year	filing	Tax year for the filing	2024/25	2025-12-03 12:02:11.856557+00	{all}
697241db-7755-4f22-8846-5760d274cb2f	filing.period_start	Period Start	filing	Start of filing period	06/04/2024	2025-12-03 12:02:11.856557+00	{all}
7f31e8e1-e350-452c-b0ce-4964c28127d1	filing.period_end	Period End	filing	End of filing period	05/04/2025	2025-12-03 12:02:11.856557+00	{all}
a44111bf-a73f-4d46-b264-416ad59837a1	deadline.filing_date	Filing Deadline	deadline	Due date for filing	31/01/2026	2025-12-03 12:02:11.856557+00	{all}
e2fb2f4d-ea53-4d80-9c84-cf893190e8c9	deadline.payment_date	Payment Deadline	deadline	Due date for payment	31/01/2026	2025-12-03 12:02:11.856557+00	{all}
bacc6d19-2f17-4576-84f9-25f776ba5beb	tax.amount_due	Tax Amount Due	tax	Tax amount payable	£5,432.00	2025-12-03 12:02:11.856557+00	{all}
1de85c87-2b66-4d88-a481-94ffa82df253	tax.amount_refund	Tax Refund	tax	Tax refund due	£1,234.00	2025-12-03 12:02:11.856557+00	{all}
1b1de330-ccea-440d-a029-3be64fb6e06d	invoice.amount	Invoice Amount	invoice	Total invoice amount	£750.00	2025-12-03 12:02:11.856557+00	{all}
58932c65-fc7e-4043-9f3f-c25ccc43e7c0	invoice.due_date	Invoice Due Date	invoice	Invoice payment due date	15/12/2024	2025-12-03 12:02:11.856557+00	{all}
d0b91e5a-d823-49d3-bfb1-93acc4f92cc8	payment.reference	Payment Reference	payment	Payment reference number	INV-2024-001	2025-12-03 12:02:11.856557+00	{all}
36689878-ec45-4c30-bcb7-518e2a0e7eb6	firm.name	Firm Name	firm	Name of the accounting firm	Smith & Co	2025-12-03 12:02:11.856557+00	{all}
c2172795-4324-492a-9355-db0e7ff455a8	firm.email_signature	Email Signature	firm	Standard email signature	Best regards,\\nSmith & Co	2025-12-03 12:02:11.856557+00	{all}
bad2a6f6-c80f-4d0c-98a5-454e1ce55544	quote_number	Quote Number	quote	\N	\N	2026-06-02 22:05:46.266711+00	{quote_proposal}
8a3444e9-a34d-47f4-9210-cd6f81357e9a	quote_total	Quote Total	quote	\N	\N	2026-06-02 22:05:46.266711+00	{quote_proposal}
6068a549-5686-42f2-8e55-7f9b8c867bad	currency	Currency	quote	\N	\N	2026-06-02 22:05:46.266711+00	{quote_proposal}
bbeac4e0-c1d9-4817-8564-32a2fdcf41bb	valid_until	Valid Until	quote	\N	\N	2026-06-02 22:05:46.266711+00	{quote_proposal}
6d7899a4-8c61-4647-9d9e-be006785f931	accept_link	Accept Link	quote	\N	\N	2026-06-02 22:05:46.266711+00	{quote_proposal}
03270b5f-ece0-4d8b-af07-f888369ed2d7	quote_lines_table	Line Items Table	quote	\N	\N	2026-06-02 22:05:46.266711+00	{quote_proposal}
05cb3880-9587-4871-bd26-205f57b6985c	recipient_name	Recipient Name	quote	\N	\N	2026-06-02 22:05:46.266711+00	{quote_proposal}
592e420f-8c37-44b2-9587-9331e6493d37	practice_name	Practice Name	quote	\N	\N	2026-06-02 22:05:46.266711+00	{quote_proposal}
0672cf7c-625c-489e-b60f-5294e9f7a78f	client.portal_link	Client Portal Link	client	Link to the client portal home	https://portal.example.com/...	2026-06-02 22:22:05.047856+00	{all}
ac3c8e5d-c8e2-4bff-b23c-6db4c1c94c7e	engagement.sign_link	Engagement Sign Link	engagement	Link to sign the engagement letter	https://portal.example.com/sign/...	2026-06-02 22:22:05.047856+00	{all}
7333ebe8-bd6c-46bd-9129-7c52755c2f13	records_request.link	Records Request Link	records	Link to the active records request	https://portal.example.com/records/...	2026-06-02 22:22:05.047856+00	{all}
895e5062-839a-47bd-b866-e973944fb585	questionnaire.link	Questionnaire Link	questionnaire	Link to complete the questionnaire	https://portal.example.com/q/...	2026-06-02 22:22:05.047856+00	{all}
c8d87e6f-b40a-4691-87a1-b954243551cb	approval.link	Approval Link	workflow	Link to approve work in the portal	https://portal.example.com/approve/...	2026-06-02 22:22:05.047856+00	{all}
f29102be-f2da-4521-a35a-27b07d8e3fe4	payment.name	Payment Name	payment	Description of the payment	Self Assessment 2024/25	2026-06-02 22:22:05.047856+00	{all}
09eb6b81-aa71-4c2c-96bd-762b97515b71	payment.amount	Payment Amount	payment	Amount due	£1,234.00	2026-06-02 22:22:05.047856+00	{all}
02b1b7b5-638b-42ca-a780-36183a112ba1	payment.due_date	Payment Due Date	payment	Payment deadline	31/01/2026	2026-06-02 22:22:05.047856+00	{all}
de9683a2-541f-4b77-8460-551f870f8ec6	filing.name	Filing Name	filing	Display name of the filing	Annual Accounts FY2024	2026-06-02 22:22:05.047856+00	{all}
7f53b89b-53e2-4321-9542-cc7839755735	filing.submission_reference	Submission Reference	filing	Reference returned by HMRC or Companies House	HMRC-REF-12345	2026-06-02 22:22:05.047856+00	{all}
554237cd-7b1d-4511-8726-d994d85dbc9f	filing.submission_date	Submission Date	filing	Date the filing was submitted	01/06/2026	2026-06-02 22:22:05.047856+00	{all}
b332201c-7f85-48c2-ad7e-9c3e13b11860	job.name	Job Name	job	Display name of the job	Annual Accounts 2024	2026-06-02 22:22:05.047856+00	{all}
c4153cc4-6030-4c37-a33f-ff398b56cc5b	organization.email	Practice Email	organization	Primary contact email for the practice	hello@smithco.co.uk	2026-06-02 22:22:05.047856+00	{all}
cb688195-7300-473d-9db2-7dd487903831	organization.phone	Practice Phone	organization	Primary contact phone for the practice	020 1234 5678	2026-06-02 22:22:05.047856+00	{all}
\.

COMMIT;
