export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      accountant_client_links: {
        Row: {
          activated_at: string | null
          client_id: string | null
          client_user_id: string | null
          company_id: string | null
          created_at: string
          decline_reason: string | null
          ended_at: string | null
          id: string
          initiated_by: Database["public"]["Enums"]["link_initiator"]
          notes: string | null
          practice_id: string
          status: Database["public"]["Enums"]["accountant_client_link_status"]
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          client_id?: string | null
          client_user_id?: string | null
          company_id?: string | null
          created_at?: string
          decline_reason?: string | null
          ended_at?: string | null
          id?: string
          initiated_by?: Database["public"]["Enums"]["link_initiator"]
          notes?: string | null
          practice_id: string
          status?: Database["public"]["Enums"]["accountant_client_link_status"]
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          client_id?: string | null
          client_user_id?: string | null
          company_id?: string | null
          created_at?: string
          decline_reason?: string | null
          ended_at?: string | null
          id?: string
          initiated_by?: Database["public"]["Enums"]["link_initiator"]
          notes?: string | null
          practice_id?: string
          status?: Database["public"]["Enums"]["accountant_client_link_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accountant_client_links_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accountant_client_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accountant_client_links_practice_id_fkey"
            columns: ["practice_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts_model_snapshots: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          balance_sheet: Json
          company_id: string
          created_at: string
          director_approval: Json
          generator_version: string
          id: string
          notes: Json
          organization_id: string
          period_end: string
          period_start: string
          snapshot_hash: string
          status: string
          taxonomy_version: string
          workpaper_instance_id: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          balance_sheet: Json
          company_id: string
          created_at?: string
          director_approval?: Json
          generator_version?: string
          id?: string
          notes?: Json
          organization_id: string
          period_end: string
          period_start: string
          snapshot_hash: string
          status?: string
          taxonomy_version?: string
          workpaper_instance_id?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          balance_sheet?: Json
          company_id?: string
          created_at?: string
          director_approval?: Json
          generator_version?: string
          id?: string
          notes?: Json
          organization_id?: string
          period_end?: string
          period_start?: string
          snapshot_hash?: string
          status?: string
          taxonomy_version?: string
          workpaper_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_model_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_model_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_rate_limits: {
        Row: {
          count: number
          created_at: string
          id: string
          key: string
          organization_id: string | null
          scope: string | null
          user_id: string | null
          window_start: string
        }
        Insert: {
          count?: number
          created_at?: string
          id?: string
          key: string
          organization_id?: string | null
          scope?: string | null
          user_id?: string | null
          window_start?: string
        }
        Update: {
          count?: number
          created_at?: string
          id?: string
          key?: string
          organization_id?: string | null
          scope?: string | null
          user_id?: string | null
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_rate_limits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_revocation_log: {
        Row: {
          approval_id: string
          approval_scope: string
          filing_id: string
          id: string
          metadata: Json | null
          new_snapshot_hash: string | null
          new_snapshot_id: string | null
          old_snapshot_hash: string | null
          old_snapshot_id: string | null
          organization_id: string
          revocation_reason: string
          revoked_at: string
          system_actor: string
        }
        Insert: {
          approval_id: string
          approval_scope: string
          filing_id: string
          id?: string
          metadata?: Json | null
          new_snapshot_hash?: string | null
          new_snapshot_id?: string | null
          old_snapshot_hash?: string | null
          old_snapshot_id?: string | null
          organization_id: string
          revocation_reason: string
          revoked_at?: string
          system_actor?: string
        }
        Update: {
          approval_id?: string
          approval_scope?: string
          filing_id?: string
          id?: string
          metadata?: Json | null
          new_snapshot_hash?: string | null
          new_snapshot_id?: string | null
          old_snapshot_hash?: string | null
          old_snapshot_id?: string | null
          organization_id?: string
          revocation_reason?: string
          revoked_at?: string
          system_actor?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_revocation_log_filing_id_fkey"
            columns: ["filing_id"]
            isOneToOne: false
            referencedRelation: "filings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_revocation_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_role: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          field_name: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          new_value: string | null
          old_value: string | null
          organization_id: string
          reason: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          actor_role?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          field_name?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          organization_id: string
          reason?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          actor_role?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          field_name?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          organization_id?: string
          reason?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          organization_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          organization_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_category_settings: {
        Row: {
          category: string
          created_at: string
          id: string
          is_enabled: boolean
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_category_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_chaser_messages: {
        Row: {
          chaser_run_id: string
          created_at: string
          failure_reason: string | null
          id: string
          idempotency_key: string
          job_id: string | null
          organization_id: string
          rendered_body: string
          rendered_subject: string
          send_at: string
          sent_at: string | null
          status: string
          subject_id: string | null
          subject_type: string | null
          template_id: string | null
          to_email: string
        }
        Insert: {
          chaser_run_id: string
          created_at?: string
          failure_reason?: string | null
          id?: string
          idempotency_key: string
          job_id?: string | null
          organization_id: string
          rendered_body?: string
          rendered_subject?: string
          send_at?: string
          sent_at?: string | null
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          template_id?: string | null
          to_email: string
        }
        Update: {
          chaser_run_id?: string
          created_at?: string
          failure_reason?: string | null
          id?: string
          idempotency_key?: string
          job_id?: string | null
          organization_id?: string
          rendered_body?: string
          rendered_subject?: string
          send_at?: string
          sent_at?: string | null
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          template_id?: string | null
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_chaser_messages_chaser_run_id_fkey"
            columns: ["chaser_run_id"]
            isOneToOne: false
            referencedRelation: "automation_chaser_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_chaser_messages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_chaser_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_chaser_messages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_chaser_policies: {
        Row: {
          applies_to_records_created_after: string | null
          category: string | null
          created_at: string
          description: string | null
          email_template_id: string | null
          frequency_interval: number
          frequency_unit: string
          id: string
          is_enabled: boolean
          is_sales: boolean
          max_frequency_interval: number
          min_frequency_interval: number
          name: string
          organization_id: string
          paused_at: string | null
          recipient_resolver: string | null
          scope: string
          send_mode: string
          service_code: string
          stop_condition_type: string
          stop_condition_value: string
          stop_on_unsubscribe: boolean
          suppression_category: string | null
          trigger_offset_days: number
          trigger_type: string
          updated_at: string
        }
        Insert: {
          applies_to_records_created_after?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          email_template_id?: string | null
          frequency_interval?: number
          frequency_unit?: string
          id?: string
          is_enabled?: boolean
          is_sales?: boolean
          max_frequency_interval?: number
          min_frequency_interval?: number
          name: string
          organization_id: string
          paused_at?: string | null
          recipient_resolver?: string | null
          scope?: string
          send_mode?: string
          service_code: string
          stop_condition_type?: string
          stop_condition_value: string
          stop_on_unsubscribe?: boolean
          suppression_category?: string | null
          trigger_offset_days?: number
          trigger_type: string
          updated_at?: string
        }
        Update: {
          applies_to_records_created_after?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          email_template_id?: string | null
          frequency_interval?: number
          frequency_unit?: string
          id?: string
          is_enabled?: boolean
          is_sales?: boolean
          max_frequency_interval?: number
          min_frequency_interval?: number
          name?: string
          organization_id?: string
          paused_at?: string | null
          recipient_resolver?: string | null
          scope?: string
          send_mode?: string
          service_code?: string
          stop_condition_type?: string
          stop_condition_value?: string
          stop_on_unsubscribe?: boolean
          suppression_category?: string | null
          trigger_offset_days?: number
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_chaser_policies_email_template_id_fkey"
            columns: ["email_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_chaser_policies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_chaser_runs: {
        Row: {
          created_at: string
          email_template_id: string | null
          frequency_interval: number
          frequency_unit: string
          id: string
          job_id: string | null
          last_sent_at: string | null
          next_send_at: string | null
          organization_id: string
          period_end: string | null
          period_start: string | null
          policy_id: string
          send_count: number
          status: string
          stop_condition_value: string
          subject_id: string | null
          subject_type: string | null
          trigger_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email_template_id?: string | null
          frequency_interval: number
          frequency_unit: string
          id?: string
          job_id?: string | null
          last_sent_at?: string | null
          next_send_at?: string | null
          organization_id: string
          period_end?: string | null
          period_start?: string | null
          policy_id: string
          send_count?: number
          status?: string
          stop_condition_value?: string
          subject_id?: string | null
          subject_type?: string | null
          trigger_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email_template_id?: string | null
          frequency_interval?: number
          frequency_unit?: string
          id?: string
          job_id?: string | null
          last_sent_at?: string | null
          next_send_at?: string | null
          organization_id?: string
          period_end?: string | null
          period_start?: string | null
          policy_id?: string
          send_count?: number
          status?: string
          stop_condition_value?: string
          subject_id?: string | null
          subject_type?: string | null
          trigger_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_chaser_runs_email_template_id_fkey"
            columns: ["email_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_chaser_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_chaser_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_chaser_runs_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "automation_chaser_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_client_overrides: {
        Row: {
          chaser_policy_id: string | null
          client_id: string
          config_overrides: Json
          created_at: string
          enabled: boolean | null
          id: string
          organization_id: string
          rule_id: string | null
          updated_at: string
        }
        Insert: {
          chaser_policy_id?: string | null
          client_id: string
          config_overrides?: Json
          created_at?: string
          enabled?: boolean | null
          id?: string
          organization_id: string
          rule_id?: string | null
          updated_at?: string
        }
        Update: {
          chaser_policy_id?: string | null
          client_id?: string
          config_overrides?: Json
          created_at?: string
          enabled?: boolean | null
          id?: string
          organization_id?: string
          rule_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_client_overrides_chaser_policy_id_fkey"
            columns: ["chaser_policy_id"]
            isOneToOne: false
            referencedRelation: "automation_chaser_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_client_overrides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_client_overrides_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_entity_link_suggestions: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          confidence_score: number
          created_at: string
          id: string
          metadata: Json
          organization_id: string
          rejected_at: string | null
          rejected_by: string | null
          source_entity_id: string
          source_entity_type: string
          suggested_entity_id: string
          suggested_entity_type: string
          suggestion_reason: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          confidence_score?: number
          created_at?: string
          id?: string
          metadata?: Json
          organization_id: string
          rejected_at?: string | null
          rejected_by?: string | null
          source_entity_id: string
          source_entity_type: string
          suggested_entity_id: string
          suggested_entity_type: string
          suggestion_reason?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          confidence_score?: number
          created_at?: string
          id?: string
          metadata?: Json
          organization_id?: string
          rejected_at?: string | null
          rejected_by?: string | null
          source_entity_id?: string
          source_entity_type?: string
          suggested_entity_id?: string
          suggested_entity_type?: string
          suggestion_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_entity_link_suggestions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_events: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          metadata: Json | null
          new_value: Json | null
          old_value: Json | null
          organization_id: string
          processed_at: string | null
          processed_by_execution_id: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          event_type: string
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          organization_id: string
          processed_at?: string | null
          processed_by_execution_id?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          organization_id?: string
          processed_at?: string | null
          processed_by_execution_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_events_processed_by_execution_id_fkey"
            columns: ["processed_by_execution_id"]
            isOneToOne: false
            referencedRelation: "automation_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_executions: {
        Row: {
          action_result: Json | null
          automation_rule_id: string
          created_at: string
          error_message: string | null
          executed_at: string | null
          execution_hash: string | null
          id: string
          organization_id: string
          status: string
          triggered_by_entity: string
          triggered_by_id: string
        }
        Insert: {
          action_result?: Json | null
          automation_rule_id: string
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          execution_hash?: string | null
          id?: string
          organization_id: string
          status?: string
          triggered_by_entity: string
          triggered_by_id: string
        }
        Update: {
          action_result?: Json | null
          automation_rule_id?: string
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          execution_hash?: string | null
          id?: string
          organization_id?: string
          status?: string
          triggered_by_entity?: string
          triggered_by_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_executions_automation_rule_id_fkey"
            columns: ["automation_rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_executions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_idempotency_keys: {
        Row: {
          chaser_policy_id: string | null
          created_at: string
          id: string
          key: string
          metadata: Json
          organization_id: string
          rule_id: string | null
          workflow_instance_id: string | null
        }
        Insert: {
          chaser_policy_id?: string | null
          created_at?: string
          id?: string
          key: string
          metadata?: Json
          organization_id: string
          rule_id?: string | null
          workflow_instance_id?: string | null
        }
        Update: {
          chaser_policy_id?: string | null
          created_at?: string
          id?: string
          key?: string
          metadata?: Json
          organization_id?: string
          rule_id?: string | null
          workflow_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_idempotency_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_job_overrides: {
        Row: {
          chaser_policy_id: string | null
          config_overrides: Json
          created_at: string
          enabled: boolean | null
          id: string
          job_id: string
          organization_id: string
          rule_id: string | null
          updated_at: string
        }
        Insert: {
          chaser_policy_id?: string | null
          config_overrides?: Json
          created_at?: string
          enabled?: boolean | null
          id?: string
          job_id: string
          organization_id: string
          rule_id?: string | null
          updated_at?: string
        }
        Update: {
          chaser_policy_id?: string | null
          config_overrides?: Json
          created_at?: string
          enabled?: boolean | null
          id?: string
          job_id?: string
          organization_id?: string
          rule_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_job_overrides_chaser_policy_id_fkey"
            columns: ["chaser_policy_id"]
            isOneToOne: false
            referencedRelation: "automation_chaser_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_job_overrides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_job_overrides_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_library_sets: {
        Row: {
          created_at: string
          description: string
          id: string
          is_default: boolean
          name: string
          updated_at: string
          version: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
          version: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      automation_org_overrides: {
        Row: {
          assignment_overrides: Json
          channel_overrides: Json
          created_at: string
          enabled: boolean
          id: string
          message_template_overrides: Json
          optional_step_toggles: Json
          org_id: string
          template_id: string
          timing_overrides: Json
          updated_at: string
        }
        Insert: {
          assignment_overrides?: Json
          channel_overrides?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          message_template_overrides?: Json
          optional_step_toggles?: Json
          org_id: string
          template_id: string
          timing_overrides?: Json
          updated_at?: string
        }
        Update: {
          assignment_overrides?: Json
          channel_overrides?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          message_template_overrides?: Json
          optional_step_toggles?: Json
          org_id?: string
          template_id?: string
          timing_overrides?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_org_overrides_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_org_overrides_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "automation_workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_pauses: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          organization_id: string
          paused_by: string | null
          reason: string | null
          rule_id: string | null
          scope: string
          target_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          organization_id: string
          paused_by?: string | null
          reason?: string | null
          rule_id?: string | null
          scope: string
          target_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          organization_id?: string
          paused_by?: string | null
          reason?: string | null
          rule_id?: string | null
          scope?: string
          target_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_pauses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rate_limits: {
        Row: {
          action_count: number | null
          automation_rule_id: string | null
          created_at: string | null
          id: string
          organization_id: string
          window_start: string
          window_type: string
        }
        Insert: {
          action_count?: number | null
          automation_rule_id?: string | null
          created_at?: string | null
          id?: string
          organization_id: string
          window_start: string
          window_type: string
        }
        Update: {
          action_count?: number | null
          automation_rule_id?: string | null
          created_at?: string | null
          id?: string
          organization_id?: string
          window_start?: string
          window_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rate_limits_automation_rule_id_fkey"
            columns: ["automation_rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_rate_limits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rule_templates: {
        Row: {
          action_config: Json | null
          action_type: string
          category: string | null
          created_at: string | null
          created_by: string | null
          default_frequency: Json | null
          default_recipient_resolver: string | null
          default_scope: string | null
          default_send_mode: string | null
          default_template_id: string | null
          description: string | null
          id: string
          is_sales_category: boolean
          is_system: boolean | null
          name: string
          organization_id: string | null
          trigger_config: Json | null
          trigger_type: string
          updated_at: string | null
          version: number | null
        }
        Insert: {
          action_config?: Json | null
          action_type: string
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          default_frequency?: Json | null
          default_recipient_resolver?: string | null
          default_scope?: string | null
          default_send_mode?: string | null
          default_template_id?: string | null
          description?: string | null
          id?: string
          is_sales_category?: boolean
          is_system?: boolean | null
          name: string
          organization_id?: string | null
          trigger_config?: Json | null
          trigger_type: string
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          action_config?: Json | null
          action_type?: string
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          default_frequency?: Json | null
          default_recipient_resolver?: string | null
          default_scope?: string | null
          default_send_mode?: string | null
          default_template_id?: string | null
          description?: string | null
          id?: string
          is_sales_category?: boolean
          is_system?: boolean | null
          name?: string
          organization_id?: string | null
          trigger_config?: Json | null
          trigger_type?: string
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_rule_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          action_config: Json
          action_type: string
          applies_to_records_created_after: string | null
          category: string | null
          created_at: string
          email_mode: string | null
          id: string
          idempotency_template: string | null
          is_active: boolean | null
          is_sales: boolean
          name: string
          organization_id: string
          paused_at: string | null
          recipient_resolver: string | null
          scope: string
          send_immediately_override: boolean | null
          send_mode: string
          template_id: string | null
          trigger_config: Json | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          action_config?: Json
          action_type: string
          applies_to_records_created_after?: string | null
          category?: string | null
          created_at?: string
          email_mode?: string | null
          id?: string
          idempotency_template?: string | null
          is_active?: boolean | null
          is_sales?: boolean
          name: string
          organization_id: string
          paused_at?: string | null
          recipient_resolver?: string | null
          scope?: string
          send_immediately_override?: boolean | null
          send_mode?: string
          template_id?: string | null
          trigger_config?: Json | null
          trigger_type: string
          updated_at?: string
        }
        Update: {
          action_config?: Json
          action_type?: string
          applies_to_records_created_after?: string | null
          category?: string | null
          created_at?: string
          email_mode?: string | null
          id?: string
          idempotency_template?: string | null
          is_active?: boolean | null
          is_sales?: boolean
          name?: string
          organization_id?: string
          paused_at?: string | null
          recipient_resolver?: string | null
          scope?: string
          send_immediately_override?: boolean | null
          send_mode?: string
          template_id?: string | null
          trigger_config?: Json | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_rules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_trigger_contracts: {
        Row: {
          created_at: string
          description: string
          id: string
          is_active: boolean
          key: string
          name: string
          payload_schema: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          key: string
          name: string
          payload_schema?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          key?: string
          name?: string
          payload_schema?: Json
          updated_at?: string
        }
        Relationships: []
      }
      automation_workflow_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          instance_id: string
          org_id: string
          payload: Json
          step_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          instance_id: string
          org_id: string
          payload?: Json
          step_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          instance_id?: string
          org_id?: string
          payload?: Json
          step_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_workflow_events_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "automation_workflow_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_workflow_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_workflow_events_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "automation_workflow_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_workflow_instances: {
        Row: {
          cancelled_at: string | null
          client_id: string | null
          company_id: string | null
          context: Json
          created_at: string
          current_step_id: string | null
          dead_lettered_at: string | null
          error_message: string | null
          id: string
          last_error: string | null
          next_retry_at: string | null
          next_run_at: string | null
          org_id: string
          paused_at: string | null
          period_key: string
          retry_count: number
          service_id: string | null
          status: string
          template_id: string
          triggering_event_id: string | null
          triggering_event_key: string
          updated_at: string
          waiting_for_event_key: string | null
        }
        Insert: {
          cancelled_at?: string | null
          client_id?: string | null
          company_id?: string | null
          context?: Json
          created_at?: string
          current_step_id?: string | null
          dead_lettered_at?: string | null
          error_message?: string | null
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          next_run_at?: string | null
          org_id: string
          paused_at?: string | null
          period_key: string
          retry_count?: number
          service_id?: string | null
          status?: string
          template_id: string
          triggering_event_id?: string | null
          triggering_event_key: string
          updated_at?: string
          waiting_for_event_key?: string | null
        }
        Update: {
          cancelled_at?: string | null
          client_id?: string | null
          company_id?: string | null
          context?: Json
          created_at?: string
          current_step_id?: string | null
          dead_lettered_at?: string | null
          error_message?: string | null
          id?: string
          last_error?: string | null
          next_retry_at?: string | null
          next_run_at?: string | null
          org_id?: string
          paused_at?: string | null
          period_key?: string
          retry_count?: number
          service_id?: string | null
          status?: string
          template_id?: string
          triggering_event_id?: string | null
          triggering_event_key?: string
          updated_at?: string
          waiting_for_event_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_workflow_instances_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_workflow_instances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_workflow_instances_current_step_id_fkey"
            columns: ["current_step_id"]
            isOneToOne: false
            referencedRelation: "automation_workflow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_workflow_instances_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_workflow_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "automation_workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_workflow_steps: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_blocking: boolean
          is_optional: boolean
          step_key: string
          step_order: number
          step_type: string
          template_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_blocking?: boolean
          is_optional?: boolean
          step_key: string
          step_order: number
          step_type: string
          template_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_blocking?: boolean
          is_optional?: boolean
          step_key?: string
          step_order?: number
          step_type?: string
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_workflow_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "automation_workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_workflow_templates: {
        Row: {
          applies_to_client_types: string[] | null
          created_at: string
          default_enabled: boolean
          definition_kind: string | null
          description: string
          id: string
          key: string
          library_set_id: string | null
          name: string
          org_id: string | null
          service_type: string | null
          updated_at: string
        }
        Insert: {
          applies_to_client_types?: string[] | null
          created_at?: string
          default_enabled?: boolean
          definition_kind?: string | null
          description?: string
          id?: string
          key: string
          library_set_id?: string | null
          name: string
          org_id?: string | null
          service_type?: string | null
          updated_at?: string
        }
        Update: {
          applies_to_client_types?: string[] | null
          created_at?: string
          default_enabled?: boolean
          definition_kind?: string | null
          description?: string
          id?: string
          key?: string
          library_set_id?: string | null
          name?: string
          org_id?: string | null
          service_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_workflow_templates_library_set_id_fkey"
            columns: ["library_set_id"]
            isOneToOne: false
            referencedRelation: "automation_library_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_workflow_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_workflow_trigger_map: {
        Row: {
          created_at: string
          filter_config: Json
          id: string
          trigger_contract_id: string
          workflow_template_id: string
        }
        Insert: {
          created_at?: string
          filter_config?: Json
          id?: string
          trigger_contract_id: string
          workflow_template_id: string
        }
        Update: {
          created_at?: string
          filter_config?: Json
          id?: string
          trigger_contract_id?: string
          workflow_template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_workflow_trigger_map_trigger_contract_id_fkey"
            columns: ["trigger_contract_id"]
            isOneToOne: false
            referencedRelation: "automation_trigger_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_workflow_trigger_map_workflow_template_id_fkey"
            columns: ["workflow_template_id"]
            isOneToOne: false
            referencedRelation: "automation_workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_id: string
          account_number: string | null
          client_id: string | null
          company_id: string | null
          created_at: string | null
          currency: string
          external_identifier: string | null
          id: string
          is_active: boolean | null
          last_synced_at: string | null
          name: string
          organization_id: string
          provider: string | null
          sort_code: string | null
          truelayer_account_id: string | null
          updated_at: string | null
        }
        Insert: {
          account_id: string
          account_number?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string
          external_identifier?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          name: string
          organization_id: string
          provider?: string | null
          sort_code?: string | null
          truelayer_account_id?: string | null
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          account_number?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string
          external_identifier?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          name?: string
          organization_id?: string
          provider?: string | null
          sort_code?: string | null
          truelayer_account_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "bookkeeping_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_connections: {
        Row: {
          access_token: string | null
          bank_logo_url: string | null
          bank_name: string | null
          client_id: string | null
          company_id: string | null
          consent_expires_at: string | null
          created_at: string | null
          id: string
          last_error: string | null
          last_synced_at: string | null
          organization_id: string
          provider: string
          provider_connection_id: string | null
          refresh_token: string | null
          scope: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          access_token?: string | null
          bank_logo_url?: string | null
          bank_name?: string | null
          client_id?: string | null
          company_id?: string | null
          consent_expires_at?: string | null
          created_at?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          organization_id: string
          provider?: string
          provider_connection_id?: string | null
          refresh_token?: string | null
          scope?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          access_token?: string | null
          bank_logo_url?: string | null
          bank_name?: string | null
          client_id?: string | null
          company_id?: string | null
          consent_expires_at?: string | null
          created_at?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          organization_id?: string
          provider?: string
          provider_connection_id?: string | null
          refresh_token?: string | null
          scope?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_connections_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_rule_executions: {
        Row: {
          applied_actions: Json | null
          bank_rule_id: string
          bank_transaction_id: string
          error_message: string | null
          executed_at: string | null
          executed_by: string | null
          id: string
          matched_conditions: Json | null
          organization_id: string
          result: string | null
        }
        Insert: {
          applied_actions?: Json | null
          bank_rule_id: string
          bank_transaction_id: string
          error_message?: string | null
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          matched_conditions?: Json | null
          organization_id: string
          result?: string | null
        }
        Update: {
          applied_actions?: Json | null
          bank_rule_id?: string
          bank_transaction_id?: string
          error_message?: string | null
          executed_at?: string | null
          executed_by?: string | null
          id?: string
          matched_conditions?: Json | null
          organization_id?: string
          result?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_rule_executions_bank_rule_id_fkey"
            columns: ["bank_rule_id"]
            isOneToOne: false
            referencedRelation: "bank_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_rule_executions_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_rule_executions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_rules: {
        Row: {
          actions: Json
          client_id: string | null
          company_id: string | null
          conditions: Json
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          last_applied_at: string | null
          organization_id: string
          priority: number | null
          rule_name: string
          times_applied: number | null
          updated_at: string | null
        }
        Insert: {
          actions?: Json
          client_id?: string | null
          company_id?: string | null
          conditions?: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_applied_at?: string | null
          organization_id: string
          priority?: number | null
          rule_name: string
          times_applied?: number | null
          updated_at?: string | null
        }
        Update: {
          actions?: Json
          client_id?: string | null
          company_id?: string | null
          conditions?: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_applied_at?: string | null
          organization_id?: string
          priority?: number | null
          rule_name?: string
          times_applied?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_rules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          balance: number | null
          bank_account_id: string
          category: string | null
          client_id: string | null
          company_id: string | null
          created_at: string | null
          currency: string | null
          description: string
          id: string
          import_batch_id: string | null
          import_source: string | null
          matched_ledger_entry_id: string | null
          organization_id: string
          provider: string | null
          raw_json: Json | null
          rule_id: string | null
          status: string
          transaction_date: string
          truelayer_transaction_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          balance?: number | null
          bank_account_id: string
          category?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          description: string
          id?: string
          import_batch_id?: string | null
          import_source?: string | null
          matched_ledger_entry_id?: string | null
          organization_id: string
          provider?: string | null
          raw_json?: Json | null
          rule_id?: string | null
          status?: string
          transaction_date: string
          truelayer_transaction_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          balance?: number | null
          bank_account_id?: string
          category?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string
          id?: string
          import_batch_id?: string | null
          import_source?: string | null
          matched_ledger_entry_id?: string | null
          organization_id?: string
          provider?: string | null
          raw_json?: Json | null
          rule_id?: string | null
          status?: string
          transaction_date?: string
          truelayer_transaction_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_matched_ledger_entry_id_fkey"
            columns: ["matched_ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_lines: {
        Row: {
          account_id: string | null
          bill_id: string
          cash_vat_recognised: number | null
          created_at: string | null
          description: string | null
          gross_amount: number | null
          id: string
          line_number: number
          net_amount: number | null
          paid_amount: number | null
          paid_at: string | null
          payment_status: string | null
          quantity: number | null
          unit_price: number | null
          vat_amount: number | null
          vat_code_id: string | null
          vat_rate: number | null
        }
        Insert: {
          account_id?: string | null
          bill_id: string
          cash_vat_recognised?: number | null
          created_at?: string | null
          description?: string | null
          gross_amount?: number | null
          id?: string
          line_number?: number
          net_amount?: number | null
          paid_amount?: number | null
          paid_at?: string | null
          payment_status?: string | null
          quantity?: number | null
          unit_price?: number | null
          vat_amount?: number | null
          vat_code_id?: string | null
          vat_rate?: number | null
        }
        Update: {
          account_id?: string | null
          bill_id?: string
          cash_vat_recognised?: number | null
          created_at?: string | null
          description?: string | null
          gross_amount?: number | null
          id?: string
          line_number?: number
          net_amount?: number | null
          paid_amount?: number | null
          paid_at?: string | null
          payment_status?: string | null
          quantity?: number | null
          unit_price?: number | null
          vat_amount?: number | null
          vat_code_id?: string | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bill_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "bookkeeping_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_lines_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_lines_vat_code_id_fkey"
            columns: ["vat_code_id"]
            isOneToOne: false
            referencedRelation: "vat_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_payments: {
        Row: {
          amount: number
          bank_account_id: string | null
          bank_transaction_id: string | null
          bill_id: string
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          payment_date: string
          payment_method: string | null
          payment_type: string | null
          reference: string | null
          unallocated_amount: number | null
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          bank_transaction_id?: string | null
          bill_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date: string
          payment_method?: string | null
          payment_type?: string | null
          reference?: string | null
          unallocated_amount?: number | null
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          bank_transaction_id?: string | null
          bill_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          payment_type?: string | null
          reference?: string | null
          unallocated_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bill_payments_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_payments_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_payments_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          amount_paid: number | null
          approved_at: string | null
          approved_by: string | null
          bill_number: string | null
          client_id: string | null
          company_id: string | null
          created_at: string | null
          currency: string | null
          due_date: string
          exchange_rate: number | null
          id: string
          is_posted: boolean | null
          issue_date: string
          locked_fields: Json | null
          notes: string | null
          organization_id: string
          override_history: Json | null
          posted_at: string | null
          posted_by: string | null
          receipt_path: string | null
          reference: string | null
          remaining_balance: number | null
          status: string | null
          supplier_id: string | null
          total_gross: number | null
          total_net: number | null
          total_vat: number | null
          updated_at: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount_paid?: number | null
          approved_at?: string | null
          approved_by?: string | null
          bill_number?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          due_date: string
          exchange_rate?: number | null
          id?: string
          is_posted?: boolean | null
          issue_date: string
          locked_fields?: Json | null
          notes?: string | null
          organization_id: string
          override_history?: Json | null
          posted_at?: string | null
          posted_by?: string | null
          receipt_path?: string | null
          reference?: string | null
          remaining_balance?: number | null
          status?: string | null
          supplier_id?: string | null
          total_gross?: number | null
          total_net?: number | null
          total_vat?: number | null
          updated_at?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount_paid?: number | null
          approved_at?: string | null
          approved_by?: string | null
          bill_number?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string | null
          due_date?: string
          exchange_rate?: number | null
          id?: string
          is_posted?: boolean | null
          issue_date?: string
          locked_fields?: Json | null
          notes?: string | null
          organization_id?: string
          override_history?: Json | null
          posted_at?: string | null
          posted_by?: string | null
          receipt_path?: string | null
          reference?: string | null
          remaining_balance?: number | null
          status?: string | null
          supplier_id?: string | null
          total_gross?: number | null
          total_net?: number | null
          total_vat?: number | null
          updated_at?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      bookkeeping_accounts: {
        Row: {
          account_subtype: string | null
          account_type: string
          client_id: string | null
          code: string
          company_id: string | null
          created_at: string | null
          ct_addback_category: string | null
          id: string
          is_active: boolean | null
          is_bank_account: boolean | null
          is_control_account: boolean | null
          is_revenue_account: boolean | null
          is_system_account: boolean | null
          name: string
          organization_id: string
          tax_allowability: string | null
          tax_mapping: Json | null
          updated_at: string | null
          vat_treatment: string | null
        }
        Insert: {
          account_subtype?: string | null
          account_type: string
          client_id?: string | null
          code: string
          company_id?: string | null
          created_at?: string | null
          ct_addback_category?: string | null
          id?: string
          is_active?: boolean | null
          is_bank_account?: boolean | null
          is_control_account?: boolean | null
          is_revenue_account?: boolean | null
          is_system_account?: boolean | null
          name: string
          organization_id: string
          tax_allowability?: string | null
          tax_mapping?: Json | null
          updated_at?: string | null
          vat_treatment?: string | null
        }
        Update: {
          account_subtype?: string | null
          account_type?: string
          client_id?: string | null
          code?: string
          company_id?: string | null
          created_at?: string | null
          ct_addback_category?: string | null
          id?: string
          is_active?: boolean | null
          is_bank_account?: boolean | null
          is_control_account?: boolean | null
          is_revenue_account?: boolean | null
          is_system_account?: boolean | null
          name?: string
          organization_id?: string
          tax_allowability?: string | null
          tax_mapping?: Json | null
          updated_at?: string | null
          vat_treatment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookkeeping_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookkeeping_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookkeeping_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bookkeeping_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json | null
          organization_id: string
          reason: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
          organization_id: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          organization_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookkeeping_audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ca_rate_tables: {
        Row: {
          aia_limit: number
          car_low_emission_max: number
          car_zero_emission_threshold: number
          created_at: string
          effective_from: string
          effective_to: string | null
          full_expensing_available: boolean
          full_expensing_rate: number
          fya_50_rate: number
          fya_zero_emission_rate: number
          id: string
          updated_at: string
          wda_main_rate: number
          wda_special_rate: number
        }
        Insert: {
          aia_limit?: number
          car_low_emission_max?: number
          car_zero_emission_threshold?: number
          created_at?: string
          effective_from: string
          effective_to?: string | null
          full_expensing_available?: boolean
          full_expensing_rate?: number
          fya_50_rate?: number
          fya_zero_emission_rate?: number
          id?: string
          updated_at?: string
          wda_main_rate?: number
          wda_special_rate?: number
        }
        Update: {
          aia_limit?: number
          car_low_emission_max?: number
          car_zero_emission_threshold?: number
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          full_expensing_available?: boolean
          full_expensing_rate?: number
          fya_50_rate?: number
          fya_zero_emission_rate?: number
          id?: string
          updated_at?: string
          wda_main_rate?: number
          wda_special_rate?: number
        }
        Relationships: []
      }
      capital_allowance_claims: {
        Row: {
          amount: number
          cap_period_id: string
          claim_type: string
          company_id: string
          created_at: string
          created_by: string | null
          fixed_asset_id: string | null
          id: string
          is_manual_override: boolean
          organization_id: string
          override_reason: string | null
          pool_id: string | null
          rule_basis: Json | null
        }
        Insert: {
          amount: number
          cap_period_id: string
          claim_type: string
          company_id: string
          created_at?: string
          created_by?: string | null
          fixed_asset_id?: string | null
          id?: string
          is_manual_override?: boolean
          organization_id: string
          override_reason?: string | null
          pool_id?: string | null
          rule_basis?: Json | null
        }
        Update: {
          amount?: number
          cap_period_id?: string
          claim_type?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          fixed_asset_id?: string | null
          id?: string
          is_manual_override?: boolean
          organization_id?: string
          override_reason?: string | null
          pool_id?: string | null
          rule_basis?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "capital_allowance_claims_cap_period_id_fkey"
            columns: ["cap_period_id"]
            isOneToOne: false
            referencedRelation: "capital_allowance_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_allowance_claims_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_allowance_claims_fixed_asset_id_fkey"
            columns: ["fixed_asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_allowance_claims_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_allowance_claims_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "capital_allowance_pools"
            referencedColumns: ["id"]
          },
        ]
      }
      capital_allowance_periods: {
        Row: {
          aia_limit_for_period: number
          approved_at: string | null
          approved_by: string | null
          company_id: string
          created_at: string
          id: string
          organization_id: string
          period_end: string
          period_start: string
          short_period_factor: number
          status: string
          updated_at: string
        }
        Insert: {
          aia_limit_for_period?: number
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          created_at?: string
          id?: string
          organization_id: string
          period_end: string
          period_start: string
          short_period_factor?: number
          status?: string
          updated_at?: string
        }
        Update: {
          aia_limit_for_period?: number
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          period_end?: string
          period_start?: string
          short_period_factor?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "capital_allowance_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_allowance_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      capital_allowance_pools: {
        Row: {
          additions: number
          aia_claimed: number
          balancing_allowance: number
          balancing_charge: number
          cap_period_id: string
          closing_wdv: number
          company_id: string
          created_at: string
          disposals: number
          full_expensing_claimed: number
          fya_claimed: number
          id: string
          metadata: Json | null
          opening_wdv: number
          organization_id: string
          pool_name: string | null
          pool_type: string
          updated_at: string
          wda_claimed: number
          wda_rate: number
        }
        Insert: {
          additions?: number
          aia_claimed?: number
          balancing_allowance?: number
          balancing_charge?: number
          cap_period_id: string
          closing_wdv?: number
          company_id: string
          created_at?: string
          disposals?: number
          full_expensing_claimed?: number
          fya_claimed?: number
          id?: string
          metadata?: Json | null
          opening_wdv?: number
          organization_id: string
          pool_name?: string | null
          pool_type: string
          updated_at?: string
          wda_claimed?: number
          wda_rate?: number
        }
        Update: {
          additions?: number
          aia_claimed?: number
          balancing_allowance?: number
          balancing_charge?: number
          cap_period_id?: string
          closing_wdv?: number
          company_id?: string
          created_at?: string
          disposals?: number
          full_expensing_claimed?: number
          fya_claimed?: number
          id?: string
          metadata?: Json | null
          opening_wdv?: number
          organization_id?: string
          pool_name?: string | null
          pool_type?: string
          updated_at?: string
          wda_claimed?: number
          wda_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "capital_allowance_pools_cap_period_id_fkey"
            columns: ["cap_period_id"]
            isOneToOne: false
            referencedRelation: "capital_allowance_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_allowance_pools_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "capital_allowance_pools_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      categorization_rules: {
        Row: {
          client_id: string | null
          company_id: string | null
          conditions: Json
          created_at: string | null
          default_account_id: string
          default_vat_code_id: string | null
          description_template: string | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string
          priority: number | null
          times_applied: number | null
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          company_id?: string | null
          conditions?: Json
          created_at?: string | null
          default_account_id: string
          default_vat_code_id?: string | null
          description_template?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id: string
          priority?: number | null
          times_applied?: number | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          company_id?: string | null
          conditions?: Json
          created_at?: string | null
          default_account_id?: string
          default_vat_code_id?: string | null
          description_template?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string
          priority?: number | null
          times_applied?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categorization_rules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categorization_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categorization_rules_default_account_id_fkey"
            columns: ["default_account_id"]
            isOneToOne: false
            referencedRelation: "bookkeeping_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categorization_rules_default_vat_code_id_fkey"
            columns: ["default_vat_code_id"]
            isOneToOne: false
            referencedRelation: "vat_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categorization_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cgt_disposals: {
        Row: {
          acquisition_date: string | null
          allowable_costs: number
          asset_description: string
          asset_type: string
          client_id: string | null
          created_at: string
          created_by: string | null
          crypto_pool_id: string | null
          disposal_date: string
          disposal_proceeds: number
          filing_id: string | null
          gain_or_loss: number
          id: string
          is_residential_property: boolean
          notes: string | null
          organization_id: string
          token_symbol: string | null
          updated_at: string
        }
        Insert: {
          acquisition_date?: string | null
          allowable_costs?: number
          asset_description: string
          asset_type?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          crypto_pool_id?: string | null
          disposal_date: string
          disposal_proceeds?: number
          filing_id?: string | null
          gain_or_loss?: number
          id?: string
          is_residential_property?: boolean
          notes?: string | null
          organization_id: string
          token_symbol?: string | null
          updated_at?: string
        }
        Update: {
          acquisition_date?: string | null
          allowable_costs?: number
          asset_description?: string
          asset_type?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          crypto_pool_id?: string | null
          disposal_date?: string
          disposal_proceeds?: number
          filing_id?: string | null
          gain_or_loss?: number
          id?: string
          is_residential_property?: boolean
          notes?: string | null
          organization_id?: string
          token_symbol?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cgt_disposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cgt_disposals_crypto_pool_id_fkey"
            columns: ["crypto_pool_id"]
            isOneToOne: false
            referencedRelation: "crypto_token_pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cgt_disposals_filing_id_fkey"
            columns: ["filing_id"]
            isOneToOne: false
            referencedRelation: "filings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cgt_disposals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chaser_job_periods: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          job_id: string
          organization_id: string
          period_end: string
          service_code: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          job_id: string
          organization_id: string
          period_end: string
          service_code: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          job_id?: string
          organization_id?: string
          period_end?: string
          service_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "chaser_job_periods_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chaser_job_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chaser_message_templates: {
        Row: {
          body_html: string
          created_at: string
          id: string
          key: string
          name: string
          subject: string
          updated_at: string
          variables_schema: Json
        }
        Insert: {
          body_html?: string
          created_at?: string
          id?: string
          key: string
          name: string
          subject: string
          updated_at?: string
          variables_schema?: Json
        }
        Update: {
          body_html?: string
          created_at?: string
          id?: string
          key?: string
          name?: string
          subject?: string
          updated_at?: string
          variables_schema?: Json
        }
        Relationships: []
      }
      cis_contractors: {
        Row: {
          accounts_office_reference: string | null
          client_id: string | null
          company_id: string | null
          contractor_utr: string
          created_at: string
          hmrc_verification_number: string | null
          hmrc_verified: boolean | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          accounts_office_reference?: string | null
          client_id?: string | null
          company_id?: string | null
          contractor_utr: string
          created_at?: string
          hmrc_verification_number?: string | null
          hmrc_verified?: boolean | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          accounts_office_reference?: string | null
          client_id?: string | null
          company_id?: string | null
          contractor_utr?: string
          created_at?: string
          hmrc_verification_number?: string | null
          hmrc_verified?: boolean | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cis_contractors_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cis_contractors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cis_contractors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cis_payments: {
        Row: {
          cis_contractor_id: string
          cis_return_id: string | null
          cis_subcontractor_id: string
          created_at: string
          deduction_amount: number
          deduction_rate: number
          description: string | null
          gross_amount: number
          id: string
          invoice_number: string | null
          labour_amount: number
          materials_amount: number | null
          net_amount: number
          organization_id: string
          payment_date: string
          payment_reference: string | null
          status: string
          tax_month: number
          tax_year: string
          updated_at: string
        }
        Insert: {
          cis_contractor_id: string
          cis_return_id?: string | null
          cis_subcontractor_id: string
          created_at?: string
          deduction_amount: number
          deduction_rate: number
          description?: string | null
          gross_amount: number
          id?: string
          invoice_number?: string | null
          labour_amount: number
          materials_amount?: number | null
          net_amount: number
          organization_id: string
          payment_date: string
          payment_reference?: string | null
          status?: string
          tax_month: number
          tax_year: string
          updated_at?: string
        }
        Update: {
          cis_contractor_id?: string
          cis_return_id?: string | null
          cis_subcontractor_id?: string
          created_at?: string
          deduction_amount?: number
          deduction_rate?: number
          description?: string | null
          gross_amount?: number
          id?: string
          invoice_number?: string | null
          labour_amount?: number
          materials_amount?: number | null
          net_amount?: number
          organization_id?: string
          payment_date?: string
          payment_reference?: string | null
          status?: string
          tax_month?: number
          tax_year?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cis_payments_cis_contractor_id_fkey"
            columns: ["cis_contractor_id"]
            isOneToOne: false
            referencedRelation: "cis_contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cis_payments_cis_return_id_fkey"
            columns: ["cis_return_id"]
            isOneToOne: false
            referencedRelation: "cis_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cis_payments_cis_subcontractor_id_fkey"
            columns: ["cis_subcontractor_id"]
            isOneToOne: false
            referencedRelation: "cis_subcontractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cis_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cis_returns: {
        Row: {
          cis_contractor_id: string
          created_at: string
          due_date: string
          employment_status_declaration: boolean | null
          filing_id: string | null
          hmrc_receipt_number: string | null
          hmrc_response: Json | null
          id: string
          notes: string | null
          organization_id: string
          period_end: string
          period_start: string
          status: string
          subcontractor_verification_declaration: boolean | null
          submitted_at: string | null
          submitted_by: string | null
          tax_month: number
          tax_year: string
          total_deductions: number | null
          total_gross_amount: number | null
          total_materials_amount: number | null
          total_payments_count: number | null
          updated_at: string
        }
        Insert: {
          cis_contractor_id: string
          created_at?: string
          due_date: string
          employment_status_declaration?: boolean | null
          filing_id?: string | null
          hmrc_receipt_number?: string | null
          hmrc_response?: Json | null
          id?: string
          notes?: string | null
          organization_id: string
          period_end: string
          period_start: string
          status?: string
          subcontractor_verification_declaration?: boolean | null
          submitted_at?: string | null
          submitted_by?: string | null
          tax_month: number
          tax_year: string
          total_deductions?: number | null
          total_gross_amount?: number | null
          total_materials_amount?: number | null
          total_payments_count?: number | null
          updated_at?: string
        }
        Update: {
          cis_contractor_id?: string
          created_at?: string
          due_date?: string
          employment_status_declaration?: boolean | null
          filing_id?: string | null
          hmrc_receipt_number?: string | null
          hmrc_response?: Json | null
          id?: string
          notes?: string | null
          organization_id?: string
          period_end?: string
          period_start?: string
          status?: string
          subcontractor_verification_declaration?: boolean | null
          submitted_at?: string | null
          submitted_by?: string | null
          tax_month?: number
          tax_year?: string
          total_deductions?: number | null
          total_gross_amount?: number | null
          total_materials_amount?: number | null
          total_payments_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cis_returns_cis_contractor_id_fkey"
            columns: ["cis_contractor_id"]
            isOneToOne: false
            referencedRelation: "cis_contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cis_returns_filing_id_fkey"
            columns: ["filing_id"]
            isOneToOne: false
            referencedRelation: "filings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cis_returns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cis_subcontractors: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          business_name: string | null
          cis_contractor_id: string
          city: string | null
          company_registration_number: string | null
          country: string | null
          created_at: string
          deduction_rate: string
          email: string | null
          first_name: string | null
          id: string
          is_active: boolean | null
          is_partnership: boolean | null
          last_name: string | null
          national_insurance_number: string | null
          organization_id: string
          partner_details: Json | null
          phone: string | null
          postcode: string | null
          trading_name: string | null
          updated_at: string
          utr: string | null
          vat_number: string | null
          verification_number: string | null
          verification_status: string
          verified_at: string | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          business_name?: string | null
          cis_contractor_id: string
          city?: string | null
          company_registration_number?: string | null
          country?: string | null
          created_at?: string
          deduction_rate?: string
          email?: string | null
          first_name?: string | null
          id?: string
          is_active?: boolean | null
          is_partnership?: boolean | null
          last_name?: string | null
          national_insurance_number?: string | null
          organization_id: string
          partner_details?: Json | null
          phone?: string | null
          postcode?: string | null
          trading_name?: string | null
          updated_at?: string
          utr?: string | null
          vat_number?: string | null
          verification_number?: string | null
          verification_status?: string
          verified_at?: string | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          business_name?: string | null
          cis_contractor_id?: string
          city?: string | null
          company_registration_number?: string | null
          country?: string | null
          created_at?: string
          deduction_rate?: string
          email?: string | null
          first_name?: string | null
          id?: string
          is_active?: boolean | null
          is_partnership?: boolean | null
          last_name?: string | null
          national_insurance_number?: string | null
          organization_id?: string
          partner_details?: Json | null
          phone?: string | null
          postcode?: string | null
          trading_name?: string | null
          updated_at?: string
          utr?: string | null
          vat_number?: string | null
          verification_number?: string | null
          verification_status?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cis_subcontractors_cis_contractor_id_fkey"
            columns: ["cis_contractor_id"]
            isOneToOne: false
            referencedRelation: "cis_contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cis_subcontractors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_approval_packs: {
        Row: {
          approval_ip: string | null
          approval_method: string | null
          approval_notes: string | null
          approval_user_agent: string | null
          approved_at: string | null
          approved_by_contact_id: string | null
          client_id: string
          created_at: string
          created_by: string | null
          documents: Json
          id: string
          job_id: string | null
          organization_id: string
          pack_type: string
          rejected_at: string | null
          sent_at: string | null
          status: string
          superseded_by: string | null
          updated_at: string
          version_number: number
          viewed_at: string | null
        }
        Insert: {
          approval_ip?: string | null
          approval_method?: string | null
          approval_notes?: string | null
          approval_user_agent?: string | null
          approved_at?: string | null
          approved_by_contact_id?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          documents?: Json
          id?: string
          job_id?: string | null
          organization_id: string
          pack_type: string
          rejected_at?: string | null
          sent_at?: string | null
          status?: string
          superseded_by?: string | null
          updated_at?: string
          version_number?: number
          viewed_at?: string | null
        }
        Update: {
          approval_ip?: string | null
          approval_method?: string | null
          approval_notes?: string | null
          approval_user_agent?: string | null
          approved_at?: string | null
          approved_by_contact_id?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          documents?: Json
          id?: string
          job_id?: string | null
          organization_id?: string
          pack_type?: string
          rejected_at?: string | null
          sent_at?: string | null
          status?: string
          superseded_by?: string | null
          updated_at?: string
          version_number?: number
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_approval_packs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_approval_packs_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "client_approval_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      client_detail_cgt: {
        Row: {
          cgt_number: string | null
          client_id: string
          created_at: string | null
          disposal_date: string | null
          home_address: Json | null
          id: string
          organization_id: string
          property_address: Json | null
          updated_at: string | null
        }
        Insert: {
          cgt_number?: string | null
          client_id: string
          created_at?: string | null
          disposal_date?: string | null
          home_address?: Json | null
          id?: string
          organization_id: string
          property_address?: Json | null
          updated_at?: string | null
        }
        Update: {
          cgt_number?: string | null
          client_id?: string
          created_at?: string | null
          disposal_date?: string | null
          home_address?: Json | null
          id?: string
          organization_id?: string
          property_address?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_detail_cgt_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_detail_cgt_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_detail_charity: {
        Row: {
          charity_number: string | null
          charity_status: string | null
          charity_year_end: string | null
          client_id: string
          created_at: string | null
          gift_aid_claim_expiry: string | null
          id: string
          organization_id: string
          trading_as: string | null
          updated_at: string | null
        }
        Insert: {
          charity_number?: string | null
          charity_status?: string | null
          charity_year_end?: string | null
          client_id: string
          created_at?: string | null
          gift_aid_claim_expiry?: string | null
          id?: string
          organization_id: string
          trading_as?: string | null
          updated_at?: string | null
        }
        Update: {
          charity_number?: string | null
          charity_status?: string | null
          charity_year_end?: string | null
          client_id?: string
          created_at?: string | null
          gift_aid_claim_expiry?: string | null
          id?: string
          organization_id?: string
          trading_as?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_detail_charity_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_detail_charity_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_detail_partnership: {
        Row: {
          client_id: string
          created_at: string | null
          id: string
          organization_id: string
          partners: Json | null
          partnership_address: Json | null
          partnership_utr: string | null
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          id?: string
          organization_id: string
          partners?: Json | null
          partnership_address?: Json | null
          partnership_utr?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          id?: string
          organization_id?: string
          partners?: Json | null
          partnership_address?: Json | null
          partnership_utr?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_detail_partnership_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_detail_partnership_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_detail_sa: {
        Row: {
          client_id: string
          created_at: string | null
          id: string
          is_mtd: boolean
          mtd_final_declaration_deadline: string | null
          mtd_quarters: Json | null
          organization_id: string
          payment_on_account_jan: number | null
          payment_on_account_jul: number | null
          refund_expected: boolean | null
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          id?: string
          is_mtd?: boolean
          mtd_final_declaration_deadline?: string | null
          mtd_quarters?: Json | null
          organization_id: string
          payment_on_account_jan?: number | null
          payment_on_account_jul?: number | null
          refund_expected?: boolean | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          id?: string
          is_mtd?: boolean
          mtd_final_declaration_deadline?: string | null
          mtd_quarters?: Json | null
          organization_id?: string
          payment_on_account_jan?: number | null
          payment_on_account_jul?: number | null
          refund_expected?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_detail_sa_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_detail_sa_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_messages: {
        Row: {
          attachments: Json | null
          client_id: string | null
          company_id: string | null
          content: string
          created_at: string
          id: string
          message_type: string
          organization_id: string
          parent_message_id: string | null
          sender_id: string | null
          sender_type: string
          subject: string | null
          visibility: string
        }
        Insert: {
          attachments?: Json | null
          client_id?: string | null
          company_id?: string | null
          content: string
          created_at?: string
          id?: string
          message_type?: string
          organization_id: string
          parent_message_id?: string | null
          sender_id?: string | null
          sender_type: string
          subject?: string | null
          visibility?: string
        }
        Update: {
          attachments?: Json | null
          client_id?: string | null
          company_id?: string | null
          content?: string
          created_at?: string
          id?: string
          message_type?: string
          organization_id?: string
          parent_message_id?: string | null
          sender_id?: string | null
          sender_type?: string
          subject?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "client_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tasks: {
        Row: {
          assigned_to: string | null
          client_id: string | null
          company_id: string | null
          completed_at: string | null
          conditional_visibility: Json | null
          created_at: string
          description: string | null
          due_date: string | null
          file_tags: Json | null
          id: string
          is_verified: boolean | null
          job_id: string | null
          organization_id: string
          request_type: string | null
          sort_order: number | null
          source_template_task_id: string | null
          status: string
          target_folder: string | null
          task_order: number | null
          template_id: string | null
          title: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          visibility: string
        }
        Insert: {
          assigned_to?: string | null
          client_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          conditional_visibility?: Json | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          file_tags?: Json | null
          id?: string
          is_verified?: boolean | null
          job_id?: string | null
          organization_id: string
          request_type?: string | null
          sort_order?: number | null
          source_template_task_id?: string | null
          status?: string
          target_folder?: string | null
          task_order?: number | null
          template_id?: string | null
          title: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          visibility?: string
        }
        Update: {
          assigned_to?: string | null
          client_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          conditional_visibility?: Json | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          file_tags?: Json | null
          id?: string
          is_verified?: boolean | null
          job_id?: string | null
          organization_id?: string
          request_type?: string | null
          sort_order?: number | null
          source_template_task_id?: string | null
          status?: string
          target_folder?: string | null
          task_order?: number | null
          template_id?: string | null
          title?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tasks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tax_authorisations: {
        Row: {
          authorised_at: string | null
          chaser_count: number
          client_id: string
          client_service_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          last_email_template_id: string | null
          next_chase_at: string | null
          notes: string | null
          organization_id: string
          reference: string | null
          requested_at: string | null
          status: string
          tax_service_type: string
          updated_at: string
        }
        Insert: {
          authorised_at?: string | null
          chaser_count?: number
          client_id: string
          client_service_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          last_email_template_id?: string | null
          next_chase_at?: string | null
          notes?: string | null
          organization_id: string
          reference?: string | null
          requested_at?: string | null
          status?: string
          tax_service_type: string
          updated_at?: string
        }
        Update: {
          authorised_at?: string | null
          chaser_count?: number
          client_id?: string
          client_service_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          last_email_template_id?: string | null
          next_chase_at?: string | null
          notes?: string | null
          organization_id?: string
          reference?: string | null
          requested_at?: string | null
          status?: string
          tax_service_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_tax_authorisations_last_email_template_id_fkey"
            columns: ["last_email_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tax_authorisations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          activated_at: string | null
          address_line_1: string | null
          address_line_2: string | null
          aml_expiry_date: string | null
          aml_verified_at: string | null
          aml_verified_by: string | null
          archived_at: string | null
          city: string | null
          client_type: string
          country: string | null
          created_at: string
          date_of_birth: string | null
          disengaged_at: string | null
          email: string
          first_name: string
          id: string
          last_engagement_letter_id: string | null
          last_kyc_pack_id: string | null
          last_name: string
          mobile_number: string | null
          national_insurance_number: string | null
          nino: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          postcode: string | null
          preferred_name: string | null
          status: string
          tags: Json | null
          updated_at: string
          utr: string | null
        }
        Insert: {
          activated_at?: string | null
          address_line_1?: string | null
          address_line_2?: string | null
          aml_expiry_date?: string | null
          aml_verified_at?: string | null
          aml_verified_by?: string | null
          archived_at?: string | null
          city?: string | null
          client_type?: string
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          disengaged_at?: string | null
          email: string
          first_name: string
          id?: string
          last_engagement_letter_id?: string | null
          last_kyc_pack_id?: string | null
          last_name: string
          mobile_number?: string | null
          national_insurance_number?: string | null
          nino?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          postcode?: string | null
          preferred_name?: string | null
          status?: string
          tags?: Json | null
          updated_at?: string
          utr?: string | null
        }
        Update: {
          activated_at?: string | null
          address_line_1?: string | null
          address_line_2?: string | null
          aml_expiry_date?: string | null
          aml_verified_at?: string | null
          aml_verified_by?: string | null
          archived_at?: string | null
          city?: string | null
          client_type?: string
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          disengaged_at?: string | null
          email?: string
          first_name?: string
          id?: string
          last_engagement_letter_id?: string | null
          last_kyc_pack_id?: string | null
          last_name?: string
          mobile_number?: string | null
          national_insurance_number?: string | null
          nino?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          postcode?: string | null
          preferred_name?: string | null
          status?: string
          tags?: Json | null
          updated_at?: string
          utr?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          activated_at: string | null
          address_line_1: string | null
          address_line_2: string | null
          aml_expiry_date: string | null
          aml_verified_at: string | null
          aml_verified_by: string | null
          archived_at: string | null
          auth_code: string | null
          ch_company_profile: Json | null
          ch_last_synced_at: string | null
          ch_personal_code: string | null
          city: string | null
          companies_house_auth_code: string | null
          company_name: string
          company_number: string | null
          company_type: string | null
          confirmation_statement_made_up_to: string | null
          confirmation_statement_next_due: string | null
          country: string | null
          created_at: string
          director_nationality: string | null
          disengaged_at: string | null
          email: string
          id: string
          incorporation_date: string | null
          internal_reference: string | null
          notes: string | null
          organization_id: string
          partner_in_charge: string | null
          phone: string | null
          postcode: string | null
          registered_office_address: Json | null
          sic_codes: Json | null
          staff_in_charge: string | null
          status: string
          tags: Json | null
          trading_address: Json | null
          trading_status: string | null
          updated_at: string
          utr: string | null
          vat_frequency: string | null
          vat_number: string | null
          vat_scheme: string | null
          vat_stagger_group: number | null
          year_end_day: number | null
          year_end_month: number | null
        }
        Insert: {
          activated_at?: string | null
          address_line_1?: string | null
          address_line_2?: string | null
          aml_expiry_date?: string | null
          aml_verified_at?: string | null
          aml_verified_by?: string | null
          archived_at?: string | null
          auth_code?: string | null
          ch_company_profile?: Json | null
          ch_last_synced_at?: string | null
          ch_personal_code?: string | null
          city?: string | null
          companies_house_auth_code?: string | null
          company_name: string
          company_number?: string | null
          company_type?: string | null
          confirmation_statement_made_up_to?: string | null
          confirmation_statement_next_due?: string | null
          country?: string | null
          created_at?: string
          director_nationality?: string | null
          disengaged_at?: string | null
          email: string
          id?: string
          incorporation_date?: string | null
          internal_reference?: string | null
          notes?: string | null
          organization_id: string
          partner_in_charge?: string | null
          phone?: string | null
          postcode?: string | null
          registered_office_address?: Json | null
          sic_codes?: Json | null
          staff_in_charge?: string | null
          status?: string
          tags?: Json | null
          trading_address?: Json | null
          trading_status?: string | null
          updated_at?: string
          utr?: string | null
          vat_frequency?: string | null
          vat_number?: string | null
          vat_scheme?: string | null
          vat_stagger_group?: number | null
          year_end_day?: number | null
          year_end_month?: number | null
        }
        Update: {
          activated_at?: string | null
          address_line_1?: string | null
          address_line_2?: string | null
          aml_expiry_date?: string | null
          aml_verified_at?: string | null
          aml_verified_by?: string | null
          archived_at?: string | null
          auth_code?: string | null
          ch_company_profile?: Json | null
          ch_last_synced_at?: string | null
          ch_personal_code?: string | null
          city?: string | null
          companies_house_auth_code?: string | null
          company_name?: string
          company_number?: string | null
          company_type?: string | null
          confirmation_statement_made_up_to?: string | null
          confirmation_statement_next_due?: string | null
          country?: string | null
          created_at?: string
          director_nationality?: string | null
          disengaged_at?: string | null
          email?: string
          id?: string
          incorporation_date?: string | null
          internal_reference?: string | null
          notes?: string | null
          organization_id?: string
          partner_in_charge?: string | null
          phone?: string | null
          postcode?: string | null
          registered_office_address?: Json | null
          sic_codes?: Json | null
          staff_in_charge?: string | null
          status?: string
          tags?: Json | null
          trading_address?: Json | null
          trading_status?: string | null
          updated_at?: string
          utr?: string | null
          vat_frequency?: string | null
          vat_number?: string | null
          vat_scheme?: string | null
          vat_stagger_group?: number | null
          year_end_day?: number | null
          year_end_month?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_partner_in_charge_fkey"
            columns: ["partner_in_charge"]
            isOneToOne: false
            referencedRelation: "organization_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_staff_in_charge_fkey"
            columns: ["staff_in_charge"]
            isOneToOne: false
            referencedRelation: "organization_users"
            referencedColumns: ["id"]
          },
        ]
      }
      companies_house_diff_staging: {
        Row: {
          client_id: string | null
          company_id: string | null
          company_number: string
          created_at: string
          current_value: Json | null
          decided_at: string | null
          decided_by: string | null
          decision_notes: string | null
          detected_at: string
          field_path: string
          id: string
          incoming_value: Json | null
          metadata: Json
          organization_id: string
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          company_id?: string | null
          company_number: string
          created_at?: string
          current_value?: Json | null
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          detected_at?: string
          field_path: string
          id?: string
          incoming_value?: Json | null
          metadata?: Json
          organization_id: string
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          company_id?: string | null
          company_number?: string
          created_at?: string
          current_value?: Json | null
          decided_at?: string | null
          decided_by?: string | null
          decision_notes?: string | null
          detected_at?: string
          field_path?: string
          id?: string
          incoming_value?: Json | null
          metadata?: Json
          organization_id?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_house_diff_staging_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      company_officers: {
        Row: {
          appointed_at: string
          ch_appointment_id: string | null
          ch_links: Json | null
          company_id: string
          created_at: string
          id: string
          person_id: string
          resigned_at: string | null
          role: string
          updated_at: string
        }
        Insert: {
          appointed_at: string
          ch_appointment_id?: string | null
          ch_links?: Json | null
          company_id: string
          created_at?: string
          id?: string
          person_id: string
          resigned_at?: string | null
          role: string
          updated_at?: string
        }
        Update: {
          appointed_at?: string
          ch_appointment_id?: string | null
          ch_links?: Json | null
          company_id?: string
          created_at?: string
          id?: string
          person_id?: string
          resigned_at?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_officers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_officers_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "company_persons"
            referencedColumns: ["id"]
          },
        ]
      }
      company_persons: {
        Row: {
          ch_officer_id: string | null
          country_of_residence: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          first_name: string
          former_names: Json | null
          id: string
          last_name: string
          linked_client_id: string | null
          middle_names: string | null
          nationality: string | null
          occupation: string | null
          organization_id: string
          phone: string | null
          residential_address_line_1: string | null
          residential_address_line_2: string | null
          residential_city: string | null
          residential_country: string | null
          residential_county: string | null
          residential_postcode: string | null
          service_address_line_1: string | null
          service_address_line_2: string | null
          service_city: string | null
          service_country: string | null
          service_county: string | null
          service_postcode: string | null
          title: string | null
          updated_at: string
          use_registered_office_as_service: boolean | null
        }
        Insert: {
          ch_officer_id?: string | null
          country_of_residence?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_name: string
          former_names?: Json | null
          id?: string
          last_name: string
          linked_client_id?: string | null
          middle_names?: string | null
          nationality?: string | null
          occupation?: string | null
          organization_id: string
          phone?: string | null
          residential_address_line_1?: string | null
          residential_address_line_2?: string | null
          residential_city?: string | null
          residential_country?: string | null
          residential_county?: string | null
          residential_postcode?: string | null
          service_address_line_1?: string | null
          service_address_line_2?: string | null
          service_city?: string | null
          service_country?: string | null
          service_county?: string | null
          service_postcode?: string | null
          title?: string | null
          updated_at?: string
          use_registered_office_as_service?: boolean | null
        }
        Update: {
          ch_officer_id?: string | null
          country_of_residence?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_name?: string
          former_names?: Json | null
          id?: string
          last_name?: string
          linked_client_id?: string | null
          middle_names?: string | null
          nationality?: string | null
          occupation?: string | null
          organization_id?: string
          phone?: string | null
          residential_address_line_1?: string | null
          residential_address_line_2?: string | null
          residential_city?: string | null
          residential_country?: string | null
          residential_county?: string | null
          residential_postcode?: string | null
          service_address_line_1?: string | null
          service_address_line_2?: string | null
          service_city?: string | null
          service_country?: string | null
          service_county?: string | null
          service_postcode?: string | null
          title?: string | null
          updated_at?: string
          use_registered_office_as_service?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "company_persons_linked_client_id_fkey"
            columns: ["linked_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_persons_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      company_pscs: {
        Row: {
          ceased_at: string | null
          ch_links: Json | null
          ch_psc_id: string | null
          company_id: string
          created_at: string
          id: string
          nature_of_control: string[]
          notified_at: string
          person_id: string
          updated_at: string
        }
        Insert: {
          ceased_at?: string | null
          ch_links?: Json | null
          ch_psc_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          nature_of_control?: string[]
          notified_at: string
          person_id: string
          updated_at?: string
        }
        Update: {
          ceased_at?: string | null
          ch_links?: Json | null
          ch_psc_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          nature_of_control?: string[]
          notified_at?: string
          person_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_pscs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_pscs_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "company_persons"
            referencedColumns: ["id"]
          },
        ]
      }
      company_register_events: {
        Row: {
          allotment_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          details: Json
          event_date: string
          event_type: string
          filing_id: string | null
          id: string
          officer_id: string | null
          person_id: string | null
          psc_id: string | null
          shareholder_id: string | null
          source: string
          transfer_id: string | null
          workpaper_instance_id: string | null
        }
        Insert: {
          allotment_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          details?: Json
          event_date: string
          event_type: string
          filing_id?: string | null
          id?: string
          officer_id?: string | null
          person_id?: string | null
          psc_id?: string | null
          shareholder_id?: string | null
          source?: string
          transfer_id?: string | null
          workpaper_instance_id?: string | null
        }
        Update: {
          allotment_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          details?: Json
          event_date?: string
          event_type?: string
          filing_id?: string | null
          id?: string
          officer_id?: string | null
          person_id?: string | null
          psc_id?: string | null
          shareholder_id?: string | null
          source?: string
          transfer_id?: string | null
          workpaper_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_register_events_allotment_id_fkey"
            columns: ["allotment_id"]
            isOneToOne: false
            referencedRelation: "company_share_allotments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_register_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_register_events_filing_id_fkey"
            columns: ["filing_id"]
            isOneToOne: false
            referencedRelation: "filings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_register_events_officer_id_fkey"
            columns: ["officer_id"]
            isOneToOne: false
            referencedRelation: "company_officers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_register_events_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "company_persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_register_events_psc_id_fkey"
            columns: ["psc_id"]
            isOneToOne: false
            referencedRelation: "company_pscs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_register_events_shareholder_id_fkey"
            columns: ["shareholder_id"]
            isOneToOne: false
            referencedRelation: "company_shareholders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_register_events_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "company_share_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_register_events_workpaper_instance_id_fkey"
            columns: ["workpaper_instance_id"]
            isOneToOne: false
            referencedRelation: "workpaper_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      company_share_allotments: {
        Row: {
          allotment_date: string
          company_id: string
          created_at: string
          filing_id: string | null
          id: string
          price_per_share: number | null
          share_class_id: string
          shareholder_id: string
          shares_allotted: number
          total_consideration: number | null
          workpaper_instance_id: string | null
        }
        Insert: {
          allotment_date: string
          company_id: string
          created_at?: string
          filing_id?: string | null
          id?: string
          price_per_share?: number | null
          share_class_id: string
          shareholder_id: string
          shares_allotted: number
          total_consideration?: number | null
          workpaper_instance_id?: string | null
        }
        Update: {
          allotment_date?: string
          company_id?: string
          created_at?: string
          filing_id?: string | null
          id?: string
          price_per_share?: number | null
          share_class_id?: string
          shareholder_id?: string
          shares_allotted?: number
          total_consideration?: number | null
          workpaper_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_share_allotments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_share_allotments_filing_id_fkey"
            columns: ["filing_id"]
            isOneToOne: false
            referencedRelation: "filings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_share_allotments_share_class_id_fkey"
            columns: ["share_class_id"]
            isOneToOne: false
            referencedRelation: "company_share_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_share_allotments_shareholder_id_fkey"
            columns: ["shareholder_id"]
            isOneToOne: false
            referencedRelation: "company_shareholders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_share_allotments_workpaper_instance_id_fkey"
            columns: ["workpaper_instance_id"]
            isOneToOne: false
            referencedRelation: "workpaper_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      company_share_classes: {
        Row: {
          capital_rights: boolean | null
          class_name: string
          company_id: string
          created_at: string
          currency: string
          dividend_rights: boolean | null
          id: string
          nominal_value: number
          rights_description: string | null
          total_shares_issued: number
          updated_at: string
          voting_rights: boolean | null
        }
        Insert: {
          capital_rights?: boolean | null
          class_name: string
          company_id: string
          created_at?: string
          currency?: string
          dividend_rights?: boolean | null
          id?: string
          nominal_value: number
          rights_description?: string | null
          total_shares_issued?: number
          updated_at?: string
          voting_rights?: boolean | null
        }
        Update: {
          capital_rights?: boolean | null
          class_name?: string
          company_id?: string
          created_at?: string
          currency?: string
          dividend_rights?: boolean | null
          id?: string
          nominal_value?: number
          rights_description?: string | null
          total_shares_issued?: number
          updated_at?: string
          voting_rights?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "company_share_classes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_share_transfers: {
        Row: {
          company_id: string
          consideration: number | null
          created_at: string
          filing_id: string | null
          from_shareholder_id: string
          id: string
          share_class_id: string
          shares_transferred: number
          to_shareholder_id: string
          transfer_date: string
          workpaper_instance_id: string | null
        }
        Insert: {
          company_id: string
          consideration?: number | null
          created_at?: string
          filing_id?: string | null
          from_shareholder_id: string
          id?: string
          share_class_id: string
          shares_transferred: number
          to_shareholder_id: string
          transfer_date: string
          workpaper_instance_id?: string | null
        }
        Update: {
          company_id?: string
          consideration?: number | null
          created_at?: string
          filing_id?: string | null
          from_shareholder_id?: string
          id?: string
          share_class_id?: string
          shares_transferred?: number
          to_shareholder_id?: string
          transfer_date?: string
          workpaper_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_share_transfers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_share_transfers_filing_id_fkey"
            columns: ["filing_id"]
            isOneToOne: false
            referencedRelation: "filings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_share_transfers_from_shareholder_id_fkey"
            columns: ["from_shareholder_id"]
            isOneToOne: false
            referencedRelation: "company_shareholders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_share_transfers_share_class_id_fkey"
            columns: ["share_class_id"]
            isOneToOne: false
            referencedRelation: "company_share_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_share_transfers_to_shareholder_id_fkey"
            columns: ["to_shareholder_id"]
            isOneToOne: false
            referencedRelation: "company_shareholders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_share_transfers_workpaper_instance_id_fkey"
            columns: ["workpaper_instance_id"]
            isOneToOne: false
            referencedRelation: "workpaper_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      company_shareholders: {
        Row: {
          as_at_date: string
          company_id: string
          created_at: string
          id: string
          person_id: string
          share_class_id: string
          shares_held: number
          updated_at: string
        }
        Insert: {
          as_at_date?: string
          company_id: string
          created_at?: string
          id?: string
          person_id: string
          share_class_id: string
          shares_held?: number
          updated_at?: string
        }
        Update: {
          as_at_date?: string
          company_id?: string
          created_at?: string
          id?: string
          person_id?: string
          share_class_id?: string
          shares_held?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_shareholders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_shareholders_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "company_persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_shareholders_share_class_id_fkey"
            columns: ["share_class_id"]
            isOneToOne: false
            referencedRelation: "company_share_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      connected_mailboxes: {
        Row: {
          access_token: string | null
          created_at: string
          email_address: string
          error_message: string | null
          id: string
          last_sync_at: string | null
          mailbox_type: string | null
          organization_id: string
          provider: Database["public"]["Enums"]["mailbox_provider"]
          refresh_token: string | null
          scopes: string[] | null
          status: Database["public"]["Enums"]["mailbox_status"]
          sync_cursor: string | null
          sync_enabled: boolean | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          email_address: string
          error_message?: string | null
          id?: string
          last_sync_at?: string | null
          mailbox_type?: string | null
          organization_id: string
          provider?: Database["public"]["Enums"]["mailbox_provider"]
          refresh_token?: string | null
          scopes?: string[] | null
          status?: Database["public"]["Enums"]["mailbox_status"]
          sync_cursor?: string | null
          sync_enabled?: boolean | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          email_address?: string
          error_message?: string | null
          id?: string
          last_sync_at?: string | null
          mailbox_type?: string | null
          organization_id?: string
          provider?: Database["public"]["Enums"]["mailbox_provider"]
          refresh_token?: string | null
          scopes?: string[] | null
          status?: Database["public"]["Enums"]["mailbox_status"]
          sync_cursor?: string | null
          sync_enabled?: boolean | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connected_mailboxes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          can_sign: boolean | null
          ch_personal_code: string | null
          client_id: string | null
          company_id: string | null
          created_at: string | null
          dob: string | null
          email: string
          id: string
          is_primary: boolean | null
          name: string
          nino: string | null
          organization_id: string
          phone: string | null
          role: string | null
          updated_at: string | null
          utr: string | null
        }
        Insert: {
          can_sign?: boolean | null
          ch_personal_code?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          dob?: string | null
          email: string
          id?: string
          is_primary?: boolean | null
          name: string
          nino?: string | null
          organization_id: string
          phone?: string | null
          role?: string | null
          updated_at?: string | null
          utr?: string | null
        }
        Update: {
          can_sign?: boolean | null
          ch_personal_code?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          dob?: string | null
          email?: string
          id?: string
          is_primary?: boolean | null
          name?: string
          nino?: string | null
          organization_id?: string
          phone?: string | null
          role?: string | null
          updated_at?: string | null
          utr?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_note_allocations: {
        Row: {
          allocation_date: string
          amount: number
          bill_id: string | null
          created_at: string
          created_by: string | null
          credit_note_id: string
          fx_rate: number | null
          id: string
          invoice_id: string | null
          journal_id: string | null
          notes: string | null
          organization_id: string
        }
        Insert: {
          allocation_date: string
          amount: number
          bill_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_id: string
          fx_rate?: number | null
          id?: string
          invoice_id?: string | null
          journal_id?: string | null
          notes?: string | null
          organization_id: string
        }
        Update: {
          allocation_date?: string
          amount?: number
          bill_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_id?: string
          fx_rate?: number | null
          id?: string
          invoice_id?: string | null
          journal_id?: string | null
          notes?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_note_allocations_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_note_allocations_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_note_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_note_allocations_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_note_allocations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_note_lines: {
        Row: {
          account_id: string | null
          created_at: string | null
          credit_note_id: string
          description: string | null
          discount_rate: number | null
          gross_amount: number | null
          id: string
          line_number: number
          net_amount: number
          quantity: number | null
          unit_price: number | null
          vat_amount: number | null
          vat_code_id: string | null
          vat_rate: number | null
        }
        Insert: {
          account_id?: string | null
          created_at?: string | null
          credit_note_id: string
          description?: string | null
          discount_rate?: number | null
          gross_amount?: number | null
          id?: string
          line_number?: number
          net_amount?: number
          quantity?: number | null
          unit_price?: number | null
          vat_amount?: number | null
          vat_code_id?: string | null
          vat_rate?: number | null
        }
        Update: {
          account_id?: string | null
          created_at?: string | null
          credit_note_id?: string
          description?: string | null
          discount_rate?: number | null
          gross_amount?: number | null
          id?: string
          line_number?: number
          net_amount?: number
          quantity?: number | null
          unit_price?: number | null
          vat_amount?: number | null
          vat_code_id?: string | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_note_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "bookkeeping_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_note_lines_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_note_lines_vat_code_id_fkey"
            columns: ["vat_code_id"]
            isOneToOne: false
            referencedRelation: "vat_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_notes: {
        Row: {
          client_id: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          credit_note_number: string | null
          credit_note_type: string
          currency: string
          customer_id: string | null
          external_reference: string | null
          fx_rate: number | null
          id: string
          is_posted: boolean | null
          issue_date: string
          journal_id: string | null
          notes: string | null
          organization_id: string
          original_bill_id: string | null
          original_invoice_id: string | null
          pdf_url: string | null
          posted_at: string | null
          posted_by: string | null
          reference: string | null
          remaining_allocation: number
          status: string
          subtotal: number
          supplier_id: string | null
          total: number
          updated_at: string
          updated_by: string | null
          vat_total: number
        }
        Insert: {
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_number?: string | null
          credit_note_type: string
          currency?: string
          customer_id?: string | null
          external_reference?: string | null
          fx_rate?: number | null
          id?: string
          is_posted?: boolean | null
          issue_date: string
          journal_id?: string | null
          notes?: string | null
          organization_id: string
          original_bill_id?: string | null
          original_invoice_id?: string | null
          pdf_url?: string | null
          posted_at?: string | null
          posted_by?: string | null
          reference?: string | null
          remaining_allocation?: number
          status?: string
          subtotal?: number
          supplier_id?: string | null
          total?: number
          updated_at?: string
          updated_by?: string | null
          vat_total?: number
        }
        Update: {
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          credit_note_number?: string | null
          credit_note_type?: string
          currency?: string
          customer_id?: string | null
          external_reference?: string | null
          fx_rate?: number | null
          id?: string
          is_posted?: boolean | null
          issue_date?: string
          journal_id?: string | null
          notes?: string | null
          organization_id?: string
          original_bill_id?: string | null
          original_invoice_id?: string | null
          pdf_url?: string | null
          posted_at?: string | null
          posted_by?: string | null
          reference?: string | null
          remaining_allocation?: number
          status?: string
          subtotal?: number
          supplier_id?: string | null
          total?: number
          updated_at?: string
          updated_by?: string | null
          vat_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_original_bill_id_fkey"
            columns: ["original_bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_original_invoice_id_fkey"
            columns: ["original_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_activities: {
        Row: {
          activity_type: string
          client_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          lead_id: string | null
          organization_id: string
          subject: string
          updated_at: string
        }
        Insert: {
          activity_type: string
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          organization_id: string
          subject?: string
          updated_at?: string
        }
        Update: {
          activity_type?: string
          client_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          organization_id?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_followup_sequences: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          stop_on_stages: Json
          trigger_stage: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          stop_on_stages?: Json
          trigger_stage?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          stop_on_stages?: Json
          trigger_stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_followup_sequences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_followup_steps: {
        Row: {
          body: string | null
          channel: string
          created_at: string
          delay_days: number
          id: string
          sequence_id: string
          step_order: number
          subject: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          channel?: string
          created_at?: string
          delay_days?: number
          id?: string
          sequence_id: string
          step_order: number
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          channel?: string
          created_at?: string
          delay_days?: number
          id?: string
          sequence_id?: string
          step_order?: number
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_followup_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "crm_followup_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      crypto_token_pools: {
        Row: {
          average_cost_per_unit: number
          client_id: string
          created_at: string
          id: string
          last_updated_at: string
          organization_id: string
          tax_year: string | null
          token_name: string | null
          token_symbol: string
          total_cost_gbp: number
          total_quantity: number
        }
        Insert: {
          average_cost_per_unit?: number
          client_id: string
          created_at?: string
          id?: string
          last_updated_at?: string
          organization_id: string
          tax_year?: string | null
          token_name?: string | null
          token_symbol: string
          total_cost_gbp?: number
          total_quantity?: number
        }
        Update: {
          average_cost_per_unit?: number
          client_id?: string
          created_at?: string
          id?: string
          last_updated_at?: string
          organization_id?: string
          tax_year?: string | null
          token_name?: string | null
          token_symbol?: string
          total_cost_gbp?: number
          total_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "crypto_token_pools_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crypto_token_pools_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crypto_transactions: {
        Row: {
          classification: string | null
          client_id: string
          cost_gbp: number
          counterpart_token: string | null
          created_at: string
          created_by: string | null
          disposal_id: string | null
          exchange_name: string | null
          fee_gbp: number
          filing_id: string | null
          id: string
          import_batch_id: string | null
          notes: string | null
          organization_id: string
          proceeds_gbp: number
          quantity: number
          token_symbol: string
          tx_date: string
          tx_hash: string | null
          tx_type: string
          updated_at: string
        }
        Insert: {
          classification?: string | null
          client_id: string
          cost_gbp?: number
          counterpart_token?: string | null
          created_at?: string
          created_by?: string | null
          disposal_id?: string | null
          exchange_name?: string | null
          fee_gbp?: number
          filing_id?: string | null
          id?: string
          import_batch_id?: string | null
          notes?: string | null
          organization_id: string
          proceeds_gbp?: number
          quantity?: number
          token_symbol: string
          tx_date: string
          tx_hash?: string | null
          tx_type: string
          updated_at?: string
        }
        Update: {
          classification?: string | null
          client_id?: string
          cost_gbp?: number
          counterpart_token?: string | null
          created_at?: string
          created_by?: string | null
          disposal_id?: string | null
          exchange_name?: string | null
          fee_gbp?: number
          filing_id?: string | null
          id?: string
          import_batch_id?: string | null
          notes?: string | null
          organization_id?: string
          proceeds_gbp?: number
          quantity?: number
          token_symbol?: string
          tx_date?: string
          tx_hash?: string | null
          tx_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crypto_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crypto_transactions_disposal_id_fkey"
            columns: ["disposal_id"]
            isOneToOne: false
            referencedRelation: "cgt_disposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crypto_transactions_filing_id_fkey"
            columns: ["filing_id"]
            isOneToOne: false
            referencedRelation: "filings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crypto_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_computation_snapshots: {
        Row: {
          accounting_profit: number
          accounts_snapshot_id: string
          add_backs: Json
          adjusted_lower_limit: number | null
          adjusted_upper_limit: number | null
          approved_at: string | null
          approved_by: string | null
          associated_companies_count: number
          balancing_charges: number
          cap_period_id: string | null
          claims_summary: Json
          company_id: string
          corporation_tax_due: number
          corporation_tax_rate: number
          created_at: string
          deductions: Json
          generator_version: string
          id: string
          marginal_relief: number
          marginal_relief_amount: number | null
          marginal_relief_fraction: number | null
          organization_id: string
          period_end: string
          period_start: string
          pools_summary: Json
          short_period_factor: number | null
          snapshot_hash: string
          status: string
          taxable_total_profits: number
          total_capital_allowances: number
        }
        Insert: {
          accounting_profit: number
          accounts_snapshot_id: string
          add_backs?: Json
          adjusted_lower_limit?: number | null
          adjusted_upper_limit?: number | null
          approved_at?: string | null
          approved_by?: string | null
          associated_companies_count?: number
          balancing_charges?: number
          cap_period_id?: string | null
          claims_summary?: Json
          company_id: string
          corporation_tax_due: number
          corporation_tax_rate: number
          created_at?: string
          deductions?: Json
          generator_version?: string
          id?: string
          marginal_relief?: number
          marginal_relief_amount?: number | null
          marginal_relief_fraction?: number | null
          organization_id: string
          period_end: string
          period_start: string
          pools_summary?: Json
          short_period_factor?: number | null
          snapshot_hash: string
          status?: string
          taxable_total_profits: number
          total_capital_allowances?: number
        }
        Update: {
          accounting_profit?: number
          accounts_snapshot_id?: string
          add_backs?: Json
          adjusted_lower_limit?: number | null
          adjusted_upper_limit?: number | null
          approved_at?: string | null
          approved_by?: string | null
          associated_companies_count?: number
          balancing_charges?: number
          cap_period_id?: string | null
          claims_summary?: Json
          company_id?: string
          corporation_tax_due?: number
          corporation_tax_rate?: number
          created_at?: string
          deductions?: Json
          generator_version?: string
          id?: string
          marginal_relief?: number
          marginal_relief_amount?: number | null
          marginal_relief_fraction?: number | null
          organization_id?: string
          period_end?: string
          period_start?: string
          pools_summary?: Json
          short_period_factor?: number | null
          snapshot_hash?: string
          status?: string
          taxable_total_profits?: number
          total_capital_allowances?: number
        }
        Relationships: [
          {
            foreignKeyName: "ct_computation_snapshots_cap_period_id_fkey"
            columns: ["cap_period_id"]
            isOneToOne: false
            referencedRelation: "capital_allowance_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_computation_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ct_computation_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ct_rate_tables: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          lower_limit: number
          main_rate: number
          marginal_relief_fraction: number
          small_profits_rate: number
          upper_limit: number
        }
        Insert: {
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          lower_limit: number
          main_rate: number
          marginal_relief_fraction: number
          small_profits_rate: number
          upper_limit: number
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          lower_limit?: number
          main_rate?: number
          marginal_relief_fraction?: number
          small_profits_rate?: number
          upper_limit?: number
        }
        Relationships: []
      }
      customers: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          city: string | null
          client_id: string | null
          company_id: string | null
          country: string | null
          created_at: string | null
          default_account_id: string | null
          default_vat_code_id: string | null
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          organization_id: string
          payment_terms_days: number | null
          phone: string | null
          postcode: string | null
          updated_at: string | null
          vat_number: string | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          client_id?: string | null
          company_id?: string | null
          country?: string | null
          created_at?: string | null
          default_account_id?: string | null
          default_vat_code_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          organization_id: string
          payment_terms_days?: number | null
          phone?: string | null
          postcode?: string | null
          updated_at?: string | null
          vat_number?: string | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          client_id?: string | null
          company_id?: string | null
          country?: string | null
          created_at?: string | null
          default_account_id?: string | null
          default_vat_code_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          organization_id?: string
          payment_terms_days?: number | null
          phone?: string | null
          postcode?: string | null
          updated_at?: string | null
          vat_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_default_account_id_fkey"
            columns: ["default_account_id"]
            isOneToOne: false
            referencedRelation: "bookkeeping_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_default_vat_code_id_fkey"
            columns: ["default_vat_code_id"]
            isOneToOne: false
            referencedRelation: "vat_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deadlines: {
        Row: {
          active_window_start: string | null
          client_id: string | null
          company_id: string | null
          completed_at: string | null
          created_at: string | null
          deadline_type: string
          description: string | null
          due_date: string
          engagement_id: string | null
          filed_at: string | null
          filing_body: string | null
          id: string
          job_id: string | null
          metadata: Json | null
          name: string
          organization_id: string
          owner_id: string | null
          parent_deadline_id: string | null
          payment_date: string | null
          period_end: string | null
          period_start: string | null
          recurrence_rule: Json | null
          required_documents: Json | null
          risk_factors: Json | null
          risk_score: number | null
          service_code: string | null
          status: string
          tags: Json | null
          updated_at: string | null
          warning_date: string | null
        }
        Insert: {
          active_window_start?: string | null
          client_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          deadline_type: string
          description?: string | null
          due_date: string
          engagement_id?: string | null
          filed_at?: string | null
          filing_body?: string | null
          id?: string
          job_id?: string | null
          metadata?: Json | null
          name: string
          organization_id: string
          owner_id?: string | null
          parent_deadline_id?: string | null
          payment_date?: string | null
          period_end?: string | null
          period_start?: string | null
          recurrence_rule?: Json | null
          required_documents?: Json | null
          risk_factors?: Json | null
          risk_score?: number | null
          service_code?: string | null
          status?: string
          tags?: Json | null
          updated_at?: string | null
          warning_date?: string | null
        }
        Update: {
          active_window_start?: string | null
          client_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          deadline_type?: string
          description?: string | null
          due_date?: string
          engagement_id?: string | null
          filed_at?: string | null
          filing_body?: string | null
          id?: string
          job_id?: string | null
          metadata?: Json | null
          name?: string
          organization_id?: string
          owner_id?: string | null
          parent_deadline_id?: string | null
          payment_date?: string | null
          period_end?: string | null
          period_start?: string | null
          recurrence_rule?: Json | null
          required_documents?: Json | null
          risk_factors?: Json | null
          risk_score?: number | null
          service_code?: string | null
          status?: string
          tags?: Json | null
          updated_at?: string | null
          warning_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deadlines_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadlines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadlines_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadlines_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadlines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadlines_parent_deadline_id_fkey"
            columns: ["parent_deadline_id"]
            isOneToOne: false
            referencedRelation: "deadlines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_deadlines_job"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      document_folders: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          organization_id: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organization_id: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_folders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_folders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      email_attachments: {
        Row: {
          content_id: string | null
          content_type: string | null
          created_at: string
          email_message_id: string
          filename: string
          id: string
          is_inline: boolean | null
          size_bytes: number | null
          storage_path: string | null
        }
        Insert: {
          content_id?: string | null
          content_type?: string | null
          created_at?: string
          email_message_id: string
          filename: string
          id?: string
          is_inline?: boolean | null
          size_bytes?: number | null
          storage_path?: string | null
        }
        Update: {
          content_id?: string | null
          content_type?: string | null
          created_at?: string
          email_message_id?: string
          filename?: string
          id?: string
          is_inline?: boolean | null
          size_bytes?: number | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_attachments_email_message_id_fkey"
            columns: ["email_message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          attachments: Json | null
          body_html: string | null
          body_text: string | null
          cc_emails: string[] | null
          client_id: string | null
          company_id: string | null
          created_at: string
          direction: Database["public"]["Enums"]["email_direction"]
          from_email: string
          from_name: string | null
          id: string
          is_read: boolean | null
          job_id: string | null
          labels: string[] | null
          link_reason: string | null
          link_reference: string | null
          mailbox_id: string
          matched_at: string | null
          matched_by: Database["public"]["Enums"]["email_match_type"] | null
          matched_entities: Json | null
          message_id: string
          needs_review: boolean | null
          organization_id: string
          raw_headers: Json | null
          received_at: string | null
          search_vector: unknown
          sent_at: string | null
          subject: string | null
          thread_id: string | null
          thread_ref: string | null
          to_emails: string[] | null
        }
        Insert: {
          attachments?: Json | null
          body_html?: string | null
          body_text?: string | null
          cc_emails?: string[] | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          direction?: Database["public"]["Enums"]["email_direction"]
          from_email: string
          from_name?: string | null
          id?: string
          is_read?: boolean | null
          job_id?: string | null
          labels?: string[] | null
          link_reason?: string | null
          link_reference?: string | null
          mailbox_id: string
          matched_at?: string | null
          matched_by?: Database["public"]["Enums"]["email_match_type"] | null
          matched_entities?: Json | null
          message_id: string
          needs_review?: boolean | null
          organization_id: string
          raw_headers?: Json | null
          received_at?: string | null
          search_vector?: unknown
          sent_at?: string | null
          subject?: string | null
          thread_id?: string | null
          thread_ref?: string | null
          to_emails?: string[] | null
        }
        Update: {
          attachments?: Json | null
          body_html?: string | null
          body_text?: string | null
          cc_emails?: string[] | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          direction?: Database["public"]["Enums"]["email_direction"]
          from_email?: string
          from_name?: string | null
          id?: string
          is_read?: boolean | null
          job_id?: string | null
          labels?: string[] | null
          link_reason?: string | null
          link_reference?: string | null
          mailbox_id?: string
          matched_at?: string | null
          matched_by?: Database["public"]["Enums"]["email_match_type"] | null
          matched_entities?: Json | null
          message_id?: string
          needs_review?: boolean | null
          organization_id?: string
          raw_headers?: Json | null
          received_at?: string | null
          search_vector?: unknown
          sent_at?: string | null
          subject?: string | null
          thread_id?: string | null
          thread_ref?: string | null
          to_emails?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "connected_mailboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "connected_mailboxes_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_thread_ref_fkey"
            columns: ["thread_ref"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_preferences: {
        Row: {
          category: string
          client_id: string | null
          contact_id: string | null
          created_at: string
          email: string | null
          id: string
          lead_id: string | null
          opt_in_at: string | null
          opted_out_at: string | null
          organization_id: string
          source: string | null
          updated_at: string
        }
        Insert: {
          category: string
          client_id?: string | null
          contact_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          lead_id?: string | null
          opt_in_at?: string | null
          opted_out_at?: string | null
          organization_id: string
          source?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          client_id?: string | null
          contact_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          lead_id?: string | null
          opt_in_at?: string | null
          opted_out_at?: string | null
          organization_id?: string
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_preferences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_push_subscriptions: {
        Row: {
          created_at: string
          delta_link: string | null
          expiration_at: string | null
          history_id: string | null
          id: string
          mailbox_id: string
          provider: string
          resource_uri: string | null
          subscription_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          delta_link?: string | null
          expiration_at?: string | null
          history_id?: string | null
          id?: string
          mailbox_id: string
          provider: string
          resource_uri?: string | null
          subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          delta_link?: string | null
          expiration_at?: string | null
          history_id?: string | null
          id?: string
          mailbox_id?: string
          provider?: string
          resource_uri?: string | null
          subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_push_subscriptions_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "connected_mailboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_push_subscriptions_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "connected_mailboxes_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      email_queue: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          body_html: string | null
          body_text: string | null
          client_id: string | null
          company_id: string | null
          context: string | null
          created_at: string | null
          created_by: string | null
          entity_id: string | null
          entity_type: string | null
          error_message: string | null
          id: string
          job_id: string | null
          last_error_code: string | null
          last_error_message: string | null
          mailbox_id: string | null
          merge_data: Json | null
          organization_id: string
          provider: string | null
          queued_by: string | null
          retry_count: number | null
          scheduled_at: string | null
          sent_at: string | null
          status: string | null
          subject: string
          template_id: string | null
          thread_id: string | null
          to_email: string
          to_name: string | null
          updated_at: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          body_html?: string | null
          body_text?: string | null
          client_id?: string | null
          company_id?: string | null
          context?: string | null
          created_at?: string | null
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error_message?: string | null
          id?: string
          job_id?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          mailbox_id?: string | null
          merge_data?: Json | null
          organization_id: string
          provider?: string | null
          queued_by?: string | null
          retry_count?: number | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string | null
          subject: string
          template_id?: string | null
          thread_id?: string | null
          to_email: string
          to_name?: string | null
          updated_at?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          body_html?: string | null
          body_text?: string | null
          client_id?: string | null
          company_id?: string | null
          context?: string | null
          created_at?: string | null
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error_message?: string | null
          id?: string
          job_id?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          mailbox_id?: string | null
          merge_data?: Json | null
          organization_id?: string
          provider?: string | null
          queued_by?: string | null
          retry_count?: number | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string
          template_id?: string | null
          thread_id?: string | null
          to_email?: string
          to_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_queue_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "connected_mailboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "connected_mailboxes_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_queue_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_suppressions: {
        Row: {
          category: string | null
          created_at: string
          email: string
          id: string
          organization_id: string
          reason: string
          source: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          email: string
          id?: string
          organization_id: string
          reason: string
          source?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          email?: string
          id?: string
          organization_id?: string
          reason?: string
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_suppressions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_threads: {
        Row: {
          client_id: string | null
          company_id: string | null
          created_at: string
          external_thread_id: string
          first_message_at: string | null
          id: string
          initiated_by: string
          is_archived: boolean | null
          job_id: string | null
          last_message_at: string | null
          message_count: number | null
          organization_id: string
          provider: string
          subject: string | null
        }
        Insert: {
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          external_thread_id: string
          first_message_at?: string | null
          id?: string
          initiated_by?: string
          is_archived?: boolean | null
          job_id?: string | null
          last_message_at?: string | null
          message_count?: number | null
          organization_id: string
          provider: string
          subject?: string | null
        }
        Update: {
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          external_thread_id?: string
          first_message_at?: string | null
          id?: string
          initiated_by?: string
          is_archived?: boolean | null
          job_id?: string | null
          last_message_at?: string | null
          message_count?: number | null
          organization_id?: string
          provider?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_threads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_threads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_threads_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_threads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_unsubscribe_tokens: {
        Row: {
          category: string | null
          created_at: string
          email: string
          id: string
          organization_id: string
          token: string
          updated_at: string
          used_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          email: string
          id?: string
          organization_id: string
          token: string
          updated_at?: string
          used_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          email?: string
          id?: string
          organization_id?: string
          token?: string
          updated_at?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_unsubscribe_tokens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_absences: {
        Row: {
          absence_type: string
          average_weekly_earnings: number | null
          created_at: string
          employee_id: string
          end_date: string | null
          expected_return_date: string | null
          fit_note_received: boolean | null
          id: string
          matb1_received: boolean | null
          notes: string | null
          organization_id: string
          qualifying_days_pattern: Json | null
          start_date: string
          statutory_pay_type: string | null
          statutory_weeks_paid: number | null
          statutory_weeks_remaining: number | null
          updated_at: string
          waiting_days_served: number | null
        }
        Insert: {
          absence_type: string
          average_weekly_earnings?: number | null
          created_at?: string
          employee_id: string
          end_date?: string | null
          expected_return_date?: string | null
          fit_note_received?: boolean | null
          id?: string
          matb1_received?: boolean | null
          notes?: string | null
          organization_id: string
          qualifying_days_pattern?: Json | null
          start_date: string
          statutory_pay_type?: string | null
          statutory_weeks_paid?: number | null
          statutory_weeks_remaining?: number | null
          updated_at?: string
          waiting_days_served?: number | null
        }
        Update: {
          absence_type?: string
          average_weekly_earnings?: number | null
          created_at?: string
          employee_id?: string
          end_date?: string | null
          expected_return_date?: string | null
          fit_note_received?: boolean | null
          id?: string
          matb1_received?: boolean | null
          notes?: string | null
          organization_id?: string
          qualifying_days_pattern?: Json | null
          start_date?: string
          statutory_pay_type?: string | null
          statutory_weeks_paid?: number | null
          statutory_weeks_remaining?: number | null
          updated_at?: string
          waiting_days_served?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_absences_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_absences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_benefits: {
        Row: {
          benefit_type: string
          car_available_from: string | null
          car_available_to: string | null
          car_capital_contributions: number | null
          car_co2_emissions: number | null
          car_days_unavailable: number | null
          car_fuel_type: string | null
          car_list_price: number | null
          car_make_model: string | null
          car_private_use_contribution: number | null
          car_registration: string | null
          cash_equivalent: number
          created_at: string
          description: string
          employee_id: string
          from_date: string
          id: string
          loan_amount: number | null
          loan_interest_paid: number | null
          notes: string | null
          organization_id: string
          payrolled: boolean | null
          tax_year: string
          to_date: string
          updated_at: string
        }
        Insert: {
          benefit_type: string
          car_available_from?: string | null
          car_available_to?: string | null
          car_capital_contributions?: number | null
          car_co2_emissions?: number | null
          car_days_unavailable?: number | null
          car_fuel_type?: string | null
          car_list_price?: number | null
          car_make_model?: string | null
          car_private_use_contribution?: number | null
          car_registration?: string | null
          cash_equivalent: number
          created_at?: string
          description: string
          employee_id: string
          from_date: string
          id?: string
          loan_amount?: number | null
          loan_interest_paid?: number | null
          notes?: string | null
          organization_id: string
          payrolled?: boolean | null
          tax_year: string
          to_date: string
          updated_at?: string
        }
        Update: {
          benefit_type?: string
          car_available_from?: string | null
          car_available_to?: string | null
          car_capital_contributions?: number | null
          car_co2_emissions?: number | null
          car_days_unavailable?: number | null
          car_fuel_type?: string | null
          car_list_price?: number | null
          car_make_model?: string | null
          car_private_use_contribution?: number | null
          car_registration?: string | null
          cash_equivalent?: number
          created_at?: string
          description?: string
          employee_id?: string
          from_date?: string
          id?: string
          loan_amount?: number | null
          loan_interest_paid?: number | null
          notes?: string | null
          organization_id?: string
          payrolled?: boolean | null
          tax_year?: string
          to_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_benefits_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_benefits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          address_line_3: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_name: string | null
          bank_sort_code: string | null
          city: string | null
          country: string | null
          county: string | null
          created_at: string
          date_of_birth: string
          department: string | null
          director_nic_method: string | null
          directorship_end_date: string | null
          directorship_start_date: string | null
          email: string | null
          employee_reference: string | null
          first_name: string
          gender: string | null
          id: string
          is_director: boolean | null
          is_scottish_taxpayer: boolean | null
          is_welsh_taxpayer: boolean | null
          job_title: string | null
          last_name: string
          leaving_date: string | null
          leaving_reason: string | null
          linked_person_id: string | null
          middle_names: string | null
          national_insurance_number: string | null
          nic_category: string
          organization_id: string
          p45_leaving_date: string | null
          p45_received: boolean | null
          p45_tax_code: string | null
          p45_total_pay: number | null
          p45_total_tax: number | null
          pay_frequency: string
          paye_scheme_id: string
          payment_method: string | null
          pension_auto_enrol_date: string | null
          pension_employee_rate_override: number | null
          pension_employer_rate_override: number | null
          pension_opt_out_date: string | null
          pension_scheme_id: string | null
          phone: string | null
          portal_user_id: string | null
          postcode: string | null
          start_date: string
          starter_declaration: string | null
          status: string
          student_loan_plan: string | null
          tax_basis: string
          tax_code: string
          title: string | null
          updated_at: string
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          address_line_3?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          bank_sort_code?: string | null
          city?: string | null
          country?: string | null
          county?: string | null
          created_at?: string
          date_of_birth: string
          department?: string | null
          director_nic_method?: string | null
          directorship_end_date?: string | null
          directorship_start_date?: string | null
          email?: string | null
          employee_reference?: string | null
          first_name: string
          gender?: string | null
          id?: string
          is_director?: boolean | null
          is_scottish_taxpayer?: boolean | null
          is_welsh_taxpayer?: boolean | null
          job_title?: string | null
          last_name: string
          leaving_date?: string | null
          leaving_reason?: string | null
          linked_person_id?: string | null
          middle_names?: string | null
          national_insurance_number?: string | null
          nic_category?: string
          organization_id: string
          p45_leaving_date?: string | null
          p45_received?: boolean | null
          p45_tax_code?: string | null
          p45_total_pay?: number | null
          p45_total_tax?: number | null
          pay_frequency?: string
          paye_scheme_id: string
          payment_method?: string | null
          pension_auto_enrol_date?: string | null
          pension_employee_rate_override?: number | null
          pension_employer_rate_override?: number | null
          pension_opt_out_date?: string | null
          pension_scheme_id?: string | null
          phone?: string | null
          portal_user_id?: string | null
          postcode?: string | null
          start_date: string
          starter_declaration?: string | null
          status?: string
          student_loan_plan?: string | null
          tax_basis?: string
          tax_code?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          address_line_3?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          bank_sort_code?: string | null
          city?: string | null
          country?: string | null
          county?: string | null
          created_at?: string
          date_of_birth?: string
          department?: string | null
          director_nic_method?: string | null
          directorship_end_date?: string | null
          directorship_start_date?: string | null
          email?: string | null
          employee_reference?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          is_director?: boolean | null
          is_scottish_taxpayer?: boolean | null
          is_welsh_taxpayer?: boolean | null
          job_title?: string | null
          last_name?: string
          leaving_date?: string | null
          leaving_reason?: string | null
          linked_person_id?: string | null
          middle_names?: string | null
          national_insurance_number?: string | null
          nic_category?: string
          organization_id?: string
          p45_leaving_date?: string | null
          p45_received?: boolean | null
          p45_tax_code?: string | null
          p45_total_pay?: number | null
          p45_total_tax?: number | null
          pay_frequency?: string
          paye_scheme_id?: string
          payment_method?: string | null
          pension_auto_enrol_date?: string | null
          pension_employee_rate_override?: number | null
          pension_employer_rate_override?: number | null
          pension_opt_out_date?: string | null
          pension_scheme_id?: string | null
          phone?: string | null
          portal_user_id?: string | null
          postcode?: string | null
          start_date?: string
          starter_declaration?: string | null
          status?: string
          student_loan_plan?: string | null
          tax_basis?: string
          tax_code?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_linked_person_id_fkey"
            columns: ["linked_person_id"]
            isOneToOne: false
            referencedRelation: "company_persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_paye_scheme_id_fkey"
            columns: ["paye_scheme_id"]
            isOneToOne: false
            referencedRelation: "paye_schemes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_pension_scheme_id_fkey"
            columns: ["pension_scheme_id"]
            isOneToOne: false
            referencedRelation: "pension_schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_letter_template_variants: {
        Row: {
          body: string
          client_type: string | null
          created_at: string
          created_by: string | null
          engagement_kind: string
          id: string
          is_active: boolean
          is_default: boolean
          legal_entity: string | null
          merge_fields: string[] | null
          organization_id: string
          service_code: string | null
          subject: string
          template_id: string | null
          updated_at: string
          variant_group_key: string | null
        }
        Insert: {
          body: string
          client_type?: string | null
          created_at?: string
          created_by?: string | null
          engagement_kind?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          legal_entity?: string | null
          merge_fields?: string[] | null
          organization_id: string
          service_code?: string | null
          subject: string
          template_id?: string | null
          updated_at?: string
          variant_group_key?: string | null
        }
        Update: {
          body?: string
          client_type?: string | null
          created_at?: string
          created_by?: string | null
          engagement_kind?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          legal_entity?: string | null
          merge_fields?: string[] | null
          organization_id?: string
          service_code?: string | null
          subject?: string
          template_id?: string | null
          updated_at?: string
          variant_group_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagement_letter_template_variants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      engagement_letters: {
        Row: {
          created_at: string
          document_content: string | null
          id: string
          onboarding_application_id: string
          organization_id: string
          sent_at: string | null
          signature_ip: string | null
          signature_token: string | null
          signature_user_agent: string | null
          signed_at: string | null
          template_id: string | null
          token_expires_at: string | null
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          created_at?: string
          document_content?: string | null
          id?: string
          onboarding_application_id: string
          organization_id: string
          sent_at?: string | null
          signature_ip?: string | null
          signature_token?: string | null
          signature_user_agent?: string | null
          signed_at?: string | null
          template_id?: string | null
          token_expires_at?: string | null
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          created_at?: string
          document_content?: string | null
          id?: string
          onboarding_application_id?: string
          organization_id?: string
          sent_at?: string | null
          signature_ip?: string | null
          signature_token?: string | null
          signature_user_agent?: string | null
          signed_at?: string | null
          template_id?: string | null
          token_expires_at?: string | null
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "engagement_letters_onboarding_application_id_fkey"
            columns: ["onboarding_application_id"]
            isOneToOne: false
            referencedRelation: "onboarding_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_letters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagement_letters_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      engagements: {
        Row: {
          activated_at: string | null
          active: boolean | null
          billing_notes: string | null
          client_id: string | null
          company_id: string | null
          created_at: string
          end_date: string | null
          engagement_letter_required: boolean
          frequency: string
          id: string
          organization_id: string
          quote_id: string | null
          service_config: Json | null
          service_id: string
          start_date: string
          status: string
          suspended_at: string | null
          terminated_at: string | null
          termination_reason: string | null
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          active?: boolean | null
          billing_notes?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          end_date?: string | null
          engagement_letter_required?: boolean
          frequency: string
          id?: string
          organization_id: string
          quote_id?: string | null
          service_config?: Json | null
          service_id: string
          start_date: string
          status?: string
          suspended_at?: string | null
          terminated_at?: string | null
          termination_reason?: string | null
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          active?: boolean | null
          billing_notes?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          end_date?: string | null
          engagement_letter_required?: boolean
          frequency?: string
          id?: string
          organization_id?: string
          quote_id?: string | null
          service_config?: Json | null
          service_id?: string
          start_date?: string
          status?: string
          suspended_at?: string | null
          terminated_at?: string | null
          termination_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      external_credentials: {
        Row: {
          created_at: string | null
          credential_label: string
          id: string
          is_active: boolean | null
          metadata: Json | null
          organization_id: string
          service_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          credential_label: string
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          organization_id: string
          service_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          credential_label?: string
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          organization_id?: string
          service_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_credentials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      filing_approvals: {
        Row: {
          approval_method: string
          approval_reason: string | null
          approval_scope: string
          approved_at: string
          approved_by: string | null
          approved_by_role: string
          created_at: string
          filing_id: string
          id: string
          model_snapshot_id: string
          organization_id: string
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          snapshot_hash: string
        }
        Insert: {
          approval_method: string
          approval_reason?: string | null
          approval_scope: string
          approved_at?: string
          approved_by?: string | null
          approved_by_role: string
          created_at?: string
          filing_id: string
          id?: string
          model_snapshot_id: string
          organization_id: string
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          snapshot_hash: string
        }
        Update: {
          approval_method?: string
          approval_reason?: string | null
          approval_scope?: string
          approved_at?: string
          approved_by?: string | null
          approved_by_role?: string
          created_at?: string
          filing_id?: string
          id?: string
          model_snapshot_id?: string
          organization_id?: string
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          snapshot_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "filing_approvals_filing_id_fkey"
            columns: ["filing_id"]
            isOneToOne: false
            referencedRelation: "filings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filing_approvals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      filing_artefacts: {
        Row: {
          artefact_type: string
          content: string
          content_hash: string
          created_at: string
          filing_id: string
          generator_version: string
          id: string
          organization_id: string
          taxonomy_version: string | null
        }
        Insert: {
          artefact_type: string
          content: string
          content_hash: string
          created_at?: string
          filing_id: string
          generator_version?: string
          id?: string
          organization_id: string
          taxonomy_version?: string | null
        }
        Update: {
          artefact_type?: string
          content?: string
          content_hash?: string
          created_at?: string
          filing_id?: string
          generator_version?: string
          id?: string
          organization_id?: string
          taxonomy_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "filing_artefacts_filing_id_fkey"
            columns: ["filing_id"]
            isOneToOne: false
            referencedRelation: "filings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filing_artefacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      filing_documents: {
        Row: {
          created_at: string
          document_name: string
          document_type: string
          file_size: number | null
          filing_id: string
          generated_at: string
          generated_by: string | null
          id: string
          mime_type: string | null
          public_url: string | null
          storage_path: string | null
          version: number | null
        }
        Insert: {
          created_at?: string
          document_name: string
          document_type: string
          file_size?: number | null
          filing_id: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          mime_type?: string | null
          public_url?: string | null
          storage_path?: string | null
          version?: number | null
        }
        Update: {
          created_at?: string
          document_name?: string
          document_type?: string
          file_size?: number | null
          filing_id?: string
          generated_at?: string
          generated_by?: string | null
          id?: string
          mime_type?: string | null
          public_url?: string | null
          storage_path?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "filing_documents_filing_id_fkey"
            columns: ["filing_id"]
            isOneToOne: false
            referencedRelation: "filings"
            referencedColumns: ["id"]
          },
        ]
      }
      filing_events: {
        Row: {
          created_at: string | null
          emitted_at: string
          event_type: string
          filing_id: string
          filing_type: string
          id: string
          metadata: Json | null
          organization_id: string
          processed_at: string | null
          status: string
        }
        Insert: {
          created_at?: string | null
          emitted_at?: string
          event_type: string
          filing_id: string
          filing_type: string
          id?: string
          metadata?: Json | null
          organization_id: string
          processed_at?: string | null
          status: string
        }
        Update: {
          created_at?: string | null
          emitted_at?: string
          event_type?: string
          filing_id?: string
          filing_type?: string
          id?: string
          metadata?: Json | null
          organization_id?: string
          processed_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "filing_events_filing_id_fkey"
            columns: ["filing_id"]
            isOneToOne: false
            referencedRelation: "filings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filing_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      filing_model_snapshots: {
        Row: {
          approved_at: string
          approved_by: string | null
          client_id: string | null
          coa_mapping_ref: string | null
          coa_snapshot: Json | null
          company_id: string | null
          computed_outputs: Json | null
          created_at: string
          filing_id: string | null
          generator_version: string
          id: string
          lock_reason: string | null
          mapping_rules_version: string | null
          organization_id: string
          pdf_artifact_id: string | null
          period_end: string
          period_start: string
          snapshot_data: Json
          snapshot_hash: string
          snapshot_type: string
          source_ledger_version: string | null
          source_workpaper_id: string | null
          submission_artifact_id: string | null
          tb_snapshot: Json | null
          tb_snapshot_ref: string | null
          version: number | null
        }
        Insert: {
          approved_at?: string
          approved_by?: string | null
          client_id?: string | null
          coa_mapping_ref?: string | null
          coa_snapshot?: Json | null
          company_id?: string | null
          computed_outputs?: Json | null
          created_at?: string
          filing_id?: string | null
          generator_version?: string
          id?: string
          lock_reason?: string | null
          mapping_rules_version?: string | null
          organization_id: string
          pdf_artifact_id?: string | null
          period_end: string
          period_start: string
          snapshot_data: Json
          snapshot_hash: string
          snapshot_type: string
          source_ledger_version?: string | null
          source_workpaper_id?: string | null
          submission_artifact_id?: string | null
          tb_snapshot?: Json | null
          tb_snapshot_ref?: string | null
          version?: number | null
        }
        Update: {
          approved_at?: string
          approved_by?: string | null
          client_id?: string | null
          coa_mapping_ref?: string | null
          coa_snapshot?: Json | null
          company_id?: string | null
          computed_outputs?: Json | null
          created_at?: string
          filing_id?: string | null
          generator_version?: string
          id?: string
          lock_reason?: string | null
          mapping_rules_version?: string | null
          organization_id?: string
          pdf_artifact_id?: string | null
          period_end?: string
          period_start?: string
          snapshot_data?: Json
          snapshot_hash?: string
          snapshot_type?: string
          source_ledger_version?: string | null
          source_workpaper_id?: string | null
          submission_artifact_id?: string | null
          tb_snapshot?: Json | null
          tb_snapshot_ref?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "filing_model_snapshots_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filing_model_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filing_model_snapshots_filing_id_fkey"
            columns: ["filing_id"]
            isOneToOne: false
            referencedRelation: "filings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filing_model_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filing_model_snapshots_source_workpaper_id_fkey"
            columns: ["source_workpaper_id"]
            isOneToOne: false
            referencedRelation: "workpaper_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      filing_payload_artifacts: {
        Row: {
          artifact_type: string
          content_type: string
          filing_id: string
          generated_at: string
          generator_version: string
          id: string
          organization_id: string
          payload_data: Json | null
          schema_version: string
          sha256_hash: string
          snapshot_id: string | null
          storage_path: string | null
        }
        Insert: {
          artifact_type: string
          content_type: string
          filing_id: string
          generated_at?: string
          generator_version?: string
          id?: string
          organization_id: string
          payload_data?: Json | null
          schema_version: string
          sha256_hash: string
          snapshot_id?: string | null
          storage_path?: string | null
        }
        Update: {
          artifact_type?: string
          content_type?: string
          filing_id?: string
          generated_at?: string
          generator_version?: string
          id?: string
          organization_id?: string
          payload_data?: Json | null
          schema_version?: string
          sha256_hash?: string
          snapshot_id?: string | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "filing_payload_artifacts_filing_id_fkey"
            columns: ["filing_id"]
            isOneToOne: false
            referencedRelation: "filings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filing_payload_artifacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filing_payload_artifacts_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "filing_model_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      filing_provider_events: {
        Row: {
          correlation_id: string | null
          created_at: string
          duration_ms: number | null
          endpoint: string
          environment: string
          event_type: string
          filing_id: string | null
          id: string
          organization_id: string
          payload_artifact_path: string | null
          provider: string
          request_summary: Json | null
          response_status: number | null
          response_summary: Json | null
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          endpoint: string
          environment: string
          event_type: string
          filing_id?: string | null
          id?: string
          organization_id: string
          payload_artifact_path?: string | null
          provider: string
          request_summary?: Json | null
          response_status?: number | null
          response_summary?: Json | null
        }
        Update: {
          correlation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          endpoint?: string
          environment?: string
          event_type?: string
          filing_id?: string | null
          id?: string
          organization_id?: string
          payload_artifact_path?: string | null
          provider?: string
          request_summary?: Json | null
          response_status?: number | null
          response_summary?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "filing_provider_events_filing_id_fkey"
            columns: ["filing_id"]
            isOneToOne: false
            referencedRelation: "filings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filing_provider_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      filing_queue: {
        Row: {
          approval_id: string | null
          attempts: number
          completed_at: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          filing_id: string
          filing_type: string
          id: string
          idempotency_key: string
          last_attempt_at: string | null
          max_attempts: number
          next_attempt_at: string | null
          organization_id: string
          priority: number
          snapshot_hash: string
          status: string
        }
        Insert: {
          approval_id?: string | null
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          filing_id: string
          filing_type: string
          id?: string
          idempotency_key: string
          last_attempt_at?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          organization_id: string
          priority?: number
          snapshot_hash: string
          status?: string
        }
        Update: {
          approval_id?: string | null
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          filing_id?: string
          filing_type?: string
          id?: string
          idempotency_key?: string
          last_attempt_at?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          organization_id?: string
          priority?: number
          snapshot_hash?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "filing_queue_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "filing_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filing_queue_filing_id_fkey"
            columns: ["filing_id"]
            isOneToOne: false
            referencedRelation: "filings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filing_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      filing_submissions: {
        Row: {
          ch_transaction_id: string | null
          correlation_id: string | null
          created_at: string
          environment: string
          error_message: string | null
          filing_id: string | null
          filing_type: string
          id: string
          idempotency_key: string | null
          organization_id: string
          provider: string | null
          request_headers: Json | null
          request_payload: string | null
          response_headers: Json | null
          response_payload: string | null
          response_status_code: number | null
          snapshot_id: string | null
          status: string
          submitted_at: string
        }
        Insert: {
          ch_transaction_id?: string | null
          correlation_id?: string | null
          created_at?: string
          environment: string
          error_message?: string | null
          filing_id?: string | null
          filing_type: string
          id?: string
          idempotency_key?: string | null
          organization_id: string
          provider?: string | null
          request_headers?: Json | null
          request_payload?: string | null
          response_headers?: Json | null
          response_payload?: string | null
          response_status_code?: number | null
          snapshot_id?: string | null
          status?: string
          submitted_at?: string
        }
        Update: {
          ch_transaction_id?: string | null
          correlation_id?: string | null
          created_at?: string
          environment?: string
          error_message?: string | null
          filing_id?: string | null
          filing_type?: string
          id?: string
          idempotency_key?: string | null
          organization_id?: string
          provider?: string | null
          request_headers?: Json | null
          request_payload?: string | null
          response_headers?: Json | null
          response_payload?: string | null
          response_status_code?: number | null
          snapshot_id?: string | null
          status?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "filing_submissions_filing_id_fkey"
            columns: ["filing_id"]
            isOneToOne: false
            referencedRelation: "filings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filing_submissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filing_submissions_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "filing_model_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      filing_validations: {
        Row: {
          created_at: string
          filing_id: string
          id: string
          organization_id: string
          results: Json
          status: string
          validated_at: string
          validation_type: string
          validator_version: string
        }
        Insert: {
          created_at?: string
          filing_id: string
          id?: string
          organization_id: string
          results?: Json
          status: string
          validated_at?: string
          validation_type: string
          validator_version?: string
        }
        Update: {
          created_at?: string
          filing_id?: string
          id?: string
          organization_id?: string
          results?: Json
          status?: string
          validated_at?: string
          validation_type?: string
          validator_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "filing_validations_filing_id_fkey"
            columns: ["filing_id"]
            isOneToOne: false
            referencedRelation: "filings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filing_validations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      filings: {
        Row: {
          accepted_at: string | null
          accounts_approval_id: string | null
          accounts_snapshot_id: string | null
          amendment_reason: string | null
          api_response: Json | null
          api_submission_id: string | null
          approval_requested_at: string | null
          approval_token: string | null
          approval_token_expires_at: string | null
          approved_at: string | null
          approved_by: string | null
          ch_transaction_id: string | null
          client_id: string | null
          company_id: string | null
          created_at: string | null
          ct_approval_id: string | null
          ct_snapshot_id: string | null
          current_snapshot_id: string | null
          current_version: number | null
          draft_schedule_data_json: Json | null
          environment: string | null
          error_code: string | null
          error_detail: Json | null
          filed_at: string | null
          filed_by: string | null
          filing_body: string
          filing_data: Json
          filing_receipt: Json | null
          filing_reference: string | null
          filing_type: string
          generated_documents: Json | null
          hmrc_correlation_id: string | null
          id: string
          idempotency_key: string | null
          is_amendment: boolean | null
          is_locked: boolean | null
          job_id: string
          last_poll_at: string | null
          last_submission_error: string | null
          locked_at: string | null
          locked_by: string | null
          model_snapshot_id: string | null
          next_retry_at: string | null
          next_year_job_id: string | null
          obligation_id: string | null
          organization_id: string
          original_filing_id: string | null
          partnership_allocation_id: string | null
          payment_deadline: string | null
          period_end: string | null
          period_start: string | null
          poll_count: number | null
          rejection_reason: string | null
          retry_count: number | null
          second_payment_date: string | null
          status: string
          submission_payload: Json | null
          submitted_at: string | null
          tax_due: number | null
          tax_refund: number | null
          tax_year: string | null
          updated_at: string | null
          vrn: string | null
          workpaper_instance_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          accounts_approval_id?: string | null
          accounts_snapshot_id?: string | null
          amendment_reason?: string | null
          api_response?: Json | null
          api_submission_id?: string | null
          approval_requested_at?: string | null
          approval_token?: string | null
          approval_token_expires_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          ch_transaction_id?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          ct_approval_id?: string | null
          ct_snapshot_id?: string | null
          current_snapshot_id?: string | null
          current_version?: number | null
          draft_schedule_data_json?: Json | null
          environment?: string | null
          error_code?: string | null
          error_detail?: Json | null
          filed_at?: string | null
          filed_by?: string | null
          filing_body: string
          filing_data?: Json
          filing_receipt?: Json | null
          filing_reference?: string | null
          filing_type: string
          generated_documents?: Json | null
          hmrc_correlation_id?: string | null
          id?: string
          idempotency_key?: string | null
          is_amendment?: boolean | null
          is_locked?: boolean | null
          job_id: string
          last_poll_at?: string | null
          last_submission_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          model_snapshot_id?: string | null
          next_retry_at?: string | null
          next_year_job_id?: string | null
          obligation_id?: string | null
          organization_id: string
          original_filing_id?: string | null
          partnership_allocation_id?: string | null
          payment_deadline?: string | null
          period_end?: string | null
          period_start?: string | null
          poll_count?: number | null
          rejection_reason?: string | null
          retry_count?: number | null
          second_payment_date?: string | null
          status?: string
          submission_payload?: Json | null
          submitted_at?: string | null
          tax_due?: number | null
          tax_refund?: number | null
          tax_year?: string | null
          updated_at?: string | null
          vrn?: string | null
          workpaper_instance_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          accounts_approval_id?: string | null
          accounts_snapshot_id?: string | null
          amendment_reason?: string | null
          api_response?: Json | null
          api_submission_id?: string | null
          approval_requested_at?: string | null
          approval_token?: string | null
          approval_token_expires_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          ch_transaction_id?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          ct_approval_id?: string | null
          ct_snapshot_id?: string | null
          current_snapshot_id?: string | null
          current_version?: number | null
          draft_schedule_data_json?: Json | null
          environment?: string | null
          error_code?: string | null
          error_detail?: Json | null
          filed_at?: string | null
          filed_by?: string | null
          filing_body?: string
          filing_data?: Json
          filing_receipt?: Json | null
          filing_reference?: string | null
          filing_type?: string
          generated_documents?: Json | null
          hmrc_correlation_id?: string | null
          id?: string
          idempotency_key?: string | null
          is_amendment?: boolean | null
          is_locked?: boolean | null
          job_id?: string
          last_poll_at?: string | null
          last_submission_error?: string | null
          locked_at?: string | null
          locked_by?: string | null
          model_snapshot_id?: string | null
          next_retry_at?: string | null
          next_year_job_id?: string | null
          obligation_id?: string | null
          organization_id?: string
          original_filing_id?: string | null
          partnership_allocation_id?: string | null
          payment_deadline?: string | null
          period_end?: string | null
          period_start?: string | null
          poll_count?: number | null
          rejection_reason?: string | null
          retry_count?: number | null
          second_payment_date?: string | null
          status?: string
          submission_payload?: Json | null
          submitted_at?: string | null
          tax_due?: number | null
          tax_refund?: number | null
          tax_year?: string | null
          updated_at?: string | null
          vrn?: string | null
          workpaper_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "filings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filings_current_snapshot_id_fkey"
            columns: ["current_snapshot_id"]
            isOneToOne: false
            referencedRelation: "filing_model_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filings_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filings_model_snapshot_id_fkey"
            columns: ["model_snapshot_id"]
            isOneToOne: false
            referencedRelation: "filing_model_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filings_next_year_job_id_fkey"
            columns: ["next_year_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filings_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "vat_obligations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filings_original_filing_id_fkey"
            columns: ["original_filing_id"]
            isOneToOne: false
            referencedRelation: "filings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filings_partnership_allocation_id_fkey"
            columns: ["partnership_allocation_id"]
            isOneToOne: false
            referencedRelation: "partnership_allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filings_workpaper_instance_id_fkey"
            columns: ["workpaper_instance_id"]
            isOneToOne: false
            referencedRelation: "workpaper_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_asset_transactions: {
        Row: {
          accounting_period_end: string
          accounting_period_start: string
          amount_net: number
          created_at: string
          created_by: string | null
          disposal_proceeds: number | null
          fixed_asset_id: string
          id: string
          notes: string | null
          organization_id: string
          transaction_type: string
        }
        Insert: {
          accounting_period_end: string
          accounting_period_start: string
          amount_net: number
          created_at?: string
          created_by?: string | null
          disposal_proceeds?: number | null
          fixed_asset_id: string
          id?: string
          notes?: string | null
          organization_id: string
          transaction_type: string
        }
        Update: {
          accounting_period_end?: string
          accounting_period_start?: string
          amount_net?: number
          created_at?: string
          created_by?: string | null
          disposal_proceeds?: number | null
          fixed_asset_id?: string
          id?: string
          notes?: string | null
          organization_id?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_asset_transactions_fixed_asset_id_fkey"
            columns: ["fixed_asset_id"]
            isOneToOne: false
            referencedRelation: "fixed_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_asset_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_assets: {
        Row: {
          acquisition_date: string
          asset_category: string
          asset_name: string
          attachment_path: string | null
          brought_into_use_date: string | null
          business_use_percentage: number
          car_co2_g_km: number | null
          car_is_electric: boolean | null
          car_list_price: number | null
          company_id: string
          cost: number
          created_at: string
          created_by: string | null
          default_pool_type: string
          disposal_date: string | null
          disposal_proceeds: number | null
          id: string
          invoice_reference: string | null
          is_car: boolean
          notes: string | null
          organization_id: string
          supplier: string | null
          updated_at: string
        }
        Insert: {
          acquisition_date: string
          asset_category: string
          asset_name: string
          attachment_path?: string | null
          brought_into_use_date?: string | null
          business_use_percentage?: number
          car_co2_g_km?: number | null
          car_is_electric?: boolean | null
          car_list_price?: number | null
          company_id: string
          cost: number
          created_at?: string
          created_by?: string | null
          default_pool_type?: string
          disposal_date?: string | null
          disposal_proceeds?: number | null
          id?: string
          invoice_reference?: string | null
          is_car?: boolean
          notes?: string | null
          organization_id: string
          supplier?: string | null
          updated_at?: string
        }
        Update: {
          acquisition_date?: string
          asset_category?: string
          asset_name?: string
          attachment_path?: string | null
          brought_into_use_date?: string | null
          business_use_percentage?: number
          car_co2_g_km?: number | null
          car_is_electric?: boolean | null
          car_list_price?: number | null
          company_id?: string
          cost?: number
          created_at?: string
          created_by?: string | null
          default_pool_type?: string
          disposal_date?: string | null
          disposal_proceeds?: number | null
          id?: string
          invoice_reference?: string | null
          is_car?: boolean
          notes?: string | null
          organization_id?: string
          supplier?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixed_assets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fx_rates: {
        Row: {
          base_currency: string
          created_at: string | null
          id: string
          rate: number
          rate_date: string
          source: string | null
          target_currency: string
        }
        Insert: {
          base_currency?: string
          created_at?: string | null
          id?: string
          rate: number
          rate_date: string
          source?: string | null
          target_currency: string
        }
        Update: {
          base_currency?: string
          created_at?: string | null
          id?: string
          rate?: number
          rate_date?: string
          source?: string | null
          target_currency?: string
        }
        Relationships: []
      }
      gmail_auth_states: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          organization_id: string
          redirect_url: string | null
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          organization_id: string
          redirect_url?: string | null
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          organization_id?: string
          redirect_url?: string | null
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gmail_auth_states_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hmrc_auth_states: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          organization_id: string
          redirect_url: string | null
          state: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          organization_id: string
          redirect_url?: string | null
          state: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          organization_id?: string
          redirect_url?: string | null
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "hmrc_auth_states_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hmrc_authorisations: {
        Row: {
          auth_type: string
          authorised_at: string | null
          client_id: string | null
          company_id: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          notes: string | null
          organization_id: string
          reference: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          auth_type: string
          authorised_at?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          reference?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          auth_type?: string
          authorised_at?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          reference?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hmrc_authorisations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hmrc_authorisations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hmrc_authorisations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      idempotency_keys: {
        Row: {
          created_at: string
          error_json: Json | null
          id: string
          key: string
          organization_id: string
          response_json: Json | null
          scope: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_json?: Json | null
          id?: string
          key: string
          organization_id: string
          response_json?: Json | null
          scope: string
          status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_json?: Json | null
          id?: string
          key?: string
          organization_id?: string
          response_json?: Json | null
          scope?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "idempotency_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          account_id: string
          cash_vat_recognised: number | null
          created_at: string | null
          description: string
          gross_amount: number
          id: string
          invoice_id: string
          line_number: number
          net_amount: number
          paid_amount: number | null
          paid_at: string | null
          payment_status: string | null
          quantity: number
          unit_price: number
          vat_amount: number
          vat_code_id: string | null
          vat_rate: number
        }
        Insert: {
          account_id: string
          cash_vat_recognised?: number | null
          created_at?: string | null
          description: string
          gross_amount: number
          id?: string
          invoice_id: string
          line_number: number
          net_amount: number
          paid_amount?: number | null
          paid_at?: string | null
          payment_status?: string | null
          quantity?: number
          unit_price: number
          vat_amount?: number
          vat_code_id?: string | null
          vat_rate?: number
        }
        Update: {
          account_id?: string
          cash_vat_recognised?: number | null
          created_at?: string | null
          description?: string
          gross_amount?: number
          id?: string
          invoice_id?: string
          line_number?: number
          net_amount?: number
          paid_amount?: number | null
          paid_at?: string | null
          payment_status?: string | null
          quantity?: number
          unit_price?: number
          vat_amount?: number
          vat_code_id?: string | null
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "bookkeeping_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_vat_code_id_fkey"
            columns: ["vat_code_id"]
            isOneToOne: false
            referencedRelation: "vat_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount: number
          bank_transaction_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          invoice_id: string
          ledger_entry_id: string | null
          payment_date: string
          payment_method: string | null
          payment_type: string | null
          reference: string | null
          unallocated_amount: number | null
        }
        Insert: {
          amount: number
          bank_transaction_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          invoice_id: string
          ledger_entry_id?: string | null
          payment_date: string
          payment_method?: string | null
          payment_type?: string | null
          reference?: string | null
          unallocated_amount?: number | null
        }
        Update: {
          amount?: number
          bank_transaction_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          invoice_id?: string
          ledger_entry_id?: string | null
          payment_date?: string
          payment_method?: string | null
          payment_type?: string | null
          reference?: string | null
          unallocated_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          client_id: string | null
          company_id: string | null
          contact_address: string | null
          contact_email: string | null
          contact_name: string
          created_at: string | null
          currency: string | null
          customer_id: string | null
          document_id: string | null
          due_date: string
          exchange_rate: number | null
          id: string
          invoice_number: string | null
          invoice_type: string
          is_posted: boolean | null
          issue_date: string
          issued_at: string | null
          issued_by: string | null
          locked_fields: Json | null
          notes: string | null
          organization_id: string
          override_history: Json | null
          override_metadata: Json | null
          pdf_path: string | null
          posted_at: string | null
          posted_by: string | null
          reference: string | null
          remaining_balance: number | null
          send_status: string | null
          sent_at: string | null
          status: string
          supplier_id: string | null
          total_gross: number
          total_net: number
          total_vat: number
          updated_at: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount_paid?: number
          client_id?: string | null
          company_id?: string | null
          contact_address?: string | null
          contact_email?: string | null
          contact_name: string
          created_at?: string | null
          currency?: string | null
          customer_id?: string | null
          document_id?: string | null
          due_date: string
          exchange_rate?: number | null
          id?: string
          invoice_number?: string | null
          invoice_type: string
          is_posted?: boolean | null
          issue_date: string
          issued_at?: string | null
          issued_by?: string | null
          locked_fields?: Json | null
          notes?: string | null
          organization_id: string
          override_history?: Json | null
          override_metadata?: Json | null
          pdf_path?: string | null
          posted_at?: string | null
          posted_by?: string | null
          reference?: string | null
          remaining_balance?: number | null
          send_status?: string | null
          sent_at?: string | null
          status?: string
          supplier_id?: string | null
          total_gross?: number
          total_net?: number
          total_vat?: number
          updated_at?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount_paid?: number
          client_id?: string | null
          company_id?: string | null
          contact_address?: string | null
          contact_email?: string | null
          contact_name?: string
          created_at?: string | null
          currency?: string | null
          customer_id?: string | null
          document_id?: string | null
          due_date?: string
          exchange_rate?: number | null
          id?: string
          invoice_number?: string | null
          invoice_type?: string
          is_posted?: boolean | null
          issue_date?: string
          issued_at?: string | null
          issued_by?: string | null
          locked_fields?: Json | null
          notes?: string | null
          organization_id?: string
          override_history?: Json | null
          override_metadata?: Json | null
          pdf_path?: string | null
          posted_at?: string | null
          posted_by?: string | null
          reference?: string | null
          remaining_balance?: number | null
          send_status?: string | null
          sent_at?: string | null
          status?: string
          supplier_id?: string | null
          total_gross?: number
          total_net?: number
          total_vat?: number
          updated_at?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "job_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      job_artifacts: {
        Row: {
          artifact_type: string
          client_id: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          id: string
          job_id: string
          locked_at: string | null
          locked_by: string | null
          metadata: Json | null
          organization_id: string
          period_label: string | null
          source_document_id: string | null
          source_questionnaire_id: string | null
          status: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          artifact_type: string
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          job_id: string
          locked_at?: string | null
          locked_by?: string | null
          metadata?: Json | null
          organization_id: string
          period_label?: string | null
          source_document_id?: string | null
          source_questionnaire_id?: string | null
          status?: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          artifact_type?: string
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          job_id?: string
          locked_at?: string | null
          locked_by?: string | null
          metadata?: Json | null
          organization_id?: string
          period_label?: string | null
          source_document_id?: string | null
          source_questionnaire_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_artifacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_artifacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_artifacts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_artifacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_artifacts_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "job_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_artifacts_source_questionnaire_id_fkey"
            columns: ["source_questionnaire_id"]
            isOneToOne: false
            referencedRelation: "questionnaire_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      job_conversations: {
        Row: {
          attachments: Json | null
          created_at: string
          id: string
          job_id: string
          message: string
          organization_id: string
          sender_id: string | null
          sender_type: string
          task_id: string | null
          visibility: string
        }
        Insert: {
          attachments?: Json | null
          created_at?: string
          id?: string
          job_id: string
          message: string
          organization_id: string
          sender_id?: string | null
          sender_type: string
          task_id?: string | null
          visibility?: string
        }
        Update: {
          attachments?: Json | null
          created_at?: string
          id?: string
          job_id?: string
          message?: string
          organization_id?: string
          sender_id?: string | null
          sender_type?: string
          task_id?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_conversations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_conversations_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "job_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      job_documents: {
        Row: {
          archived: boolean | null
          archived_at: string | null
          auto_archive_at: string | null
          client_visible: boolean | null
          file_name: string
          file_path: string
          file_size: number | null
          folder_id: string | null
          id: string
          job_id: string
          mime_type: string | null
          organization_id: string
          scroll_verified: boolean | null
          signature_ip: string | null
          signature_required: boolean | null
          signature_typed_name: string | null
          signed_at: string | null
          signed_by: string | null
          tags: Json | null
          task_id: string | null
          uploaded_at: string
          uploaded_by: string | null
          version: number | null
        }
        Insert: {
          archived?: boolean | null
          archived_at?: string | null
          auto_archive_at?: string | null
          client_visible?: boolean | null
          file_name: string
          file_path: string
          file_size?: number | null
          folder_id?: string | null
          id?: string
          job_id: string
          mime_type?: string | null
          organization_id: string
          scroll_verified?: boolean | null
          signature_ip?: string | null
          signature_required?: boolean | null
          signature_typed_name?: string | null
          signed_at?: string | null
          signed_by?: string | null
          tags?: Json | null
          task_id?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
          version?: number | null
        }
        Update: {
          archived?: boolean | null
          archived_at?: string | null
          auto_archive_at?: string | null
          client_visible?: boolean | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          folder_id?: string | null
          id?: string
          job_id?: string
          mime_type?: string | null
          organization_id?: string
          scroll_verified?: boolean | null
          signature_ip?: string | null
          signature_required?: boolean | null
          signature_typed_name?: string | null
          signed_at?: string | null
          signed_by?: string | null
          tags?: Json | null
          task_id?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_documents_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "document_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_documents_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_documents_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "job_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      job_questionnaire_instances: {
        Row: {
          created_at: string | null
          feeds_workpaper: boolean | null
          id: string
          job_id: string
          questionnaire_instance_id: string
          questionnaire_type: string
          trigger_status: string | null
        }
        Insert: {
          created_at?: string | null
          feeds_workpaper?: boolean | null
          id?: string
          job_id: string
          questionnaire_instance_id: string
          questionnaire_type?: string
          trigger_status?: string | null
        }
        Update: {
          created_at?: string | null
          feeds_workpaper?: boolean | null
          id?: string
          job_id?: string
          questionnaire_instance_id?: string
          questionnaire_type?: string
          trigger_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_questionnaire_instances_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_questionnaire_instances_questionnaire_instance_id_fkey"
            columns: ["questionnaire_instance_id"]
            isOneToOne: false
            referencedRelation: "questionnaire_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      job_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          dependencies: Json | null
          dependency_task_ids: string[] | null
          description: string | null
          due_date: string | null
          id: string
          is_client_facing: boolean | null
          is_manual: boolean | null
          job_id: string
          organization_id: string
          relative_due_days: number | null
          source_template_task_id: string | null
          stage: string | null
          status: string
          task_order: number | null
          template_task_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          dependencies?: Json | null
          dependency_task_ids?: string[] | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_client_facing?: boolean | null
          is_manual?: boolean | null
          job_id: string
          organization_id: string
          relative_due_days?: number | null
          source_template_task_id?: string | null
          stage?: string | null
          status?: string
          task_order?: number | null
          template_task_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          dependencies?: Json | null
          dependency_task_ids?: string[] | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_client_facing?: boolean | null
          is_manual?: boolean | null
          job_id?: string
          organization_id?: string
          relative_due_days?: number | null
          source_template_task_id?: string | null
          stage?: string | null
          status?: string
          task_order?: number | null
          template_task_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_tasks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_templates: {
        Row: {
          auto_close_if_no_work: boolean | null
          created_at: string
          default_priority: string | null
          default_status: string | null
          default_tags: Json | null
          description: string | null
          entity_filters: Json | null
          frequency: string | null
          id: string
          is_active: boolean | null
          organization_id: string
          records_requests_template: Json | null
          recurrence_config: Json | null
          relative_due_offset: number | null
          service_type: string
          skip_if_no_activity: boolean | null
          tasks: Json
          template_name: string
          trigger_conditions: Json | null
          trigger_type: string | null
          ui_category: string | null
          updated_at: string
          version: number | null
        }
        Insert: {
          auto_close_if_no_work?: boolean | null
          created_at?: string
          default_priority?: string | null
          default_status?: string | null
          default_tags?: Json | null
          description?: string | null
          entity_filters?: Json | null
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          organization_id: string
          records_requests_template?: Json | null
          recurrence_config?: Json | null
          relative_due_offset?: number | null
          service_type: string
          skip_if_no_activity?: boolean | null
          tasks?: Json
          template_name: string
          trigger_conditions?: Json | null
          trigger_type?: string | null
          ui_category?: string | null
          updated_at?: string
          version?: number | null
        }
        Update: {
          auto_close_if_no_work?: boolean | null
          created_at?: string
          default_priority?: string | null
          default_status?: string | null
          default_tags?: Json | null
          description?: string | null
          entity_filters?: Json | null
          frequency?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string
          records_requests_template?: Json | null
          recurrence_config?: Json | null
          relative_due_offset?: number | null
          service_type?: string
          skip_if_no_activity?: boolean | null
          tasks?: Json
          template_name?: string
          trigger_conditions?: Json | null
          trigger_type?: string | null
          ui_category?: string | null
          updated_at?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_timeline: {
        Row: {
          created_at: string
          event_data: Json | null
          event_type: string
          id: string
          job_id: string
          organization_id: string
          task_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_data?: Json | null
          event_type: string
          id?: string
          job_id: string
          organization_id: string
          task_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_data?: Json | null
          event_type?: string
          id?: string
          job_id?: string
          organization_id?: string
          task_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_timeline_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_timeline_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_timeline_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "job_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      job_workpaper_instances: {
        Row: {
          client_id: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          id: string
          instance_data_json: Json
          instance_schema_json: Json
          job_id: string
          lock_reason: string | null
          locked_at: string | null
          locked_by: string | null
          name: string
          organization_id: string
          prepared_at: string | null
          prepared_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          template_id: string | null
          template_version: number | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          instance_data_json?: Json
          instance_schema_json?: Json
          job_id: string
          lock_reason?: string | null
          locked_at?: string | null
          locked_by?: string | null
          name: string
          organization_id: string
          prepared_at?: string | null
          prepared_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          template_id?: string | null
          template_version?: number | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          instance_data_json?: Json
          instance_schema_json?: Json
          job_id?: string
          lock_reason?: string | null
          locked_at?: string | null
          locked_by?: string | null
          name?: string
          organization_id?: string
          prepared_at?: string | null
          prepared_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          template_id?: string | null
          template_version?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_workpaper_instances_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_workpaper_instances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_workpaper_instances_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_workpaper_instances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_workpaper_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workpaper_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          assigned_to: string | null
          auto_generated_at: string | null
          automation_source: string | null
          can_undo_until: string | null
          client_id: string | null
          company_id: string | null
          completed_at: string | null
          created_at: string
          filing_deadline: string | null
          generation_reason: string | null
          id: string
          info_received_at: string | null
          info_requested_at: string | null
          internal_target_date: string | null
          is_auto_generated: boolean | null
          is_recurring: boolean | null
          job_name: string
          last_activity_at: string | null
          name: string | null
          organization_id: string
          period_end: string | null
          period_label: string | null
          period_start: string | null
          priority: string
          progress: number | null
          recurrence_rule: Json | null
          service_type: string
          source_job_id: string | null
          source_template_id: string | null
          status: string
          tags: Json | null
          template_id: string | null
          template_version: number | null
          updated_at: string
          workpaper_instance_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          auto_generated_at?: string | null
          automation_source?: string | null
          can_undo_until?: string | null
          client_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          filing_deadline?: string | null
          generation_reason?: string | null
          id?: string
          info_received_at?: string | null
          info_requested_at?: string | null
          internal_target_date?: string | null
          is_auto_generated?: boolean | null
          is_recurring?: boolean | null
          job_name: string
          last_activity_at?: string | null
          name?: string | null
          organization_id: string
          period_end?: string | null
          period_label?: string | null
          period_start?: string | null
          priority?: string
          progress?: number | null
          recurrence_rule?: Json | null
          service_type: string
          source_job_id?: string | null
          source_template_id?: string | null
          status?: string
          tags?: Json | null
          template_id?: string | null
          template_version?: number | null
          updated_at?: string
          workpaper_instance_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          auto_generated_at?: string | null
          automation_source?: string | null
          can_undo_until?: string | null
          client_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          filing_deadline?: string | null
          generation_reason?: string | null
          id?: string
          info_received_at?: string | null
          info_requested_at?: string | null
          internal_target_date?: string | null
          is_auto_generated?: boolean | null
          is_recurring?: boolean | null
          job_name?: string
          last_activity_at?: string | null
          name?: string | null
          organization_id?: string
          period_end?: string | null
          period_label?: string | null
          period_start?: string | null
          priority?: string
          progress?: number | null
          recurrence_rule?: Json | null
          service_type?: string
          source_job_id?: string | null
          source_template_id?: string | null
          status?: string
          tags?: Json | null
          template_id?: string | null
          template_version?: number | null
          updated_at?: string
          workpaper_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_jobs_client"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_jobs_company"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_source_job_id_fkey"
            columns: ["source_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_workpaper_instance_id_fkey"
            columns: ["workpaper_instance_id"]
            isOneToOne: false
            referencedRelation: "workpaper_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          created_at: string | null
          credit: number | null
          debit: number | null
          description: string | null
          id: string
          journal_id: string
          line_number: number
          vat_code_id: string | null
        }
        Insert: {
          account_id: string
          created_at?: string | null
          credit?: number | null
          debit?: number | null
          description?: string | null
          id?: string
          journal_id: string
          line_number: number
          vat_code_id?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string | null
          credit?: number | null
          debit?: number | null
          description?: string | null
          id?: string
          journal_id?: string
          line_number?: number
          vat_code_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "bookkeeping_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_vat_code_id_fkey"
            columns: ["vat_code_id"]
            isOneToOne: false
            referencedRelation: "vat_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      journals: {
        Row: {
          client_id: string | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          description: string
          fx_rate_to_base: number | null
          id: string
          is_posted: boolean | null
          is_reversed: boolean | null
          journal_date: string
          journal_type: string
          organization_id: string
          posted_at: string | null
          reference: string | null
          reversal_date: string | null
          reverse_date: string | null
          reverses_journal_id: string | null
          total_credit: number | null
          total_debit: number | null
          transaction_currency: string | null
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description: string
          fx_rate_to_base?: number | null
          id?: string
          is_posted?: boolean | null
          is_reversed?: boolean | null
          journal_date: string
          journal_type?: string
          organization_id: string
          posted_at?: string | null
          reference?: string | null
          reversal_date?: string | null
          reverse_date?: string | null
          reverses_journal_id?: string | null
          total_credit?: number | null
          total_debit?: number | null
          transaction_currency?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string
          fx_rate_to_base?: number | null
          id?: string
          is_posted?: boolean | null
          is_reversed?: boolean | null
          journal_date?: string
          journal_type?: string
          organization_id?: string
          posted_at?: string | null
          reference?: string | null
          reversal_date?: string | null
          reverse_date?: string | null
          reverses_journal_id?: string | null
          total_credit?: number | null
          total_debit?: number | null
          transaction_currency?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journals_reverses_journal_id_fkey"
            columns: ["reverses_journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_pack_subjects: {
        Row: {
          chaser_count: number
          created_at: string
          documents: Json
          due_at: string | null
          id: string
          kyc_pack_id: string
          last_chased_at: string | null
          metadata: Json
          organization_id: string
          subject_name: string
          subject_ref_id: string | null
          subject_ref_type: string | null
          subject_status: string
          subject_type: string
          updated_at: string
          waiver_reason: string | null
        }
        Insert: {
          chaser_count?: number
          created_at?: string
          documents?: Json
          due_at?: string | null
          id?: string
          kyc_pack_id: string
          last_chased_at?: string | null
          metadata?: Json
          organization_id: string
          subject_name: string
          subject_ref_id?: string | null
          subject_ref_type?: string | null
          subject_status?: string
          subject_type: string
          updated_at?: string
          waiver_reason?: string | null
        }
        Update: {
          chaser_count?: number
          created_at?: string
          documents?: Json
          due_at?: string | null
          id?: string
          kyc_pack_id?: string
          last_chased_at?: string | null
          metadata?: Json
          organization_id?: string
          subject_name?: string
          subject_ref_id?: string | null
          subject_ref_type?: string | null
          subject_status?: string
          subject_type?: string
          updated_at?: string
          waiver_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kyc_pack_subjects_kyc_pack_id_fkey"
            columns: ["kyc_pack_id"]
            isOneToOne: false
            referencedRelation: "kyc_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_pack_subjects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_packs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          client_id: string
          created_at: string
          created_by: string | null
          due_at: string | null
          expires_at: string | null
          id: string
          metadata: Json
          notes: string | null
          organization_id: string
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          organization_id: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          organization_id?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kyc_packs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kyc_packs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          body: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          direction: string | null
          due_date: string | null
          id: string
          lead_id: string
          organization_id: string
          subject: string | null
          type: string
        }
        Insert: {
          body?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string | null
          due_date?: string | null
          id?: string
          lead_id: string
          organization_id: string
          subject?: string | null
          type: string
        }
        Update: {
          body?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string
          organization_id?: string
          subject?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activity_summary: {
        Row: {
          dormant_threshold_days: number
          is_dormant: boolean
          last_activity_at: string | null
          last_stage_change_at: string | null
          lead_id: string
          organization_id: string
          refreshed_at: string
          stage: string | null
        }
        Insert: {
          dormant_threshold_days?: number
          is_dormant?: boolean
          last_activity_at?: string | null
          last_stage_change_at?: string | null
          lead_id: string
          organization_id: string
          refreshed_at?: string
          stage?: string | null
        }
        Update: {
          dormant_threshold_days?: number
          is_dormant?: boolean
          last_activity_at?: string | null
          last_stage_change_at?: string | null
          lead_id?: string
          organization_id?: string
          refreshed_at?: string
          stage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_activity_summary_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activity_summary_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          ch_company_profile: Json | null
          chasing_started_at: string | null
          converted_at: string | null
          created_at: string
          email: string
          estimated_monthly_value: number | null
          first_name: string
          id: string
          last_name: string
          lead_type: string
          lost_at: string | null
          lost_reason: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          pipeline_stage: string
          proposal_sent_at: string | null
          qualified_at: string | null
          source: string | null
          tags: Json | null
          updated_at: string
          won_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          ch_company_profile?: Json | null
          chasing_started_at?: string | null
          converted_at?: string | null
          created_at?: string
          email: string
          estimated_monthly_value?: number | null
          first_name: string
          id?: string
          last_name: string
          lead_type?: string
          lost_at?: string | null
          lost_reason?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          pipeline_stage?: string
          proposal_sent_at?: string | null
          qualified_at?: string | null
          source?: string | null
          tags?: Json | null
          updated_at?: string
          won_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          ch_company_profile?: Json | null
          chasing_started_at?: string | null
          converted_at?: string | null
          created_at?: string
          email?: string
          estimated_monthly_value?: number | null
          first_name?: string
          id?: string
          last_name?: string
          lead_type?: string
          lost_at?: string | null
          lost_reason?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          pipeline_stage?: string
          proposal_sent_at?: string | null
          qualified_at?: string | null
          source?: string | null
          tags?: Json | null
          updated_at?: string
          won_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          account_id: string
          base_currency: string | null
          client_id: string | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          credit: number | null
          debit: number | null
          description: string | null
          document_id: string | null
          entry_date: string | null
          fx_rate_to_base: number | null
          gross_amount: number | null
          id: string
          is_locked: boolean | null
          journal_id: string | null
          jurisdiction: string | null
          net_amount: number | null
          organization_id: string
          paid_amount: number | null
          paid_at: string | null
          payment_status: string | null
          reference: string | null
          reverse_charge: boolean | null
          source_id: string | null
          source_type: string
          supply_category: string | null
          transaction_credit: number | null
          transaction_currency: string | null
          transaction_date: string
          transaction_debit: number | null
          updated_at: string | null
          updated_by: string | null
          vat_amount: number | null
          vat_code_id: string | null
          vat_period_id: string | null
          vat_period_lock: boolean | null
        }
        Insert: {
          account_id: string
          base_currency?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          credit?: number | null
          debit?: number | null
          description?: string | null
          document_id?: string | null
          entry_date?: string | null
          fx_rate_to_base?: number | null
          gross_amount?: number | null
          id?: string
          is_locked?: boolean | null
          journal_id?: string | null
          jurisdiction?: string | null
          net_amount?: number | null
          organization_id: string
          paid_amount?: number | null
          paid_at?: string | null
          payment_status?: string | null
          reference?: string | null
          reverse_charge?: boolean | null
          source_id?: string | null
          source_type: string
          supply_category?: string | null
          transaction_credit?: number | null
          transaction_currency?: string | null
          transaction_date: string
          transaction_debit?: number | null
          updated_at?: string | null
          updated_by?: string | null
          vat_amount?: number | null
          vat_code_id?: string | null
          vat_period_id?: string | null
          vat_period_lock?: boolean | null
        }
        Update: {
          account_id?: string
          base_currency?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          credit?: number | null
          debit?: number | null
          description?: string | null
          document_id?: string | null
          entry_date?: string | null
          fx_rate_to_base?: number | null
          gross_amount?: number | null
          id?: string
          is_locked?: boolean | null
          journal_id?: string | null
          jurisdiction?: string | null
          net_amount?: number | null
          organization_id?: string
          paid_amount?: number | null
          paid_at?: string | null
          payment_status?: string | null
          reference?: string | null
          reverse_charge?: boolean | null
          source_id?: string | null
          source_type?: string
          supply_category?: string | null
          transaction_credit?: number | null
          transaction_currency?: string | null
          transaction_date?: string
          transaction_debit?: number | null
          updated_at?: string | null
          updated_by?: string | null
          vat_amount?: number | null
          vat_code_id?: string | null
          vat_period_id?: string | null
          vat_period_lock?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_ledger_entries_vat_period"
            columns: ["vat_period_id"]
            isOneToOne: false
            referencedRelation: "vat_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "bookkeeping_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "job_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_vat_code_id_fkey"
            columns: ["vat_code_id"]
            isOneToOne: false
            referencedRelation: "vat_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      matching_candidates: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          bank_transaction_id: string
          candidate_id: string
          candidate_type: string
          confidence_score: number | null
          created_at: string | null
          id: string
          is_accepted: boolean | null
          match_reasons: Json | null
          organization_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          bank_transaction_id: string
          candidate_id: string
          candidate_type: string
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          is_accepted?: boolean | null
          match_reasons?: Json | null
          organization_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          bank_transaction_id?: string
          candidate_id?: string
          candidate_type?: string
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          is_accepted?: boolean | null
          match_reasons?: Json | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matching_candidates_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matching_candidates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      message_entity_links: {
        Row: {
          client_message_id: string | null
          email_message_id: string | null
          entity_id: string
          entity_type: string
          id: string
          organization_id: string
          tagged_at: string | null
          tagged_by: string | null
        }
        Insert: {
          client_message_id?: string | null
          email_message_id?: string | null
          entity_id: string
          entity_type: string
          id?: string
          organization_id: string
          tagged_at?: string | null
          tagged_by?: string | null
        }
        Update: {
          client_message_id?: string | null
          email_message_id?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          organization_id?: string
          tagged_at?: string | null
          tagged_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_entity_links_client_message_id_fkey"
            columns: ["client_message_id"]
            isOneToOne: false
            referencedRelation: "client_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_entity_links_email_message_id_fkey"
            columns: ["email_message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_entity_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          body: string
          category: string | null
          channel: string
          created_at: string
          id: string
          is_sales: boolean
          is_system: boolean
          key: string | null
          name: string
          organization_id: string | null
          recipient_rule: string | null
          required_merge_fields: string[] | null
          requires_unsubscribe_link: boolean
          source_template_id: string | null
          subject: string | null
          updated_at: string
          variables_schema: Json
        }
        Insert: {
          body: string
          category?: string | null
          channel: string
          created_at?: string
          id?: string
          is_sales?: boolean
          is_system?: boolean
          key?: string | null
          name: string
          organization_id?: string | null
          recipient_rule?: string | null
          required_merge_fields?: string[] | null
          requires_unsubscribe_link?: boolean
          source_template_id?: string | null
          subject?: string | null
          updated_at?: string
          variables_schema?: Json
        }
        Update: {
          body?: string
          category?: string | null
          channel?: string
          created_at?: string
          id?: string
          is_sales?: boolean
          is_system?: boolean
          key?: string | null
          name?: string
          organization_id?: string | null
          recipient_rule?: string | null
          required_merge_fields?: string[] | null
          requires_unsubscribe_link?: boolean
          source_template_id?: string | null
          subject?: string | null
          updated_at?: string
          variables_schema?: Json
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_templates_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          dismissed: boolean | null
          dismissed_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          is_read: boolean | null
          message: string | null
          organization_id: string
          payload: Json | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          dismissed?: boolean | null
          dismissed_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          organization_id: string
          payload?: Json | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          dismissed?: boolean | null
          dismissed_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          organization_id?: string
          payload?: Json | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_applications: {
        Row: {
          additional_documents_uploaded: boolean | null
          address_line_1: string | null
          address_line_2: string | null
          aml_documents_migrated: boolean | null
          aml_expiry_date: string | null
          aml_notes: string | null
          aml_status: string | null
          aml_submitted_at: string | null
          aml_verified_at: string | null
          application_type: string
          approved_at: string | null
          approved_by: string | null
          city: string | null
          clearance_notes: string | null
          clearance_received: boolean | null
          clearance_received_at: string | null
          client_id: string | null
          company_id: string | null
          company_name: string | null
          company_number: string | null
          contracts_sent_at: string | null
          contracts_signed_at: string | null
          country: string | null
          created_at: string
          date_of_birth: string | null
          documents_requested_at: string | null
          email: string | null
          first_name: string | null
          id: string
          id_document_uploaded: boolean | null
          incorporation_date: string | null
          last_name: string | null
          lead_id: string | null
          national_insurance_number: string | null
          onboarding_questionnaire_instance_id: string | null
          organization_id: string
          phone: string | null
          postcode: string | null
          previous_accountant_email: string | null
          previous_accountant_firm_name: string | null
          previous_accountant_required: boolean | null
          proof_of_address_uploaded: boolean | null
          questionnaire_submitted_at: string | null
          quote_id: string | null
          rejection_reason: string | null
          signature_data: Json | null
          status: string
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          additional_documents_uploaded?: boolean | null
          address_line_1?: string | null
          address_line_2?: string | null
          aml_documents_migrated?: boolean | null
          aml_expiry_date?: string | null
          aml_notes?: string | null
          aml_status?: string | null
          aml_submitted_at?: string | null
          aml_verified_at?: string | null
          application_type: string
          approved_at?: string | null
          approved_by?: string | null
          city?: string | null
          clearance_notes?: string | null
          clearance_received?: boolean | null
          clearance_received_at?: string | null
          client_id?: string | null
          company_id?: string | null
          company_name?: string | null
          company_number?: string | null
          contracts_sent_at?: string | null
          contracts_signed_at?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          documents_requested_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          id_document_uploaded?: boolean | null
          incorporation_date?: string | null
          last_name?: string | null
          lead_id?: string | null
          national_insurance_number?: string | null
          onboarding_questionnaire_instance_id?: string | null
          organization_id: string
          phone?: string | null
          postcode?: string | null
          previous_accountant_email?: string | null
          previous_accountant_firm_name?: string | null
          previous_accountant_required?: boolean | null
          proof_of_address_uploaded?: boolean | null
          questionnaire_submitted_at?: string | null
          quote_id?: string | null
          rejection_reason?: string | null
          signature_data?: Json | null
          status?: string
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          additional_documents_uploaded?: boolean | null
          address_line_1?: string | null
          address_line_2?: string | null
          aml_documents_migrated?: boolean | null
          aml_expiry_date?: string | null
          aml_notes?: string | null
          aml_status?: string | null
          aml_submitted_at?: string | null
          aml_verified_at?: string | null
          application_type?: string
          approved_at?: string | null
          approved_by?: string | null
          city?: string | null
          clearance_notes?: string | null
          clearance_received?: boolean | null
          clearance_received_at?: string | null
          client_id?: string | null
          company_id?: string | null
          company_name?: string | null
          company_number?: string | null
          contracts_sent_at?: string | null
          contracts_signed_at?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          documents_requested_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          id_document_uploaded?: boolean | null
          incorporation_date?: string | null
          last_name?: string | null
          lead_id?: string | null
          national_insurance_number?: string | null
          onboarding_questionnaire_instance_id?: string | null
          organization_id?: string
          phone?: string | null
          postcode?: string | null
          previous_accountant_email?: string | null
          previous_accountant_firm_name?: string | null
          previous_accountant_required?: boolean | null
          proof_of_address_uploaded?: boolean | null
          questionnaire_submitted_at?: string | null
          quote_id?: string | null
          rejection_reason?: string | null
          signature_data?: Json | null
          status?: string
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_applications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_applications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_applications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_applications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_applications_questionnaire_instance_fkey"
            columns: ["onboarding_questionnaire_instance_id"]
            isOneToOne: false
            referencedRelation: "questionnaire_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_applications_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_documents: {
        Row: {
          application_id: string
          created_at: string
          document_type: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          organization_id: string
          uploaded_by: string | null
        }
        Insert: {
          application_id: string
          created_at?: string
          document_type: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          organization_id: string
          uploaded_by?: string | null
        }
        Update: {
          application_id?: string
          created_at?: string
          document_type?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          organization_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "onboarding_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_settings: {
        Row: {
          automation_max_actions_org_day: number | null
          automation_max_actions_org_hour: number | null
          automation_max_actions_per_rule_day: number | null
          automation_max_actions_per_rule_hour: number | null
          automation_rule_management_mode: string | null
          bill_number_next: number | null
          bill_number_padding: number | null
          bill_number_prefix: string | null
          business_days: string[] | null
          business_hours_end: string | null
          business_hours_start: string | null
          created_at: string | null
          deadline_buffer_days_ct: number | null
          deadline_buffer_days_sa: number | null
          deadline_buffer_days_vat: number | null
          email_default_mode: string | null
          invoice_number_next: number | null
          invoice_number_padding: number | null
          invoice_number_prefix: string | null
          organization_id: string
          shared_mailbox_enabled: boolean | null
          sla_email_response_hours: number | null
          sla_internal_message_hours: number | null
          sla_portal_message_hours: number | null
          sla_task_default_hours: number | null
          sla_task_urgent_hours: number | null
          updated_at: string | null
        }
        Insert: {
          automation_max_actions_org_day?: number | null
          automation_max_actions_org_hour?: number | null
          automation_max_actions_per_rule_day?: number | null
          automation_max_actions_per_rule_hour?: number | null
          automation_rule_management_mode?: string | null
          bill_number_next?: number | null
          bill_number_padding?: number | null
          bill_number_prefix?: string | null
          business_days?: string[] | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          created_at?: string | null
          deadline_buffer_days_ct?: number | null
          deadline_buffer_days_sa?: number | null
          deadline_buffer_days_vat?: number | null
          email_default_mode?: string | null
          invoice_number_next?: number | null
          invoice_number_padding?: number | null
          invoice_number_prefix?: string | null
          organization_id: string
          shared_mailbox_enabled?: boolean | null
          sla_email_response_hours?: number | null
          sla_internal_message_hours?: number | null
          sla_portal_message_hours?: number | null
          sla_task_default_hours?: number | null
          sla_task_urgent_hours?: number | null
          updated_at?: string | null
        }
        Update: {
          automation_max_actions_org_day?: number | null
          automation_max_actions_org_hour?: number | null
          automation_max_actions_per_rule_day?: number | null
          automation_max_actions_per_rule_hour?: number | null
          automation_rule_management_mode?: string | null
          bill_number_next?: number | null
          bill_number_padding?: number | null
          bill_number_prefix?: string | null
          business_days?: string[] | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          created_at?: string | null
          deadline_buffer_days_ct?: number | null
          deadline_buffer_days_sa?: number | null
          deadline_buffer_days_vat?: number | null
          email_default_mode?: string | null
          invoice_number_next?: number | null
          invoice_number_padding?: number | null
          invoice_number_prefix?: string | null
          organization_id?: string
          shared_mailbox_enabled?: boolean | null
          sla_email_response_hours?: number | null
          sla_internal_message_hours?: number | null
          sla_portal_message_hours?: number | null
          sla_task_default_hours?: number | null
          sla_task_urgent_hours?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_billing: {
        Row: {
          billing_status: string | null
          created_at: string | null
          organization_id: string
          pending_checkout_session_id: string | null
          stripe_connect_account_id: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string | null
        }
        Insert: {
          billing_status?: string | null
          created_at?: string | null
          organization_id: string
          pending_checkout_session_id?: string | null
          stripe_connect_account_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
        }
        Update: {
          billing_status?: string | null
          created_at?: string | null
          organization_id?: string
          pending_checkout_session_id?: string | null
          stripe_connect_account_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_billing_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_branding: {
        Row: {
          accent_color: string | null
          address_line_1: string | null
          address_line_2: string | null
          city: string | null
          company_registration_number: string | null
          country: string | null
          created_at: string | null
          email_footer_html: string | null
          invoice_footer_notes: string | null
          legal_name: string | null
          logo_dark_url: string | null
          logo_light_url: string | null
          organization_id: string
          phone: string | null
          portal_theme: Json | null
          postcode: string | null
          trading_name: string | null
          updated_at: string | null
          vat_number: string | null
          website: string | null
        }
        Insert: {
          accent_color?: string | null
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          company_registration_number?: string | null
          country?: string | null
          created_at?: string | null
          email_footer_html?: string | null
          invoice_footer_notes?: string | null
          legal_name?: string | null
          logo_dark_url?: string | null
          logo_light_url?: string | null
          organization_id: string
          phone?: string | null
          portal_theme?: Json | null
          postcode?: string | null
          trading_name?: string | null
          updated_at?: string | null
          vat_number?: string | null
          website?: string | null
        }
        Update: {
          accent_color?: string | null
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          company_registration_number?: string | null
          country?: string | null
          created_at?: string | null
          email_footer_html?: string | null
          invoice_footer_notes?: string | null
          legal_name?: string | null
          logo_dark_url?: string | null
          logo_light_url?: string | null
          organization_id?: string
          phone?: string | null
          portal_theme?: Json | null
          postcode?: string | null
          trading_name?: string | null
          updated_at?: string | null
          vat_number?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_branding_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_integrations_companies_house: {
        Row: {
          ch_sync_opt_in: boolean
          ch_sync_opt_in_at: string | null
          ch_sync_opt_in_by: string | null
          connected_at: string | null
          created_at: string | null
          last_test_at: string | null
          last_test_success: boolean | null
          organization_id: string
          presenter_email: string | null
          presenter_id: string | null
          presenter_name: string | null
          updated_at: string | null
        }
        Insert: {
          ch_sync_opt_in?: boolean
          ch_sync_opt_in_at?: string | null
          ch_sync_opt_in_by?: string | null
          connected_at?: string | null
          created_at?: string | null
          last_test_at?: string | null
          last_test_success?: boolean | null
          organization_id: string
          presenter_email?: string | null
          presenter_id?: string | null
          presenter_name?: string | null
          updated_at?: string | null
        }
        Update: {
          ch_sync_opt_in?: boolean
          ch_sync_opt_in_at?: string | null
          ch_sync_opt_in_by?: string | null
          connected_at?: string | null
          created_at?: string | null
          last_test_at?: string | null
          last_test_success?: boolean | null
          organization_id?: string
          presenter_email?: string | null
          presenter_id?: string | null
          presenter_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_integrations_companies_house_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_integrations_hmrc: {
        Row: {
          created_at: string | null
          ct_connected: boolean | null
          mtd_vat_access_token_encrypted: string | null
          mtd_vat_connected: boolean | null
          mtd_vat_connected_at: string | null
          mtd_vat_expires_at: string | null
          mtd_vat_refresh_token_encrypted: string | null
          organization_id: string
          paye_connected: boolean | null
          sa_connected: boolean | null
          test_mode: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          ct_connected?: boolean | null
          mtd_vat_access_token_encrypted?: string | null
          mtd_vat_connected?: boolean | null
          mtd_vat_connected_at?: string | null
          mtd_vat_expires_at?: string | null
          mtd_vat_refresh_token_encrypted?: string | null
          organization_id: string
          paye_connected?: boolean | null
          sa_connected?: boolean | null
          test_mode?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          ct_connected?: boolean | null
          mtd_vat_access_token_encrypted?: string | null
          mtd_vat_connected?: boolean | null
          mtd_vat_connected_at?: string | null
          mtd_vat_expires_at?: string | null
          mtd_vat_refresh_token_encrypted?: string | null
          organization_id?: string
          paye_connected?: boolean | null
          sa_connected?: boolean | null
          test_mode?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_integrations_hmrc_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_settings: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          setting_key: string
          setting_value: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          setting_key: string
          setting_value?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_subscription_cache: {
        Row: {
          checked_at: string
          organization_id: string
          plan_name: string | null
          subscribed: boolean
          subscription_end: string | null
          subscription_id: string | null
          subscription_status: string | null
          updated_at: string
        }
        Insert: {
          checked_at?: string
          organization_id: string
          plan_name?: string | null
          subscribed?: boolean
          subscription_end?: string | null
          subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string
        }
        Update: {
          checked_at?: string
          organization_id?: string
          plan_name?: string | null
          subscribed?: boolean
          subscription_end?: string | null
          subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_subscription_cache_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_users: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_users_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          automations_enabled: boolean
          billing_status: Database["public"]["Enums"]["billing_status_enum"]
          city: string | null
          country: string | null
          created_at: string
          email_domain: string | null
          firm_code: string | null
          id: string
          is_public_listed: boolean | null
          logo_url: string | null
          name: string
          onboarding_completed: boolean | null
          payment_required_before_onboarding: boolean
          pending_checkout_session_id: string | null
          postcode: string | null
          practice_description: string | null
          setup_dismissed: boolean | null
          stripe_connect_account_id: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          timezone: string | null
          updated_at: string
          vat_reconciliation_tolerance: number | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          automations_enabled?: boolean
          billing_status?: Database["public"]["Enums"]["billing_status_enum"]
          city?: string | null
          country?: string | null
          created_at?: string
          email_domain?: string | null
          firm_code?: string | null
          id?: string
          is_public_listed?: boolean | null
          logo_url?: string | null
          name: string
          onboarding_completed?: boolean | null
          payment_required_before_onboarding?: boolean
          pending_checkout_session_id?: string | null
          postcode?: string | null
          practice_description?: string | null
          setup_dismissed?: boolean | null
          stripe_connect_account_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          timezone?: string | null
          updated_at?: string
          vat_reconciliation_tolerance?: number | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          automations_enabled?: boolean
          billing_status?: Database["public"]["Enums"]["billing_status_enum"]
          city?: string | null
          country?: string | null
          created_at?: string
          email_domain?: string | null
          firm_code?: string | null
          id?: string
          is_public_listed?: boolean | null
          logo_url?: string | null
          name?: string
          onboarding_completed?: boolean | null
          payment_required_before_onboarding?: boolean
          pending_checkout_session_id?: string | null
          postcode?: string | null
          practice_description?: string | null
          setup_dismissed?: boolean | null
          stripe_connect_account_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          timezone?: string | null
          updated_at?: string
          vat_reconciliation_tolerance?: number | null
        }
        Relationships: []
      }
      outlook_auth_states: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          organization_id: string
          redirect_url: string | null
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          organization_id: string
          redirect_url?: string | null
          state: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          organization_id?: string
          redirect_url?: string | null
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outlook_auth_states_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      partnership_allocations: {
        Row: {
          allocation_method: string
          computed_profit_share: number
          computed_tax_adjustments: Json | null
          created_at: string
          filing_id: string
          fixed_amount: number | null
          id: string
          organization_id: string
          partner_client_id: string | null
          partner_name: string
          percentage: number | null
          special_allocation_json: Json | null
          updated_at: string
        }
        Insert: {
          allocation_method?: string
          computed_profit_share?: number
          computed_tax_adjustments?: Json | null
          created_at?: string
          filing_id: string
          fixed_amount?: number | null
          id?: string
          organization_id: string
          partner_client_id?: string | null
          partner_name: string
          percentage?: number | null
          special_allocation_json?: Json | null
          updated_at?: string
        }
        Update: {
          allocation_method?: string
          computed_profit_share?: number
          computed_tax_adjustments?: Json | null
          created_at?: string
          filing_id?: string
          fixed_amount?: number | null
          id?: string
          organization_id?: string
          partner_client_id?: string | null
          partner_name?: string
          percentage?: number | null
          special_allocation_json?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partnership_allocations_filing_id_fkey"
            columns: ["filing_id"]
            isOneToOne: false
            referencedRelation: "filings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partnership_allocations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partnership_allocations_partner_client_id_fkey"
            columns: ["partner_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      pay_runs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          employee_count: number | null
          fps_filing_id: string | null
          id: string
          journal_id: string | null
          notes: string | null
          organization_id: string
          pay_frequency: string
          paye_scheme_id: string
          payment_date: string
          period_end: string
          period_start: string
          prepared_at: string | null
          prepared_by: string | null
          status: string
          tax_period: number
          tax_year: string
          total_employee_nic: number | null
          total_employee_pension: number | null
          total_employer_nic: number | null
          total_employer_pension: number | null
          total_gross_pay: number | null
          total_net_pay: number | null
          total_paye: number | null
          total_statutory_pay: number | null
          total_student_loan: number | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          employee_count?: number | null
          fps_filing_id?: string | null
          id?: string
          journal_id?: string | null
          notes?: string | null
          organization_id: string
          pay_frequency: string
          paye_scheme_id: string
          payment_date: string
          period_end: string
          period_start: string
          prepared_at?: string | null
          prepared_by?: string | null
          status?: string
          tax_period: number
          tax_year: string
          total_employee_nic?: number | null
          total_employee_pension?: number | null
          total_employer_nic?: number | null
          total_employer_pension?: number | null
          total_gross_pay?: number | null
          total_net_pay?: number | null
          total_paye?: number | null
          total_statutory_pay?: number | null
          total_student_loan?: number | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          employee_count?: number | null
          fps_filing_id?: string | null
          id?: string
          journal_id?: string | null
          notes?: string | null
          organization_id?: string
          pay_frequency?: string
          paye_scheme_id?: string
          payment_date?: string
          period_end?: string
          period_start?: string
          prepared_at?: string | null
          prepared_by?: string | null
          status?: string
          tax_period?: number
          tax_year?: string
          total_employee_nic?: number | null
          total_employee_pension?: number | null
          total_employer_nic?: number | null
          total_employer_pension?: number | null
          total_gross_pay?: number | null
          total_net_pay?: number | null
          total_paye?: number | null
          total_statutory_pay?: number | null
          total_student_loan?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pay_runs_fps_filing_id_fkey"
            columns: ["fps_filing_id"]
            isOneToOne: false
            referencedRelation: "filings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_runs_journal_id_fkey"
            columns: ["journal_id"]
            isOneToOne: false
            referencedRelation: "journals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pay_runs_paye_scheme_id_fkey"
            columns: ["paye_scheme_id"]
            isOneToOne: false
            referencedRelation: "paye_schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      paye_schemes: {
        Row: {
          accounts_office_reference: string | null
          client_id: string | null
          company_id: string | null
          created_at: string
          default_pay_day: number | null
          default_pay_day_of_week: string | null
          default_pay_frequency: string
          employer_paye_reference: string
          id: string
          is_active: boolean | null
          name: string
          organization_id: string
          rti_password_hash: string | null
          rti_sender_id: string | null
          rti_test_mode: boolean | null
          tax_year_start: string
          updated_at: string
        }
        Insert: {
          accounts_office_reference?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          default_pay_day?: number | null
          default_pay_day_of_week?: string | null
          default_pay_frequency?: string
          employer_paye_reference: string
          id?: string
          is_active?: boolean | null
          name: string
          organization_id: string
          rti_password_hash?: string | null
          rti_sender_id?: string | null
          rti_test_mode?: boolean | null
          tax_year_start?: string
          updated_at?: string
        }
        Update: {
          accounts_office_reference?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          default_pay_day?: number | null
          default_pay_day_of_week?: string | null
          default_pay_frequency?: string
          employer_paye_reference?: string
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string
          rti_password_hash?: string | null
          rti_sender_id?: string | null
          rti_test_mode?: boolean | null
          tax_year_start?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paye_schemes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paye_schemes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paye_schemes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_journal_mapping: {
        Row: {
          created_at: string
          credit_account_id: string | null
          debit_account_id: string | null
          description: string | null
          id: string
          is_active: boolean
          organization_id: string
          payroll_category: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credit_account_id?: string | null
          debit_account_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          organization_id: string
          payroll_category: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credit_account_id?: string | null
          debit_account_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string
          payroll_category?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_journal_mapping_credit_account_id_fkey"
            columns: ["credit_account_id"]
            isOneToOne: false
            referencedRelation: "bookkeeping_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_journal_mapping_debit_account_id_fkey"
            columns: ["debit_account_id"]
            isOneToOne: false
            referencedRelation: "bookkeeping_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_journal_mapping_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payslips: {
        Row: {
          attachment_of_earnings: number | null
          basic_pay: number | null
          bonus_pay: number | null
          calculation_breakdown: Json | null
          commission_pay: number | null
          created_at: string
          director_nic_method: string | null
          employee_id: string
          employee_nic: number | null
          employee_pension: number | null
          employer_nic: number | null
          employer_pension: number | null
          gross_pay: number
          holiday_pay: number | null
          id: string
          is_director: boolean | null
          net_pay: number
          nic_category: string
          nicable_pay: number
          organization_id: string
          other_deductions: number | null
          other_pay: number | null
          overtime_pay: number | null
          pay_run_id: string
          paye_tax: number | null
          payment_date: string
          pdf_storage_path: string | null
          pensionable_pay: number
          period_end: string
          period_start: string
          postgrad_loan: number | null
          salary_sacrifice_other: number | null
          salary_sacrifice_pension: number | null
          sick_pay: number | null
          status: string
          statutory_adoption_pay: number | null
          statutory_maternity_pay: number | null
          statutory_parental_bereavement_pay: number | null
          statutory_paternity_pay: number | null
          statutory_shared_parental_pay: number | null
          student_loan: number | null
          tax_basis: string
          tax_code: string
          tax_period: number
          tax_year: string
          taxable_pay: number
          total_deductions: number
          updated_at: string
          ytd_employee_nic: number | null
          ytd_employee_pension: number | null
          ytd_employer_nic: number | null
          ytd_employer_pension: number | null
          ytd_gross_pay: number | null
          ytd_paye_tax: number | null
          ytd_student_loan: number | null
          ytd_taxable_pay: number | null
        }
        Insert: {
          attachment_of_earnings?: number | null
          basic_pay?: number | null
          bonus_pay?: number | null
          calculation_breakdown?: Json | null
          commission_pay?: number | null
          created_at?: string
          director_nic_method?: string | null
          employee_id: string
          employee_nic?: number | null
          employee_pension?: number | null
          employer_nic?: number | null
          employer_pension?: number | null
          gross_pay: number
          holiday_pay?: number | null
          id?: string
          is_director?: boolean | null
          net_pay: number
          nic_category: string
          nicable_pay: number
          organization_id: string
          other_deductions?: number | null
          other_pay?: number | null
          overtime_pay?: number | null
          pay_run_id: string
          paye_tax?: number | null
          payment_date: string
          pdf_storage_path?: string | null
          pensionable_pay: number
          period_end: string
          period_start: string
          postgrad_loan?: number | null
          salary_sacrifice_other?: number | null
          salary_sacrifice_pension?: number | null
          sick_pay?: number | null
          status?: string
          statutory_adoption_pay?: number | null
          statutory_maternity_pay?: number | null
          statutory_parental_bereavement_pay?: number | null
          statutory_paternity_pay?: number | null
          statutory_shared_parental_pay?: number | null
          student_loan?: number | null
          tax_basis: string
          tax_code: string
          tax_period: number
          tax_year: string
          taxable_pay: number
          total_deductions: number
          updated_at?: string
          ytd_employee_nic?: number | null
          ytd_employee_pension?: number | null
          ytd_employer_nic?: number | null
          ytd_employer_pension?: number | null
          ytd_gross_pay?: number | null
          ytd_paye_tax?: number | null
          ytd_student_loan?: number | null
          ytd_taxable_pay?: number | null
        }
        Update: {
          attachment_of_earnings?: number | null
          basic_pay?: number | null
          bonus_pay?: number | null
          calculation_breakdown?: Json | null
          commission_pay?: number | null
          created_at?: string
          director_nic_method?: string | null
          employee_id?: string
          employee_nic?: number | null
          employee_pension?: number | null
          employer_nic?: number | null
          employer_pension?: number | null
          gross_pay?: number
          holiday_pay?: number | null
          id?: string
          is_director?: boolean | null
          net_pay?: number
          nic_category?: string
          nicable_pay?: number
          organization_id?: string
          other_deductions?: number | null
          other_pay?: number | null
          overtime_pay?: number | null
          pay_run_id?: string
          paye_tax?: number | null
          payment_date?: string
          pdf_storage_path?: string | null
          pensionable_pay?: number
          period_end?: string
          period_start?: string
          postgrad_loan?: number | null
          salary_sacrifice_other?: number | null
          salary_sacrifice_pension?: number | null
          sick_pay?: number | null
          status?: string
          statutory_adoption_pay?: number | null
          statutory_maternity_pay?: number | null
          statutory_parental_bereavement_pay?: number | null
          statutory_paternity_pay?: number | null
          statutory_shared_parental_pay?: number | null
          student_loan?: number | null
          tax_basis?: string
          tax_code?: string
          tax_period?: number
          tax_year?: string
          taxable_pay?: number
          total_deductions?: number
          updated_at?: string
          ytd_employee_nic?: number | null
          ytd_employee_pension?: number | null
          ytd_employer_nic?: number | null
          ytd_employer_pension?: number | null
          ytd_gross_pay?: number | null
          ytd_paye_tax?: number | null
          ytd_student_loan?: number | null
          ytd_taxable_pay?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payslips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_pay_run_id_fkey"
            columns: ["pay_run_id"]
            isOneToOne: false
            referencedRelation: "pay_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_practice_signups: {
        Row: {
          accountant_email: string
          client_id: string | null
          company_id: string | null
          completed_at: string | null
          created_at: string
          id: string
          proposed_practice_name: string | null
          status: string
        }
        Insert: {
          accountant_email: string
          client_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          proposed_practice_name?: string | null
          status?: string
        }
        Update: {
          accountant_email?: string
          client_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          proposed_practice_name?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_practice_signups_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_practice_signups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      pension_schemes: {
        Row: {
          auto_enrolment_enabled: boolean | null
          auto_enrolment_trigger: number | null
          created_at: string
          employee_contribution_rate: number
          employer_contribution_rate: number
          employer_id: string | null
          id: string
          is_active: boolean | null
          lower_qualifying_earnings: number | null
          name: string
          organization_id: string
          paye_scheme_id: string
          postponement_period_months: number | null
          provider: string
          staging_date: string | null
          updated_at: string
          upper_qualifying_earnings: number | null
        }
        Insert: {
          auto_enrolment_enabled?: boolean | null
          auto_enrolment_trigger?: number | null
          created_at?: string
          employee_contribution_rate?: number
          employer_contribution_rate?: number
          employer_id?: string | null
          id?: string
          is_active?: boolean | null
          lower_qualifying_earnings?: number | null
          name: string
          organization_id: string
          paye_scheme_id: string
          postponement_period_months?: number | null
          provider: string
          staging_date?: string | null
          updated_at?: string
          upper_qualifying_earnings?: number | null
        }
        Update: {
          auto_enrolment_enabled?: boolean | null
          auto_enrolment_trigger?: number | null
          created_at?: string
          employee_contribution_rate?: number
          employer_contribution_rate?: number
          employer_id?: string | null
          id?: string
          is_active?: boolean | null
          lower_qualifying_earnings?: number | null
          name?: string
          organization_id?: string
          paye_scheme_id?: string
          postponement_period_months?: number | null
          provider?: string
          staging_date?: string | null
          updated_at?: string
          upper_qualifying_earnings?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pension_schemes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pension_schemes_paye_scheme_id_fkey"
            columns: ["paye_scheme_id"]
            isOneToOne: false
            referencedRelation: "paye_schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      period_locks: {
        Row: {
          client_id: string | null
          company_id: string | null
          id: string
          lock_date: string
          locked_at: string
          locked_by: string | null
          organization_id: string
          reason: string | null
        }
        Insert: {
          client_id?: string | null
          company_id?: string | null
          id?: string
          lock_date: string
          locked_at?: string
          locked_by?: string | null
          organization_id: string
          reason?: string | null
        }
        Update: {
          client_id?: string | null
          company_id?: string | null
          id?: string
          lock_date?: string
          locked_at?: string
          locked_by?: string | null
          organization_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "period_locks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_locks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "period_locks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_access: {
        Row: {
          accepted_at: string | null
          client_id: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          id: string
          invite_expires_at: string | null
          invite_token: string | null
          invited_at: string | null
          is_active: boolean | null
          organization_id: string
          revoked_at: string | null
          revoked_reason: string | null
          role: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invite_expires_at?: string | null
          invite_token?: string | null
          invited_at?: string | null
          is_active?: boolean | null
          organization_id: string
          revoked_at?: string | null
          revoked_reason?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invite_expires_at?: string | null
          invite_token?: string | null
          invited_at?: string | null
          is_active?: boolean | null
          organization_id?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_access_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_access_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_access_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_visibility_settings: {
        Row: {
          client_id: string | null
          company_id: string | null
          created_at: string
          id: string
          organization_id: string
          show_bank_accounts: boolean
          show_cash: boolean
          show_ct_estimate: boolean
          show_detailed_ledger: boolean
          show_invoices: boolean
          show_profit: boolean
          show_receivables_payables: boolean
          show_revenue: boolean
          show_transactions: boolean
          show_trial_balance: boolean
          show_vat_position: boolean
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          organization_id: string
          show_bank_accounts?: boolean
          show_cash?: boolean
          show_ct_estimate?: boolean
          show_detailed_ledger?: boolean
          show_invoices?: boolean
          show_profit?: boolean
          show_receivables_payables?: boolean
          show_revenue?: boolean
          show_transactions?: boolean
          show_trial_balance?: boolean
          show_vat_position?: boolean
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          show_bank_accounts?: boolean
          show_cash?: boolean
          show_ct_estimate?: boolean
          show_detailed_ledger?: boolean
          show_invoices?: boolean
          show_profit?: boolean
          show_receivables_payables?: boolean
          show_revenue?: boolean
          show_transactions?: boolean
          show_trial_balance?: boolean
          show_vat_position?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_visibility_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_visibility_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_visibility_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      questionnaire_access_log: {
        Row: {
          action: string
          created_at: string | null
          id: string
          ip: string | null
          questionnaire_instance_id: string
          token_hash: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          ip?: string | null
          questionnaire_instance_id: string
          token_hash?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          ip?: string | null
          questionnaire_instance_id?: string
          token_hash?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      questionnaire_files: {
        Row: {
          document_folder: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          is_archived_to_documents: boolean | null
          mime_type: string | null
          organization_id: string
          question_id: string
          questionnaire_instance_id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          document_folder?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          is_archived_to_documents?: boolean | null
          mime_type?: string | null
          organization_id: string
          question_id: string
          questionnaire_instance_id: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          document_folder?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          is_archived_to_documents?: boolean | null
          mime_type?: string | null
          organization_id?: string
          question_id?: string
          questionnaire_instance_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questionnaire_files_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questionnaire_files_questionnaire_instance_id_fkey"
            columns: ["questionnaire_instance_id"]
            isOneToOne: false
            referencedRelation: "questionnaire_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      questionnaire_instances: {
        Row: {
          access_token: string
          client_id: string | null
          company_id: string | null
          created_at: string
          created_by_rollover: boolean | null
          id: string
          job_id: string | null
          name: string
          organization_id: string
          period_end: string | null
          period_label: string | null
          period_start: string | null
          questions: Json
          reviewed_at: string | null
          reviewed_by: string | null
          sent_at: string
          service: string | null
          started_at: string | null
          status: string
          submitted_at: string | null
          task_id: string | null
          template_id: string
          token_expires_at: string
          updated_at: string
        }
        Insert: {
          access_token: string
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by_rollover?: boolean | null
          id?: string
          job_id?: string | null
          name: string
          organization_id: string
          period_end?: string | null
          period_label?: string | null
          period_start?: string | null
          questions: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          sent_at?: string
          service?: string | null
          started_at?: string | null
          status?: string
          submitted_at?: string | null
          task_id?: string | null
          template_id: string
          token_expires_at?: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by_rollover?: boolean | null
          id?: string
          job_id?: string | null
          name?: string
          organization_id?: string
          period_end?: string | null
          period_label?: string | null
          period_start?: string | null
          questions?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          sent_at?: string
          service?: string | null
          started_at?: string | null
          status?: string
          submitted_at?: string | null
          task_id?: string | null
          template_id?: string
          token_expires_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questionnaire_instances_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questionnaire_instances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questionnaire_instances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questionnaire_instances_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "client_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questionnaire_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      questionnaire_public_links: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          questionnaire_instance_id: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          questionnaire_instance_id: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          questionnaire_instance_id?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "questionnaire_public_links_questionnaire_instance_id_fkey"
            columns: ["questionnaire_instance_id"]
            isOneToOne: false
            referencedRelation: "questionnaire_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      questionnaire_responses: {
        Row: {
          answer_array: Json | null
          answer_boolean: boolean | null
          answer_date: string | null
          answer_number: number | null
          answer_text: string | null
          answered_at: string
          id: string
          question_id: string
          questionnaire_instance_id: string
          updated_at: string
        }
        Insert: {
          answer_array?: Json | null
          answer_boolean?: boolean | null
          answer_date?: string | null
          answer_number?: number | null
          answer_text?: string | null
          answered_at?: string
          id?: string
          question_id: string
          questionnaire_instance_id: string
          updated_at?: string
        }
        Update: {
          answer_array?: Json | null
          answer_boolean?: boolean | null
          answer_date?: string | null
          answer_number?: number | null
          answer_text?: string | null
          answered_at?: string
          id?: string
          question_id?: string
          questionnaire_instance_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questionnaire_responses_questionnaire_instance_id_fkey"
            columns: ["questionnaire_instance_id"]
            isOneToOne: false
            referencedRelation: "questionnaire_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      questionnaire_token_attempts: {
        Row: {
          count: number
          created_at: string | null
          id: string
          token_hash: string
          window_start: string
        }
        Insert: {
          count?: number
          created_at?: string | null
          id?: string
          token_hash: string
          window_start: string
        }
        Update: {
          count?: number
          created_at?: string | null
          id?: string
          token_hash?: string
          window_start?: string
        }
        Relationships: []
      }
      quote_acceptance_tokens: {
        Row: {
          created_at: string
          expires_at: string
          organization_id: string
          quote_id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          organization_id: string
          quote_id: string
          token?: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          organization_id?: string
          quote_id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_acceptance_tokens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_acceptance_tokens_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_lines: {
        Row: {
          billing_frequency: string
          created_at: string
          description_override: string | null
          id: string
          line_order: number
          organization_id: string
          quantity: number
          quote_id: string
          service_id: string
          subtotal: number
          unit_price: number
        }
        Insert: {
          billing_frequency?: string
          created_at?: string
          description_override?: string | null
          id?: string
          line_order?: number
          organization_id: string
          quantity?: number
          quote_id: string
          service_id: string
          subtotal: number
          unit_price: number
        }
        Update: {
          billing_frequency?: string
          created_at?: string
          description_override?: string | null
          id?: string
          line_order?: number
          organization_id?: string
          quantity?: number
          quote_id?: string
          service_id?: string
          subtotal?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_lines_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_lines_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          client_id: string | null
          company_id: string | null
          created_at: string
          currency: string
          id: string
          lead_id: string | null
          notes: string | null
          organization_id: string
          ported_at: string | null
          ported_to_client_id: string | null
          ported_to_company_id: string | null
          quote_number: string
          rejected_at: string | null
          rejection_reason: string | null
          sent_at: string | null
          status: string
          supersedes_quote_id: string | null
          total_amount: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          accepted_at?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          lead_id?: string | null
          notes?: string | null
          organization_id: string
          ported_at?: string | null
          ported_to_client_id?: string | null
          ported_to_company_id?: string | null
          quote_number: string
          rejected_at?: string | null
          rejection_reason?: string | null
          sent_at?: string | null
          status?: string
          supersedes_quote_id?: string | null
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          accepted_at?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          lead_id?: string | null
          notes?: string | null
          organization_id?: string
          ported_at?: string | null
          ported_to_client_id?: string | null
          ported_to_company_id?: string | null
          quote_number?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          sent_at?: string | null
          status?: string
          supersedes_quote_id?: string | null
          total_amount?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_ported_to_company_id_fkey"
            columns: ["ported_to_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_supersedes_quote_id_fkey"
            columns: ["supersedes_quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          bank_transaction_id: string | null
          category: string | null
          client_id: string | null
          company_id: string | null
          currency: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          invoice_id: string | null
          ledger_entry_id: string | null
          mime_type: string | null
          notes: string | null
          ocr_data: Json | null
          ocr_status: string | null
          organization_id: string
          processed_at: string | null
          receipt_date: string | null
          total_amount: number | null
          uploaded_at: string
          uploaded_by: string | null
          vat_amount: number | null
          vendor_name: string | null
        }
        Insert: {
          bank_transaction_id?: string | null
          category?: string | null
          client_id?: string | null
          company_id?: string | null
          currency?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          invoice_id?: string | null
          ledger_entry_id?: string | null
          mime_type?: string | null
          notes?: string | null
          ocr_data?: Json | null
          ocr_status?: string | null
          organization_id: string
          processed_at?: string | null
          receipt_date?: string | null
          total_amount?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
          vat_amount?: number | null
          vendor_name?: string | null
        }
        Update: {
          bank_transaction_id?: string | null
          category?: string | null
          client_id?: string | null
          company_id?: string | null
          currency?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          invoice_id?: string | null
          ledger_entry_id?: string | null
          mime_type?: string | null
          notes?: string | null
          ocr_data?: Json | null
          ocr_status?: string | null
          organization_id?: string
          processed_at?: string | null
          receipt_date?: string | null
          total_amount?: number | null
          uploaded_at?: string
          uploaded_by?: string | null
          vat_amount?: number | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipts_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_lines: {
        Row: {
          amount: number
          bank_transaction_id: string | null
          created_at: string | null
          id: string
          ledger_entry_id: string | null
          match_type: string
          reconciliation_id: string
        }
        Insert: {
          amount: number
          bank_transaction_id?: string | null
          created_at?: string | null
          id?: string
          ledger_entry_id?: string | null
          match_type?: string
          reconciliation_id: string
        }
        Update: {
          amount?: number
          bank_transaction_id?: string | null
          created_at?: string | null
          id?: string
          ledger_entry_id?: string | null
          match_type?: string
          reconciliation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_lines_bank_transaction_id_fkey"
            columns: ["bank_transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_lines_ledger_entry_id_fkey"
            columns: ["ledger_entry_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_lines_reconciliation_id_fkey"
            columns: ["reconciliation_id"]
            isOneToOne: false
            referencedRelation: "reconciliations"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliations: {
        Row: {
          bank_account_id: string
          client_id: string | null
          company_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          id: string
          organization_id: string
          statement_closing_balance: number
          statement_end_date: string
          statement_opening_balance: number
          statement_start_date: string
          status: string
          updated_at: string | null
        }
        Insert: {
          bank_account_id: string
          client_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          id?: string
          organization_id: string
          statement_closing_balance: number
          statement_end_date: string
          statement_opening_balance: number
          statement_start_date: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          bank_account_id?: string
          client_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          id?: string
          organization_id?: string
          statement_closing_balance?: number
          statement_end_date?: string
          statement_opening_balance?: number
          statement_start_date?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliations_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      record_request_items: {
        Row: {
          chaser_count: number
          client_id: string
          client_visible: boolean
          created_at: string
          description: string | null
          due_at: string | null
          id: string
          job_id: string | null
          label: string
          last_chased_at: string | null
          metadata: Json
          organization_id: string
          received_by: string | null
          requested_by: string | null
          sort_order: number
          source: string | null
          status: string
          updated_at: string
          verified_by: string | null
          waived_by: string | null
          waiver_reason: string | null
        }
        Insert: {
          chaser_count?: number
          client_id: string
          client_visible?: boolean
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          job_id?: string | null
          label: string
          last_chased_at?: string | null
          metadata?: Json
          organization_id: string
          received_by?: string | null
          requested_by?: string | null
          sort_order?: number
          source?: string | null
          status?: string
          updated_at?: string
          verified_by?: string | null
          waived_by?: string | null
          waiver_reason?: string | null
        }
        Update: {
          chaser_count?: number
          client_id?: string
          client_visible?: boolean
          created_at?: string
          description?: string | null
          due_at?: string | null
          id?: string
          job_id?: string | null
          label?: string
          last_chased_at?: string | null
          metadata?: Json
          organization_id?: string
          received_by?: string | null
          requested_by?: string | null
          sort_order?: number
          source?: string | null
          status?: string
          updated_at?: string
          verified_by?: string | null
          waived_by?: string | null
          waiver_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "record_request_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_invoice_schedules: {
        Row: {
          amount: number | null
          auto_send: boolean
          billing_day: number | null
          cadence: string
          client_id: string
          create_draft_only: boolean
          created_at: string
          currency: string
          end_date: string | null
          failure_count: number
          id: string
          invoice_template_id: string | null
          last_invoice_id: string | null
          last_run_at: string | null
          metadata: Json
          next_run_at: string | null
          organization_id: string
          payment_terms_days: number
          service_id: string | null
          start_date: string
          status: string
          tax_rate_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          auto_send?: boolean
          billing_day?: number | null
          cadence: string
          client_id: string
          create_draft_only?: boolean
          created_at?: string
          currency?: string
          end_date?: string | null
          failure_count?: number
          id?: string
          invoice_template_id?: string | null
          last_invoice_id?: string | null
          last_run_at?: string | null
          metadata?: Json
          next_run_at?: string | null
          organization_id: string
          payment_terms_days?: number
          service_id?: string | null
          start_date: string
          status?: string
          tax_rate_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          auto_send?: boolean
          billing_day?: number | null
          cadence?: string
          client_id?: string
          create_draft_only?: boolean
          created_at?: string
          currency?: string
          end_date?: string | null
          failure_count?: number
          id?: string
          invoice_template_id?: string | null
          last_invoice_id?: string | null
          last_run_at?: string | null
          metadata?: Json
          next_run_at?: string | null
          organization_id?: string
          payment_terms_days?: number
          service_id?: string | null
          start_date?: string
          status?: string
          tax_rate_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_invoice_schedules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_events: {
        Row: {
          client_id: string | null
          created_at: string
          currency: string
          event_type: string
          gross_amount: number
          id: string
          invoice_id: string | null
          metadata: Json
          net_amount: number
          occurred_at: string
          organization_id: string
          recognition_period_end: string | null
          recognition_period_start: string | null
          reversal_of_event_id: string | null
          service_id: string | null
          source_id: string | null
          source_type: string
          tax_amount: number
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          currency?: string
          event_type: string
          gross_amount?: number
          id?: string
          invoice_id?: string | null
          metadata?: Json
          net_amount?: number
          occurred_at?: string
          organization_id: string
          recognition_period_end?: string | null
          recognition_period_start?: string | null
          reversal_of_event_id?: string | null
          service_id?: string | null
          source_id?: string | null
          source_type: string
          tax_amount?: number
        }
        Update: {
          client_id?: string | null
          created_at?: string
          currency?: string
          event_type?: string
          gross_amount?: number
          id?: string
          invoice_id?: string | null
          metadata?: Json
          net_amount?: number
          occurred_at?: string
          organization_id?: string
          recognition_period_end?: string | null
          recognition_period_start?: string | null
          reversal_of_event_id?: string | null
          service_id?: string | null
          source_id?: string | null
          source_type?: string
          tax_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "revenue_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_events_reversal_of_event_id_fkey"
            columns: ["reversal_of_event_id"]
            isOneToOne: false
            referencedRelation: "revenue_events"
            referencedColumns: ["id"]
          },
        ]
      }
      rti_submissions: {
        Row: {
          created_at: string
          error_messages: Json | null
          filing_id: string
          hmrc_correlation_id: string | null
          hmrc_response: Json | null
          hmrc_submission_id: string | null
          id: string
          organization_id: string
          pay_run_id: string | null
          paye_scheme_id: string
          response_received_at: string | null
          submission_status: string
          submission_type: string
          submitted_at: string | null
          submitted_by: string | null
          tax_period: number | null
          tax_year: string
          updated_at: string
          xml_payload: string | null
        }
        Insert: {
          created_at?: string
          error_messages?: Json | null
          filing_id: string
          hmrc_correlation_id?: string | null
          hmrc_response?: Json | null
          hmrc_submission_id?: string | null
          id?: string
          organization_id: string
          pay_run_id?: string | null
          paye_scheme_id: string
          response_received_at?: string | null
          submission_status?: string
          submission_type: string
          submitted_at?: string | null
          submitted_by?: string | null
          tax_period?: number | null
          tax_year: string
          updated_at?: string
          xml_payload?: string | null
        }
        Update: {
          created_at?: string
          error_messages?: Json | null
          filing_id?: string
          hmrc_correlation_id?: string | null
          hmrc_response?: Json | null
          hmrc_submission_id?: string | null
          id?: string
          organization_id?: string
          pay_run_id?: string | null
          paye_scheme_id?: string
          response_received_at?: string | null
          submission_status?: string
          submission_type?: string
          submitted_at?: string | null
          submitted_by?: string | null
          tax_period?: number | null
          tax_year?: string
          updated_at?: string
          xml_payload?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rti_submissions_filing_id_fkey"
            columns: ["filing_id"]
            isOneToOne: false
            referencedRelation: "filings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rti_submissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rti_submissions_pay_run_id_fkey"
            columns: ["pay_run_id"]
            isOneToOne: false
            referencedRelation: "pay_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rti_submissions_paye_scheme_id_fkey"
            columns: ["paye_scheme_id"]
            isOneToOne: false
            referencedRelation: "paye_schemes"
            referencedColumns: ["id"]
          },
        ]
      }
      sa_rate_tables: {
        Row: {
          additional_rate: number
          basic_rate: number
          basic_rate_limit: number
          cgt_annual_exempt_amount: number
          cgt_basic_rate: number
          cgt_higher_rate: number
          cgt_residential_basic: number
          cgt_residential_higher: number
          class2_threshold: number
          class2_weekly_rate: number
          class4_additional_rate: number
          class4_lower_limit: number
          class4_main_rate: number
          class4_upper_limit: number
          created_at: string
          dividend_additional_rate: number
          dividend_allowance: number
          dividend_basic_rate: number
          dividend_higher_rate: number
          effective_from: string
          effective_to: string | null
          hicbc_threshold: number
          hicbc_upper_threshold: number
          higher_rate: number
          higher_rate_limit: number
          id: string
          marriage_allowance_amount: number
          pension_annual_allowance: number
          pension_mpaa: number
          pension_taper_floor: number
          pension_taper_threshold: number
          personal_allowance: number
          savings_nil_rate_basic: number
          savings_nil_rate_higher: number
          student_loan_pg_rate: number
          student_loan_pg_threshold: number
          student_loan_plan1_rate: number
          student_loan_plan1_threshold: number
          student_loan_plan2_rate: number
          student_loan_plan2_threshold: number
          student_loan_plan4_rate: number
          student_loan_plan4_threshold: number
          student_loan_plan5_rate: number
          student_loan_plan5_threshold: number
          taper_threshold: number
          tax_year: string
          updated_at: string
        }
        Insert: {
          additional_rate?: number
          basic_rate?: number
          basic_rate_limit?: number
          cgt_annual_exempt_amount?: number
          cgt_basic_rate?: number
          cgt_higher_rate?: number
          cgt_residential_basic?: number
          cgt_residential_higher?: number
          class2_threshold?: number
          class2_weekly_rate?: number
          class4_additional_rate?: number
          class4_lower_limit?: number
          class4_main_rate?: number
          class4_upper_limit?: number
          created_at?: string
          dividend_additional_rate?: number
          dividend_allowance?: number
          dividend_basic_rate?: number
          dividend_higher_rate?: number
          effective_from: string
          effective_to?: string | null
          hicbc_threshold?: number
          hicbc_upper_threshold?: number
          higher_rate?: number
          higher_rate_limit?: number
          id?: string
          marriage_allowance_amount?: number
          pension_annual_allowance?: number
          pension_mpaa?: number
          pension_taper_floor?: number
          pension_taper_threshold?: number
          personal_allowance?: number
          savings_nil_rate_basic?: number
          savings_nil_rate_higher?: number
          student_loan_pg_rate?: number
          student_loan_pg_threshold?: number
          student_loan_plan1_rate?: number
          student_loan_plan1_threshold?: number
          student_loan_plan2_rate?: number
          student_loan_plan2_threshold?: number
          student_loan_plan4_rate?: number
          student_loan_plan4_threshold?: number
          student_loan_plan5_rate?: number
          student_loan_plan5_threshold?: number
          taper_threshold?: number
          tax_year: string
          updated_at?: string
        }
        Update: {
          additional_rate?: number
          basic_rate?: number
          basic_rate_limit?: number
          cgt_annual_exempt_amount?: number
          cgt_basic_rate?: number
          cgt_higher_rate?: number
          cgt_residential_basic?: number
          cgt_residential_higher?: number
          class2_threshold?: number
          class2_weekly_rate?: number
          class4_additional_rate?: number
          class4_lower_limit?: number
          class4_main_rate?: number
          class4_upper_limit?: number
          created_at?: string
          dividend_additional_rate?: number
          dividend_allowance?: number
          dividend_basic_rate?: number
          dividend_higher_rate?: number
          effective_from?: string
          effective_to?: string | null
          hicbc_threshold?: number
          hicbc_upper_threshold?: number
          higher_rate?: number
          higher_rate_limit?: number
          id?: string
          marriage_allowance_amount?: number
          pension_annual_allowance?: number
          pension_mpaa?: number
          pension_taper_floor?: number
          pension_taper_threshold?: number
          personal_allowance?: number
          savings_nil_rate_basic?: number
          savings_nil_rate_higher?: number
          student_loan_pg_rate?: number
          student_loan_pg_threshold?: number
          student_loan_plan1_rate?: number
          student_loan_plan1_threshold?: number
          student_loan_plan2_rate?: number
          student_loan_plan2_threshold?: number
          student_loan_plan4_rate?: number
          student_loan_plan4_threshold?: number
          student_loan_plan5_rate?: number
          student_loan_plan5_threshold?: number
          taper_threshold?: number
          tax_year?: string
          updated_at?: string
        }
        Relationships: []
      }
      services_catalog: {
        Row: {
          active: boolean | null
          billing_model: string
          code: string
          created_at: string
          default_job_template_id: string | null
          default_price: number
          description: string | null
          entity_scope: string
          id: string
          information_request_template_id: string | null
          is_bookkeeping_related: boolean | null
          is_recurring: boolean | null
          name: string
          organization_id: string
          records_request_template_id: string | null
          trigger_date_offset_days: number | null
          trigger_date_type: string | null
          updated_at: string
          workpaper_template_id: string | null
        }
        Insert: {
          active?: boolean | null
          billing_model: string
          code: string
          created_at?: string
          default_job_template_id?: string | null
          default_price: number
          description?: string | null
          entity_scope?: string
          id?: string
          information_request_template_id?: string | null
          is_bookkeeping_related?: boolean | null
          is_recurring?: boolean | null
          name: string
          organization_id: string
          records_request_template_id?: string | null
          trigger_date_offset_days?: number | null
          trigger_date_type?: string | null
          updated_at?: string
          workpaper_template_id?: string | null
        }
        Update: {
          active?: boolean | null
          billing_model?: string
          code?: string
          created_at?: string
          default_job_template_id?: string | null
          default_price?: number
          description?: string | null
          entity_scope?: string
          id?: string
          information_request_template_id?: string | null
          is_bookkeeping_related?: boolean | null
          is_recurring?: boolean | null
          name?: string
          organization_id?: string
          records_request_template_id?: string | null
          trigger_date_offset_days?: number | null
          trigger_date_type?: string | null
          updated_at?: string
          workpaper_template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "services_catalog_default_job_template_id_fkey"
            columns: ["default_job_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_catalog_information_request_template_id_fkey"
            columns: ["information_request_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_catalog_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_catalog_records_request_template_id_fkey"
            columns: ["records_request_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_catalog_workpaper_template_id_fkey"
            columns: ["workpaper_template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_definitions: {
        Row: {
          category: string | null
          created_at: string
          default_duration_hours: number
          description: string | null
          feeds_dashboard: boolean
          id: string
          is_active: boolean | null
          is_system: boolean | null
          job_type: string | null
          name: string
          organization_id: string
          pause_conditions: Json | null
          service_code: string | null
          sla_type: string
          stop_conditions: Json | null
          trigger_event: string
          trigger_status: string | null
          updated_at: string
          urgent_duration_hours: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          default_duration_hours: number
          description?: string | null
          feeds_dashboard?: boolean
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          job_type?: string | null
          name: string
          organization_id: string
          pause_conditions?: Json | null
          service_code?: string | null
          sla_type: string
          stop_conditions?: Json | null
          trigger_event: string
          trigger_status?: string | null
          updated_at?: string
          urgent_duration_hours?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string
          default_duration_hours?: number
          description?: string | null
          feeds_dashboard?: boolean
          id?: string
          is_active?: boolean | null
          is_system?: boolean | null
          job_type?: string | null
          name?: string
          organization_id?: string
          pause_conditions?: Json | null
          service_code?: string | null
          sla_type?: string
          stop_conditions?: Json | null
          trigger_event?: string
          trigger_status?: string | null
          updated_at?: string
          urgent_duration_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sla_definitions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_instances: {
        Row: {
          breached: boolean | null
          breached_at: string | null
          completed_at: string | null
          compressed: boolean | null
          created_at: string
          due_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json | null
          organization_id: string
          paused_at: string | null
          paused_total_seconds: number | null
          sla_definition_id: string | null
          started_at: string
          status: string | null
        }
        Insert: {
          breached?: boolean | null
          breached_at?: string | null
          completed_at?: string | null
          compressed?: boolean | null
          created_at?: string
          due_at: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
          organization_id: string
          paused_at?: string | null
          paused_total_seconds?: number | null
          sla_definition_id?: string | null
          started_at: string
          status?: string | null
        }
        Update: {
          breached?: boolean | null
          breached_at?: string | null
          completed_at?: string | null
          compressed?: boolean | null
          created_at?: string
          due_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          organization_id?: string
          paused_at?: string | null
          paused_total_seconds?: number | null
          sla_definition_id?: string | null
          started_at?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sla_instances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_instances_sla_definition_id_fkey"
            columns: ["sla_definition_id"]
            isOneToOne: false
            referencedRelation: "sla_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          created_at: string
          id: string
          processed_at: string
          type: string
        }
        Insert: {
          created_at: string
          id: string
          processed_at?: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          processed_at?: string
          type?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          city: string | null
          client_id: string | null
          company_id: string | null
          country: string | null
          created_at: string | null
          default_account_id: string | null
          default_vat_code_id: string | null
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          organization_id: string
          payment_terms_days: number | null
          phone: string | null
          postcode: string | null
          updated_at: string | null
          vat_number: string | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          client_id?: string | null
          company_id?: string | null
          country?: string | null
          created_at?: string | null
          default_account_id?: string | null
          default_vat_code_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          organization_id: string
          payment_terms_days?: number | null
          phone?: string | null
          postcode?: string | null
          updated_at?: string | null
          vat_number?: string | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          client_id?: string | null
          company_id?: string | null
          country?: string | null
          created_at?: string | null
          default_account_id?: string | null
          default_vat_code_id?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          organization_id?: string
          payment_terms_days?: number | null
          phone?: string | null
          postcode?: string | null
          updated_at?: string | null
          vat_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_default_account_id_fkey"
            columns: ["default_account_id"]
            isOneToOne: false
            referencedRelation: "bookkeeping_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_default_vat_code_id_fkey"
            columns: ["default_vat_code_id"]
            isOneToOne: false
            referencedRelation: "vat_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tb_account_mappings: {
        Row: {
          client_id: string | null
          column_config: Json | null
          company_id: string | null
          created_at: string
          id: string
          is_default: boolean | null
          is_global: boolean
          mappings: Json
          organization_id: string
          source_type: string
          template_name: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          column_config?: Json | null
          company_id?: string | null
          created_at?: string
          id?: string
          is_default?: boolean | null
          is_global?: boolean
          mappings?: Json
          organization_id: string
          source_type: string
          template_name: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          column_config?: Json | null
          company_id?: string | null
          created_at?: string
          id?: string
          is_default?: boolean | null
          is_global?: boolean
          mappings?: Json
          organization_id?: string
          source_type?: string
          template_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tb_account_mappings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb_account_mappings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tb_account_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invitations: {
        Row: {
          accepted_at: string | null
          email: string
          expires_at: string
          id: string
          invited_at: string
          invited_by: string
          organization_id: string
          role: string
        }
        Insert: {
          accepted_at?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_at?: string
          invited_by: string
          organization_id: string
          role: string
        }
        Update: {
          accepted_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_at?: string
          invited_by?: string
          organization_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      template_blocks: {
        Row: {
          block_name: string
          block_type: string
          content: Json
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          block_name: string
          block_type: string
          content?: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          block_name?: string
          block_type?: string
          content?: Json
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_blocks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      template_merge_fields: {
        Row: {
          created_at: string
          description: string | null
          example_value: string | null
          field_category: string
          field_key: string
          field_label: string
          id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          example_value?: string | null
          field_category: string
          field_key: string
          field_label: string
          id?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          example_value?: string | null
          field_category?: string
          field_key?: string
          field_label?: string
          id?: string
        }
        Relationships: []
      }
      template_versions: {
        Row: {
          change_notes: string | null
          content: Json
          created_at: string
          created_by: string | null
          id: string
          published_at: string | null
          template_id: string
          version: number | null
          version_number: number
        }
        Insert: {
          change_notes?: string | null
          content: Json
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          template_id: string
          version?: number | null
          version_number: number
        }
        Update: {
          change_notes?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string | null
          template_id?: string
          version?: number | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          content: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          last_validated_at: string | null
          name: string
          organization_id: string | null
          recipient_rule: string | null
          required_merge_fields: string[] | null
          requires_unsubscribe_link: boolean
          service: string | null
          status: string
          tags: Json | null
          type: string
          updated_at: string
          validation_state: string | null
          version_number: number
        }
        Insert: {
          content?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          last_validated_at?: string | null
          name: string
          organization_id?: string | null
          recipient_rule?: string | null
          required_merge_fields?: string[] | null
          requires_unsubscribe_link?: boolean
          service?: string | null
          status?: string
          tags?: Json | null
          type: string
          updated_at?: string
          validation_state?: string | null
          version_number?: number
        }
        Update: {
          content?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          last_validated_at?: string | null
          name?: string
          organization_id?: string | null
          recipient_rule?: string | null
          required_merge_fields?: string[] | null
          requires_unsubscribe_link?: boolean
          service?: string | null
          status?: string
          tags?: Json | null
          type?: string
          updated_at?: string
          validation_state?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_balance_snapshots: {
        Row: {
          balances: Json
          client_id: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          finalised_at: string | null
          finalised_by: string | null
          id: string
          is_balanced: boolean | null
          job_id: string | null
          locked: boolean
          metadata: Json | null
          notes: string | null
          organization_id: string
          period_end: string
          period_start: string
          snapshot_date: string
          source_type: string
          status: string
          total_credit: number | null
          total_debit: number | null
          updated_at: string
        }
        Insert: {
          balances?: Json
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          finalised_at?: string | null
          finalised_by?: string | null
          id?: string
          is_balanced?: boolean | null
          job_id?: string | null
          locked?: boolean
          metadata?: Json | null
          notes?: string | null
          organization_id: string
          period_end: string
          period_start: string
          snapshot_date?: string
          source_type?: string
          status?: string
          total_credit?: number | null
          total_debit?: number | null
          updated_at?: string
        }
        Update: {
          balances?: Json
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          finalised_at?: string | null
          finalised_by?: string | null
          id?: string
          is_balanced?: boolean | null
          job_id?: string | null
          locked?: boolean
          metadata?: Json | null
          notes?: string | null
          organization_id?: string
          period_end?: string
          period_start?: string
          snapshot_date?: string
          source_type?: string
          status?: string
          total_credit?: number | null
          total_debit?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trial_balance_snapshots_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_balance_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_balance_snapshots_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trial_balance_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      truelayer_auth_states: {
        Row: {
          client_id: string | null
          company_id: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          organization_id: string
          redirect_path: string | null
          state: string
        }
        Insert: {
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          organization_id: string
          redirect_path?: string | null
          state: string
        }
        Update: {
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          organization_id?: string
          redirect_path?: string | null
          state?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["portal_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role: Database["public"]["Enums"]["portal_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["portal_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_saved_views: {
        Row: {
          created_at: string | null
          entity_type: string
          filters: Json
          id: string
          is_default: boolean | null
          organization_id: string
          updated_at: string | null
          user_id: string
          view_name: string
        }
        Insert: {
          created_at?: string | null
          entity_type: string
          filters?: Json
          id?: string
          is_default?: boolean | null
          organization_id: string
          updated_at?: string | null
          user_id: string
          view_name: string
        }
        Update: {
          created_at?: string | null
          entity_type?: string
          filters?: Json
          id?: string
          is_default?: boolean | null
          organization_id?: string
          updated_at?: string | null
          user_id?: string
          view_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_saved_views_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          created_at: string | null
          device_info: Json | null
          expires_at: string
          id: string
          invalidated_at: string | null
          invalidated_reason: string | null
          ip_address: string | null
          last_activity_at: string | null
          organization_id: string
          session_token: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_info?: Json | null
          expires_at: string
          id?: string
          invalidated_at?: string | null
          invalidated_reason?: string | null
          ip_address?: string | null
          last_activity_at?: string | null
          organization_id: string
          session_token: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_info?: Json | null
          expires_at?: string
          id?: string
          invalidated_at?: string | null
          invalidated_reason?: string | null
          ip_address?: string | null
          last_activity_at?: string | null
          organization_id?: string
          session_token?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vat_adjustments: {
        Row: {
          adjustment_type: string
          approved_at: string | null
          approved_by: string | null
          box_adjustments: Json | null
          boxes_affected: number[]
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          net_adjustment: number | null
          organization_id: string
          reason: string
          supporting_document_id: string | null
          updated_at: string
          vat_adjustment: number | null
          vat_period_id: string
        }
        Insert: {
          adjustment_type: string
          approved_at?: string | null
          approved_by?: string | null
          box_adjustments?: Json | null
          boxes_affected?: number[]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          net_adjustment?: number | null
          organization_id: string
          reason: string
          supporting_document_id?: string | null
          updated_at?: string
          vat_adjustment?: number | null
          vat_period_id: string
        }
        Update: {
          adjustment_type?: string
          approved_at?: string | null
          approved_by?: string | null
          box_adjustments?: Json | null
          boxes_affected?: number[]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          net_adjustment?: number | null
          organization_id?: string
          reason?: string
          supporting_document_id?: string | null
          updated_at?: string
          vat_adjustment?: number | null
          vat_period_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vat_adjustments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_adjustments_vat_period_id_fkey"
            columns: ["vat_period_id"]
            isOneToOne: false
            referencedRelation: "vat_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      vat_codes: {
        Row: {
          client_id: string | null
          code: string
          company_id: string | null
          created_at: string | null
          description: string
          hmrc_box_mapping: Json | null
          id: string
          is_active: boolean | null
          is_common: boolean
          is_reclaimable: boolean | null
          jurisdiction: string | null
          net_included_in_boxes: number[] | null
          organization_id: string
          partial_exemption_applicable: boolean | null
          rate: number
          reverse_charge: boolean | null
          scheme_type: string | null
          supply_category: string | null
          updated_at: string | null
          vat_included_in_boxes: number[] | null
          vat_type: string
        }
        Insert: {
          client_id?: string | null
          code: string
          company_id?: string | null
          created_at?: string | null
          description: string
          hmrc_box_mapping?: Json | null
          id?: string
          is_active?: boolean | null
          is_common?: boolean
          is_reclaimable?: boolean | null
          jurisdiction?: string | null
          net_included_in_boxes?: number[] | null
          organization_id: string
          partial_exemption_applicable?: boolean | null
          rate: number
          reverse_charge?: boolean | null
          scheme_type?: string | null
          supply_category?: string | null
          updated_at?: string | null
          vat_included_in_boxes?: number[] | null
          vat_type: string
        }
        Update: {
          client_id?: string | null
          code?: string
          company_id?: string | null
          created_at?: string | null
          description?: string
          hmrc_box_mapping?: Json | null
          id?: string
          is_active?: boolean | null
          is_common?: boolean
          is_reclaimable?: boolean | null
          jurisdiction?: string | null
          net_included_in_boxes?: number[] | null
          organization_id?: string
          partial_exemption_applicable?: boolean | null
          rate?: number
          reverse_charge?: boolean | null
          scheme_type?: string | null
          supply_category?: string | null
          updated_at?: string | null
          vat_included_in_boxes?: number[] | null
          vat_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "vat_codes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_codes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_codes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vat_obligations: {
        Row: {
          client_id: string | null
          company_id: string | null
          due_date: string
          fetched_at: string
          id: string
          organization_id: string
          period_end: string
          period_key: string
          period_start: string
          raw_response: Json | null
          received_date: string | null
          status: string
          vrn: string
        }
        Insert: {
          client_id?: string | null
          company_id?: string | null
          due_date: string
          fetched_at?: string
          id?: string
          organization_id: string
          period_end: string
          period_key: string
          period_start: string
          raw_response?: Json | null
          received_date?: string | null
          status: string
          vrn: string
        }
        Update: {
          client_id?: string | null
          company_id?: string | null
          due_date?: string
          fetched_at?: string
          id?: string
          organization_id?: string
          period_end?: string
          period_key?: string
          period_start?: string
          raw_response?: Json | null
          received_date?: string | null
          status?: string
          vrn?: string
        }
        Relationships: [
          {
            foreignKeyName: "vat_obligations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_obligations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_obligations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vat_period_lines: {
        Row: {
          box1_contribution: number | null
          box2_contribution: number | null
          box4_contribution: number | null
          box6_contribution: number | null
          box7_contribution: number | null
          box8_contribution: number | null
          box9_contribution: number | null
          created_at: string
          gross_total: number
          id: string
          net_total: number
          organization_id: string
          partial_exemption_disallowed: number | null
          source_count: number
          vat_code: string
          vat_code_id: string | null
          vat_period_id: string
          vat_rate: number
          vat_total: number
          vat_type: string
        }
        Insert: {
          box1_contribution?: number | null
          box2_contribution?: number | null
          box4_contribution?: number | null
          box6_contribution?: number | null
          box7_contribution?: number | null
          box8_contribution?: number | null
          box9_contribution?: number | null
          created_at?: string
          gross_total?: number
          id?: string
          net_total?: number
          organization_id: string
          partial_exemption_disallowed?: number | null
          source_count?: number
          vat_code: string
          vat_code_id?: string | null
          vat_period_id: string
          vat_rate: number
          vat_total?: number
          vat_type: string
        }
        Update: {
          box1_contribution?: number | null
          box2_contribution?: number | null
          box4_contribution?: number | null
          box6_contribution?: number | null
          box7_contribution?: number | null
          box8_contribution?: number | null
          box9_contribution?: number | null
          created_at?: string
          gross_total?: number
          id?: string
          net_total?: number
          organization_id?: string
          partial_exemption_disallowed?: number | null
          source_count?: number
          vat_code?: string
          vat_code_id?: string | null
          vat_period_id?: string
          vat_rate?: number
          vat_total?: number
          vat_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "vat_period_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_period_lines_vat_code_id_fkey"
            columns: ["vat_code_id"]
            isOneToOne: false
            referencedRelation: "vat_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_period_lines_vat_period_id_fkey"
            columns: ["vat_period_id"]
            isOneToOne: false
            referencedRelation: "vat_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      vat_periods: {
        Row: {
          cash_accounting_enabled: boolean | null
          cash_excluded_vat: number | null
          cash_included_vat: number | null
          client_id: string | null
          company_id: string | null
          computed_box1: number | null
          computed_box2: number | null
          computed_box3: number | null
          computed_box4: number | null
          computed_box5: number | null
          computed_box6: number | null
          computed_box7: number | null
          computed_box8: number | null
          computed_box9: number | null
          control_account_balance: number | null
          created_at: string
          filing_id: string | null
          finalised_at: string | null
          finalised_by: string | null
          flat_rate_category: string | null
          flat_rate_percentage: number | null
          generated_at: string | null
          id: string
          organization_id: string
          partial_exemption_applicable: boolean | null
          partial_exemption_rate: number | null
          period_end: string
          period_key: string | null
          period_start: string
          reconciliation_difference: number | null
          reconciliation_status: string | null
          scheme_parameters: Json | null
          status: string
          updated_at: string
          vat_registration_id: string | null
          vat_scheme: string
          vrn: string
          workpaper_instance_id: string | null
        }
        Insert: {
          cash_accounting_enabled?: boolean | null
          cash_excluded_vat?: number | null
          cash_included_vat?: number | null
          client_id?: string | null
          company_id?: string | null
          computed_box1?: number | null
          computed_box2?: number | null
          computed_box3?: number | null
          computed_box4?: number | null
          computed_box5?: number | null
          computed_box6?: number | null
          computed_box7?: number | null
          computed_box8?: number | null
          computed_box9?: number | null
          control_account_balance?: number | null
          created_at?: string
          filing_id?: string | null
          finalised_at?: string | null
          finalised_by?: string | null
          flat_rate_category?: string | null
          flat_rate_percentage?: number | null
          generated_at?: string | null
          id?: string
          organization_id: string
          partial_exemption_applicable?: boolean | null
          partial_exemption_rate?: number | null
          period_end: string
          period_key?: string | null
          period_start: string
          reconciliation_difference?: number | null
          reconciliation_status?: string | null
          scheme_parameters?: Json | null
          status?: string
          updated_at?: string
          vat_registration_id?: string | null
          vat_scheme?: string
          vrn: string
          workpaper_instance_id?: string | null
        }
        Update: {
          cash_accounting_enabled?: boolean | null
          cash_excluded_vat?: number | null
          cash_included_vat?: number | null
          client_id?: string | null
          company_id?: string | null
          computed_box1?: number | null
          computed_box2?: number | null
          computed_box3?: number | null
          computed_box4?: number | null
          computed_box5?: number | null
          computed_box6?: number | null
          computed_box7?: number | null
          computed_box8?: number | null
          computed_box9?: number | null
          control_account_balance?: number | null
          created_at?: string
          filing_id?: string | null
          finalised_at?: string | null
          finalised_by?: string | null
          flat_rate_category?: string | null
          flat_rate_percentage?: number | null
          generated_at?: string | null
          id?: string
          organization_id?: string
          partial_exemption_applicable?: boolean | null
          partial_exemption_rate?: number | null
          period_end?: string
          period_key?: string | null
          period_start?: string
          reconciliation_difference?: number | null
          reconciliation_status?: string | null
          scheme_parameters?: Json | null
          status?: string
          updated_at?: string
          vat_registration_id?: string | null
          vat_scheme?: string
          vrn?: string
          workpaper_instance_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vat_periods_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_periods_vat_registration_id_fkey"
            columns: ["vat_registration_id"]
            isOneToOne: false
            referencedRelation: "vat_registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      vat_reconciliations: {
        Row: {
          absolute_difference: number
          acknowledged: boolean
          acknowledged_at: string | null
          acknowledged_by_user_id: string | null
          acknowledgement_note: string | null
          actual_vat: number
          calculation_details: Json | null
          classification: string
          client_id: string | null
          company_id: string | null
          control_account_ids: string[] | null
          created_at: string
          difference: number
          expected_vat: number
          id: string
          model_snapshot_id: string | null
          organization_id: string
          tolerance_amount: number
          updated_at: string
          vat_period_id: string
        }
        Insert: {
          absolute_difference?: number
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by_user_id?: string | null
          acknowledgement_note?: string | null
          actual_vat?: number
          calculation_details?: Json | null
          classification?: string
          client_id?: string | null
          company_id?: string | null
          control_account_ids?: string[] | null
          created_at?: string
          difference?: number
          expected_vat?: number
          id?: string
          model_snapshot_id?: string | null
          organization_id: string
          tolerance_amount?: number
          updated_at?: string
          vat_period_id: string
        }
        Update: {
          absolute_difference?: number
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by_user_id?: string | null
          acknowledgement_note?: string | null
          actual_vat?: number
          calculation_details?: Json | null
          classification?: string
          client_id?: string | null
          company_id?: string | null
          control_account_ids?: string[] | null
          created_at?: string
          difference?: number
          expected_vat?: number
          id?: string
          model_snapshot_id?: string | null
          organization_id?: string
          tolerance_amount?: number
          updated_at?: string
          vat_period_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vat_reconciliations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_reconciliations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_reconciliations_model_snapshot_id_fkey"
            columns: ["model_snapshot_id"]
            isOneToOne: false
            referencedRelation: "filing_model_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_reconciliations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_reconciliations_vat_period_id_fkey"
            columns: ["vat_period_id"]
            isOneToOne: false
            referencedRelation: "vat_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      vat_registrations: {
        Row: {
          annual_accounting_joined_at: string | null
          annual_accounting_payment_schedule: string | null
          cash_scheme_joined_at: string | null
          cash_scheme_threshold: number | null
          client_id: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          flat_rate_first_year_discount: boolean | null
          flat_rate_percentage: number | null
          flat_rate_trade_sector: string | null
          id: string
          notes: string | null
          organization_id: string
          partial_exemption_applicable: boolean | null
          partial_exemption_method: string | null
          partial_exemption_rate: number | null
          scheme: string
          updated_at: string
          vrn: string
        }
        Insert: {
          annual_accounting_joined_at?: string | null
          annual_accounting_payment_schedule?: string | null
          cash_scheme_joined_at?: string | null
          cash_scheme_threshold?: number | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          flat_rate_first_year_discount?: boolean | null
          flat_rate_percentage?: number | null
          flat_rate_trade_sector?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          partial_exemption_applicable?: boolean | null
          partial_exemption_method?: string | null
          partial_exemption_rate?: number | null
          scheme?: string
          updated_at?: string
          vrn: string
        }
        Update: {
          annual_accounting_joined_at?: string | null
          annual_accounting_payment_schedule?: string | null
          cash_scheme_joined_at?: string | null
          cash_scheme_threshold?: number | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          flat_rate_first_year_discount?: boolean | null
          flat_rate_percentage?: number | null
          flat_rate_trade_sector?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          partial_exemption_applicable?: boolean | null
          partial_exemption_method?: string | null
          partial_exemption_rate?: number | null
          scheme?: string
          updated_at?: string
          vrn?: string
        }
        Relationships: [
          {
            foreignKeyName: "vat_registrations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_registrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_registrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vat_returns: {
        Row: {
          box_1_vat_due_sales: number
          box_2_vat_due_acquisitions: number
          box_3_total_vat_due: number
          box_4_vat_reclaimed: number
          box_5_net_vat: number
          box_6_total_sales: number
          box_7_total_purchases: number
          box_8_total_supplies_eu: number
          box_9_total_acquisitions_eu: number
          client_id: string | null
          company_id: string | null
          created_at: string | null
          due_date: string
          hmrc_receipt: Json | null
          id: string
          notes: string | null
          organization_id: string
          period_end: string
          period_start: string
          status: string
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string | null
        }
        Insert: {
          box_1_vat_due_sales?: number
          box_2_vat_due_acquisitions?: number
          box_3_total_vat_due?: number
          box_4_vat_reclaimed?: number
          box_5_net_vat?: number
          box_6_total_sales?: number
          box_7_total_purchases?: number
          box_8_total_supplies_eu?: number
          box_9_total_acquisitions_eu?: number
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          due_date: string
          hmrc_receipt?: Json | null
          id?: string
          notes?: string | null
          organization_id: string
          period_end: string
          period_start: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string | null
        }
        Update: {
          box_1_vat_due_sales?: number
          box_2_vat_due_acquisitions?: number
          box_3_total_vat_due?: number
          box_4_vat_reclaimed?: number
          box_5_net_vat?: number
          box_6_total_sales?: number
          box_7_total_purchases?: number
          box_8_total_supplies_eu?: number
          box_9_total_acquisitions_eu?: number
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          due_date?: string
          hmrc_receipt?: Json | null
          id?: string
          notes?: string | null
          organization_id?: string
          period_end?: string
          period_start?: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vat_returns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_returns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_returns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vat_transaction_links: {
        Row: {
          created_at: string
          id: string
          net_amount: number
          source_id: string
          source_table: string
          source_type: string
          transaction_date: string
          vat_amount: number
          vat_code: string | null
          vat_code_id: string | null
          vat_period_id: string
          vat_period_line_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          net_amount: number
          source_id: string
          source_table: string
          source_type: string
          transaction_date: string
          vat_amount: number
          vat_code?: string | null
          vat_code_id?: string | null
          vat_period_id: string
          vat_period_line_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          net_amount?: number
          source_id?: string
          source_table?: string
          source_type?: string
          transaction_date?: string
          vat_amount?: number
          vat_code?: string | null
          vat_code_id?: string | null
          vat_period_id?: string
          vat_period_line_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vat_transaction_links_vat_period_id_fkey"
            columns: ["vat_period_id"]
            isOneToOne: false
            referencedRelation: "vat_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_transaction_links_vat_period_line_id_fkey"
            columns: ["vat_period_line_id"]
            isOneToOne: false
            referencedRelation: "vat_period_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      workpaper_category_mappings: {
        Row: {
          account_code_pattern: string | null
          account_subtype: string | null
          account_type: string | null
          created_at: string
          id: string
          is_default: boolean | null
          mapping_type: string
          organization_id: string
          priority: number | null
          workpaper_category: string
          workpaper_subcategory: string | null
        }
        Insert: {
          account_code_pattern?: string | null
          account_subtype?: string | null
          account_type?: string | null
          created_at?: string
          id?: string
          is_default?: boolean | null
          mapping_type: string
          organization_id: string
          priority?: number | null
          workpaper_category: string
          workpaper_subcategory?: string | null
        }
        Update: {
          account_code_pattern?: string | null
          account_subtype?: string | null
          account_type?: string | null
          created_at?: string
          id?: string
          is_default?: boolean | null
          mapping_type?: string
          organization_id?: string
          priority?: number | null
          workpaper_category?: string
          workpaper_subcategory?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workpaper_category_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      workpaper_instances: {
        Row: {
          client_id: string | null
          company_id: string | null
          computed_data: Json | null
          created_at: string | null
          data_source: string | null
          field_notes: Json | null
          field_overrides: Json | null
          field_values: Json
          finalised_at: string | null
          finalised_by: string | null
          id: string
          job_id: string
          last_data_sync_at: string | null
          locked: boolean
          name: string
          organization_id: string
          owner_user_id: string | null
          period_end: string | null
          period_label: string | null
          period_start: string | null
          prepared_at: string | null
          prepared_by: string | null
          questionnaire_instance_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          service_type: string
          source_data: Json | null
          source_type: string | null
          status: string
          template_id: string | null
          trial_balance_snapshot_id: string | null
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          company_id?: string | null
          computed_data?: Json | null
          created_at?: string | null
          data_source?: string | null
          field_notes?: Json | null
          field_overrides?: Json | null
          field_values?: Json
          finalised_at?: string | null
          finalised_by?: string | null
          id?: string
          job_id: string
          last_data_sync_at?: string | null
          locked?: boolean
          name: string
          organization_id: string
          owner_user_id?: string | null
          period_end?: string | null
          period_label?: string | null
          period_start?: string | null
          prepared_at?: string | null
          prepared_by?: string | null
          questionnaire_instance_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_type: string
          source_data?: Json | null
          source_type?: string | null
          status?: string
          template_id?: string | null
          trial_balance_snapshot_id?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          company_id?: string | null
          computed_data?: Json | null
          created_at?: string | null
          data_source?: string | null
          field_notes?: Json | null
          field_overrides?: Json | null
          field_values?: Json
          finalised_at?: string | null
          finalised_by?: string | null
          id?: string
          job_id?: string
          last_data_sync_at?: string | null
          locked?: boolean
          name?: string
          organization_id?: string
          owner_user_id?: string | null
          period_end?: string | null
          period_label?: string | null
          period_start?: string | null
          prepared_at?: string | null
          prepared_by?: string | null
          questionnaire_instance_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_type?: string
          source_data?: Json | null
          source_type?: string | null
          status?: string
          template_id?: string | null
          trial_balance_snapshot_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workpaper_instances_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpaper_instances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpaper_instances_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpaper_instances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpaper_instances_questionnaire_instance_id_fkey"
            columns: ["questionnaire_instance_id"]
            isOneToOne: false
            referencedRelation: "questionnaire_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpaper_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workpaper_instances_trial_balance_snapshot_id_fkey"
            columns: ["trial_balance_snapshot_id"]
            isOneToOne: false
            referencedRelation: "trial_balance_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      workpaper_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          is_system: boolean
          job_type: string
          name: string
          organization_id: string | null
          schema_json: Json
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          is_system?: boolean
          job_type: string
          name: string
          organization_id?: string | null
          schema_json?: Json
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          is_system?: boolean
          job_type?: string
          name?: string
          organization_id?: string | null
          schema_json?: Json
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "workpaper_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      bank_connections_safe: {
        Row: {
          bank_logo_url: string | null
          bank_name: string | null
          client_id: string | null
          company_id: string | null
          consent_expires_at: string | null
          created_at: string | null
          id: string | null
          last_error: string | null
          last_synced_at: string | null
          organization_id: string | null
          provider: string | null
          provider_connection_id: string | null
          scope: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          bank_logo_url?: string | null
          bank_name?: string | null
          client_id?: string | null
          company_id?: string | null
          consent_expires_at?: string | null
          created_at?: string | null
          id?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          organization_id?: string | null
          provider?: string | null
          provider_connection_id?: string | null
          scope?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          bank_logo_url?: string | null
          bank_name?: string | null
          client_id?: string | null
          company_id?: string | null
          consent_expires_at?: string | null
          created_at?: string | null
          id?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          organization_id?: string | null
          provider?: string | null
          provider_connection_id?: string | null
          scope?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_connections_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      connected_mailboxes_safe: {
        Row: {
          created_at: string | null
          email_address: string | null
          error_message: string | null
          id: string | null
          last_sync_at: string | null
          mailbox_type: string | null
          organization_id: string | null
          provider: Database["public"]["Enums"]["mailbox_provider"] | null
          status: Database["public"]["Enums"]["mailbox_status"] | null
          sync_enabled: boolean | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email_address?: string | null
          error_message?: string | null
          id?: string | null
          last_sync_at?: string | null
          mailbox_type?: string | null
          organization_id?: string | null
          provider?: Database["public"]["Enums"]["mailbox_provider"] | null
          status?: Database["public"]["Enums"]["mailbox_status"] | null
          sync_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email_address?: string | null
          error_message?: string | null
          id?: string | null
          last_sync_at?: string | null
          mailbox_type?: string | null
          organization_id?: string | null
          provider?: Database["public"]["Enums"]["mailbox_provider"] | null
          status?: Database["public"]["Enums"]["mailbox_status"] | null
          sync_enabled?: boolean | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "connected_mailboxes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_integrations_hmrc_safe: {
        Row: {
          created_at: string | null
          ct_connected: boolean | null
          mtd_vat_connected: boolean | null
          mtd_vat_connected_at: string | null
          mtd_vat_expires_at: string | null
          organization_id: string | null
          paye_connected: boolean | null
          sa_connected: boolean | null
          test_mode: boolean | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          ct_connected?: boolean | null
          mtd_vat_connected?: boolean | null
          mtd_vat_connected_at?: string | null
          mtd_vat_expires_at?: string | null
          organization_id?: string | null
          paye_connected?: boolean | null
          sa_connected?: boolean | null
          test_mode?: boolean | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          ct_connected?: boolean | null
          mtd_vat_connected?: boolean | null
          mtd_vat_connected_at?: string | null
          mtd_vat_expires_at?: string | null
          organization_id?: string | null
          paye_connected?: boolean | null
          sa_connected?: boolean | null
          test_mode?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_integrations_hmrc_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _check_questionnaire_token_rate_limit: {
        Args: { p_token_hash: string }
        Returns: undefined
      }
      _hash_token: { Args: { p_token: string }; Returns: string }
      _require_valid_questionnaire_link: {
        Args: { p_instance_id: string; p_token: string }
        Returns: {
          created_at: string | null
          expires_at: string
          id: string
          questionnaire_instance_id: string
          revoked_at: string | null
          token_hash: string
        }
        SetofOptions: {
          from: "*"
          to: "questionnaire_public_links"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      accept_org_invitation: {
        Args: { invitation_id: string }
        Returns: string
      }
      acknowledge_failed_email_safe: {
        Args: { p_email_id: string }
        Returns: Json
      }
      acknowledge_vat_reconciliation: {
        Args: { p_note?: string; p_reconciliation_id: string }
        Returns: Json
      }
      add_org_member: {
        Args: {
          target_org_id: string
          target_role: string
          target_user_id: string
        }
        Returns: string
      }
      apply_ch_diff: {
        Args: { p_decision: string; p_diff_id: string; p_notes?: string }
        Returns: undefined
      }
      apply_client_override: {
        Args: {
          p_chaser_policy_id: string
          p_client_id: string
          p_config?: Json
          p_enabled: boolean
          p_org_id: string
          p_rule_id: string
        }
        Returns: string
      }
      apply_job_override: {
        Args: {
          p_chaser_policy_id: string
          p_config?: Json
          p_enabled: boolean
          p_job_id: string
          p_org_id: string
          p_rule_id: string
        }
        Returns: string
      }
      approve_bill_safe: { Args: { p_bill_id: string }; Returns: Json }
      approve_filing_safe: { Args: { p_filing_id: string }; Returns: Json }
      automation_dry_run: {
        Args: { p_rule_id: string; p_sample_event?: Json }
        Returns: Json
      }
      calculate_cash_vat_proportion: {
        Args: {
          p_gross_amount: number
          p_net_amount: number
          p_paid_amount: number
          p_vat_amount: number
        }
        Returns: number
      }
      calculate_deadline: {
        Args: {
          filing_type: string
          metadata?: Json
          period_end: string
          period_start: string
        }
        Returns: string
      }
      can_access_shared_mailbox: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_approve_bills: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_approve_filings: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_create_invoices: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_edit_invoices: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_execute_automation: {
        Args: { p_execution_hash: string; p_rule_id: string }
        Returns: boolean
      }
      can_finalise: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_finalize_workpapers: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_issue_invoices: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_lock_periods: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_automation_rules: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_automation_rules_check: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_bank_reconciliation: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_bills: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_email_queue: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_practice_settings: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_team: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_templates: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_modify_jobs: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_override_invoice_lock: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_override_locked_records: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_post_journals: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_record_payments: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_send_emails: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_submit_filings: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_void_invoices: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_void_paid_invoices: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_void_unpaid_invoices: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      cancel_workflow_instance: {
        Args: { p_instance_id: string; p_reason?: string }
        Returns: undefined
      }
      check_automation_rate_limit: {
        Args: { p_organization_id: string; p_rule_id?: string }
        Returns: Json
      }
      check_suppression: {
        Args: { p_category: string; p_email: string; p_org_id: string }
        Returns: boolean
      }
      claim_idempotency_key: {
        Args: {
          p_chaser_policy_id?: string
          p_key: string
          p_org_id: string
          p_rule_id?: string
          p_workflow_instance_id?: string
        }
        Returns: boolean
      }
      cleanup_expired_gmail_auth_states: { Args: never; Returns: undefined }
      cleanup_expired_outlook_auth_states: { Args: never; Returns: undefined }
      cleanup_old_rate_limits: { Args: never; Returns: undefined }
      client_has_portal_access: {
        Args: {
          check_client_id?: string
          check_company_id?: string
          check_user_id: string
        }
        Returns: boolean
      }
      consume_unsubscribe_token: {
        Args: { p_category?: string; p_token: string }
        Returns: Json
      }
      create_automation_rule_safe: {
        Args: {
          p_action_config?: Json
          p_action_type?: string
          p_email_mode?: string
          p_is_active?: boolean
          p_name: string
          p_organization_id: string
          p_trigger_config?: Json
          p_trigger_type: string
        }
        Returns: Json
      }
      create_bill_draft_safe: {
        Args: {
          p_bill_number?: string
          p_currency?: string
          p_due_date?: string
          p_entity_id: string
          p_entity_type: string
          p_issue_date?: string
          p_lines?: Json
          p_notes?: string
          p_organization_id: string
          p_reference?: string
          p_supplier_id?: string
        }
        Returns: Json
      }
      create_customer_safe: {
        Args: {
          p_billing_address?: Json
          p_company_name?: string
          p_default_currency?: string
          p_email?: string
          p_entity_id: string
          p_entity_type: string
          p_internal_notes?: string
          p_name: string
          p_organization_id: string
          p_payment_terms_days?: number
          p_phone?: string
          p_vat_number?: string
        }
        Returns: Json
      }
      create_invoice_draft_safe: {
        Args: {
          p_contact_email?: string
          p_contact_name?: string
          p_currency?: string
          p_customer_id?: string
          p_due_date?: string
          p_entity_id: string
          p_entity_type: string
          p_invoice_number?: string
          p_invoice_type?: string
          p_issue_date?: string
          p_lines?: Json
          p_notes?: string
          p_organization_id: string
          p_reference?: string
        }
        Returns: Json
      }
      create_invoice_safe: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_input: Json
          p_organization_id: string
        }
        Returns: Json
      }
      create_job_from_template: {
        Args: {
          p_client_id?: string
          p_company_id?: string
          p_engagement_id?: string
          p_filing_deadline?: string
          p_name?: string
          p_organization_id: string
          p_period_end?: string
          p_period_start?: string
          p_service_id?: string
          p_template_id: string
        }
        Returns: Json
      }
      create_organization_with_owner: {
        Args: { org_name: string }
        Returns: string
      }
      create_questionnaire_public_link: {
        Args: { p_expires_at: string; p_instance_id: string }
        Returns: Json
      }
      create_test_ct600_filing: {
        Args: {
          p_organization_id: string
          p_period_end: string
          p_period_start: string
          p_test_run_key: string
        }
        Returns: Json
      }
      delete_automation_rule_safe: {
        Args: { p_rule_id: string }
        Returns: Json
      }
      disconnect_mailbox_safe: { Args: { p_mailbox_id: string }; Returns: Json }
      emit_automation_event: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_event_type: string
          p_metadata?: Json
          p_new_value?: Json
          p_old_value?: Json
          p_organization_id: string
        }
        Returns: string
      }
      enqueue_unsubscribe_token: {
        Args: { p_category?: string; p_email: string; p_org_id: string }
        Returns: string
      }
      ensure_org_settings: {
        Args: { _org_id: string }
        Returns: {
          automation_max_actions_org_day: number | null
          automation_max_actions_org_hour: number | null
          automation_max_actions_per_rule_day: number | null
          automation_max_actions_per_rule_hour: number | null
          automation_rule_management_mode: string | null
          bill_number_next: number | null
          bill_number_padding: number | null
          bill_number_prefix: string | null
          business_days: string[] | null
          business_hours_end: string | null
          business_hours_start: string | null
          created_at: string | null
          deadline_buffer_days_ct: number | null
          deadline_buffer_days_sa: number | null
          deadline_buffer_days_vat: number | null
          email_default_mode: string | null
          invoice_number_next: number | null
          invoice_number_padding: number | null
          invoice_number_prefix: string | null
          organization_id: string
          shared_mailbox_enabled: boolean | null
          sla_email_response_hours: number | null
          sla_internal_message_hours: number | null
          sla_portal_message_hours: number | null
          sla_task_default_hours: number | null
          sla_task_urgent_hours: number | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "org_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      finalize_workpaper_safe: {
        Args: { p_workpaper_id: string }
        Returns: Json
      }
      find_entities_by_email: {
        Args: { _email: string; _org_id: string }
        Returns: {
          entity_id: string
          entity_name: string
          entity_type: string
          match_source: string
        }[]
      }
      generate_filing_approval_token: {
        Args: { p_filing_id: string }
        Returns: string
      }
      generate_invite_token: { Args: never; Returns: string }
      generate_questionnaire_token: { Args: never; Returns: string }
      generate_quote_number: { Args: { org_id: string }; Returns: string }
      get_active_vat_registration: {
        Args: {
          p_as_of_date?: string
          p_entity_id: string
          p_entity_type: string
        }
        Returns: {
          annual_accounting_joined_at: string | null
          annual_accounting_payment_schedule: string | null
          cash_scheme_joined_at: string | null
          cash_scheme_threshold: number | null
          client_id: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          flat_rate_first_year_discount: boolean | null
          flat_rate_percentage: number | null
          flat_rate_trade_sector: string | null
          id: string
          notes: string | null
          organization_id: string
          partial_exemption_applicable: boolean | null
          partial_exemption_method: string | null
          partial_exemption_rate: number | null
          scheme: string
          updated_at: string
          vrn: string
        }
        SetofOptions: {
          from: "*"
          to: "vat_registrations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_invoice_with_lines_safe: {
        Args: { p_invoice_id: string }
        Returns: Json
      }
      get_org_settings_safe: {
        Args: { p_organization_id: string }
        Returns: {
          automation_max_actions_org_day: number | null
          automation_max_actions_org_hour: number | null
          automation_max_actions_per_rule_day: number | null
          automation_max_actions_per_rule_hour: number | null
          automation_rule_management_mode: string | null
          bill_number_next: number | null
          bill_number_padding: number | null
          bill_number_prefix: string | null
          business_days: string[] | null
          business_hours_end: string | null
          business_hours_start: string | null
          created_at: string | null
          deadline_buffer_days_ct: number | null
          deadline_buffer_days_sa: number | null
          deadline_buffer_days_vat: number | null
          email_default_mode: string | null
          invoice_number_next: number | null
          invoice_number_padding: number | null
          invoice_number_prefix: string | null
          organization_id: string
          shared_mailbox_enabled: boolean | null
          sla_email_response_hours: number | null
          sla_internal_message_hours: number | null
          sla_portal_message_hours: number | null
          sla_task_default_hours: number | null
          sla_task_urgent_hours: number | null
          updated_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "org_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_portal_bank_accounts_for_entity: {
        Args: { _client_id?: string; _company_id?: string; _user_id: string }
        Returns: {
          account_number: string
          connection_status: string
          currency: string
          id: string
          last_synced_at: string
          name: string
          provider: string
          sort_code: string
        }[]
      }
      get_portal_entities_for_current_user: {
        Args: never
        Returns: {
          display_name: string
          entity_id: string
          entity_type: string
          organization_id: string
          registration_number: string
          tax_reference: string
        }[]
      }
      get_portal_entities_for_user: {
        Args: { _user_id: string }
        Returns: {
          display_name: string
          entity_id: string
          entity_type: string
          organization_id: string
          registration_number: string
          tax_reference: string
        }[]
      }
      get_portal_invite_details: { Args: { p_token: string }; Returns: Json }
      get_portal_kpis_for_entity: {
        Args: {
          _client_id?: string
          _company_id?: string
          _period_end?: string
          _period_start?: string
          _user_id: string
        }
        Returns: {
          cash_balance: number
          corporation_tax_estimate: number
          expenses: number
          net_profit: number
          revenue: number
          vat_position: number
        }[]
      }
      get_portal_visibility_for_entity: {
        Args: { _client_id?: string; _company_id?: string; _user_id: string }
        Returns: {
          show_bank_accounts: boolean
          show_cash: boolean
          show_ct_estimate: boolean
          show_detailed_ledger: boolean
          show_invoices: boolean
          show_profit: boolean
          show_receivables_payables: boolean
          show_revenue: boolean
          show_transactions: boolean
          show_trial_balance: boolean
          show_vat_position: boolean
        }[]
      }
      get_questionnaire_by_token: {
        Args: { p_instance_id: string; p_token: string }
        Returns: Json
      }
      get_questionnaire_responses_by_token: {
        Args: { p_instance_id: string; p_token: string }
        Returns: Json
      }
      get_user_organization_id:
        | { Args: never; Returns: string }
        | { Args: { check_user_id: string }; Returns: string }
      get_user_permissions: { Args: { _org_id: string }; Returns: Json }
      get_user_role: {
        Args: { _org_id: string; _user_id: string }
        Returns: string
      }
      has_any_role: {
        Args: { _org_id: string; _roles: string[]; _user_id: string }
        Returns: boolean
      }
      has_organization_role: {
        Args: { _org_id: string; _role: string }
        Returns: boolean
      }
      has_portal_role: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["portal_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _org_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_automation_rate_limit: {
        Args: {
          p_increment?: number
          p_organization_id: string
          p_rule_id: string
        }
        Returns: undefined
      }
      is_period_locked: {
        Args: {
          p_client_id: string
          p_company_id: string
          p_organization_id: string
          p_target_date: string
        }
        Returns: boolean
      }
      issue_invoice_safe: { Args: { p_invoice_id: string }; Returns: Json }
      lifecycle_accept_portal_invitation: {
        Args: { p_token: string }
        Returns: Json
      }
      lifecycle_accept_quote: { Args: { p_quote_id: string }; Returns: Json }
      lifecycle_approve_onboarding: {
        Args: { p_onboarding_id: string }
        Returns: Json
      }
      lifecycle_grant_portal_access: {
        Args: {
          p_email: string
          p_entity_id: string
          p_entity_type: string
          p_role?: string
        }
        Returns: Json
      }
      lifecycle_send_quote: { Args: { p_quote_id: string }; Returns: Json }
      mark_lead_dormant: {
        Args: { p_lead_id: string; p_reason?: string }
        Returns: undefined
      }
      mark_lead_lost: {
        Args: { p_lead_id: string; p_reason?: string }
        Returns: undefined
      }
      override_bill_lock_safe: {
        Args: { p_bill_id: string; p_changes: Json; p_reason: string }
        Returns: Json
      }
      override_invoice_lock_safe: {
        Args: { p_changes: Json; p_invoice_id: string; p_reason: string }
        Returns: Json
      }
      pause_automation: {
        Args: {
          p_expires_at: string
          p_org_id: string
          p_reason: string
          p_rule_id: string
          p_scope: string
          p_target_id: string
        }
        Returns: string
      }
      pause_workflow_instance: {
        Args: { p_instance_id: string; p_reason?: string }
        Returns: undefined
      }
      port_quote_to_client: { Args: { p_quote_id: string }; Returns: string }
      post_to_ledger: {
        Args: {
          p_client_id: string
          p_company_id: string
          p_created_by?: string
          p_currency?: string
          p_description: string
          p_entries?: Json
          p_fx_rate?: number
          p_journal_date: string
          p_journal_type: string
          p_organization_id: string
          p_reference: string
          p_source_id: string
          p_source_type: string
        }
        Returns: Json
      }
      process_questionnaire_submission: {
        Args: { p_questionnaire_instance_id: string }
        Returns: Json
      }
      public_accept_quote_by_token:
        | {
            Args: { p_token: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.public_accept_quote_by_token(p_token => text), public.public_accept_quote_by_token(p_token => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
        | {
            Args: { p_token: string }
            Returns: {
              error: true
            } & "Could not choose the best candidate function between: public.public_accept_quote_by_token(p_token => text), public.public_accept_quote_by_token(p_token => uuid). Try renaming the parameters or the function itself in the database so function overloading can be resolved"
          }
      public_get_quote_by_token: { Args: { p_token: string }; Returns: Json }
      public_reject_quote_by_token:
        | { Args: { p_reason?: string; p_token: string }; Returns: Json }
        | { Args: { p_reason?: string; p_token: string }; Returns: Json }
      queue_email_safe: {
        Args: {
          p_body_html?: string
          p_entity_id?: string
          p_entity_type?: string
          p_merge_data?: Json
          p_organization_id: string
          p_scheduled_at?: string
          p_subject?: string
          p_template_id?: string
          p_to_email: string
          p_to_name?: string
        }
        Returns: Json
      }
      queue_filing_for_submission: {
        Args: { p_filing_id: string; p_filing_type: string; p_user_id: string }
        Returns: Json
      }
      record_automation_audit: {
        Args: {
          p_action: string
          p_after: Json
          p_before: Json
          p_entity_id: string
          p_entity_type: string
          p_metadata?: Json
          p_org_id: string
        }
        Returns: string
      }
      record_automation_execution: {
        Args: {
          p_action_result?: Json
          p_error_message?: string
          p_execution_hash: string
          p_organization_id: string
          p_rule_id: string
          p_status: string
          p_triggered_by_entity: string
          p_triggered_by_id: string
        }
        Returns: string
      }
      record_bill_payment_safe: {
        Args: {
          p_amount: number
          p_bank_account_id?: string
          p_bill_id: string
          p_payment_date: string
          p_payment_method?: string
          p_reference?: string
        }
        Returns: Json
      }
      record_invoice_payment_safe: {
        Args: {
          p_amount: number
          p_bank_account_id?: string
          p_invoice_id: string
          p_payment_date: string
          p_payment_method?: string
          p_reference?: string
        }
        Returns: Json
      }
      record_kyc_subject_progress: {
        Args: { p_new_status: string; p_notes?: string; p_subject_id: string }
        Returns: undefined
      }
      regress_filing_status: {
        Args: { p_filing_id: string; p_reason: string }
        Returns: undefined
      }
      reissue_quote: { Args: { p_quote_id: string }; Returns: string }
      resolve_engagement_letter_variant: {
        Args: {
          p_client_type: string
          p_engagement_kind: string
          p_legal_entity: string
          p_organization_id: string
          p_service_code: string
        }
        Returns: string
      }
      resume_automation: { Args: { p_pause_id: string }; Returns: boolean }
      resume_workflow_instance: {
        Args: { p_instance_id: string }
        Returns: undefined
      }
      retry_failed_email_safe: { Args: { p_email_id: string }; Returns: Json }
      reverse_bill_payment_safe: {
        Args: { p_payment_id: string; p_reason: string }
        Returns: Json
      }
      reverse_invoice_payment_safe: {
        Args: { p_payment_id: string; p_reason: string }
        Returns: Json
      }
      reverse_journal: {
        Args: {
          p_journal_id: string
          p_reason?: string
          p_reversal_date: string
        }
        Returns: Json
      }
      revoke_approval_with_audit: {
        Args: {
          p_approval_id: string
          p_metadata?: Json
          p_new_snapshot_hash: string
          p_new_snapshot_id: string
          p_old_snapshot_hash: string
          p_old_snapshot_id: string
          p_revocation_reason: string
        }
        Returns: undefined
      }
      role_level: { Args: { r: string }; Returns: number }
      save_questionnaire_answer_by_token: {
        Args: {
          p_answer_array?: string[]
          p_answer_boolean?: boolean
          p_answer_date?: string
          p_answer_number?: number
          p_answer_text?: string
          p_instance_id: string
          p_question_id: string
          p_token: string
        }
        Returns: Json
      }
      seed_default_chart_of_accounts: {
        Args: {
          p_client_id?: string
          p_company_id?: string
          p_organization_id: string
        }
        Returns: undefined
      }
      seed_default_vat_codes: {
        Args: { p_organization_id: string }
        Returns: undefined
      }
      seed_org_automation_defaults: {
        Args: { p_dry_run?: boolean; p_org_id: string }
        Returns: Json
      }
      send_onboarding_questionnaire: {
        Args: { p_onboarding_id: string; p_template_id: string }
        Returns: Json
      }
      start_kyc_pack: {
        Args: { p_client_id: string; p_subjects?: Json }
        Returns: string
      }
      submit_filing_safe: { Args: { p_filing_id: string }; Returns: Json }
      submit_questionnaire_by_token: {
        Args: { p_instance_id: string; p_token: string }
        Returns: Json
      }
      toggle_automation_rule_safe: {
        Args: { p_is_active: boolean; p_rule_id: string }
        Returns: Json
      }
      trigger_records_request: { Args: { p_job_id: string }; Returns: Json }
      try_parse_numeric: { Args: { val: string }; Returns: number }
      update_automation_rule_safe: {
        Args: {
          p_action_config?: Json
          p_action_type?: string
          p_email_mode?: string
          p_is_active?: boolean
          p_name?: string
          p_rule_id: string
          p_trigger_config?: Json
          p_trigger_type?: string
        }
        Returns: Json
      }
      update_bill_draft_safe: {
        Args: {
          p_bill_id: string
          p_bill_number?: string
          p_due_date?: string
          p_issue_date?: string
          p_lines?: Json
          p_notes?: string
          p_reference?: string
          p_supplier_id?: string
        }
        Returns: Json
      }
      update_deadline_safe: {
        Args: { p_deadline_id: string; p_updates: Json }
        Returns: Json
      }
      update_invoice_draft_safe: {
        Args: {
          p_contact_email?: string
          p_contact_name?: string
          p_customer_id?: string
          p_due_date?: string
          p_invoice_id: string
          p_issue_date?: string
          p_lines?: Json
          p_reference?: string
        }
        Returns: Json
      }
      update_issued_invoice_safe: {
        Args: { p_invoice_id: string; p_reason?: string; p_updates: Json }
        Returns: Json
      }
      update_job_status_safe: {
        Args: { p_job_id: string; p_new_status: string; p_reason?: string }
        Returns: Json
      }
      update_queued_email_safe: {
        Args: {
          p_body_html?: string
          p_email_id: string
          p_scheduled_at?: string
          p_subject?: string
          p_to_email?: string
        }
        Returns: Json
      }
      update_user_role_safe: {
        Args: { p_new_role: string; p_org_id: string; p_target_user_id: string }
        Returns: Json
      }
      user_has_org_role: {
        Args: {
          check_org_id: string
          check_user_id: string
          required_role: string
        }
        Returns: boolean
      }
      user_has_organization_access: {
        Args: { org_id: string }
        Returns: boolean
      }
      user_has_role_at_least: {
        Args: { _min_role: string; _org_id: string; _user_id: string }
        Returns: boolean
      }
      user_in_organization: {
        Args: { check_org_id: string; check_user_id: string }
        Returns: boolean
      }
      user_role_is_at_least: {
        Args: { check_org_id: string; check_user_id: string; min_role: string }
        Returns: boolean
      }
      validate_filing_approval_token: {
        Args: { p_token: string }
        Returns: {
          error_message: string
          filing_id: string
          is_valid: boolean
        }[]
      }
      validate_filing_submission: {
        Args: { p_filing_id: string; p_filing_type: string; p_user_id: string }
        Returns: Json
      }
      validate_submission_integrity: {
        Args: { p_filing_id: string; p_filing_type: string }
        Returns: Json
      }
      validate_template: {
        Args: { p_context?: Json; p_template_id: string }
        Returns: Json
      }
      verify_aml: { Args: { p_onboarding_id: string }; Returns: Json }
      void_bill_safe: {
        Args: { p_bill_id: string; p_reason: string }
        Returns: Json
      }
      void_invoice_safe: {
        Args: { p_invoice_id: string; p_reason: string }
        Returns: Json
      }
      write_audit_log: {
        Args: {
          p_action: string
          p_after_state?: Json
          p_before_state?: Json
          p_entity_id: string
          p_entity_type: string
          p_field_name?: string
          p_metadata?: Json
          p_new_value?: string
          p_old_value?: string
          p_org_id: string
        }
        Returns: string
      }
    }
    Enums: {
      accountant_client_link_status:
        | "pending_client_approval"
        | "pending_practice_approval"
        | "active"
        | "declined"
        | "revoked_by_client"
        | "revoked_by_practice"
        | "switched_out"
      app_role: "owner" | "admin" | "manager" | "staff" | "viewer"
      billing_status_enum:
        | "pending_payment"
        | "active"
        | "past_due"
        | "canceled"
      email_direction: "inbound" | "outbound"
      email_match_type: "auto" | "manual"
      link_initiator: "client" | "practice"
      mailbox_provider: "gmail" | "outlook"
      mailbox_status: "active" | "expired" | "revoked" | "error"
      portal_role: "accountant" | "client"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      accountant_client_link_status: [
        "pending_client_approval",
        "pending_practice_approval",
        "active",
        "declined",
        "revoked_by_client",
        "revoked_by_practice",
        "switched_out",
      ],
      app_role: ["owner", "admin", "manager", "staff", "viewer"],
      billing_status_enum: [
        "pending_payment",
        "active",
        "past_due",
        "canceled",
      ],
      email_direction: ["inbound", "outbound"],
      email_match_type: ["auto", "manual"],
      link_initiator: ["client", "practice"],
      mailbox_provider: ["gmail", "outlook"],
      mailbox_status: ["active", "expired", "revoked", "error"],
      portal_role: ["accountant", "client"],
    },
  },
} as const
