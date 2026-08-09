/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Source:     supabase/migrations/*.sql (replayed in order, honouring DROP CONSTRAINT)
 * Generator:  scripts/generate-db-vocabulary.py
 * Regenerate: python3 scripts/generate-db-vocabulary.py
 * Enforced by: src/test/regression/vocabulary-registry.test.ts
 *
 * This is the canonical vocabulary of every CHECK-constrained column in the database.
 * It replaces guesswork and hand-copied string literals, which produced DEF-026 (the bills
 * UI filtered on `VOID` after the constraint had moved to `VOIDED`) and the CHECK-violation
 * cluster (functions writing status literals no constraint permits).
 *
 * READ `allowed`, NOT `constraints[n].values`.
 *
 * A column may carry several live CHECK constraints. Postgres enforces every one of them,
 * so the writable set is their INTERSECTION. Reading a single constraint is how a value
 * comes to look legal while being rejected at runtime — `unreachable` lists exactly those
 * values: declared by at least one constraint, forbidden by another, writable by nobody.
 * A non-empty `unreachable` is a schema defect, not a feature.
 */

export interface DbCheckConstraint {
  /** Exact Postgres constraint name. */
  readonly name: string;
  /** Values this one constraint permits. */
  readonly values: readonly string[];
  /** Migration that last defined it. */
  readonly migration: string;
}

export interface DbColumnVocabulary {
  readonly table: string;
  readonly column: string;
  /** Every live CHECK constraint on this column. */
  readonly constraints: readonly DbCheckConstraint[];
  /** Values permitted by ALL live constraints. This is what you may write. */
  readonly allowed: readonly string[];
  /** Declared by one constraint, forbidden by another. Writable by nobody. */
  readonly unreachable: readonly string[];
}


export const DB_CHECK_VOCABULARIES: readonly DbColumnVocabulary[] = [
  {
    table: "accounts_model_snapshots",
    column: "status",
    constraints: [
      { name: "accounts_model_snapshots_status_check", values: ["accepted", "approved", "draft", "rejected", "submitted"], migration: "20251214183122_29b44e21-74c0-421f-b785-5a9464f9df28.sql" },
    ],
    allowed: ["accepted", "approved", "draft", "rejected", "submitted"],
    unreachable: [],
  },
  {
    table: "approval_revocation_log",
    column: "approval_scope",
    constraints: [
      { name: "approval_revocation_log_approval_scope_check", values: ["ACCOUNTS", "CT600"], migration: "20251214202222_903b8ad4-31b4-4b54-a1a9-a10aa7c0421d.sql" },
    ],
    allowed: ["ACCOUNTS", "CT600"],
    unreachable: [],
  },
  {
    table: "approval_revocation_log",
    column: "revocation_reason",
    constraints: [
      { name: "approval_revocation_log_revocation_reason_check", values: ["CT_COMPUTATION_CHANGED", "ENTITY_DATA_CHANGED", "FILING_AMENDED", "MANUAL_REVOCATION", "SNAPSHOT_SUPERSEDED", "UNDERLYING_ACCOUNTS_CHANGED"], migration: "20251214202222_903b8ad4-31b4-4b54-a1a9-a10aa7c0421d.sql" },
    ],
    allowed: ["CT_COMPUTATION_CHANGED", "ENTITY_DATA_CHANGED", "FILING_AMENDED", "MANUAL_REVOCATION", "SNAPSHOT_SUPERSEDED", "UNDERLYING_ACCOUNTS_CHANGED"],
    unreachable: [],
  },
  {
    table: "automation_chaser_messages",
    column: "status",
    constraints: [
      { name: "automation_chaser_messages_status_check", values: ["CANCELLED", "FAILED", "QUEUED", "SENT"], migration: "20260218200259_7f91076b-6cce-46e2-9b22-b3a9f810948d.sql" },
    ],
    allowed: ["CANCELLED", "FAILED", "QUEUED", "SENT"],
    unreachable: [],
  },
  {
    table: "automation_chaser_policies",
    column: "frequency_unit",
    constraints: [
      { name: "automation_chaser_policies_frequency_unit_check", values: ["DAY", "MONTH", "WEEK"], migration: "20260218200259_7f91076b-6cce-46e2-9b22-b3a9f810948d.sql" },
    ],
    allowed: ["DAY", "MONTH", "WEEK"],
    unreachable: [],
  },
  {
    table: "automation_chaser_policies",
    column: "scope",
    constraints: [
      { name: "automation_chaser_policies_scope_check", values: ["all_records", "new_records"], migration: "20260531225541_2b0991ac-14a5-4fff-b2c8-d772504f3fbc.sql" },
    ],
    allowed: ["all_records", "new_records"],
    unreachable: [],
  },
  {
    table: "automation_chaser_policies",
    column: "send_mode",
    constraints: [
      { name: "automation_chaser_policies_send_mode_check", values: ["auto", "disabled", "draft", "task_only"], migration: "20260531225541_2b0991ac-14a5-4fff-b2c8-d772504f3fbc.sql" },
    ],
    allowed: ["auto", "disabled", "draft", "task_only"],
    unreachable: [],
  },
  {
    table: "automation_chaser_policies",
    column: "trigger_type",
    constraints: [
      { name: "automation_chaser_policies_trigger_type_check", values: ["CLIENT_ONBOARDED", "COMPANY_YEAR_END", "DEADLINE_APPROACHING", "ENGAGEMENT_LETTER_SENT", "HMRC_AUTH_REQUESTED", "INBOUND_MESSAGE_RECEIVED", "INVOICE_OVERDUE", "JOB_CREATED", "KYC_STATUS_CHANGED", "LEAD_CREATED", "MANUAL", "MTD_QUARTER_END", "QUESTIONNAIRE_SENT", "QUOTE_SENT", "RECORDS_REQUESTED", "SERVICE_ACTIVATED", "SIGNATURE_REQUESTED", "TAX_YEAR_END", "VAT_PERIOD_END", "WORKPAPER_CREATED"], migration: "20260601174147_cd4b2598-481e-4806-9aab-bc5eff5b31d6.sql" },
    ],
    allowed: ["CLIENT_ONBOARDED", "COMPANY_YEAR_END", "DEADLINE_APPROACHING", "ENGAGEMENT_LETTER_SENT", "HMRC_AUTH_REQUESTED", "INBOUND_MESSAGE_RECEIVED", "INVOICE_OVERDUE", "JOB_CREATED", "KYC_STATUS_CHANGED", "LEAD_CREATED", "MANUAL", "MTD_QUARTER_END", "QUESTIONNAIRE_SENT", "QUOTE_SENT", "RECORDS_REQUESTED", "SERVICE_ACTIVATED", "SIGNATURE_REQUESTED", "TAX_YEAR_END", "VAT_PERIOD_END", "WORKPAPER_CREATED"],
    unreachable: [],
  },
  {
    table: "automation_chaser_runs",
    column: "status",
    constraints: [
      { name: "automation_chaser_runs_status_check", values: ["ACTIVE", "PAUSED", "STOPPED"], migration: "20260218200259_7f91076b-6cce-46e2-9b22-b3a9f810948d.sql" },
    ],
    allowed: ["ACTIVE", "PAUSED", "STOPPED"],
    unreachable: [],
  },
  {
    table: "automation_engine_switches",
    column: "engine",
    constraints: [
      { name: "automation_engine_switches_engine_check", values: ["executor", "router"], migration: "20260717203515_b7c03bdb-fd9d-4fb4-a288-6893f2a5c590.sql" },
    ],
    allowed: ["executor", "router"],
    unreachable: [],
  },
  {
    table: "automation_executions",
    column: "status",
    constraints: [
      { name: "automation_executions_status_check", values: ["failed", "pending", "running", "success"], migration: "20251208140717_87cd71f5-3454-4a1c-aa63-5b56f13eb50f.sql" },
    ],
    allowed: ["failed", "pending", "running", "success"],
    unreachable: [],
  },
  {
    table: "automation_pauses",
    column: "scope",
    constraints: [
      { name: "automation_pauses_scope_check", values: ["chaser_policy", "client", "job", "org", "rule", "workflow_template"], migration: "20260531225541_2b0991ac-14a5-4fff-b2c8-d772504f3fbc.sql" },
    ],
    allowed: ["chaser_policy", "client", "job", "org", "rule", "workflow_template"],
    unreachable: [],
  },
  {
    table: "automation_rate_limits",
    column: "window_type",
    constraints: [
      { name: "automation_rate_limits_window_type_check", values: ["day", "hour"], migration: "20251217142032_b8113a6b-8109-4ab5-bb49-76b9d46a87c0.sql" },
    ],
    allowed: ["day", "hour"],
    unreachable: [],
  },
  {
    table: "automation_rules",
    column: "email_mode",
    constraints: [
      { name: "automation_rules_email_mode_check", values: ["draft_by_default", "send_by_default"], migration: "20251217154236_99d79bb6-ee61-459f-86ba-3f3f0986ccac.sql" },
    ],
    allowed: ["draft_by_default", "send_by_default"],
    unreachable: [],
  },
  {
    table: "automation_rules",
    column: "scope",
    constraints: [
      { name: "automation_rules_scope_check", values: ["all_records", "new_records"], migration: "20260531225541_2b0991ac-14a5-4fff-b2c8-d772504f3fbc.sql" },
    ],
    allowed: ["all_records", "new_records"],
    unreachable: [],
  },
  {
    table: "automation_rules",
    column: "send_mode",
    constraints: [
      { name: "automation_rules_send_mode_check", values: ["auto", "disabled", "draft", "task_only"], migration: "20260531225541_2b0991ac-14a5-4fff-b2c8-d772504f3fbc.sql" },
    ],
    allowed: ["auto", "disabled", "draft", "task_only"],
    unreachable: [],
  },
  {
    table: "automation_workflow_instances",
    column: "status",
    constraints: [
      { name: "automation_workflow_instances_status_check", values: ["CANCELLED", "COMPLETED", "FAILED", "PAUSED", "QUEUED", "RUNNING", "WAITING"], migration: "20260722112349_1ec4f463-f0e3-4f7b-9e55-77b5c4c5fd19.sql" },
    ],
    allowed: ["CANCELLED", "COMPLETED", "FAILED", "PAUSED", "QUEUED", "RUNNING", "WAITING"],
    unreachable: [],
  },
  {
    table: "automation_workflow_templates",
    column: "definition_kind",
    constraints: [
      { name: "automation_workflow_templates_definition_kind_check", values: ["branching", "linear"], migration: "20260601064530_b35c29d8-ddda-46b2-b276-5128d2dd26ef.sql" },
    ],
    allowed: ["branching", "linear"],
    unreachable: [],
  },
  {
    table: "bank_rules",
    column: "source",
    constraints: [
      { name: "bank_rules_source_check", values: ["accountant", "portal", "system"], migration: "20260609102215_6814cdf9-2b5c-49a4-b08b-9abcb48a6feb.sql" },
    ],
    allowed: ["accountant", "portal", "system"],
    unreachable: [],
  },
  {
    table: "bank_sync_logs",
    column: "status",
    constraints: [
      { name: "bank_sync_logs_status_check", values: ["failed", "partial", "running", "success"], migration: "20260608123906_6a60a02c-09fd-493d-a6fd-3d2a5acc9bc2.sql" },
    ],
    allowed: ["failed", "partial", "running", "success"],
    unreachable: [],
  },
  {
    table: "bank_sync_logs",
    column: "triggered_by",
    constraints: [
      { name: "bank_sync_logs_triggered_by_check", values: ["callback", "manual", "reconnect", "scheduled"], migration: "20260608123906_6a60a02c-09fd-493d-a6fd-3d2a5acc9bc2.sql" },
    ],
    allowed: ["callback", "manual", "reconnect", "scheduled"],
    unreachable: [],
  },
  {
    table: "bill_lines",
    column: "payment_status",
    constraints: [
      { name: "bill_lines_payment_status_check", values: ["PAID", "PART_PAID", "UNPAID"], migration: "20251214171844_40398d4b-bf1d-44a7-829f-5704a60cdbba.sql" },
    ],
    allowed: ["PAID", "PART_PAID", "UNPAID"],
    unreachable: [],
  },
  {
    table: "bill_payments",
    column: "payment_type",
    constraints: [
      { name: "bill_payments_payment_type_check", values: ["normal", "overpayment", "prepayment", "refund"], migration: "20251205140338_97e45441-8be4-4be2-af72-8b275156e892.sql" },
    ],
    allowed: ["normal", "overpayment", "prepayment", "refund"],
    unreachable: [],
  },
  {
    table: "bills",
    column: "status",
    constraints: [
      { name: "bills_status_check", values: ["APPROVED", "AWAITING_PAYMENT", "DRAFT", "OVERDUE", "PAID", "PART_PAID", "VOIDED"], migration: "20260806083329_92ddc200-e321-4931-a954-0d248d5b7d6b.sql" },
    ],
    allowed: ["APPROVED", "AWAITING_PAYMENT", "DRAFT", "OVERDUE", "PAID", "PART_PAID", "VOIDED"],
    unreachable: [],
  },
  {
    table: "bookkeeping_accounts",
    column: "ct_addback_category",
    constraints: [
      { name: "bookkeeping_accounts_ct_addback_category_check", values: ["amortisation", "capital_expenditure", "depreciation", "donations_non_qualifying", "entertaining", "fines_penalties", "legal_non_trade", "other_disallowable", "personal_expenses", "provisions"], migration: "20260217173506_1c5c204b-c2c2-42f6-ad43-9bb74815cb22.sql" },
    ],
    allowed: ["amortisation", "capital_expenditure", "depreciation", "donations_non_qualifying", "entertaining", "fines_penalties", "legal_non_trade", "other_disallowable", "personal_expenses", "provisions"],
    unreachable: [],
  },
  {
    table: "bookkeeping_accounts",
    column: "tax_allowability",
    constraints: [
      { name: "bookkeeping_accounts_tax_allowability_check", values: ["capital", "disallowable", "fully_allowable", "not_applicable", "partially_allowable"], migration: "20260217173506_1c5c204b-c2c2-42f6-ad43-9bb74815cb22.sql" },
    ],
    allowed: ["capital", "disallowable", "fully_allowable", "not_applicable", "partially_allowable"],
    unreachable: [],
  },
  {
    table: "bookkeeping_accounts",
    column: "vat_treatment",
    constraints: [
      { name: "bookkeeping_accounts_vat_treatment_check", values: ["exempt", "not_applicable", "outside_scope", "reduced", "reverse_charge", "standard", "zero_rated"], migration: "20260217173506_1c5c204b-c2c2-42f6-ad43-9bb74815cb22.sql" },
    ],
    allowed: ["exempt", "not_applicable", "outside_scope", "reduced", "reverse_charge", "standard", "zero_rated"],
    unreachable: [],
  },
  {
    table: "bookkeeping_queries",
    column: "status",
    constraints: [
      { name: "bookkeeping_queries_status_check", values: ["answered", "closed", "open", "resolved"], migration: "20260608112113_07411be4-f36b-4e48-a5f9-1d56eb2e7a3b.sql" },
    ],
    allowed: ["answered", "closed", "open", "resolved"],
    unreachable: [],
  },
  {
    table: "capital_allowance_claims",
    column: "claim_type",
    constraints: [
      { name: "capital_allowance_claims_claim_type_check", values: ["AIA", "BALANCING_ALLOWANCE", "BALANCING_CHARGE", "FULL_EXPENSING", "FYA_100", "FYA_50", "WDA"], migration: "20251214183122_29b44e21-74c0-421f-b785-5a9464f9df28.sql" },
    ],
    allowed: ["AIA", "BALANCING_ALLOWANCE", "BALANCING_CHARGE", "FULL_EXPENSING", "FYA_100", "FYA_50", "WDA"],
    unreachable: [],
  },
  {
    table: "capital_allowance_periods",
    column: "status",
    constraints: [
      { name: "capital_allowance_periods_status_check", values: ["approved", "calculated", "draft", "filed"], migration: "20251214183122_29b44e21-74c0-421f-b785-5a9464f9df28.sql" },
    ],
    allowed: ["approved", "calculated", "draft", "filed"],
    unreachable: [],
  },
  {
    table: "capital_allowance_pools",
    column: "pool_type",
    constraints: [
      { name: "capital_allowance_pools_pool_type_check", values: ["MAIN", "SINGLE_ASSET", "SPECIAL_RATE"], migration: "20251214183122_29b44e21-74c0-421f-b785-5a9464f9df28.sql" },
    ],
    allowed: ["MAIN", "SINGLE_ASSET", "SPECIAL_RATE"],
    unreachable: [],
  },
  {
    table: "cgt_disposals",
    column: "asset_type",
    constraints: [
      { name: "cgt_disposals_asset_type_check", values: ["crypto", "other", "property", "shares"], migration: "20260217165747_62d29c7c-c125-4af5-8b19-aa601d50b241.sql" },
    ],
    allowed: ["crypto", "other", "property", "shares"],
    unreachable: [],
  },
  {
    table: "chaser_job_periods",
    column: "entity_type",
    constraints: [
      { name: "chaser_job_periods_entity_type_check", values: ["client", "company"], migration: "20260218200259_7f91076b-6cce-46e2-9b22-b3a9f810948d.sql" },
    ],
    allowed: ["client", "company"],
    unreachable: [],
  },
  {
    table: "cis_payments",
    column: "status",
    constraints: [
      { name: "cis_payments_status_check", values: ["included_in_return", "paid", "recorded"], migration: "20251204132126_60114b6f-52d6-4502-a15b-a17d2539650d.sql" },
    ],
    allowed: ["included_in_return", "paid", "recorded"],
    unreachable: [],
  },
  {
    table: "cis_returns",
    column: "status",
    constraints: [
      { name: "cis_returns_status_check", values: ["accepted", "draft", "ready", "rejected", "submitted"], migration: "20251204132126_60114b6f-52d6-4502-a15b-a17d2539650d.sql" },
    ],
    allowed: ["accepted", "draft", "ready", "rejected", "submitted"],
    unreachable: [],
  },
  {
    table: "cis_subcontractors",
    column: "deduction_rate",
    constraints: [
      { name: "cis_subcontractors_deduction_rate_check", values: ["gross", "higher", "standard"], migration: "20251204132126_60114b6f-52d6-4502-a15b-a17d2539650d.sql" },
    ],
    allowed: ["gross", "higher", "standard"],
    unreachable: [],
  },
  {
    table: "cis_subcontractors",
    column: "verification_status",
    constraints: [
      { name: "cis_subcontractors_verification_status_check", values: ["failed", "unverified", "verified"], migration: "20251204132126_60114b6f-52d6-4502-a15b-a17d2539650d.sql" },
    ],
    allowed: ["failed", "unverified", "verified"],
    unreachable: [],
  },
  {
    table: "client_approval_packs",
    column: "status",
    constraints: [
      { name: "client_approval_packs_status_check", values: ["approved", "draft", "rejected", "sent", "superseded", "viewed", "withdrawn"], migration: "20260531225541_2b0991ac-14a5-4fff-b2c8-d772504f3fbc.sql" },
    ],
    allowed: ["approved", "draft", "rejected", "sent", "superseded", "viewed", "withdrawn"],
    unreachable: [],
  },
  {
    table: "client_messages",
    column: "message_type",
    constraints: [
      { name: "client_messages_message_type_check", values: ["email", "message", "note", "system_event"], migration: "20251126113616_c803a14b-c299-4c16-9a4c-78b6f60d53a5.sql" },
    ],
    allowed: ["email", "message", "note", "system_event"],
    unreachable: [],
  },
  {
    table: "client_messages",
    column: "sender_type",
    constraints: [
      { name: "client_messages_sender_type_check", values: ["client", "staff", "system"], migration: "20251126113616_c803a14b-c299-4c16-9a4c-78b6f60d53a5.sql" },
    ],
    allowed: ["client", "staff", "system"],
    unreachable: [],
  },
  {
    table: "client_messages",
    column: "visibility",
    constraints: [
      { name: "client_messages_visibility_check", values: ["client_visible", "internal_only"], migration: "20251126113616_c803a14b-c299-4c16-9a4c-78b6f60d53a5.sql" },
    ],
    allowed: ["client_visible", "internal_only"],
    unreachable: [],
  },
  {
    table: "client_tasks",
    column: "status",
    constraints: [
      { name: "client_tasks_status_check", values: ["complete", "in_progress", "not_started"], migration: "20251126113616_c803a14b-c299-4c16-9a4c-78b6f60d53a5.sql" },
    ],
    allowed: ["complete", "in_progress", "not_started"],
    unreachable: [],
  },
  {
    table: "client_tasks",
    column: "visibility",
    constraints: [
      { name: "client_tasks_visibility_check", values: ["client_visible", "internal_only"], migration: "20251126113616_c803a14b-c299-4c16-9a4c-78b6f60d53a5.sql" },
    ],
    allowed: ["client_visible", "internal_only"],
    unreachable: [],
  },
  {
    table: "client_tax_authorisations",
    column: "status",
    constraints: [
      { name: "client_tax_authorisations_status_check", values: ["authorised", "client_authenticating", "code_sent", "expired", "not_requested", "rejected", "requested", "revoked"], migration: "20260531225541_2b0991ac-14a5-4fff-b2c8-d772504f3fbc.sql" },
    ],
    allowed: ["authorised", "client_authenticating", "code_sent", "expired", "not_requested", "rejected", "requested", "revoked"],
    unreachable: [],
  },
  {
    table: "client_tax_authorisations",
    column: "tax_service_type",
    constraints: [
      { name: "client_tax_authorisations_tax_service_type_check", values: ["CIS", "CT", "MTD_IT", "MTD_VAT", "PARTNERSHIP", "PAYE", "SA", "TRUST", "VAT"], migration: "20260531225541_2b0991ac-14a5-4fff-b2c8-d772504f3fbc.sql" },
    ],
    allowed: ["CIS", "CT", "MTD_IT", "MTD_VAT", "PARTNERSHIP", "PAYE", "SA", "TRUST", "VAT"],
    unreachable: [],
  },
  {
    table: "clients",
    column: "status",
    constraints: [
      { name: "clients_status_check", values: ["active", "archived", "disengaged", "pending"], migration: "20251201222625_7c546b89-c9fd-4973-92f4-b0c696537825.sql" },
    ],
    allowed: ["active", "archived", "disengaged", "pending"],
    unreachable: [],
  },
  {
    table: "companies",
    column: "status",
    constraints: [
      { name: "companies_status_check", values: ["active", "archived", "disengaged", "pending"], migration: "20251201222625_7c546b89-c9fd-4973-92f4-b0c696537825.sql" },
    ],
    allowed: ["active", "archived", "disengaged", "pending"],
    unreachable: [],
  },
  {
    table: "companies",
    column: "vat_frequency",
    constraints: [
      { name: "companies_vat_frequency_check", values: ["ANNUAL", "MONTHLY", "QUARTERLY"], migration: "20251127002312_aa391640-7e71-48d4-8f60-7721fa83c3e8.sql" },
    ],
    allowed: ["ANNUAL", "MONTHLY", "QUARTERLY"],
    unreachable: [],
  },
  {
    table: "companies",
    column: "vat_scheme",
    constraints: [
      { name: "companies_vat_scheme_check", values: ["ANNUAL_ACCOUNTING", "CASH_ACCOUNTING", "FLAT_RATE", "NONE", "STANDARD"], migration: "20251127002312_aa391640-7e71-48d4-8f60-7721fa83c3e8.sql" },
    ],
    allowed: ["ANNUAL_ACCOUNTING", "CASH_ACCOUNTING", "FLAT_RATE", "NONE", "STANDARD"],
    unreachable: [],
  },
  {
    table: "companies_house_diff_staging",
    column: "status",
    constraints: [
      { name: "companies_house_diff_staging_status_check", values: ["accepted", "pending", "rejected", "superseded"], migration: "20260601064530_b35c29d8-ddda-46b2-b276-5128d2dd26ef.sql" },
    ],
    allowed: ["accepted", "pending", "rejected", "superseded"],
    unreachable: [],
  },
  {
    table: "company_officers",
    column: "role",
    constraints: [
      { name: "company_officers_role_check", values: ["director", "llp_designated_member", "llp_member", "secretary"], migration: "20251204014132_eafd2f20-4528-4ce2-8f60-5ff30ef1ef08.sql" },
    ],
    allowed: ["director", "llp_designated_member", "llp_member", "secretary"],
    unreachable: [],
  },
  {
    table: "company_register_events",
    column: "event_type",
    constraints: [
      { name: "company_register_events_event_type_check", values: ["allotment", "appointment", "ch_sync", "confirmation_statement_filed", "psc_added", "psc_ceased", "psc_updated", "registered_office_changed", "resignation", "share_class_created", "share_class_updated", "sic_codes_changed", "termination", "transfer"], migration: "20251204014132_eafd2f20-4528-4ce2-8f60-5ff30ef1ef08.sql" },
    ],
    allowed: ["allotment", "appointment", "ch_sync", "confirmation_statement_filed", "psc_added", "psc_ceased", "psc_updated", "registered_office_changed", "resignation", "share_class_created", "share_class_updated", "sic_codes_changed", "termination", "transfer"],
    unreachable: [],
  },
  {
    table: "company_register_events",
    column: "source",
    constraints: [
      { name: "company_register_events_source_check", values: ["ch_sync", "manual", "migration", "workpaper"], migration: "20251204014132_eafd2f20-4528-4ce2-8f60-5ff30ef1ef08.sql" },
    ],
    allowed: ["ch_sync", "manual", "migration", "workpaper"],
    unreachable: [],
  },
  {
    table: "connected_mailboxes",
    column: "mailbox_type",
    constraints: [
      { name: "connected_mailboxes_mailbox_type_check", values: ["personal", "shared"], migration: "20251217154236_99d79bb6-ee61-459f-86ba-3f3f0986ccac.sql" },
    ],
    allowed: ["personal", "shared"],
    unreachable: [],
  },
  {
    table: "credit_notes",
    column: "credit_note_type",
    constraints: [
      { name: "credit_notes_credit_note_type_check", values: ["PURCHASE", "SALES"], migration: "20251205140338_97e45441-8be4-4be2-af72-8b275156e892.sql" },
    ],
    allowed: ["PURCHASE", "SALES"],
    unreachable: [],
  },
  {
    table: "credit_notes",
    column: "status",
    constraints: [
      { name: "credit_notes_status_check", values: ["APPROVED", "DRAFT", "FULLY_ALLOCATED", "VOIDED"], migration: "20251205140338_97e45441-8be4-4be2-af72-8b275156e892.sql" },
    ],
    allowed: ["APPROVED", "DRAFT", "FULLY_ALLOCATED", "VOIDED"],
    unreachable: [],
  },
  {
    table: "crm_activities",
    column: "activity_type",
    constraints: [
      { name: "crm_activities_activity_type_check", values: ["call", "email", "follow_up", "meeting", "note", "task"], migration: "20260407104823_24d531f0-17c1-4b9f-8d1d-0165f8acc6ea.sql" },
    ],
    allowed: ["call", "email", "follow_up", "meeting", "note", "task"],
    unreachable: [],
  },
  {
    table: "crm_followup_steps",
    column: "channel",
    constraints: [
      { name: "crm_followup_steps_channel_check", values: ["email", "sms", "task"], migration: "20260602133851_794346cb-6d90-443b-b9c5-797f71abfa79.sql" },
    ],
    allowed: ["email", "sms", "task"],
    unreachable: [],
  },
  {
    table: "crypto_transactions",
    column: "classification",
    constraints: [
      { name: "crypto_transactions_classification_check", values: ["capital", "income", "non_taxable", "unclassified"], migration: "20260217165747_62d29c7c-c125-4af5-8b19-aa601d50b241.sql" },
    ],
    allowed: ["capital", "income", "non_taxable", "unclassified"],
    unreachable: [],
  },
  {
    table: "crypto_transactions",
    column: "tx_type",
    constraints: [
      { name: "crypto_transactions_tx_type_check", values: ["airdrop", "buy", "fee", "fork", "gift_given", "gift_received", "lost", "mining", "sell", "staking_reward", "swap_in", "swap_out", "transfer_in", "transfer_out"], migration: "20260217165747_62d29c7c-c125-4af5-8b19-aa601d50b241.sql" },
    ],
    allowed: ["airdrop", "buy", "fee", "fork", "gift_given", "gift_received", "lost", "mining", "sell", "staking_reward", "swap_in", "swap_out", "transfer_in", "transfer_out"],
    unreachable: [],
  },
  {
    table: "ct_computation_snapshots",
    column: "status",
    constraints: [
      { name: "ct_computation_snapshots_status_check", values: ["accepted", "approved", "draft", "rejected", "submitted"], migration: "20251214183122_29b44e21-74c0-421f-b785-5a9464f9df28.sql" },
    ],
    allowed: ["accepted", "approved", "draft", "rejected", "submitted"],
    unreachable: [],
  },
  {
    table: "data_audit_log",
    column: "subject_kind",
    constraints: [
      { name: "data_audit_log_subject_kind_check", values: ["client", "company", "person"], migration: "20260722162044_3078029e-8a3c-4144-9a5b-922d2bef6870.sql" },
    ],
    allowed: ["client", "company", "person"],
    unreachable: [],
  },
  {
    table: "data_change_requests",
    column: "origin",
    constraints: [
      { name: "data_change_requests_origin_check", values: ["onboarding", "portal", "staff"], migration: "20260722162044_3078029e-8a3c-4144-9a5b-922d2bef6870.sql" },
    ],
    allowed: ["onboarding", "portal", "staff"],
    unreachable: [],
  },
  {
    table: "data_change_requests",
    column: "status",
    constraints: [
      { name: "data_change_requests_status_check", values: ["approved", "needs_more_info", "rejected", "submitted"], migration: "20260722162044_3078029e-8a3c-4144-9a5b-922d2bef6870.sql" },
    ],
    allowed: ["approved", "needs_more_info", "rejected", "submitted"],
    unreachable: [],
  },
  {
    table: "data_change_requests",
    column: "subject_kind",
    constraints: [
      { name: "data_change_requests_subject_kind_check", values: ["client", "company", "person"], migration: "20260722162044_3078029e-8a3c-4144-9a5b-922d2bef6870.sql" },
    ],
    allowed: ["client", "company", "person"],
    unreachable: [],
  },
  {
    table: "data_point_state",
    column: "source",
    constraints: [
      { name: "data_point_state_source_check", values: ["client", "companies_house", "firm"], migration: "20260722162044_3078029e-8a3c-4144-9a5b-922d2bef6870.sql" },
    ],
    allowed: ["client", "companies_house", "firm"],
    unreachable: [],
  },
  {
    table: "data_point_state",
    column: "status",
    constraints: [
      { name: "data_point_state_status_check", values: ["not_applicable", "outstanding", "pending_verification", "provided", "rejected", "verified"], migration: "20260722162044_3078029e-8a3c-4144-9a5b-922d2bef6870.sql" },
    ],
    allowed: ["not_applicable", "outstanding", "pending_verification", "provided", "rejected", "verified"],
    unreachable: [],
  },
  {
    table: "data_point_state",
    column: "subject_kind",
    constraints: [
      { name: "data_point_state_subject_kind_check", values: ["client", "company", "person"], migration: "20260722162044_3078029e-8a3c-4144-9a5b-922d2bef6870.sql" },
    ],
    allowed: ["client", "company", "person"],
    unreachable: [],
  },
  {
    table: "data_requirements",
    column: "provider",
    constraints: [
      { name: "data_requirements_provider_check", values: ["client", "companies_house", "firm"], migration: "20260722162044_3078029e-8a3c-4144-9a5b-922d2bef6870.sql" },
    ],
    allowed: ["client", "companies_house", "firm"],
    unreachable: [],
  },
  {
    table: "data_requirements",
    column: "sensitivity",
    constraints: [
      { name: "data_requirements_sensitivity_check", values: ["normal", "sensitive"], migration: "20260722162044_3078029e-8a3c-4144-9a5b-922d2bef6870.sql" },
    ],
    allowed: ["normal", "sensitive"],
    unreachable: [],
  },
  {
    table: "data_requirements",
    column: "subject_kind",
    constraints: [
      { name: "data_requirements_subject_kind_check", values: ["client", "company", "person"], migration: "20260722162044_3078029e-8a3c-4144-9a5b-922d2bef6870.sql" },
    ],
    allowed: ["client", "company", "person"],
    unreachable: [],
  },
  {
    table: "deadlines",
    column: "deadline_type",
    constraints: [
      { name: "deadlines_deadline_type_check", values: ["custom", "internal", "statutory"], migration: "20251127002312_aa391640-7e71-48d4-8f60-7721fa83c3e8.sql" },
    ],
    allowed: ["custom", "internal", "statutory"],
    unreachable: [],
  },
  {
    table: "deadlines",
    column: "filing_body",
    constraints: [
      { name: "deadlines_filing_body_check", values: ["COMPANIES_HOUSE", "CUSTOM", "HMRC", "INTERNAL"], migration: "20251127002312_aa391640-7e71-48d4-8f60-7721fa83c3e8.sql" },
    ],
    allowed: ["COMPANIES_HOUSE", "CUSTOM", "HMRC", "INTERNAL"],
    unreachable: [],
  },
  {
    table: "deadlines",
    column: "status",
    constraints: [
      { name: "deadlines_status_check", values: ["cancelled", "completed", "filed", "in_progress", "overdue", "pending"], migration: "20251127002312_aa391640-7e71-48d4-8f60-7721fa83c3e8.sql" },
    ],
    allowed: ["cancelled", "completed", "filed", "in_progress", "overdue", "pending"],
    unreachable: [],
  },
  {
    table: "email_messages",
    column: "link_reason",
    constraints: [
      { name: "email_messages_link_reason_check", values: ["accountancyos_initiated", "manual", "reply_to_known", "sender_match_reference"], migration: "20251203120212_f22f024f-86b4-4cea-a333-e4433dc81331.sql" },
    ],
    allowed: ["accountancyos_initiated", "manual", "reply_to_known", "sender_match_reference"],
    unreachable: [],
  },
  {
    table: "email_push_subscriptions",
    column: "provider",
    constraints: [
      { name: "email_push_subscriptions_provider_check", values: ["gmail", "outlook"], migration: "20251203120212_f22f024f-86b4-4cea-a333-e4433dc81331.sql" },
    ],
    allowed: ["gmail", "outlook"],
    unreachable: [],
  },
  {
    table: "email_queue",
    column: "context",
    constraints: [
      { name: "email_queue_context_check", values: ["engagement", "general", "invoice", "job", "onboarding", "quote", "system"], migration: "20260622172622_29f06116-e3de-4844-8e4c-a382f6e25c33.sql" },
    ],
    allowed: ["engagement", "general", "invoice", "job", "onboarding", "quote", "system"],
    unreachable: [],
  },
  {
    table: "email_queue",
    column: "provider",
    constraints: [
      { name: "email_queue_provider_check", values: ["gmail", "outlook", "postmark"], migration: "20251203120212_f22f024f-86b4-4cea-a333-e4433dc81331.sql" },
    ],
    allowed: ["gmail", "outlook", "postmark"],
    unreachable: [],
  },
  {
    table: "email_queue",
    column: "status",
    constraints: [
      { name: "email_queue_status_check", values: ["draft", "failed", "ignored", "pending", "queued", "sent"], migration: "20251203120212_f22f024f-86b4-4cea-a333-e4433dc81331.sql" },
    ],
    allowed: ["draft", "failed", "ignored", "pending", "queued", "sent"],
    unreachable: [],
  },
  {
    table: "email_send_log",
    column: "status",
    constraints: [
      { name: "email_send_log_status_check", values: ["bounced", "complained", "dlq", "failed", "pending", "sent", "suppressed"], migration: "20260617194841_email_infra.sql" },
    ],
    allowed: ["bounced", "complained", "dlq", "failed", "pending", "sent", "suppressed"],
    unreachable: [],
  },
  {
    table: "email_suppressions",
    column: "reason",
    constraints: [
      { name: "email_suppressions_reason_check", values: ["bounce", "complaint", "hard_bounce", "manual", "unsubscribe"], migration: "20260531225541_2b0991ac-14a5-4fff-b2c8-d772504f3fbc.sql" },
    ],
    allowed: ["bounce", "complaint", "hard_bounce", "manual", "unsubscribe"],
    unreachable: [],
  },
  {
    table: "email_threads",
    column: "initiated_by",
    constraints: [
      { name: "email_threads_initiated_by_check", values: ["accountancyos", "client", "unknown"], migration: "20251203120212_f22f024f-86b4-4cea-a333-e4433dc81331.sql" },
    ],
    allowed: ["accountancyos", "client", "unknown"],
    unreachable: [],
  },
  {
    table: "email_threads",
    column: "provider",
    constraints: [
      { name: "email_threads_provider_check", values: ["gmail", "outlook"], migration: "20251203120212_f22f024f-86b4-4cea-a333-e4433dc81331.sql" },
    ],
    allowed: ["gmail", "outlook"],
    unreachable: [],
  },
  {
    table: "employee_absences",
    column: "absence_type",
    constraints: [
      { name: "employee_absences_absence_type_check", values: ["adoption", "holiday", "jury_service", "maternity", "other", "parental_bereavement", "paternity", "shared_parental", "sickness", "unpaid"], migration: "20251204132126_60114b6f-52d6-4502-a15b-a17d2539650d.sql" },
    ],
    allowed: ["adoption", "holiday", "jury_service", "maternity", "other", "parental_bereavement", "paternity", "shared_parental", "sickness", "unpaid"],
    unreachable: [],
  },
  {
    table: "employee_absences",
    column: "statutory_pay_type",
    constraints: [
      { name: "employee_absences_statutory_pay_type_check", values: ["sap", "shpp", "smp", "spbp", "spp", "ssp"], migration: "20251204132126_60114b6f-52d6-4502-a15b-a17d2539650d.sql" },
    ],
    allowed: ["sap", "shpp", "smp", "spbp", "spp", "ssp"],
    unreachable: [],
  },
  {
    table: "employee_benefits",
    column: "benefit_type",
    constraints: [
      { name: "employee_benefits_benefit_type_check", values: ["accommodation", "assets_transferred", "car_allowance", "car_fuel", "company_car", "living_accommodation", "loans", "mileage_allowance", "other", "payments_on_behalf", "private_medical", "telephone", "van", "van_fuel", "vouchers_credit_cards"], migration: "20251204132126_60114b6f-52d6-4502-a15b-a17d2539650d.sql" },
    ],
    allowed: ["accommodation", "assets_transferred", "car_allowance", "car_fuel", "company_car", "living_accommodation", "loans", "mileage_allowance", "other", "payments_on_behalf", "private_medical", "telephone", "van", "van_fuel", "vouchers_credit_cards"],
    unreachable: [],
  },
  {
    table: "employee_benefits",
    column: "car_fuel_type",
    constraints: [
      { name: "employee_benefits_car_fuel_type_check", values: ["diesel", "electric", "hybrid_diesel", "hybrid_petrol", "petrol"], migration: "20251204132126_60114b6f-52d6-4502-a15b-a17d2539650d.sql" },
    ],
    allowed: ["diesel", "electric", "hybrid_diesel", "hybrid_petrol", "petrol"],
    unreachable: [],
  },
  {
    table: "employees",
    column: "director_nic_method",
    constraints: [
      { name: "employees_director_nic_method_check", values: ["alternative", "annual"], migration: "20251204132126_60114b6f-52d6-4502-a15b-a17d2539650d.sql" },
    ],
    allowed: ["alternative", "annual"],
    unreachable: [],
  },
  {
    table: "employees",
    column: "gender",
    constraints: [
      { name: "employees_gender_check", values: ["female", "male", "not_specified"], migration: "20251204132126_60114b6f-52d6-4502-a15b-a17d2539650d.sql" },
    ],
    allowed: ["female", "male", "not_specified"],
    unreachable: [],
  },
  {
    table: "employees",
    column: "leaving_reason",
    constraints: [
      { name: "employees_leaving_reason_check", values: ["death", "dismissal", "other", "redundancy", "resignation", "retirement", "transfer"], migration: "20251204132126_60114b6f-52d6-4502-a15b-a17d2539650d.sql" },
    ],
    allowed: ["death", "dismissal", "other", "redundancy", "resignation", "retirement", "transfer"],
    unreachable: [],
  },
  {
    table: "employees",
    column: "nic_category",
    constraints: [
      { name: "employees_nic_category_check", values: ["A", "B", "C", "F", "H", "I", "J", "L", "M", "S", "V", "X", "Z"], migration: "20251204132126_60114b6f-52d6-4502-a15b-a17d2539650d.sql" },
    ],
    allowed: ["A", "B", "C", "F", "H", "I", "J", "L", "M", "S", "V", "X", "Z"],
    unreachable: [],
  },
  {
    table: "employees",
    column: "pay_frequency",
    constraints: [
      { name: "employees_pay_frequency_check", values: ["fortnightly", "four_weekly", "monthly", "weekly"], migration: "20251204132126_60114b6f-52d6-4502-a15b-a17d2539650d.sql" },
    ],
    allowed: ["fortnightly", "four_weekly", "monthly", "weekly"],
    unreachable: [],
  },
  {
    table: "employees",
    column: "payment_method",
    constraints: [
      { name: "employees_payment_method_check", values: ["bacs", "cash", "cheque"], migration: "20251204132126_60114b6f-52d6-4502-a15b-a17d2539650d.sql" },
    ],
    allowed: ["bacs", "cash", "cheque"],
    unreachable: [],
  },
  {
    table: "employees",
    column: "starter_declaration",
    constraints: [
      { name: "employees_starter_declaration_check", values: ["A", "B", "C"], migration: "20251204132126_60114b6f-52d6-4502-a15b-a17d2539650d.sql" },
    ],
    allowed: ["A", "B", "C"],
    unreachable: [],
  },
  {
    table: "employees",
    column: "status",
    constraints: [
      { name: "employees_status_check", values: ["active", "left", "on_leave", "pending"], migration: "20251204132126_60114b6f-52d6-4502-a15b-a17d2539650d.sql" },
    ],
    allowed: ["active", "left", "on_leave", "pending"],
    unreachable: [],
  },
  {
    table: "employees",
    column: "student_loan_plan",
    constraints: [
      { name: "employees_student_loan_plan_check", values: ["none", "plan_1", "plan_2", "plan_4", "plan_5", "postgrad"], migration: "20251204132126_60114b6f-52d6-4502-a15b-a17d2539650d.sql" },
    ],
    allowed: ["none", "plan_1", "plan_2", "plan_4", "plan_5", "postgrad"],
    unreachable: [],
  },
  {
    table: "employees",
    column: "tax_basis",
    constraints: [
      { name: "employees_tax_basis_check", values: ["cumulative", "week1_month1"], migration: "20251204132126_60114b6f-52d6-4502-a15b-a17d2539650d.sql" },
    ],
    allowed: ["cumulative", "week1_month1"],
    unreachable: [],
  },
  {
    table: "engagement_letter_template_variants",
    column: "engagement_kind",
    constraints: [
      { name: "engagement_letter_template_variants_engagement_kind_check", values: ["annual_renewal", "one_off", "recurring"], migration: "20260601064530_b35c29d8-ddda-46b2-b276-5128d2dd26ef.sql" },
    ],
    allowed: ["annual_renewal", "one_off", "recurring"],
    unreachable: [],
  },
  {
    table: "engagement_letters",
    column: "signing_rule",
    constraints: [
      { name: "engagement_letters_signing_rule_check", values: ["all", "any"], migration: "20260727072814_8bb45d66-92a8-4f49-999f-d4a099b11614.sql" },
    ],
    allowed: ["all", "any"],
    unreachable: [],
  },
  {
    table: "engagement_letters",
    column: "status",
    constraints: [
      { name: "engagement_letters_status_check", values: ["draft", "partially_signed", "sent", "signed"], migration: "20260727140000_el_signature_rule_sot.sql" },
    ],
    allowed: ["draft", "partially_signed", "sent", "signed"],
    unreachable: [],
  },
  {
    table: "engagements",
    column: "frequency",
    constraints: [
      { name: "engagements_frequency_check", values: ["annual", "monthly", "one_off", "quarterly"], migration: "20251125171545_fcb626d1-1d93-46ad-89eb-d04902c78286.sql" },
    ],
    allowed: ["annual", "monthly", "one_off", "quarterly"],
    unreachable: [],
  },
  {
    table: "engagements",
    column: "status",
    constraints: [
      { name: "engagements_status_check", values: ["active", "draft", "suspended", "terminated"], migration: "20251201222625_7c546b89-c9fd-4973-92f4-b0c696537825.sql" },
    ],
    allowed: ["active", "draft", "suspended", "terminated"],
    unreachable: [],
  },
  {
    table: "filing_approvals",
    column: "approval_method",
    constraints: [
      { name: "filing_approvals_approval_method_check", values: ["EMAIL", "OVERRIDE", "PORTAL"], migration: "20251214185814_7f7d3557-f8f2-471d-ba0a-d6b5e15ac831.sql" },
    ],
    allowed: ["EMAIL", "OVERRIDE", "PORTAL"],
    unreachable: [],
  },
  {
    table: "filing_approvals",
    column: "approval_scope",
    constraints: [
      { name: "filing_approvals_approval_scope_check", values: ["ACCOUNTS", "CT600"], migration: "20251214185814_7f7d3557-f8f2-471d-ba0a-d6b5e15ac831.sql" },
    ],
    allowed: ["ACCOUNTS", "CT600"],
    unreachable: [],
  },
  {
    table: "filing_approvals",
    column: "approved_by_role",
    constraints: [
      { name: "filing_approvals_approved_by_role_check", values: ["ACCOUNTANT", "CLIENT"], migration: "20251214185814_7f7d3557-f8f2-471d-ba0a-d6b5e15ac831.sql" },
    ],
    allowed: ["ACCOUNTANT", "CLIENT"],
    unreachable: [],
  },
  {
    table: "filing_artefacts",
    column: "artefact_type",
    constraints: [
      { name: "filing_artefacts_artefact_type_check", values: ["CH_ACCOUNTS_XML", "CT600_XML", "HMRC_CT600_DELETE_REQUEST_XML", "HMRC_CT600_DELETE_RESPONSE_XML", "HMRC_CT600_FINAL_RESPONSE_XML", "HMRC_CT600_POLL_REQUEST_XML", "HMRC_CT600_POLL_RESPONSE_XML", "HMRC_CT600_SUBMIT_ACK_XML", "HMRC_CT600_SUBMIT_REQUEST_XML", "IXBRL_ACCOUNTS", "IXBRL_CT_COMPUTATION", "PDF_ACCOUNTS", "PDF_CT_COMPUTATION"], migration: "20260809160000_def_036_transport_jobs.sql" },
    ],
    allowed: ["CH_ACCOUNTS_XML", "CT600_XML", "HMRC_CT600_DELETE_REQUEST_XML", "HMRC_CT600_DELETE_RESPONSE_XML", "HMRC_CT600_FINAL_RESPONSE_XML", "HMRC_CT600_POLL_REQUEST_XML", "HMRC_CT600_POLL_RESPONSE_XML", "HMRC_CT600_SUBMIT_ACK_XML", "HMRC_CT600_SUBMIT_REQUEST_XML", "IXBRL_ACCOUNTS", "IXBRL_CT_COMPUTATION", "PDF_ACCOUNTS", "PDF_CT_COMPUTATION"],
    unreachable: [],
  },
  {
    table: "filing_queue",
    column: "filing_type",
    constraints: [
      { name: "filing_queue_filing_type_check", values: ["ACCOUNTS_CH", "CT600_HMRC", "VAT_HMRC"], migration: "20251214185814_7f7d3557-f8f2-471d-ba0a-d6b5e15ac831.sql" },
    ],
    allowed: ["ACCOUNTS_CH", "CT600_HMRC", "VAT_HMRC"],
    unreachable: [],
  },
  {
    table: "filing_queue",
    column: "status",
    constraints: [
      { name: "filing_queue_status_check", values: ["cancelled", "completed", "failed", "processing", "queued"], migration: "20251214185814_7f7d3557-f8f2-471d-ba0a-d6b5e15ac831.sql" },
    ],
    allowed: ["cancelled", "completed", "failed", "processing", "queued"],
    unreachable: [],
  },
  {
    table: "filing_submissions",
    column: "environment",
    constraints: [
      { name: "filing_submissions_environment_check", values: ["production", "test"], migration: "20251210010511_5ef8bd80-ab4a-4a2f-9126-276bd4a87c77.sql" },
    ],
    allowed: ["production", "test"],
    unreachable: [],
  },
  {
    table: "filing_submissions",
    column: "status",
    constraints: [
      { name: "filing_submissions_status_check", values: ["accepted", "error", "pending", "rejected", "submitted"], migration: "20251210010511_5ef8bd80-ab4a-4a2f-9126-276bd4a87c77.sql" },
    ],
    allowed: ["accepted", "error", "pending", "rejected", "submitted"],
    unreachable: [],
  },
  {
    table: "filings",
    column: "environment",
    constraints: [
      { name: "filings_environment_check", values: ["production", "test"], migration: "20251210010511_5ef8bd80-ab4a-4a2f-9126-276bd4a87c77.sql" },
    ],
    allowed: ["production", "test"],
    unreachable: [],
  },
  {
    table: "filings",
    column: "status",
    constraints: [
      { name: "chk_filing_status", values: ["accepted", "approved", "awaiting_approval", "client_changes_requested", "draft", "filed", "in_progress", "not_started", "ready_for_review", "ready_to_file", "rejected", "sent_to_client", "submitted"], migration: "20260620150856_c734e7f6-c637-4964-87bc-36dcc04cf02f.sql" },
    ],
    allowed: ["accepted", "approved", "awaiting_approval", "client_changes_requested", "draft", "filed", "in_progress", "not_started", "ready_for_review", "ready_to_file", "rejected", "sent_to_client", "submitted"],
    unreachable: [],
  },
  {
    table: "fixed_asset_transactions",
    column: "transaction_type",
    constraints: [
      { name: "fixed_asset_transactions_transaction_type_check", values: ["ADDITION", "ADJUSTMENT", "DISPOSAL", "TRANSFER"], migration: "20251214183122_29b44e21-74c0-421f-b785-5a9464f9df28.sql" },
    ],
    allowed: ["ADDITION", "ADJUSTMENT", "DISPOSAL", "TRANSFER"],
    unreachable: [],
  },
  {
    table: "fixed_assets",
    column: "default_pool_type",
    constraints: [
      { name: "fixed_assets_default_pool_type_check", values: ["MAIN", "SINGLE_ASSET", "SPECIAL_RATE"], migration: "20251214183122_29b44e21-74c0-421f-b785-5a9464f9df28.sql" },
    ],
    allowed: ["MAIN", "SINGLE_ASSET", "SPECIAL_RATE"],
    unreachable: [],
  },
  {
    table: "fixed_assets",
    column: "depreciation_method",
    constraints: [
      { name: "fixed_assets_depreciation_method_check", values: ["NONE", "RB", "SL"], migration: "20260609203254_00fbbde8-e890-4e6f-b78f-f374a3a1a479.sql" },
    ],
    allowed: ["NONE", "RB", "SL"],
    unreachable: [],
  },
  {
    table: "fixed_assets",
    column: "status",
    constraints: [
      { name: "fixed_assets_status_check", values: ["active", "disposed", "fully_depreciated"], migration: "20260609203254_00fbbde8-e890-4e6f-b78f-f374a3a1a479.sql" },
    ],
    allowed: ["active", "disposed", "fully_depreciated"],
    unreachable: [],
  },
  {
    table: "hmrc_authorisations",
    column: "auth_type",
    constraints: [
      { name: "hmrc_authorisations_auth_type_check", values: ["company", "ct", "paye", "personal", "vat"], migration: "20260202134808_00717835-2a62-417d-ac3f-6e0517997921.sql" },
    ],
    allowed: ["company", "ct", "paye", "personal", "vat"],
    unreachable: [],
  },
  {
    table: "hmrc_authorisations",
    column: "status",
    constraints: [
      { name: "hmrc_authorisations_status_check", values: ["active", "expired", "pending", "revoked"], migration: "20260202134808_00717835-2a62-417d-ac3f-6e0517997921.sql" },
    ],
    allowed: ["active", "expired", "pending", "revoked"],
    unreachable: [],
  },
  {
    table: "idempotency_keys",
    column: "status",
    constraints: [
      { name: "idempotency_keys_status_check", values: ["failed", "in_progress", "succeeded"], migration: "20251218230026_8bb84143-6ac0-4337-98ed-7aae93cea55a.sql" },
    ],
    allowed: ["failed", "in_progress", "succeeded"],
    unreachable: [],
  },
  {
    table: "invoice_lines",
    column: "payment_status",
    constraints: [
      { name: "invoice_lines_payment_status_check", values: ["PAID", "PART_PAID", "UNPAID"], migration: "20251214171844_40398d4b-bf1d-44a7-829f-5704a60cdbba.sql" },
    ],
    allowed: ["PAID", "PART_PAID", "UNPAID"],
    unreachable: [],
  },
  {
    table: "invoice_payments",
    column: "payment_type",
    constraints: [
      { name: "invoice_payments_payment_type_check", values: ["normal", "overpayment", "prepayment", "refund"], migration: "20251205140338_97e45441-8be4-4be2-af72-8b275156e892.sql" },
    ],
    allowed: ["normal", "overpayment", "prepayment", "refund"],
    unreachable: [],
  },
  {
    table: "invoices",
    column: "status",
    constraints: [
      { name: "invoices_status_check", values: ["AWAITING_PAYMENT", "DRAFT", "OVERDUE", "PAID", "PART_PAID", "VOIDED"], migration: "20260703203849_fedfedfc-0641-4999-b85b-74f96ecff1ef.sql" },
    ],
    allowed: ["AWAITING_PAYMENT", "DRAFT", "OVERDUE", "PAID", "PART_PAID", "VOIDED"],
    unreachable: [],
  },
  {
    table: "job_artifacts",
    column: "artifact_type",
    constraints: [
      { name: "job_artifacts_artifact_type_check", values: ["computation_output", "document", "external_workpaper", "filing_snapshot", "questionnaire_submission", "workpaper_schedule"], migration: "20260217130613_a778448c-48b6-4b93-a66f-5f11910b72da.sql" },
    ],
    allowed: ["computation_output", "document", "external_workpaper", "filing_snapshot", "questionnaire_submission", "workpaper_schedule"],
    unreachable: [],
  },
  {
    table: "job_artifacts",
    column: "status",
    constraints: [
      { name: "job_artifacts_status_check", values: ["active", "superseded", "void"], migration: "20260217130613_a778448c-48b6-4b93-a66f-5f11910b72da.sql" },
    ],
    allowed: ["active", "superseded", "void"],
    unreachable: [],
  },
  {
    table: "job_conversations",
    column: "sender_type",
    constraints: [
      { name: "job_conversations_sender_type_check", values: ["accountant", "client"], migration: "20251126133923_4132a3da-01d4-41f8-a938-994efcd7bd7f.sql" },
    ],
    allowed: ["accountant", "client"],
    unreachable: [],
  },
  {
    table: "job_conversations",
    column: "visibility",
    constraints: [
      { name: "job_conversations_visibility_check", values: ["client_visible", "internal"], migration: "20251126133923_4132a3da-01d4-41f8-a938-994efcd7bd7f.sql" },
    ],
    allowed: ["client_visible", "internal"],
    unreachable: [],
  },
  {
    table: "job_tasks",
    column: "status",
    constraints: [
      { name: "job_tasks_status_check", values: ["blocked", "doing", "done", "todo"], migration: "20251126133923_4132a3da-01d4-41f8-a938-994efcd7bd7f.sql" },
    ],
    allowed: ["blocked", "doing", "done", "todo"],
    unreachable: [],
  },
  {
    table: "job_workpaper_instances",
    column: "status",
    constraints: [
      { name: "job_workpaper_instances_status_check", values: ["draft", "in_review", "locked"], migration: "20260217130613_a778448c-48b6-4b93-a66f-5f11910b72da.sql" },
    ],
    allowed: ["draft", "in_review", "locked"],
    unreachable: [],
  },
  {
    table: "jobs",
    column: "automation_source",
    constraints: [
      { name: "jobs_automation_source_check", values: ["manual", "scheduled", "template"], migration: "20251126133923_4132a3da-01d4-41f8-a938-994efcd7bd7f.sql" },
    ],
    allowed: ["manual", "scheduled", "template"],
    unreachable: [],
  },
  {
    table: "jobs",
    column: "priority",
    constraints: [
      { name: "jobs_priority_check", values: ["critical", "high", "low", "normal"], migration: "20251126133923_4132a3da-01d4-41f8-a938-994efcd7bd7f.sql" },
    ],
    allowed: ["critical", "high", "low", "normal"],
    unreachable: [],
  },
  {
    table: "jobs",
    column: "status",
    constraints: [
      { name: "chk_jobs_status", values: ["accountant_queries", "accountant_review", "blank", "client_queries", "client_review", "completed", "ready_to_file", "records_received", "records_requested"], migration: "20260217105419_11da5c58-558f-4d0d-b954-ff5dc86215d1.sql" },
    ],
    allowed: ["accountant_queries", "accountant_review", "blank", "client_queries", "client_review", "completed", "ready_to_file", "records_received", "records_requested"],
    unreachable: [],
  },
  {
    table: "kyc_pack_subjects",
    column: "subject_ref_type",
    constraints: [
      { name: "kyc_pack_subjects_subject_ref_type_check", values: ["contact", "director", "free_text"], migration: "20260601064530_b35c29d8-ddda-46b2-b276-5128d2dd26ef.sql" },
    ],
    allowed: ["contact", "director", "free_text"],
    unreachable: [],
  },
  {
    table: "kyc_pack_subjects",
    column: "subject_status",
    constraints: [
      { name: "kyc_pack_subjects_subject_status_check", values: ["complete", "documents_requested", "failed", "partial", "pending", "waived"], migration: "20260601064530_b35c29d8-ddda-46b2-b276-5128d2dd26ef.sql" },
    ],
    allowed: ["complete", "documents_requested", "failed", "partial", "pending", "waived"],
    unreachable: [],
  },
  {
    table: "kyc_pack_subjects",
    column: "subject_type",
    constraints: [
      { name: "kyc_pack_subjects_subject_type_check", values: ["authorised_contact", "director", "individual_client", "llp_member", "partner", "psc", "trustee"], migration: "20260601064530_b35c29d8-ddda-46b2-b276-5128d2dd26ef.sql" },
    ],
    allowed: ["authorised_contact", "director", "individual_client", "llp_member", "partner", "psc", "trustee"],
    unreachable: [],
  },
  {
    table: "kyc_packs",
    column: "status",
    constraints: [
      { name: "kyc_packs_status_check", values: ["approved", "expired", "in_progress", "not_started", "rejected", "submitted"], migration: "20260601064530_b35c29d8-ddda-46b2-b276-5128d2dd26ef.sql" },
    ],
    allowed: ["approved", "expired", "in_progress", "not_started", "rejected", "submitted"],
    unreachable: [],
  },
  {
    table: "lead_activities",
    column: "direction",
    constraints: [
      { name: "lead_activities_direction_check", values: ["inbound", "outbound"], migration: "20251125162931_d691c4e7-1323-460d-aa1b-975a1b0f58a4.sql" },
    ],
    allowed: ["inbound", "outbound"],
    unreachable: [],
  },
  {
    table: "lead_activities",
    column: "type",
    constraints: [
      { name: "lead_activities_type_check", values: ["call", "email", "meeting", "note", "sms", "task", "whatsapp"], migration: "20251125162931_d691c4e7-1323-460d-aa1b-975a1b0f58a4.sql" },
    ],
    allowed: ["call", "email", "meeting", "note", "sms", "task", "whatsapp"],
    unreachable: [],
  },
  {
    table: "leads",
    column: "pipeline_stage",
    constraints: [
      { name: "leads_pipeline_stage_check", values: ["chasing", "lost", "new", "proposal_sent", "qualified", "won"], migration: "20251125162931_d691c4e7-1323-460d-aa1b-975a1b0f58a4.sql" },
    ],
    allowed: ["chasing", "lost", "new", "proposal_sent", "qualified", "won"],
    unreachable: [],
  },
  {
    table: "leads",
    column: "source",
    constraints: [
      { name: "leads_source_check", values: ["ad", "direct", "other", "referral", "website"], migration: "20251125162931_d691c4e7-1323-460d-aa1b-975a1b0f58a4.sql" },
    ],
    allowed: ["ad", "direct", "other", "referral", "website"],
    unreachable: [],
  },
  {
    table: "ledger_entries",
    column: "payment_status",
    constraints: [
      { name: "ledger_entries_payment_status_check", values: ["PAID", "PART_PAID", "UNPAID"], migration: "20251214171844_40398d4b-bf1d-44a7-829f-5704a60cdbba.sql" },
    ],
    allowed: ["PAID", "PART_PAID", "UNPAID"],
    unreachable: [],
  },
  {
    table: "message_entity_links",
    column: "entity_type",
    constraints: [
      { name: "message_entity_links_entity_type_check", values: ["engagement", "filing", "job", "workpaper"], migration: "20251203123610_b408cc49-f989-4b3c-b2cf-21f125f163fa.sql" },
    ],
    allowed: ["engagement", "filing", "job", "workpaper"],
    unreachable: [],
  },
  {
    table: "message_templates",
    column: "channel",
    constraints: [
      { name: "message_templates_channel_check", values: ["email", "sms", "whatsapp"], migration: "20251125162931_d691c4e7-1323-460d-aa1b-975a1b0f58a4.sql" },
    ],
    allowed: ["email", "sms", "whatsapp"],
    unreachable: [],
  },
  {
    table: "notifications",
    column: "entity_type",
    constraints: [
      { name: "notifications_entity_type_check", values: ["client", "company", "deadline", "document", "job", "lead", "message", "onboarding", "onboarding_application", "quote", "task"], migration: "20260603143837_faec841f-ea51-438c-9e8d-5c96825a5a6f.sql" },
    ],
    allowed: ["client", "company", "deadline", "document", "job", "lead", "message", "onboarding", "onboarding_application", "quote", "task"],
    unreachable: [],
  },
  {
    table: "onboarding_applications",
    column: "aml_status",
    constraints: [
      { name: "onboarding_applications_aml_status_check", values: ["failed", "manual_review", "pending", "verified"], migration: "20260603171715_46e1cf7a-f841-419f-afe7-39eddaf20f6a.sql" },
    ],
    allowed: ["failed", "manual_review", "pending", "verified"],
    unreachable: [],
  },
  {
    table: "onboarding_applications",
    column: "application_type",
    constraints: [
      { name: "onboarding_applications_application_type_check", values: ["company", "individual"], migration: "20251125174504_ef058dc7-9526-444a-a872-2ef4a03f1b9e.sql" },
    ],
    allowed: ["company", "individual"],
    unreachable: [],
  },
  {
    table: "onboarding_applications",
    column: "billing_status",
    constraints: [
      { name: "onboarding_applications_billing_status_check", values: ["completed", "not_required", "pending", "skipped"], migration: "20260603112138_b1caea48-9e9e-4fdf-aa29-93331fde125e.sql" },
    ],
    allowed: ["completed", "not_required", "pending", "skipped"],
    unreachable: [],
  },
  {
    table: "onboarding_applications",
    column: "status",
    constraints: [
      { name: "onboarding_applications_status_check", values: ["aml_pending", "approved", "billing_pending", "cancelled", "draft", "engagement_pending", "for_review", "in_progress", "needs_client_action", "portal_pending", "rejected"], migration: "20260603105927_91064164-21ea-4443-b8a3-0560c75bf9d1.sql" },
    ],
    allowed: ["aml_pending", "approved", "billing_pending", "cancelled", "draft", "engagement_pending", "for_review", "in_progress", "needs_client_action", "portal_pending", "rejected"],
    unreachable: [],
  },
  {
    table: "onboarding_documents",
    column: "document_type",
    constraints: [
      { name: "onboarding_documents_document_type_check", values: ["id", "incorporation_cert", "other", "proof_of_address"], migration: "20251125174504_ef058dc7-9526-444a-a872-2ef4a03f1b9e.sql" },
    ],
    allowed: ["id", "incorporation_cert", "other", "proof_of_address"],
    unreachable: [],
  },
  {
    table: "org_settings",
    column: "automation_rule_management_mode",
    constraints: [
      { name: "org_settings_automation_rule_management_mode_check", values: ["owner_admin_manager", "owner_admin_only"], migration: "20251217142032_b8113a6b-8109-4ab5-bb49-76b9d46a87c0.sql" },
    ],
    allowed: ["owner_admin_manager", "owner_admin_only"],
    unreachable: [],
  },
  {
    table: "org_settings",
    column: "email_default_mode",
    constraints: [
      { name: "org_settings_email_default_mode_check", values: ["draft_by_default", "send_by_default"], migration: "20251217142032_b8113a6b-8109-4ab5-bb49-76b9d46a87c0.sql" },
    ],
    allowed: ["draft_by_default", "send_by_default"],
    unreachable: [],
  },
  {
    table: "organization_users",
    column: "role",
    constraints: [
      { name: "organization_users_role_check", values: ["admin", "owner", "staff"], migration: "20260407104059_9fc4adcd-35ae-4960-a6ad-825d65867314.sql" },
    ],
    allowed: ["admin", "owner", "staff"],
    unreachable: [],
  },
  {
    table: "partnership_allocations",
    column: "allocation_method",
    constraints: [
      { name: "partnership_allocations_allocation_method_check", values: ["fixed", "percentage", "special"], migration: "20260217173058_473fe9ee-80e5-4c68-86b0-98e03bd77e2a.sql" },
    ],
    allowed: ["fixed", "percentage", "special"],
    unreachable: [],
  },
  {
    table: "pay_runs",
    column: "pay_frequency",
    constraints: [
      { name: "pay_runs_pay_frequency_check", values: ["fortnightly", "four_weekly", "monthly", "weekly"], migration: "20251204132126_60114b6f-52d6-4502-a15b-a17d2539650d.sql" },
    ],
    allowed: ["fortnightly", "four_weekly", "monthly", "weekly"],
    unreachable: [],
  },
  {
    table: "pay_runs",
    column: "status",
    constraints: [
      { name: "pay_runs_status_check", values: ["approved", "draft", "paid", "processing", "submitted"], migration: "20251204132126_60114b6f-52d6-4502-a15b-a17d2539650d.sql" },
    ],
    allowed: ["approved", "draft", "paid", "processing", "submitted"],
    unreachable: [],
  },
  {
    table: "paye_schemes",
    column: "default_pay_day_of_week",
    constraints: [
      { name: "paye_schemes_default_pay_day_of_week_check", values: ["friday", "monday", "saturday", "sunday", "thursday", "tuesday", "wednesday"], migration: "20251204132126_60114b6f-52d6-4502-a15b-a17d2539650d.sql" },
    ],
    allowed: ["friday", "monday", "saturday", "sunday", "thursday", "tuesday", "wednesday"],
    unreachable: [],
  },
  {
    table: "paye_schemes",
    column: "default_pay_frequency",
    constraints: [
      { name: "paye_schemes_default_pay_frequency_check", values: ["fortnightly", "four_weekly", "monthly", "weekly"], migration: "20251204132126_60114b6f-52d6-4502-a15b-a17d2539650d.sql" },
    ],
    allowed: ["fortnightly", "four_weekly", "monthly", "weekly"],
    unreachable: [],
  },
  {
    table: "payslips",
    column: "status",
    constraints: [
      { name: "payslips_status_check", values: ["approved", "calculated", "draft", "paid"], migration: "20251204132126_60114b6f-52d6-4502-a15b-a17d2539650d.sql" },
    ],
    allowed: ["approved", "calculated", "draft", "paid"],
    unreachable: [],
  },
  {
    table: "portal_access",
    column: "status",
    constraints: [
      { name: "portal_access_status_check", values: ["active", "invited", "revoked"], migration: "20251201222625_7c546b89-c9fd-4973-92f4-b0c696537825.sql" },
    ],
    allowed: ["active", "invited", "revoked"],
    unreachable: [],
  },
  {
    table: "questionnaire_access_log",
    column: "action",
    constraints: [
      { name: "questionnaire_access_log_action_check", values: ["expired", "invalid_token", "revoked", "save", "submit", "view"], migration: "20251219005527_09c35375-cf00-4c84-bcf2-f10d264e42a5.sql" },
    ],
    allowed: ["expired", "invalid_token", "revoked", "save", "submit", "view"],
    unreachable: [],
  },
  {
    table: "questionnaire_instances",
    column: "status",
    constraints: [
      { name: "questionnaire_instances_status_check", values: ["in_progress", "reviewed", "sent", "submitted"], migration: "20251126114216_42f85bd0-c478-48db-90f9-edd244ba7bb5.sql" },
    ],
    allowed: ["in_progress", "reviewed", "sent", "submitted"],
    unreachable: [],
  },
  {
    table: "quote_lines",
    column: "billing_frequency",
    constraints: [
      { name: "quote_lines_billing_frequency_check", values: ["annual", "monthly", "now"], migration: "20260727205036_36d29c39-d655-48b3-9ece-0de14f6ab1e2.sql" },
    ],
    allowed: ["annual", "monthly", "now"],
    unreachable: [],
  },
  {
    table: "quotes",
    column: "status",
    constraints: [
      { name: "quotes_status_check", values: ["accepted", "draft", "expired", "rejected", "sent", "superseded"], migration: "20260602210920_f7a0e684-d797-4dca-9e40-4b7219e88f32.sql" },
    ],
    allowed: ["accepted", "draft", "expired", "rejected", "sent", "superseded"],
    unreachable: [],
  },
  {
    table: "record_request_items",
    column: "status",
    constraints: [
      { name: "record_request_items_status_check", values: ["client_says_unavailable", "invalid", "missing", "not_applicable", "not_requested", "pending", "received", "requested", "reviewed", "verified", "waived"], migration: "20260531225541_2b0991ac-14a5-4fff-b2c8-d772504f3fbc.sql" },
    ],
    allowed: ["client_says_unavailable", "invalid", "missing", "not_applicable", "not_requested", "pending", "received", "requested", "reviewed", "verified", "waived"],
    unreachable: [],
  },
  {
    table: "recurring_invoice_schedules",
    column: "cadence",
    constraints: [
      { name: "recurring_invoice_schedules_cadence_check", values: ["annual", "custom", "fortnightly", "monthly", "quarterly", "semi_annual", "weekly"], migration: "20260531225541_2b0991ac-14a5-4fff-b2c8-d772504f3fbc.sql" },
    ],
    allowed: ["annual", "custom", "fortnightly", "monthly", "quarterly", "semi_annual", "weekly"],
    unreachable: [],
  },
  {
    table: "recurring_invoice_schedules",
    column: "status",
    constraints: [
      { name: "recurring_invoice_schedules_status_check", values: ["active", "cancelled", "completed", "failed", "paused"], migration: "20260531225541_2b0991ac-14a5-4fff-b2c8-d772504f3fbc.sql" },
    ],
    allowed: ["active", "cancelled", "completed", "failed", "paused"],
    unreachable: [],
  },
  {
    table: "rti_submissions",
    column: "submission_status",
    constraints: [
      { name: "rti_submissions_submission_status_check", values: ["accepted", "error", "pending", "rejected", "submitted"], migration: "20251204132126_60114b6f-52d6-4502-a15b-a17d2539650d.sql" },
    ],
    allowed: ["accepted", "error", "pending", "rejected", "submitted"],
    unreachable: [],
  },
  {
    table: "rti_submissions",
    column: "submission_type",
    constraints: [
      { name: "rti_submissions_submission_type_check", values: ["ear", "eps", "fps", "nvr"], migration: "20251204132126_60114b6f-52d6-4502-a15b-a17d2539650d.sql" },
    ],
    allowed: ["ear", "eps", "fps", "nvr"],
    unreachable: [],
  },
  {
    table: "services_catalog",
    column: "billing_model",
    constraints: [
      { name: "services_catalog_billing_model_check", values: ["fixed", "hourly", "monthly"], migration: "20251125171545_fcb626d1-1d93-46ad-89eb-d04902c78286.sql" },
    ],
    allowed: ["fixed", "hourly", "monthly"],
    unreachable: [],
  },
  {
    table: "services_catalog",
    column: "entity_scope",
    constraints: [
      { name: "services_catalog_entity_scope_check", values: ["company", "either", "individual", "partnership"], migration: "20260602210920_f7a0e684-d797-4dca-9e40-4b7219e88f32.sql" },
    ],
    allowed: ["company", "either", "individual", "partnership"],
    unreachable: [],
  },
  {
    table: "sla_definitions",
    column: "sla_type",
    constraints: [
      { name: "sla_definitions_sla_type_check", values: ["client_email", "in_app_message", "internal_message", "job", "task"], migration: "20260202115658_0e3e9fcb-8976-44cf-b0b3-fc729db11321.sql" },
    ],
    allowed: ["client_email", "in_app_message", "internal_message", "job", "task"],
    unreachable: [],
  },
  {
    table: "sla_instances",
    column: "entity_type",
    constraints: [
      { name: "sla_instances_entity_type_check", values: ["conversation", "email", "job", "message", "task"], migration: "20260202115658_0e3e9fcb-8976-44cf-b0b3-fc729db11321.sql" },
    ],
    allowed: ["conversation", "email", "job", "message", "task"],
    unreachable: [],
  },
  {
    table: "sla_instances",
    column: "status",
    constraints: [
      { name: "sla_instances_status_check", values: ["active", "breached", "completed", "paused"], migration: "20260202115658_0e3e9fcb-8976-44cf-b0b3-fc729db11321.sql" },
    ],
    allowed: ["active", "breached", "completed", "paused"],
    unreachable: [],
  },
  {
    table: "suppressed_emails",
    column: "reason",
    constraints: [
      { name: "suppressed_emails_reason_check", values: ["bounce", "complaint", "unsubscribe"], migration: "20260617194841_email_infra.sql" },
    ],
    allowed: ["bounce", "complaint", "unsubscribe"],
    unreachable: [],
  },
  {
    table: "tb_account_mappings",
    column: "source_type",
    constraints: [
      { name: "tb_account_mappings_source_type_check", values: ["csv", "freeagent", "quickbooks", "sage", "xero"], migration: "20251128170320_10dda9a9-e75a-4bb4-bdde-32dbbc976ee4.sql" },
    ],
    allowed: ["csv", "freeagent", "quickbooks", "sage", "xero"],
    unreachable: [],
  },
  {
    table: "team_invitations",
    column: "role",
    constraints: [
      { name: "team_invitations_role_check", values: ["admin", "staff"], migration: "20251125193807_3f009137-0727-42df-a119-68ccadfdee5f.sql" },
    ],
    allowed: ["admin", "staff"],
    unreachable: [],
  },
  {
    table: "template_blocks",
    column: "block_type",
    constraints: [
      { name: "template_blocks_block_type_check", values: ["deadline_block", "records_request", "task_group"], migration: "20251208004816_867ae0d2-ade9-4806-97c5-ae0dff749259.sql" },
    ],
    allowed: ["deadline_block", "records_request", "task_group"],
    unreachable: [],
  },
  {
    table: "templates",
    column: "status",
    constraints: [
      { name: "templates_status_check", values: ["active", "inactive"], migration: "20251126133115_01060011-edd5-4760-b991-4969b743362b.sql" },
    ],
    allowed: ["active", "inactive"],
    unreachable: [],
  },
  {
    table: "templates",
    column: "type",
    constraints: [
      { name: "templates_type_check", values: ["automation", "checklist", "email", "job", "questionnaire", "task", "workpaper"], migration: "20251126132937_90e0abe2-d57b-4e6c-9762-d3898629dd48.sql" },
    ],
    allowed: ["automation", "checklist", "email", "job", "questionnaire", "task", "workpaper"],
    unreachable: [],
  },
  {
    table: "transport_jobs",
    column: "channel",
    constraints: [
      { name: "transport_jobs_channel_check", values: ["ch", "hmrc_ct", "hmrc_vat"], migration: "20260809160000_def_036_transport_jobs.sql" },
    ],
    allowed: ["ch", "hmrc_ct", "hmrc_vat"],
    unreachable: [],
  },
  {
    table: "transport_jobs",
    column: "operation",
    constraints: [
      { name: "transport_jobs_operation_check", values: ["delete", "poll"], migration: "20260809160000_def_036_transport_jobs.sql" },
    ],
    allowed: ["delete", "poll"],
    unreachable: [],
  },
  {
    table: "transport_jobs",
    column: "status",
    constraints: [
      { name: "transport_jobs_status_check", values: ["cancelled", "completed", "failed", "processing", "queued"], migration: "20260809160000_def_036_transport_jobs.sql" },
    ],
    allowed: ["cancelled", "completed", "failed", "processing", "queued"],
    unreachable: [],
  },
  {
    table: "trial_balance_snapshots",
    column: "source_type",
    constraints: [
      { name: "trial_balance_snapshots_source_type_check", values: ["freeagent", "manual_import", "native", "quickbooks", "sage", "xero"], migration: "20251128170320_10dda9a9-e75a-4bb4-bdde-32dbbc976ee4.sql" },
    ],
    allowed: ["freeagent", "manual_import", "native", "quickbooks", "sage", "xero"],
    unreachable: [],
  },
  {
    table: "trial_balance_snapshots",
    column: "status",
    constraints: [
      { name: "trial_balance_snapshots_status_check", values: ["draft", "finalised", "superseded", "used_in_workpaper"], migration: "20260725100000_tb_snapshot_draft_lifecycle.sql" },
    ],
    allowed: ["draft", "finalised", "superseded", "used_in_workpaper"],
    unreachable: [],
  },
  {
    table: "truelayer_auth_states",
    column: "mode",
    constraints: [
      { name: "truelayer_auth_states_mode_check", values: ["connect", "reconnect"], migration: "20260608123906_6a60a02c-09fd-493d-a6fd-3d2a5acc9bc2.sql" },
    ],
    allowed: ["connect", "reconnect"],
    unreachable: [],
  },
  {
    table: "user_saved_views",
    column: "entity_type",
    constraints: [
      { name: "user_saved_views_entity_type_check", values: ["bills", "clients", "deadlines", "emails", "invoices", "jobs"], migration: "20251217142032_b8113a6b-8109-4ab5-bb49-76b9d46a87c0.sql" },
    ],
    allowed: ["bills", "clients", "deadlines", "emails", "invoices", "jobs"],
    unreachable: [],
  },
  {
    table: "vat_adjustments",
    column: "adjustment_type",
    constraints: [
      { name: "chk_vat_adjustment_type", values: ["BAD_DEBT_RELIEF", "CAPITAL_GOODS_SCHEME", "CASH_ACCOUNTING_TIMING", "FLAT_RATE_ADJUSTMENT", "FUEL_SCALE_CHARGE", "MANUAL_CORRECTION", "OTHER", "PARTIAL_EXEMPTION", "PRIOR_PERIOD_CORRECTION"], migration: "20251214170027_2f283e64-1618-449e-81c1-8d795bfea462.sql" },
    ],
    allowed: ["BAD_DEBT_RELIEF", "CAPITAL_GOODS_SCHEME", "CASH_ACCOUNTING_TIMING", "FLAT_RATE_ADJUSTMENT", "FUEL_SCALE_CHARGE", "MANUAL_CORRECTION", "OTHER", "PARTIAL_EXEMPTION", "PRIOR_PERIOD_CORRECTION"],
    unreachable: [],
  },
  {
    table: "vat_codes",
    column: "supply_category",
    constraints: [
      { name: "chk_vat_code_scheme_type", values: ["GOODS", "GOODS_AND_SERVICES", "SERVICES"], migration: "20251214170027_2f283e64-1618-449e-81c1-8d795bfea462.sql" },
    ],
    allowed: ["GOODS", "GOODS_AND_SERVICES", "SERVICES"],
    unreachable: [],
  },
  {
    table: "vat_periods",
    column: "reconciliation_status",
    constraints: [
      { name: "chk_vat_period_reconciliation", values: ["MATCHED", "MISMATCH", "PENDING", "WARNING"], migration: "20251214170027_2f283e64-1618-449e-81c1-8d795bfea462.sql" },
    ],
    allowed: ["MATCHED", "MISMATCH", "PENDING", "WARNING"],
    unreachable: [],
  },
  {
    table: "vat_periods",
    column: "status",
    constraints: [
      { name: "chk_vat_period_status", values: ["AMENDED", "CALCULATING", "FILED", "FINALISED", "FINALISING", "OPEN", "READY_FOR_REVIEW"], migration: "20251214170027_2f283e64-1618-449e-81c1-8d795bfea462.sql" },
    ],
    allowed: ["AMENDED", "CALCULATING", "FILED", "FINALISED", "FINALISING", "OPEN", "READY_FOR_REVIEW"],
    unreachable: [],
  },
  {
    table: "vat_periods",
    column: "vat_scheme",
    constraints: [
      { name: "chk_vat_period_scheme", values: ["ANNUAL_ACCOUNTING", "CASH_ACCOUNTING", "FLAT_RATE", "STANDARD"], migration: "20251214170027_2f283e64-1618-449e-81c1-8d795bfea462.sql" },
    ],
    allowed: ["ANNUAL_ACCOUNTING", "CASH_ACCOUNTING", "FLAT_RATE", "STANDARD"],
    unreachable: [],
  },
  {
    table: "vat_reconciliations",
    column: "classification",
    constraints: [
      { name: "vat_reconciliations_classification_check", values: ["INFO", "WARNING"], migration: "20251214170851_bac8ed64-07b1-418f-8673-4d83b3acd7ee.sql" },
    ],
    allowed: ["INFO", "WARNING"],
    unreachable: [],
  },
  {
    table: "vat_registrations",
    column: "annual_accounting_payment_schedule",
    constraints: [
      { name: "vat_registrations_annual_accounting_payment_schedule_check", values: ["MONTHLY", "QUARTERLY"], migration: "20251214171844_40398d4b-bf1d-44a7-829f-5704a60cdbba.sql" },
    ],
    allowed: ["MONTHLY", "QUARTERLY"],
    unreachable: [],
  },
  {
    table: "vat_registrations",
    column: "partial_exemption_method",
    constraints: [
      { name: "vat_registrations_partial_exemption_method_check", values: ["SPECIAL", "STANDARD"], migration: "20251214171844_40398d4b-bf1d-44a7-829f-5704a60cdbba.sql" },
    ],
    allowed: ["SPECIAL", "STANDARD"],
    unreachable: [],
  },
  {
    table: "vat_registrations",
    column: "scheme",
    constraints: [
      { name: "vat_registrations_scheme_check", values: ["ANNUAL_ACCOUNTING", "CASH_ACCOUNTING", "FLAT_RATE", "STANDARD"], migration: "20251214171844_40398d4b-bf1d-44a7-829f-5704a60cdbba.sql" },
    ],
    allowed: ["ANNUAL_ACCOUNTING", "CASH_ACCOUNTING", "FLAT_RATE", "STANDARD"],
    unreachable: [],
  },
  {
    table: "vat_transaction_links",
    column: "source_type",
    constraints: [
      { name: "chk_vat_link_source_type", values: ["bank_split", "bill_line", "invoice_line", "journal_line", "ledger_entry"], migration: "20251214170027_2f283e64-1618-449e-81c1-8d795bfea462.sql" },
    ],
    allowed: ["bank_split", "bill_line", "invoice_line", "journal_line", "ledger_entry"],
    unreachable: [],
  },
  {
    table: "workpaper_category_mappings",
    column: "mapping_type",
    constraints: [
      { name: "workpaper_category_mappings_mapping_type_check", values: ["company_accounts", "ct600", "self_assessment", "vat_return"], migration: "20251128170320_10dda9a9-e75a-4bb4-bdde-32dbbc976ee4.sql" },
    ],
    allowed: ["company_accounts", "ct600", "self_assessment", "vat_return"],
    unreachable: [],
  },
  {
    table: "workpaper_instances",
    column: "source_type",
    constraints: [
      { name: "workpaper_instances_source_type_check", values: ["hybrid", "manual", "questionnaire", "trial_balance"], migration: "20251128170320_10dda9a9-e75a-4bb4-bdde-32dbbc976ee4.sql" },
    ],
    allowed: ["hybrid", "manual", "questionnaire", "trial_balance"],
    unreachable: [],
  },
  {
    table: "workpaper_instances",
    column: "status",
    constraints: [
      { name: "valid_status", values: ["draft", "finalised", "in_progress", "ready_for_review"], migration: "20251127004529_905ab965-6694-4319-be9d-ea8aa1f7d13d.sql" },
    ],
    allowed: ["draft", "finalised", "in_progress", "ready_for_review"],
    unreachable: [],
  },
  {
    table: "workpaper_templates",
    column: "job_type",
    constraints: [
      { name: "workpaper_templates_job_type_check", values: ["BOOKKEEPING", "CIS", "CT600", "LTD_ACCOUNTS", "OTHER", "PARTNERSHIP", "PAYROLL", "SA_MTD", "SA_NON_MTD", "VAT"], migration: "20260217130613_a778448c-48b6-4b93-a66f-5f11910b72da.sql" },
    ],
    allowed: ["BOOKKEEPING", "CIS", "CT600", "LTD_ACCOUNTS", "OTHER", "PARTNERSHIP", "PAYROLL", "SA_MTD", "SA_NON_MTD", "VAT"],
    unreachable: [],
  },
] as const;

/** Lookup by `"table.column"` — the values you may actually write. */
export const DB_VOCABULARY: Readonly<Record<string, readonly string[]>> =
  Object.freeze(
    Object.fromEntries(
      DB_CHECK_VOCABULARIES.map((v) => [`${v.table}.${v.column}`, v.allowed]),
    ),
  );

/** Columns whose live constraints contradict each other. Should be empty; see the test. */
export const CONTRADICTORY_COLUMNS: readonly DbColumnVocabulary[] =
  DB_CHECK_VOCABULARIES.filter((v) => v.unreachable.length > 0);

/**
 * Assert a value is writable, at the point of writing, with a message that names the
 * legal set. Cheaper than a 23514 from Postgres, which names the constraint but not the
 * vocabulary, and arrives after the transaction has already done work.
 */
export function assertVocabulary(
  table: string,
  column: string,
  value: string,
): void {
  const allowed = DB_VOCABULARY[`${table}.${column}`];
  if (!allowed) return; // Column carries no CHECK constraint; nothing to enforce.
  if (!allowed.includes(value)) {
    throw new Error(
      `${table}.${column} cannot be "${value}". Allowed: ${allowed.join(", ")}.`,
    );
  }
}
