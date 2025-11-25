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
          vat_number: string | null
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
          vat_number?: string | null
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
          vat_number?: string | null
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
      onboarding_applications: {
        Row: {
          additional_documents_uploaded: boolean | null
          address_line_1: string | null
          address_line_2: string | null
          aml_notes: string | null
          aml_status: string | null
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
          id: string
          logo_url: string | null
          name: string
          onboarding_completed: boolean | null
          postcode: string | null
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
          id?: string
          logo_url?: string | null
          name: string
          onboarding_completed?: boolean | null
          postcode?: string | null
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
          id?: string
          logo_url?: string | null
          name?: string
          onboarding_completed?: boolean | null
          postcode?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      quote_lines: {
        Row: {
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_quote_number: { Args: { org_id: string }; Returns: string }
      get_user_organization_id: { Args: never; Returns: string }
      has_organization_role: {
        Args: { required_role: string }
        Returns: boolean
      }
      user_has_organization_access: {
        Args: { org_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
