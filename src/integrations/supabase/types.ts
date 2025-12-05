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
      audit_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string
          entity_type: string
          field_name: string | null
          id: string
          metadata: Json | null
          new_value: string | null
          old_value: string | null
          organization_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id: string
          entity_type: string
          field_name?: string | null
          id?: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          organization_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          field_name?: string | null
          id?: string
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          organization_id?: string
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
          created_at: string | null
          description: string | null
          gross_amount: number | null
          id: string
          line_number: number
          net_amount: number | null
          quantity: number | null
          unit_price: number | null
          vat_amount: number | null
          vat_code_id: string | null
          vat_rate: number | null
        }
        Insert: {
          account_id?: string | null
          bill_id: string
          created_at?: string | null
          description?: string | null
          gross_amount?: number | null
          id?: string
          line_number?: number
          net_amount?: number | null
          quantity?: number | null
          unit_price?: number | null
          vat_amount?: number | null
          vat_code_id?: string | null
          vat_rate?: number | null
        }
        Update: {
          account_id?: string | null
          bill_id?: string
          created_at?: string | null
          description?: string | null
          gross_amount?: number | null
          id?: string
          line_number?: number
          net_amount?: number | null
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
          notes: string | null
          organization_id: string
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
        }
        Insert: {
          amount_paid?: number | null
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
          notes?: string | null
          organization_id: string
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
        }
        Update: {
          amount_paid?: number | null
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
          notes?: string | null
          organization_id?: string
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
          activated_at: string | null
          address_line_1: string | null
          address_line_2: string | null
          aml_expiry_date: string | null
          aml_verified_at: string | null
          aml_verified_by: string | null
          archived_at: string | null
          city: string | null
          country: string | null
          created_at: string
          date_of_birth: string | null
          disengaged_at: string | null
          email: string
          first_name: string
          id: string
          last_name: string
          national_insurance_number: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          postcode: string | null
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
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          disengaged_at?: string | null
          email: string
          first_name: string
          id?: string
          last_name: string
          national_insurance_number?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          postcode?: string | null
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
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          disengaged_at?: string | null
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          national_insurance_number?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          postcode?: string | null
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
          ch_company_profile: Json | null
          ch_last_synced_at: string | null
          city: string | null
          company_name: string
          company_number: string | null
          company_type: string | null
          confirmation_statement_made_up_to: string | null
          confirmation_statement_next_due: string | null
          country: string | null
          created_at: string
          disengaged_at: string | null
          email: string
          id: string
          incorporation_date: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          postcode: string | null
          registered_office_address: Json | null
          sic_codes: Json | null
          status: string
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
          activated_at?: string | null
          address_line_1?: string | null
          address_line_2?: string | null
          aml_expiry_date?: string | null
          aml_verified_at?: string | null
          aml_verified_by?: string | null
          archived_at?: string | null
          ch_company_profile?: Json | null
          ch_last_synced_at?: string | null
          city?: string | null
          company_name: string
          company_number?: string | null
          company_type?: string | null
          confirmation_statement_made_up_to?: string | null
          confirmation_statement_next_due?: string | null
          country?: string | null
          created_at?: string
          disengaged_at?: string | null
          email: string
          id?: string
          incorporation_date?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          postcode?: string | null
          registered_office_address?: Json | null
          sic_codes?: Json | null
          status?: string
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
          activated_at?: string | null
          address_line_1?: string | null
          address_line_2?: string | null
          aml_expiry_date?: string | null
          aml_verified_at?: string | null
          aml_verified_by?: string | null
          archived_at?: string | null
          ch_company_profile?: Json | null
          ch_last_synced_at?: string | null
          city?: string | null
          company_name?: string
          company_number?: string | null
          company_type?: string | null
          confirmation_statement_made_up_to?: string | null
          confirmation_statement_next_due?: string | null
          country?: string | null
          created_at?: string
          disengaged_at?: string | null
          email?: string
          id?: string
          incorporation_date?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          postcode?: string | null
          registered_office_address?: Json | null
          sic_codes?: Json | null
          status?: string
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
          client_id: string | null
          company_id: string | null
          created_at: string | null
          email: string
          id: string
          is_primary: boolean | null
          name: string
          organization_id: string
          phone: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          email: string
          id?: string
          is_primary?: boolean | null
          name: string
          organization_id: string
          phone?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          company_id?: string | null
          created_at?: string | null
          email?: string
          id?: string
          is_primary?: boolean | null
          name?: string
          organization_id?: string
          phone?: string | null
          role?: string | null
          updated_at?: string | null
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
        ]
      }
      email_queue: {
        Row: {
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
          mailbox_id: string | null
          merge_data: Json | null
          organization_id: string
          provider: string | null
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
          mailbox_id?: string | null
          merge_data?: Json | null
          organization_id: string
          provider?: string | null
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
          mailbox_id?: string | null
          merge_data?: Json | null
          organization_id?: string
          provider?: string | null
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
      filings: {
        Row: {
          api_response: Json | null
          api_submission_id: string | null
          approval_requested_at: string | null
          approval_token: string | null
          approval_token_expires_at: string | null
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
          next_year_job_id: string | null
          organization_id: string
          payment_deadline: string | null
          period_end: string | null
          period_start: string | null
          rejection_reason: string | null
          second_payment_date: string | null
          status: string
          submission_payload: Json | null
          tax_due: number | null
          tax_refund: number | null
          tax_year: string | null
          updated_at: string | null
          workpaper_instance_id: string | null
        }
        Insert: {
          api_response?: Json | null
          api_submission_id?: string | null
          approval_requested_at?: string | null
          approval_token?: string | null
          approval_token_expires_at?: string | null
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
          next_year_job_id?: string | null
          organization_id: string
          payment_deadline?: string | null
          period_end?: string | null
          period_start?: string | null
          rejection_reason?: string | null
          second_payment_date?: string | null
          status?: string
          submission_payload?: Json | null
          tax_due?: number | null
          tax_refund?: number | null
          tax_year?: string | null
          updated_at?: string | null
          workpaper_instance_id?: string | null
        }
        Update: {
          api_response?: Json | null
          api_submission_id?: string | null
          approval_requested_at?: string | null
          approval_token?: string | null
          approval_token_expires_at?: string | null
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
          next_year_job_id?: string | null
          organization_id?: string
          payment_deadline?: string | null
          period_end?: string | null
          period_start?: string | null
          rejection_reason?: string | null
          second_payment_date?: string | null
          status?: string
          submission_payload?: Json | null
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
            foreignKeyName: "filings_next_year_job_id_fkey"
            columns: ["next_year_job_id"]
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
          notes: string | null
          organization_id: string
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
          notes?: string | null
          organization_id: string
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
          notes?: string | null
          organization_id?: string
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
          job_id: string
          organization_id: string
          relative_due_days: number | null
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
          job_id: string
          organization_id: string
          relative_due_days?: number | null
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
          job_id?: string
          organization_id?: string
          relative_due_days?: number | null
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
          info_received_at: string | null
          info_requested_at: string | null
          internal_target_date: string | null
          is_auto_generated: boolean | null
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
          source_job_id: string | null
          source_template_id: string | null
          status: string
          tags: Json | null
          template_id: string | null
          updated_at: string
          workpaper_instance_id: string | null
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
          info_received_at?: string | null
          info_requested_at?: string | null
          internal_target_date?: string | null
          is_auto_generated?: boolean | null
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
          source_job_id?: string | null
          source_template_id?: string | null
          status?: string
          tags?: Json | null
          template_id?: string | null
          updated_at?: string
          workpaper_instance_id?: string | null
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
          info_received_at?: string | null
          info_requested_at?: string | null
          internal_target_date?: string | null
          is_auto_generated?: boolean | null
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
          source_job_id?: string | null
          source_template_id?: string | null
          status?: string
          tags?: Json | null
          template_id?: string | null
          updated_at?: string
          workpaper_instance_id?: string | null
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
          converted_at: string | null
          created_at: string
          email: string
          estimated_monthly_value: number | null
          first_name: string
          id: string
          last_name: string
          lost_reason: string | null
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
          converted_at?: string | null
          created_at?: string
          email: string
          estimated_monthly_value?: number | null
          first_name: string
          id?: string
          last_name: string
          lost_reason?: string | null
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
          converted_at?: string | null
          created_at?: string
          email?: string
          estimated_monthly_value?: number | null
          first_name?: string
          id?: string
          last_name?: string
          lost_reason?: string | null
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
          base_currency: string | null
          client_id: string | null
          company_id: string | null
          created_at: string | null
          created_by: string | null
          credit: number | null
          debit: number | null
          description: string | null
          document_id: string | null
          fx_rate_to_base: number | null
          id: string
          is_locked: boolean | null
          organization_id: string
          source_id: string | null
          source_type: string
          transaction_credit: number | null
          transaction_currency: string | null
          transaction_date: string
          transaction_debit: number | null
          updated_at: string | null
          updated_by: string | null
          vat_code_id: string | null
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
          fx_rate_to_base?: number | null
          id?: string
          is_locked?: boolean | null
          organization_id: string
          source_id?: string | null
          source_type: string
          transaction_credit?: number | null
          transaction_currency?: string | null
          transaction_date: string
          transaction_debit?: number | null
          updated_at?: string | null
          updated_by?: string | null
          vat_code_id?: string | null
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
          fx_rate_to_base?: number | null
          id?: string
          is_locked?: boolean | null
          organization_id?: string
          source_id?: string | null
          source_type?: string
          transaction_credit?: number | null
          transaction_currency?: string | null
          transaction_date?: string
          transaction_debit?: number | null
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
          payment_required_before_onboarding: boolean
          postcode: string | null
          practice_description: string | null
          stripe_connect_account_id: string | null
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
          payment_required_before_onboarding?: boolean
          postcode?: string | null
          practice_description?: string | null
          stripe_connect_account_id?: string | null
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
          payment_required_before_onboarding?: boolean
          postcode?: string | null
          practice_description?: string | null
          stripe_connect_account_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          timezone?: string | null
          updated_at?: string
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
          rejected_at: string | null
          rejection_reason: string | null
          sent_at: string | null
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
          rejected_at?: string | null
          rejection_reason?: string | null
          sent_at?: string | null
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
          rejected_at?: string | null
          rejection_reason?: string | null
          sent_at?: string | null
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
      services_catalog: {
        Row: {
          active: boolean | null
          billing_model: string
          code: string
          created_at: string
          default_job_template_id: string | null
          default_price: number
          description: string | null
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
      cleanup_expired_gmail_auth_states: { Args: never; Returns: undefined }
      cleanup_expired_outlook_auth_states: { Args: never; Returns: undefined }
      client_has_portal_access: {
        Args: {
          check_client_id?: string
          check_company_id?: string
          check_user_id: string
        }
        Returns: boolean
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
      is_period_locked: {
        Args: {
          p_client_id: string
          p_company_id: string
          p_organization_id: string
          p_target_date: string
        }
        Returns: boolean
      }
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
      process_questionnaire_submission: {
        Args: { p_questionnaire_instance_id: string }
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
      send_onboarding_questionnaire: {
        Args: { p_onboarding_id: string; p_template_id: string }
        Returns: Json
      }
      trigger_records_request: { Args: { p_job_id: string }; Returns: Json }
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
      validate_filing_approval_token: {
        Args: { p_token: string }
        Returns: {
          error_message: string
          filing_id: string
          is_valid: boolean
        }[]
      }
      verify_aml: { Args: { p_onboarding_id: string }; Returns: Json }
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
      email_direction: ["inbound", "outbound"],
      email_match_type: ["auto", "manual"],
      link_initiator: ["client", "practice"],
      mailbox_provider: ["gmail", "outlook"],
      mailbox_status: ["active", "expired", "revoked", "error"],
      portal_role: ["accountant", "client"],
    },
  },
} as const
