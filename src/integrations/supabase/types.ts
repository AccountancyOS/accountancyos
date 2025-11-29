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
      automation_rules: {
        Row: {
          action_config: Json
          action_type: string
          created_at: string
          id: string
          is_active: boolean | null
          name: string
          organization_id: string
          template_id: string | null
          trigger_config: Json | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          action_config?: Json
          action_type: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          name: string
          organization_id: string
          template_id?: string | null
          trigger_config?: Json | null
          trigger_type: string
          updated_at?: string
        }
        Update: {
          action_config?: Json
          action_type?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string
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
      bank_accounts: {
        Row: {
          account_id: string
          client_id: string | null
          company_id: string | null
          created_at: string | null
          currency: string
          external_identifier: string | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          account_id: string
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string
          external_identifier?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          account_id?: string
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          currency?: string
          external_identifier?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string
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
      bank_transactions: {
        Row: {
          amount: number
          balance: number | null
          bank_account_id: string
          client_id: string | null
          company_id: string | null
          created_at: string | null
          description: string
          id: string
          import_batch_id: string | null
          import_source: string | null
          matched_ledger_entry_id: string | null
          organization_id: string
          rule_id: string | null
          status: string
          transaction_date: string
        }
        Insert: {
          amount: number
          balance?: number | null
          bank_account_id: string
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          description: string
          id?: string
          import_batch_id?: string | null
          import_source?: string | null
          matched_ledger_entry_id?: string | null
          organization_id: string
          rule_id?: string | null
          status?: string
          transaction_date: string
        }
        Update: {
          amount?: number
          balance?: number | null
          bank_account_id?: string
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          description?: string
          id?: string
          import_batch_id?: string | null
          import_source?: string | null
          matched_ledger_entry_id?: string | null
          organization_id?: string
          rule_id?: string | null
          status?: string
          transaction_date?: string
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
      bookkeeping_accounts: {
        Row: {
          account_subtype: string | null
          account_type: string
          client_id: string | null
          code: string
          company_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          is_bank_account: boolean | null
          is_control_account: boolean | null
          is_revenue_account: boolean | null
          is_system_account: boolean | null
          name: string
          organization_id: string
          tax_mapping: Json | null
          updated_at: string | null
        }
        Insert: {
          account_subtype?: string | null
          account_type: string
          client_id?: string | null
          code: string
          company_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_bank_account?: boolean | null
          is_control_account?: boolean | null
          is_revenue_account?: boolean | null
          is_system_account?: boolean | null
          name: string
          organization_id: string
          tax_mapping?: Json | null
          updated_at?: string | null
        }
        Update: {
          account_subtype?: string | null
          account_type?: string
          client_id?: string | null
          code?: string
          company_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_bank_account?: boolean | null
          is_control_account?: boolean | null
          is_revenue_account?: boolean | null
          is_system_account?: boolean | null
          name?: string
          organization_id?: string
          tax_mapping?: Json | null
          updated_at?: string | null
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
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          organization_id: string
          status: string
          task_order: number | null
          template_id: string | null
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          assigned_to?: string | null
          client_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          organization_id: string
          status?: string
          task_order?: number | null
          template_id?: string | null
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          assigned_to?: string | null
          client_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          organization_id?: string
          status?: string
          task_order?: number | null
          template_id?: string | null
          title?: string
          updated_at?: string
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
      clients: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          city: string | null
          country: string | null
          created_at: string
          date_of_birth: string | null
          email: string
          first_name: string
          id: string
          last_name: string
          national_insurance_number: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          postcode: string | null
          tags: Json | null
          updated_at: string
          utr: string | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          email: string
          first_name: string
          id?: string
          last_name: string
          national_insurance_number?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          postcode?: string | null
          tags?: Json | null
          updated_at?: string
          utr?: string | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          national_insurance_number?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          postcode?: string | null
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
          address_line_1: string | null
          address_line_2: string | null
          city: string | null
          company_name: string
          company_number: string | null
          country: string | null
          created_at: string
          email: string
          id: string
          incorporation_date: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          postcode: string | null
          tags: Json | null
          updated_at: string
          vat_frequency: string | null
          vat_number: string | null
          vat_scheme: string | null
          vat_stagger_group: number | null
          year_end_day: number | null
          year_end_month: number | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          company_name: string
          company_number?: string | null
          country?: string | null
          created_at?: string
          email: string
          id?: string
          incorporation_date?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          postcode?: string | null
          tags?: Json | null
          updated_at?: string
          vat_frequency?: string | null
          vat_number?: string | null
          vat_scheme?: string | null
          vat_stagger_group?: number | null
          year_end_day?: number | null
          year_end_month?: number | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          city?: string | null
          company_name?: string
          company_number?: string | null
          country?: string | null
          created_at?: string
          email?: string
          id?: string
          incorporation_date?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          postcode?: string | null
          tags?: Json | null
          updated_at?: string
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
        ]
      }
      email_queue: {
        Row: {
          body_html: string | null
          body_text: string | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          error_message: string | null
          id: string
          merge_data: Json | null
          organization_id: string
          retry_count: number | null
          scheduled_at: string | null
          sent_at: string | null
          status: string | null
          subject: string
          template_id: string | null
          to_email: string
          to_name: string | null
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error_message?: string | null
          id?: string
          merge_data?: Json | null
          organization_id: string
          retry_count?: number | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string | null
          subject: string
          template_id?: string | null
          to_email: string
          to_name?: string | null
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          error_message?: string | null
          id?: string
          merge_data?: Json | null
          organization_id?: string
          retry_count?: number | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string
          template_id?: string | null
          to_email?: string
          to_name?: string | null
        }
        Relationships: [
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
        ]
      }
      engagements: {
        Row: {
          active: boolean | null
          billing_notes: string | null
          client_id: string | null
          company_id: string | null
          created_at: string
          end_date: string | null
          frequency: string
          id: string
          organization_id: string
          quote_id: string | null
          service_config: Json | null
          service_id: string
          start_date: string
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          billing_notes?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          end_date?: string | null
          frequency: string
          id?: string
          organization_id: string
          quote_id?: string | null
          service_config?: Json | null
          service_id: string
          start_date: string
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          billing_notes?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          end_date?: string | null
          frequency?: string
          id?: string
          organization_id?: string
          quote_id?: string | null
          service_config?: Json | null
          service_id?: string
          start_date?: string
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
      filings: {
        Row: {
          approval_requested_at: string | null
          approved_at: string | null
          approved_by: string | null
          client_id: string | null
          company_id: string | null
          created_at: string | null
          filed_at: string | null
          filed_by: string | null
          filing_body: string
          filing_data: Json
          filing_receipt: Json | null
          filing_reference: string | null
          filing_type: string
          generated_documents: Json | null
          id: string
          is_locked: boolean | null
          job_id: string
          organization_id: string
          payment_deadline: string | null
          period_end: string | null
          period_start: string | null
          rejection_reason: string | null
          second_payment_date: string | null
          status: string
          tax_due: number | null
          tax_refund: number | null
          tax_year: string | null
          updated_at: string | null
          workpaper_instance_id: string | null
        }
        Insert: {
          approval_requested_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          filed_at?: string | null
          filed_by?: string | null
          filing_body: string
          filing_data?: Json
          filing_receipt?: Json | null
          filing_reference?: string | null
          filing_type: string
          generated_documents?: Json | null
          id?: string
          is_locked?: boolean | null
          job_id: string
          organization_id: string
          payment_deadline?: string | null
          period_end?: string | null
          period_start?: string | null
          rejection_reason?: string | null
          second_payment_date?: string | null
          status?: string
          tax_due?: number | null
          tax_refund?: number | null
          tax_year?: string | null
          updated_at?: string | null
          workpaper_instance_id?: string | null
        }
        Update: {
          approval_requested_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          filed_at?: string | null
          filed_by?: string | null
          filing_body?: string
          filing_data?: Json
          filing_receipt?: Json | null
          filing_reference?: string | null
          filing_type?: string
          generated_documents?: Json | null
          id?: string
          is_locked?: boolean | null
          job_id?: string
          organization_id?: string
          payment_deadline?: string | null
          period_end?: string | null
          period_start?: string | null
          rejection_reason?: string | null
          second_payment_date?: string | null
          status?: string
          tax_due?: number | null
          tax_refund?: number | null
          tax_year?: string | null
          updated_at?: string | null
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
            foreignKeyName: "filings_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
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
            foreignKeyName: "filings_workpaper_instance_id_fkey"
            columns: ["workpaper_instance_id"]
            isOneToOne: false
            referencedRelation: "workpaper_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          account_id: string
          created_at: string | null
          description: string
          gross_amount: number
          id: string
          invoice_id: string
          line_number: number
          net_amount: number
          quantity: number
          unit_price: number
          vat_amount: number
          vat_code_id: string | null
          vat_rate: number
        }
        Insert: {
          account_id: string
          created_at?: string | null
          description: string
          gross_amount: number
          id?: string
          invoice_id: string
          line_number: number
          net_amount: number
          quantity?: number
          unit_price: number
          vat_amount?: number
          vat_code_id?: string | null
          vat_rate?: number
        }
        Update: {
          account_id?: string
          created_at?: string | null
          description?: string
          gross_amount?: number
          id?: string
          invoice_id?: string
          line_number?: number
          net_amount?: number
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
          reference: string | null
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
          reference?: string | null
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
          reference?: string | null
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
          document_id: string | null
          due_date: string
          id: string
          invoice_number: string | null
          invoice_type: string
          is_posted: boolean | null
          issue_date: string
          notes: string | null
          organization_id: string
          posted_at: string | null
          posted_by: string | null
          reference: string | null
          status: string
          total_gross: number
          total_net: number
          total_vat: number
          updated_at: string | null
        }
        Insert: {
          amount_paid?: number
          client_id?: string | null
          company_id?: string | null
          contact_address?: string | null
          contact_email?: string | null
          contact_name: string
          created_at?: string | null
          document_id?: string | null
          due_date: string
          id?: string
          invoice_number?: string | null
          invoice_type: string
          is_posted?: boolean | null
          issue_date: string
          notes?: string | null
          organization_id: string
          posted_at?: string | null
          posted_by?: string | null
          reference?: string | null
          status?: string
          total_gross?: number
          total_net?: number
          total_vat?: number
          updated_at?: string | null
        }
        Update: {
          amount_paid?: number
          client_id?: string | null
          company_id?: string | null
          contact_address?: string | null
          contact_email?: string | null
          contact_name?: string
          created_at?: string | null
          document_id?: string | null
          due_date?: string
          id?: string
          invoice_number?: string | null
          invoice_type?: string
          is_posted?: boolean | null
          issue_date?: string
          notes?: string | null
          organization_id?: string
          posted_at?: string | null
          posted_by?: string | null
          reference?: string | null
          status?: string
          total_gross?: number
          total_net?: number
          total_vat?: number
          updated_at?: string | null
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
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          job_id: string
          mime_type: string | null
          organization_id: string
          tags: Json | null
          task_id: string | null
          uploaded_at: string
          uploaded_by: string | null
          version: number | null
        }
        Insert: {
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          job_id: string
          mime_type?: string | null
          organization_id: string
          tags?: Json | null
          task_id?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
          version?: number | null
        }
        Update: {
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          job_id?: string
          mime_type?: string | null
          organization_id?: string
          tags?: Json | null
          task_id?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
          version?: number | null
        }
        Relationships: [
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
      job_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          dependencies: Json | null
          description: string | null
          due_date: string | null
          id: string
          job_id: string
          organization_id: string
          stage: string | null
          status: string
          task_order: number | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          dependencies?: Json | null
          description?: string | null
          due_date?: string | null
          id?: string
          job_id: string
          organization_id: string
          stage?: string | null
          status?: string
          task_order?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          dependencies?: Json | null
          description?: string | null
          due_date?: string | null
          id?: string
          job_id?: string
          organization_id?: string
          stage?: string | null
          status?: string
          task_order?: number | null
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
          created_at: string
          default_priority: string | null
          default_status: string | null
          default_tags: Json | null
          id: string
          is_active: boolean | null
          organization_id: string
          recurrence_config: Json | null
          service_type: string
          tasks: Json
          template_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_priority?: string | null
          default_status?: string | null
          default_tags?: Json | null
          id?: string
          is_active?: boolean | null
          organization_id: string
          recurrence_config?: Json | null
          service_type: string
          tasks?: Json
          template_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_priority?: string | null
          default_status?: string | null
          default_tags?: Json | null
          id?: string
          is_active?: boolean | null
          organization_id?: string
          recurrence_config?: Json | null
          service_type?: string
          tasks?: Json
          template_name?: string
          updated_at?: string
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
      jobs: {
        Row: {
          assigned_to: string | null
          automation_source: string | null
          client_id: string | null
          company_id: string | null
          completed_at: string | null
          created_at: string
          filing_deadline: string | null
          id: string
          internal_target_date: string | null
          is_recurring: boolean | null
          job_name: string
          last_activity_at: string | null
          organization_id: string
          period_end: string | null
          period_label: string | null
          period_start: string | null
          priority: string
          progress: number | null
          recurrence_rule: Json | null
          service_type: string
          status: string
          tags: Json | null
          template_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          automation_source?: string | null
          client_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          filing_deadline?: string | null
          id?: string
          internal_target_date?: string | null
          is_recurring?: boolean | null
          job_name: string
          last_activity_at?: string | null
          organization_id: string
          period_end?: string | null
          period_label?: string | null
          period_start?: string | null
          priority?: string
          progress?: number | null
          recurrence_rule?: Json | null
          service_type: string
          status?: string
          tags?: Json | null
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          automation_source?: string | null
          client_id?: string | null
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          filing_deadline?: string | null
          id?: string
          internal_target_date?: string | null
          is_recurring?: boolean | null
          job_name?: string
          last_activity_at?: string | null
          organization_id?: string
          period_end?: string | null
          period_label?: string | null
          period_start?: string | null
          priority?: string
          progress?: number | null
          recurrence_rule?: Json | null
          service_type?: string
          status?: string
          tags?: Json | null
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
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
          id: string
          is_posted: boolean | null
          is_reversed: boolean | null
          journal_date: string
          journal_type: string
          organization_id: string
          posted_at: string | null
          reference: string | null
          reverse_date: string | null
          reverses_journal_id: string | null
          total_credit: number | null
          total_debit: number | null
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description: string
          id?: string
          is_posted?: boolean | null
          is_reversed?: boolean | null
          journal_date: string
          journal_type?: string
          organization_id: string
          posted_at?: string | null
          reference?: string | null
          reverse_date?: string | null
          reverses_journal_id?: string | null
          total_credit?: number | null
          total_debit?: number | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string
          id?: string
          is_posted?: boolean | null
          is_reversed?: boolean | null
          journal_date?: string
          journal_type?: string
          organization_id?: string
          posted_at?: string | null
          reference?: string | null
          reverse_date?: string | null
          reverses_journal_id?: string | null
          total_credit?: number | null
          total_debit?: number | null
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
      leads: {
        Row: {
          assigned_to: string | null
          created_at: string
          email: string
          estimated_monthly_value: number | null
          first_name: string
          id: string
          last_name: string
          notes: string | null
          organization_id: string
          phone: string | null
          pipeline_stage: string
          source: string | null
          tags: Json | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          email: string
          estimated_monthly_value?: number | null
          first_name: string
          id?: string
          last_name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          pipeline_stage?: string
          source?: string | null
          tags?: Json | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          email?: string
          estimated_monthly_value?: number | null
          first_name?: string
          id?: string
          last_name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          pipeline_stage?: string
          source?: string | null
          tags?: Json | null
          updated_at?: string
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
          client_id: string | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          credit: number | null
          debit: number | null
          description: string | null
          document_id: string | null
          id: string
          is_locked: boolean | null
          organization_id: string
          source_id: string | null
          source_type: string
          transaction_date: string
          updated_at: string | null
          updated_by: string | null
          vat_code_id: string | null
        }
        Insert: {
          account_id: string
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          credit?: number | null
          debit?: number | null
          description?: string | null
          document_id?: string | null
          id?: string
          is_locked?: boolean | null
          organization_id: string
          source_id?: string | null
          source_type: string
          transaction_date: string
          updated_at?: string | null
          updated_by?: string | null
          vat_code_id?: string | null
        }
        Update: {
          account_id?: string
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          credit?: number | null
          debit?: number | null
          description?: string | null
          document_id?: string | null
          id?: string
          is_locked?: boolean | null
          organization_id?: string
          source_id?: string | null
          source_type?: string
          transaction_date?: string
          updated_at?: string | null
          updated_by?: string | null
          vat_code_id?: string | null
        }
        Relationships: [
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
      message_templates: {
        Row: {
          body: string
          channel: string
          created_at: string
          id: string
          name: string
          organization_id: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          body: string
          channel: string
          created_at?: string
          id?: string
          name: string
          organization_id: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
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
          aml_notes: string | null
          aml_status: string | null
          aml_verified_at: string | null
          application_type: string
          approved_at: string | null
          approved_by: string | null
          city: string | null
          client_id: string | null
          company_id: string | null
          company_name: string | null
          company_number: string | null
          country: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          first_name: string | null
          id: string
          id_document_uploaded: boolean | null
          incorporation_date: string | null
          last_name: string | null
          lead_id: string | null
          national_insurance_number: string | null
          organization_id: string
          phone: string | null
          postcode: string | null
          proof_of_address_uploaded: boolean | null
          quote_id: string | null
          rejection_reason: string | null
          status: string
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          additional_documents_uploaded?: boolean | null
          address_line_1?: string | null
          address_line_2?: string | null
          aml_notes?: string | null
          aml_status?: string | null
          aml_verified_at?: string | null
          application_type: string
          approved_at?: string | null
          approved_by?: string | null
          city?: string | null
          client_id?: string | null
          company_id?: string | null
          company_name?: string | null
          company_number?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          id_document_uploaded?: boolean | null
          incorporation_date?: string | null
          last_name?: string | null
          lead_id?: string | null
          national_insurance_number?: string | null
          organization_id: string
          phone?: string | null
          postcode?: string | null
          proof_of_address_uploaded?: boolean | null
          quote_id?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          additional_documents_uploaded?: boolean | null
          address_line_1?: string | null
          address_line_2?: string | null
          aml_notes?: string | null
          aml_status?: string | null
          aml_verified_at?: string | null
          application_type?: string
          approved_at?: string | null
          approved_by?: string | null
          city?: string | null
          client_id?: string | null
          company_id?: string | null
          company_name?: string | null
          company_number?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          id_document_uploaded?: boolean | null
          incorporation_date?: string | null
          last_name?: string | null
          lead_id?: string | null
          national_insurance_number?: string | null
          organization_id?: string
          phone?: string | null
          postcode?: string | null
          proof_of_address_uploaded?: boolean | null
          quote_id?: string | null
          rejection_reason?: string | null
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
          postcode: string | null
          practice_description: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          timezone: string | null
          updated_at: string
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
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
          postcode?: string | null
          practice_description?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
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
          postcode?: string | null
          practice_description?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
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
          client_id: string | null
          company_id: string | null
          created_at: string
          id: string
          is_active: boolean | null
          organization_id: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          organization_id: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          organization_id?: string
          user_id?: string
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
          show_cash: boolean | null
          show_ct_estimate: boolean | null
          show_profit: boolean | null
          show_receivables_payables: boolean | null
          show_revenue: boolean | null
          show_transactions: boolean | null
          show_vat_position: boolean | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          organization_id: string
          show_cash?: boolean | null
          show_ct_estimate?: boolean | null
          show_profit?: boolean | null
          show_receivables_payables?: boolean | null
          show_revenue?: boolean | null
          show_transactions?: boolean | null
          show_vat_position?: boolean | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          show_cash?: boolean | null
          show_ct_estimate?: boolean | null
          show_profit?: boolean | null
          show_receivables_payables?: boolean | null
          show_revenue?: boolean | null
          show_transactions?: boolean | null
          show_vat_position?: boolean | null
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
          quote_number: string
          status: string
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
          quote_number: string
          status?: string
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
          quote_number?: string
          status?: string
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
      services_catalog: {
        Row: {
          active: boolean | null
          billing_model: string
          code: string
          created_at: string
          default_price: number
          description: string | null
          id: string
          is_bookkeeping_related: boolean | null
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean | null
          billing_model: string
          code: string
          created_at?: string
          default_price: number
          description?: string | null
          id?: string
          is_bookkeeping_related?: boolean | null
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean | null
          billing_model?: string
          code?: string
          created_at?: string
          default_price?: number
          description?: string | null
          id?: string
          is_bookkeeping_related?: boolean | null
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_catalog_organization_id_fkey"
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
          template_id: string
          version_number: number
        }
        Insert: {
          change_notes?: string | null
          content: Json
          created_at?: string
          created_by?: string | null
          id?: string
          template_id: string
          version_number: number
        }
        Update: {
          change_notes?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          template_id?: string
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
          name: string
          organization_id: string
          service: string | null
          status: string
          tags: Json | null
          type: string
          updated_at: string
          version_number: number
        }
        Insert: {
          content?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          service?: string | null
          status?: string
          tags?: Json | null
          type: string
          updated_at?: string
          version_number?: number
        }
        Update: {
          content?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          service?: string | null
          status?: string
          tags?: Json | null
          type?: string
          updated_at?: string
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
      vat_codes: {
        Row: {
          client_id: string | null
          code: string
          company_id: string | null
          created_at: string | null
          description: string
          id: string
          is_active: boolean | null
          organization_id: string
          rate: number
          updated_at: string | null
          vat_type: string
        }
        Insert: {
          client_id?: string | null
          code: string
          company_id?: string | null
          created_at?: string | null
          description: string
          id?: string
          is_active?: boolean | null
          organization_id: string
          rate: number
          updated_at?: string | null
          vat_type: string
        }
        Update: {
          client_id?: string | null
          code?: string
          company_id?: string | null
          created_at?: string | null
          description?: string
          id?: string
          is_active?: boolean | null
          organization_id?: string
          rate?: number
          updated_at?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_deadline: {
        Args: {
          filing_type: string
          metadata?: Json
          period_end: string
          period_start: string
        }
        Returns: string
      }
      can_finalise: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      client_has_portal_access: {
        Args: {
          check_client_id?: string
          check_company_id?: string
          check_user_id: string
        }
        Returns: boolean
      }
      create_organization_with_owner: {
        Args: { org_name: string }
        Returns: string
      }
      generate_questionnaire_token: { Args: never; Returns: string }
      generate_quote_number: { Args: { org_id: string }; Returns: string }
      get_user_organization_id:
        | { Args: { check_user_id: string }; Returns: string }
        | { Args: never; Returns: string }
      has_organization_role: {
        Args: { required_role: string }
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
      user_in_organization: {
        Args: { check_org_id: string; check_user_id: string }
        Returns: boolean
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
      link_initiator: "client" | "practice"
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
      link_initiator: ["client", "practice"],
      portal_role: ["accountant", "client"],
    },
  },
} as const
